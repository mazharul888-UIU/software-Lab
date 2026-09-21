const { GoogleGenAI } = require("@google/genai");

const CACHE_TTL_MS = 15 * 60 * 1000;
const planCache = new Map();

const CAREER_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "skills"],
  properties: {
    headline: { type: "string", minLength: 10, maxLength: 140 },
    summary: { type: "string", minLength: 20, maxLength: 500 },
    skills: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "reason"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 90 },
          reason: { type: "string", minLength: 12, maxLength: 240 },
        },
      },
    },
  },
};

const FALLBACK_TRACKS = [
  {
    match: /computer|software|cse|ict|information technology|data|ai|machine learning|cyber/i,
    skills: [
      ["Data structures & algorithms", "Builds the problem-solving foundation expected in software interviews."],
      ["SQL and data modeling", "Helps you work confidently with the data behind modern products."],
      ["Git and collaborative delivery", "Makes your projects easier to review, ship and explain to employers."],
      ["Cloud deployment", "Connects academic projects to production-ready engineering workflows."],
    ],
  },
  {
    match: /business|bba|management|marketing|commerce|accounting|finance|economics/i,
    skills: [
      ["Advanced Excel and dashboards", "Turns business data into clear decisions and measurable outcomes."],
      ["Business analytics", "Builds the evidence-based thinking employers expect from business graduates."],
      ["Presentation and storytelling", "Helps you communicate recommendations to clients and stakeholders."],
      ["Digital marketing fundamentals", "Adds practical reach across Bangladesh's growing digital business roles."],
    ],
  },
  {
    match: /electrical|eee|electronics|telecommunication|mechanical|mechatronics/i,
    skills: [
      ["MATLAB or Python for engineering", "Lets you simulate, analyze and communicate technical decisions."],
      ["Embedded systems fundamentals", "Connects engineering theory with practical hardware and IoT work."],
      ["CAD and technical documentation", "Makes design work easier to review and use in real teams."],
      ["Industrial automation", "Maps well to Bangladesh's manufacturing, power and control roles."],
    ],
  },
  {
    match: /civil|architecture|construction|urban|environment/i,
    skills: [
      ["AutoCAD and BIM workflows", "Strengthens the digital delivery skills used in modern project teams."],
      ["Project planning and estimation", "Helps translate design decisions into realistic construction plans."],
      ["GIS and spatial analysis", "Adds a practical advantage for infrastructure and urban projects."],
      ["Technical communication", "Makes drawings, reports and stakeholder updates easier to understand."],
    ],
  },
];

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function listValue(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return listValue(parsed);
    } catch {
      // Fall through to delimiter parsing for legacy profile values.
    }
  }
  return String(value || "").split(/[,;|]/).map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8);
}

function configuredApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

function profileKey(profile) {
  return JSON.stringify({
    degree: cleanText(profile.degree, 120).toLowerCase(),
    targetRole: cleanText(profile.target_role || profile.targetRole, 120).toLowerCase(),
    interests: listValue(profile.career_interests || profile.careerInterests).map((item) => item.toLowerCase()),
    skills: listValue(profile.skills).map((item) => item.toLowerCase()),
  });
}

function fallbackPlan(profile) {
  const degree = cleanText(profile.degree, 120) || "your degree";
  const role = cleanText(profile.target_role || profile.targetRole, 120);
  if (degree === "your degree") {
    return {
      degree,
      headline: "Add your degree to unlock a skill plan",
      summary: "CareerCube uses your degree as the primary signal, then combines it with your target role and interests to choose useful next skills.",
      skills: [],
      model: null,
      source: "degree-required",
      generatedAt: new Date().toISOString(),
    };
  }
  const track = FALLBACK_TRACKS.find((item) => item.match.test(degree)) || FALLBACK_TRACKS[0];
  return {
    degree,
    headline: `Next skills for ${degree}`,
    summary: `These priorities are selected for your ${degree}${role ? ` and target role in ${role}` : ""}. Build them through one practical project at a time.`,
    skills: track.skills.map(([name, reason]) => ({ name, reason })),
    model: null,
    source: "degree-guidance",
    generatedAt: new Date().toISOString(),
  };
}

function buildPrompt(profile) {
  const degree = cleanText(profile.degree, 120) || "Not provided";
  const role = cleanText(profile.target_role || profile.targetRole, 120) || "Not provided";
  const interests = listValue(profile.career_interests || profile.careerInterests);
  const skills = listValue(profile.skills);
  return [
    "You are a Bangladesh-focused career skills advisor for university students.",
    "Recommend skills to learn next. The degree must be the primary anchor; do not give generic advice that ignores the field of study.",
    "Use the target role, interests and existing skills only to prioritize within that degree track.",
    "Return only JSON matching the schema. Give 3 to 5 concrete skills, each with a short practical reason.",
    `Degree: ${degree}`,
    `Target role: ${role}`,
    `Career interests: ${interests.join(", ") || "Not provided"}`,
    `Current skills: ${skills.join(", ") || "Not provided"}`,
  ].join("\n");
}

function normalizePlan(payload, profile, model) {
  const fallback = fallbackPlan(profile);
  const skills = (Array.isArray(payload?.skills) ? payload.skills : [])
    .map((item) => ({
      name: cleanText(item?.name, 90),
      reason: cleanText(item?.reason, 240),
    }))
    .filter((item) => item.name && item.reason)
    .slice(0, 5);
  if (skills.length < 3) return fallback;
  return {
    degree: fallback.degree,
    headline: cleanText(payload.headline, 140) || fallback.headline,
    summary: cleanText(payload.summary, 500) || fallback.summary,
    skills,
    model: model || null,
    source: "gemini",
    generatedAt: new Date().toISOString(),
  };
}

async function generateCareerSkillPlan(profile = {}) {
  const key = profileKey(profile);
  const cached = planCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.plan;

  const fallback = fallbackPlan(profile);
  const apiKey = configuredApiKey();
  if (!apiKey) {
    planCache.set(key, { plan: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  try {
    const model = String(process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
    const ai = new GoogleGenAI({ apiKey });
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: buildPrompt(profile),
        config: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          responseJsonSchema: CAREER_PLAN_SCHEMA,
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Career plan generation timed out")), 7000)),
    ]);
    const plan = normalizePlan(JSON.parse(response?.text || "{}"), profile, response?.modelVersion || model);
    planCache.set(key, { plan, expiresAt: Date.now() + CACHE_TTL_MS });
    return plan;
  } catch (error) {
    console.warn("Career skill plan is using degree guidance after Gemini failure", error?.message || error);
    planCache.set(key, { plan: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }
}

module.exports = { generateCareerSkillPlan };
