const express = require("express");
const { randomBytes } = require("node:crypto");
const { pool, query } = require("../config/db");
const { authenticate, adminOnly } = require("../middleware/auth");
const { ensureJobSchema } = require("../services/job-schema");
const { ensureProfileSchema } = require("../services/profile-schema");
const { ensureMatchingSchema } = require("../services/matching-schema");
const { ensureEventSchema } = require("../services/event-schema");
const { sanitizeSkillNames } = require("../services/job-matching");
const { ensureCommunitySchema } = require("../services/community-schema");
const { analyseContent } = require("../services/content-moderation");
const { getPlatformSettings, savePlatformSettings } = require("../services/platform-settings");
const {
  getAdminYouTubePlaylists,
  saveAdminPlaylistAssignment,
  searchYouTubePlaylists,
} = require("../services/youtube-playlists");
const {
  getAdminYouTubeResources,
  saveAdminYouTubeResource,
  searchYouTubeVideos,
} = require("../services/youtube-resources");

const router = express.Router();
router.use(authenticate, adminOnly);

const cleanSettingText = (value, fallback, maximum) => {
  const cleaned = String(value ?? fallback ?? "").trim();
  return cleaned.slice(0, maximum);
};

const cleanSettingUrl = (value) => {
  const cleaned = cleanSettingText(value, "", 500);
  if (!cleaned) return "";
  try {
    const parsed = new URL(cleaned);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    const error = new Error("Integration URLs must use http or https");
    error.statusCode = 400;
    throw error;
  }
};

function sanitisePlatformSettings(input, current) {
  const general = { ...current.general, ...(input.general || {}) };
  const features = { ...current.features, ...(input.features || {}) };
  const security = { ...current.security, ...(input.security || {}) };
  const email = { ...current.email, ...(input.email || {}) };
  const integrations = { ...current.integrations, ...(input.integrations || {}) };
  const ai = { ...current.ai, ...(input.ai || {}) };
  const supportEmail = cleanSettingText(general.supportEmail, current.general.supportEmail, 190).toLowerCase();
  const replyTo = cleanSettingText(email.replyTo, supportEmail, 190).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    const error = new Error("Enter valid support and reply-to email addresses");
    error.statusCode = 400;
    throw error;
  }
  const minimumPasswordLength = Math.min(64, Math.max(8, Number(security.minimumPasswordLength) || 8));
  const sessionHours = Math.min(720, Math.max(1, Number(security.sessionHours) || 168));
  const moderationThreshold = Math.min(100, Math.max(1, Number(ai.moderationThreshold) || 38));
  const coverLetterTone = ["Professional", "Concise", "Confident", "Warm"].includes(ai.coverLetterTone)
    ? ai.coverLetterTone
    : "Professional";

  return {
    general: {
      platformName: cleanSettingText(general.platformName, "CareerCube", 80) || "CareerCube",
      supportEmail,
      timezone: cleanSettingText(general.timezone, "Asia/Dhaka", 80) || "Asia/Dhaka",
      locale: cleanSettingText(general.locale, "English (Bangladesh)", 80) || "English (Bangladesh)",
    },
    features: {
      registrationEnabled: Boolean(features.registrationEnabled),
      coverLetterEnabled: Boolean(features.coverLetterEnabled),
      communityPostingEnabled: Boolean(features.communityPostingEnabled),
      maintenanceMode: Boolean(features.maintenanceMode),
    },
    security: {
      minimumPasswordLength,
      requireUppercase: Boolean(security.requireUppercase),
      requireNumber: Boolean(security.requireNumber),
      sessionHours,
    },
    email: {
      senderName: cleanSettingText(email.senderName, "CareerCube", 120) || "CareerCube",
      replyTo,
      welcomeSubject: cleanSettingText(email.welcomeSubject, "Welcome to CareerCube", 200),
      welcomeBody: cleanSettingText(email.welcomeBody, "", 5000),
      applicationSubject: cleanSettingText(email.applicationSubject, "Application received", 200),
      applicationBody: cleanSettingText(email.applicationBody, "", 5000),
    },
    integrations: {
      supportPortalUrl: cleanSettingUrl(integrations.supportPortalUrl),
      careerPageUrl: cleanSettingUrl(integrations.careerPageUrl),
      webhookUrl: cleanSettingUrl(integrations.webhookUrl),
      webhookEnabled: Boolean(integrations.webhookEnabled && integrations.webhookUrl),
    },
    ai: {
      jobRecommendationsEnabled: Boolean(ai.jobRecommendationsEnabled),
      contentModerationEnabled: Boolean(ai.contentModerationEnabled),
      moderationThreshold,
      coverLetterTone,
    },
  };
}

const integrationStatus = () => ({
  database: "connected",
  aiService: process.env.AI_SERVICE_URL ? "configured" : "fallback",
  emailService: process.env.RESEND_API_KEY || process.env.SMTP_HOST ? "configured" : "not_configured",
});

router.get("/settings", async (_req, res, next) => {
  try {
    res.json({
      settings: await getPlatformSettings({ fresh: true }),
      integrations: integrationStatus(),
    });
  } catch (error) { next(error); }
});

router.patch("/settings", async (req, res, next) => {
  try {
    const current = await getPlatformSettings({ fresh: true });
    const settings = sanitisePlatformSettings(req.body || {}, current);
    const saved = await savePlatformSettings(settings, req.user.id);
    await query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES (?, 'settings.update', 'platform_settings', 'platform', ?, ?)`,
      [req.user.id, JSON.stringify({ sections: Object.keys(req.body || {}) }), req.ip || null],
    );
    res.json({ settings: saved, integrations: integrationStatus(), message: "System settings saved" });
  } catch (error) { next(error); }
});

router.get("/youtube-playlists", async (_req, res, next) => {
  try {
    res.json(await getAdminYouTubePlaylists());
  } catch (error) { next(error); }
});

router.post("/youtube-playlists/search", async (req, res, next) => {
  try {
    const term = cleanText(req.body?.query, 200);
    if (term.length < 2) return res.status(400).json({ error: "Enter a search term or YouTube playlist URL" });
    res.json({ items: await searchYouTubePlaylists(term, 8) });
  } catch (error) { next(error); }
});

router.post("/youtube-playlists", async (req, res, next) => {
  try {
    const playlistInput = cleanText(req.body?.playlistId || req.body?.playlistUrl, 600);
    if (!playlistInput) return res.status(400).json({ error: "Choose a YouTube playlist first" });
    const result = await saveAdminPlaylistAssignment({
      playlistInput,
      studentIds: req.body?.studentIds,
      assignToAll: Boolean(req.body?.assignToAll),
      reason: req.body?.reason,
      tags: req.body?.tags,
      status: req.body?.status,
      adminId: req.user.id,
    });
    res.status(201).json({
      playlist: result.playlist,
      assignedCount: result.assignedCount,
      message: result.assignedCount
        ? `Playlist suggested to ${result.assignedCount} student${result.assignedCount === 1 ? "" : "s"}`
        : "Playlist saved to the CareerCube learning library",
    });
  } catch (error) { next(error); }
});

router.get("/youtube-resources", async (_req, res, next) => {
  try {
    res.json(await getAdminYouTubeResources());
  } catch (error) { next(error); }
});

router.post("/youtube-resources/search", async (req, res, next) => {
  try {
    const term = cleanText(req.body?.query, 200);
    if (term.length < 2) return res.status(400).json({ error: "Enter a skill or paste a YouTube video URL" });
    res.json({ items: await searchYouTubeVideos(term, 20) });
  } catch (error) { next(error); }
});

router.post("/youtube-resources", async (req, res, next) => {
  try {
    const resourceInput = cleanText(req.body?.videoId || req.body?.videoUrl, 800);
    const skill = cleanText(req.body?.skill, 160);
    if (!resourceInput) return res.status(400).json({ error: "Choose a YouTube video first" });
    if (skill.length < 2) return res.status(400).json({ error: "Enter the skill this resource teaches" });
    const tags = Array.from(new Set([skill, ...(Array.isArray(req.body?.tags) ? req.body.tags : [])].map((tag) => cleanText(tag, 80)).filter(Boolean))).slice(0, 12);
    const result = await saveAdminYouTubeResource({
      resourceInput,
      studentIds: req.body?.studentIds,
      assignToAll: Boolean(req.body?.assignToAll),
      reason: req.body?.reason,
      tags,
      status: req.body?.status,
      adminId: req.user.id,
    });
    res.status(201).json({
      resource: result.resource,
      assignedCount: result.assignedCount,
      message: result.assignedCount
        ? `Resource suggested to ${result.assignedCount} student${result.assignedCount === 1 ? "" : "s"}`
        : "Resource saved to the CareerCube learning library",
    });
  } catch (error) { next(error); }
});

router.get("/stats", async (_req, res, next) => {
  try {
    await ensureJobSchema();
    const [[users], [assessments], [jobs], [applications], [posts], [reports]] = await Promise.all([
      query("SELECT COUNT(*) total FROM users WHERE role='student'"),
      query("SELECT COUNT(*) total FROM assessments WHERE created_by IS NOT NULL"),
      query("SELECT COUNT(*) total FROM jobs WHERE created_by IS NOT NULL"),
      query("SELECT COUNT(*) total FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.created_by IS NOT NULL AND a.status<>'withdrawn'"),
      query("SELECT COUNT(*) total FROM community_posts WHERE status='visible'"),
      query("SELECT COUNT(*) total FROM content_reports WHERE status='open'"),
    ]);
    res.json({ users: users.total, assessments: assessments.total, jobs: jobs.total, applications: applications.total, posts: posts.total, openReports: reports.total });
  } catch (error) { next(error); }
});

const assessmentStatuses = new Set(["draft", "published", "archived"]);
const questionStatuses = new Set(["draft", "published", "needs_review"]);
const difficulties = new Set(["Beginner", "Intermediate", "Advanced"]);
const questionTypes = new Set(["multiple_choice", "true_false"]);
const jobStatuses = new Set(["draft", "pending", "live", "closed"]);
const applicationStatuses = new Set(["applied", "in_review", "assessment", "interview", "offer", "rejected"]);
const employmentTypes = new Set(["Full-time", "Part-time", "Internship", "Contract"]);
const workplaceTypes = new Set(["On-site", "Hybrid", "Remote"]);
const applicationModes = new Set(["careerforge", "external"]);
const eventStatuses = new Set(["draft", "published", "cancelled"]);

function cleanText(value, maxLength = 5000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanExternalApplyUrl(value) {
  const raw = cleanText(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanEventUrl(value) {
  const raw = cleanText(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function eventDate(value) {
  const raw = cleanText(value, 60);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventPayload(body) {
  const rawCapacity = body.capacity === "" || body.capacity === null || body.capacity === undefined
    ? null
    : Number(body.capacity);
  return {
    title: cleanText(body.title, 220),
    description: cleanText(body.description, 10000) || null,
    eventType: cleanText(body.eventType, 100),
    host: cleanText(body.host, 180),
    location: cleanText(body.location, 220) || null,
    eventUrl: cleanEventUrl(body.eventUrl),
    startsAt: eventDate(body.startsAt),
    endsAt: eventDate(body.endsAt),
    capacity: rawCapacity === null ? null : (Number.isInteger(rawCapacity) && rawCapacity > 0 && rawCapacity <= 100000 ? rawCapacity : Number.NaN),
    status: eventStatuses.has(body.status) ? body.status : "draft",
  };
}

function validateEvent(payload, body) {
  if (!payload.title || !payload.eventType || !payload.host || !payload.startsAt || !payload.endsAt) {
    return "Title, type, host, start time and end time are required";
  }
  if (payload.endsAt.getTime() <= payload.startsAt.getTime()) return "End time must be after the start time";
  if (payload.status === "published" && payload.startsAt.getTime() <= Date.now()) return "Published events must start in the future";
  if (Number.isNaN(payload.capacity)) return "Capacity must be a whole number between 1 and 100000";
  if (cleanText(body.eventUrl, 500) && !payload.eventUrl) return "Event URL must be a valid http or https link";
  return null;
}

function assessmentPayload(body) {
  return {
    title: cleanText(body.title, 180),
    description: cleanText(body.description, 5000) || null,
    category: cleanText(body.category, 100),
    difficulty: difficulties.has(body.difficulty) ? body.difficulty : "Beginner",
    timeLimitMinutes: Math.min(180, Math.max(1, Number(body.timeLimitMinutes) || 15)),
    passingPercentage: Math.min(100, Math.max(0, Number(body.passingPercentage) || 60)),
    status: assessmentStatuses.has(body.status) ? body.status : "draft",
  };
}

function questionPayload(body) {
  const options = Array.isArray(body.options)
    ? body.options.slice(0, 6).map((option) => ({
      text: cleanText(option.text, 1000),
      isCorrect: Boolean(option.isCorrect),
    })).filter((option) => option.text)
    : [];
  return {
    assessmentId: Number(body.assessmentId),
    prompt: cleanText(body.prompt, 10000),
    questionType: questionTypes.has(body.questionType) ? body.questionType : "multiple_choice",
    difficulty: difficulties.has(body.difficulty) ? body.difficulty : "Beginner",
    explanation: cleanText(body.explanation, 10000) || null,
    points: Math.min(100, Math.max(0.25, Number(body.points) || 1)),
    status: questionStatuses.has(body.status) ? body.status : "draft",
    options,
  };
}

function validateQuestion(payload) {
  if (!payload.assessmentId || !payload.prompt) return "Assessment and question text are required";
  if (payload.options.length < 2) return "At least two answer options are required";
  if (payload.options.filter((option) => option.isCorrect).length !== 1) return "Select exactly one correct answer";
  return null;
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function jobPayload(body) {
  const rawExpiry = cleanText(body.expiresAt, 40);
  const expiresAt = rawExpiry
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawExpiry) ? `${rawExpiry}T23:59:59.999Z` : rawExpiry)
    : null;
  const applicationMode = applicationModes.has(body.applicationMode) ? body.applicationMode : "careerforge";
  return {
    companyName: cleanText(body.companyName, 160),
    companyDescription: cleanText(body.companyDescription, 5000) || null,
    companyWebsite: cleanText(body.companyWebsite, 300) || null,
    title: cleanText(body.title, 180),
    description: cleanText(body.description, 20000),
    responsibilities: cleanText(body.responsibilities, 10000) || null,
    requirements: cleanText(body.requirements, 10000),
    requiredSkills: sanitizeSkillNames(body.requiredSkills, 15),
    category: cleanText(body.category, 100),
    employmentType: employmentTypes.has(body.employmentType) ? body.employmentType : "Full-time",
    location: cleanText(body.location, 180),
    workplaceType: workplaceTypes.has(body.workplaceType) ? body.workplaceType : "On-site",
    salaryMin: optionalNumber(body.salaryMin),
    salaryMax: optionalNumber(body.salaryMax),
    currency: cleanText(body.currency, 3).toUpperCase() || "BDT",
    status: jobStatuses.has(body.status) ? body.status : "live",
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    applicationMode,
    externalApplyUrl: applicationMode === "external" ? cleanExternalApplyUrl(body.externalApplyUrl) : null,
    sourceLabel: applicationMode === "external" ? cleanText(body.sourceLabel, 120) || "Verified company source" : null,
  };
}

async function syncJobSkills(connection, jobId, requiredSkills) {
  await connection.execute("DELETE FROM job_skills WHERE job_id=?", [jobId]);
  for (const skill of requiredSkills) {
    await connection.execute(
      "INSERT INTO skills (name, category) VALUES (?, 'CareerCube skills') ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [skill],
    );
    const [skillRows] = await connection.execute("SELECT id FROM skills WHERE name=? LIMIT 1", [skill]);
    await connection.execute(
      "INSERT INTO job_skills (job_id, skill_id, weight, required_score) VALUES (?, ?, 1, 50)",
      [jobId, skillRows[0].id],
    );
  }
}

function validateJob(payload) {
  if (!payload.companyName || !payload.title || !payload.description || !payload.requirements
      || !payload.category || !payload.location || !payload.expiresAt) {
    return "Company, role, description, requirements, category, location and expiry date are required";
  }
  if (payload.expiresAt.getTime() <= Date.now()) return "Expiry date must be in the future";
  if (payload.salaryMin !== null && payload.salaryMax !== null && payload.salaryMin > payload.salaryMax) {
    return "Maximum salary must be greater than or equal to minimum salary";
  }
  if (payload.applicationMode === "external" && !payload.externalApplyUrl) {
    return "Add a valid official application URL for this verified external job";
  }
  return null;
}

function createJobSlug(title, company) {
  const base = `${title}-${company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 185) || "job";
  return `${base}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

router.get("/assessments", async (_req, res, next) => {
  try {
    res.json(await query(
      `SELECT a.id, a.title, a.description, a.category, a.difficulty,
       a.time_limit_minutes, a.passing_percentage, a.status, a.created_at, a.updated_at,
       COUNT(DISTINCT q.id) question_count, COUNT(DISTINCT aa.id) attempt_count,
       ROUND(AVG(aa.percentage), 1) average_score
       FROM assessments a
       LEFT JOIN questions q ON q.assessment_id=a.id
       LEFT JOIN assessment_attempts aa ON aa.assessment_id=a.id
       WHERE a.created_by IS NOT NULL
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
    ));
  } catch (error) { next(error); }
});

router.post("/assessments", async (req, res, next) => {
  try {
    const payload = assessmentPayload(req.body);
    if (!payload.title || !payload.category) return res.status(400).json({ error: "Title and category are required" });
    const result = await query(
      `INSERT INTO assessments
       (title, description, category, difficulty, time_limit_minutes, passing_percentage, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.title, payload.description, payload.category, payload.difficulty, payload.timeLimitMinutes, payload.passingPercentage, payload.status, req.user.id],
    );
    const [assessment] = await query("SELECT * FROM assessments WHERE id=?", [result.insertId]);
    res.status(201).json(assessment);
  } catch (error) { next(error); }
});

router.patch("/assessments/:id", async (req, res, next) => {
  try {
    const payload = assessmentPayload(req.body);
    if (!payload.title || !payload.category) return res.status(400).json({ error: "Title and category are required" });
    const result = await query(
      `UPDATE assessments SET title=?, description=?, category=?, difficulty=?,
       time_limit_minutes=?, passing_percentage=?, status=?
       WHERE id=? AND created_by IS NOT NULL`,
      [payload.title, payload.description, payload.category, payload.difficulty, payload.timeLimitMinutes, payload.passingPercentage, payload.status, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Assessment not found" });
    res.json({ message: "Assessment updated" });
  } catch (error) { next(error); }
});

router.delete("/assessments/:id", async (req, res, next) => {
  try {
    const result = await query("DELETE FROM assessments WHERE id=? AND created_by IS NOT NULL", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Assessment not found" });
    res.json({ message: "Assessment deleted" });
  } catch (error) { next(error); }
});

router.get("/questions", async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT q.id, q.assessment_id, q.prompt, q.question_type, q.difficulty,
       q.explanation, q.points, q.status, q.created_at, q.updated_at,
       a.title assessment_title
       FROM questions q
       JOIN assessments a ON a.id=q.assessment_id
       WHERE a.created_by IS NOT NULL
       ORDER BY q.created_at DESC`,
    );
    for (const row of rows) {
      row.options = await query(
        "SELECT id, option_text, is_correct, sort_order FROM question_options WHERE question_id=? ORDER BY sort_order",
        [row.id],
      );
    }
    res.json(rows);
  } catch (error) { next(error); }
});

async function saveQuestion(req, res, next, questionId = null) {
  const payload = questionPayload(req.body);
  const validationError = validateQuestion(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assessmentRows] = await connection.execute(
      "SELECT id FROM assessments WHERE id=? AND created_by IS NOT NULL",
      [payload.assessmentId],
    );
    if (!assessmentRows[0]) {
      await connection.rollback();
      return res.status(404).json({ error: "Assessment not found" });
    }

    let savedQuestionId = questionId;
    if (questionId) {
      const [questionRows] = await connection.execute(
        `SELECT q.id FROM questions q
         JOIN assessments a ON a.id=q.assessment_id
         WHERE q.id=? AND a.created_by IS NOT NULL`,
        [questionId],
      );
      if (!questionRows[0]) {
        await connection.rollback();
        return res.status(404).json({ error: "Question not found" });
      }
      const [result] = await connection.execute(
        `UPDATE questions SET assessment_id=?, prompt=?, question_type=?, difficulty=?,
         explanation=?, points=?, status=? WHERE id=?`,
        [payload.assessmentId, payload.prompt, payload.questionType, payload.difficulty, payload.explanation, payload.points, payload.status, questionId],
      );
      if (!result.affectedRows) {
        await connection.rollback();
        return res.status(404).json({ error: "Question not found" });
      }
      await connection.execute("DELETE FROM question_options WHERE question_id=?", [questionId]);
    } else {
      const [result] = await connection.execute(
        `INSERT INTO questions
         (assessment_id, prompt, question_type, difficulty, explanation, points, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [payload.assessmentId, payload.prompt, payload.questionType, payload.difficulty, payload.explanation, payload.points, payload.status],
      );
      savedQuestionId = result.insertId;
    }

    for (let index = 0; index < payload.options.length; index += 1) {
      const option = payload.options[index];
      await connection.execute(
        "INSERT INTO question_options (question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?)",
        [savedQuestionId, option.text, option.isCorrect, index + 1],
      );
    }
    await connection.commit();
    res.status(questionId ? 200 : 201).json({ id: savedQuestionId, message: questionId ? "Question updated" : "Question created" });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

router.post("/questions", (req, res, next) => saveQuestion(req, res, next));
router.patch("/questions/:id", (req, res, next) => saveQuestion(req, res, next, Number(req.params.id)));

router.delete("/questions/:id", async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM questions
       WHERE id=? AND assessment_id IN (
         SELECT id FROM assessments WHERE created_by IS NOT NULL
       )`,
      [req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Question not found" });
    res.json({ message: "Question deleted" });
  } catch (error) { next(error); }
});

router.get("/events", async (_req, res, next) => {
  try {
    await ensureEventSchema();
    res.json(await query(
      `SELECT e.id, e.title, e.description, e.event_type, e.host, e.location, e.event_url,
              e.starts_at, e.ends_at, e.capacity, e.status, e.created_at, e.updated_at,
              COALESCE((SELECT COUNT(*) FROM event_registrations er WHERE er.event_id=e.id), 0) registration_count
       FROM events e
       WHERE e.created_by IS NOT NULL
       ORDER BY e.starts_at DESC`,
    ));
  } catch (error) { next(error); }
});

async function saveManagedEvent(req, res, next, eventId = null) {
  const payload = eventPayload(req.body || {});
  const validationError = validateEvent(payload, req.body || {});
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    await ensureEventSchema();
    if (eventId) {
      const [existing] = await query(
        `SELECT e.starts_at,
                (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id=e.id) registration_count
         FROM events e WHERE e.id=? AND e.created_by IS NOT NULL`,
        [eventId],
      );
      if (!existing) return res.status(404).json({ error: "Event not found" });
      if (payload.capacity != null && Number(existing.registration_count || 0) > payload.capacity) {
        return res.status(400).json({ error: "Capacity cannot be lower than the current reservation count" });
      }
      const result = await query(
        `UPDATE events SET title=?, description=?, event_type=?, host=?, location=?, event_url=?,
         starts_at=?, ends_at=?, capacity=?, status=?
         WHERE id=? AND created_by IS NOT NULL`,
        [
          payload.title, payload.description, payload.eventType, payload.host, payload.location, payload.eventUrl,
          payload.startsAt, payload.endsAt, payload.capacity, payload.status, eventId,
        ],
      );
      if (!result.affectedRows) return res.status(404).json({ error: "Event not found" });
    } else {
      await query(
        `INSERT INTO events
         (title, description, event_type, host, location, event_url, starts_at, ends_at, capacity, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.title, payload.description, payload.eventType, payload.host, payload.location, payload.eventUrl,
          payload.startsAt, payload.endsAt, payload.capacity, payload.status, req.user.id,
        ],
      );
    }
    res.status(eventId ? 200 : 201).json({ message: eventId ? "Event updated" : "Event created" });
  } catch (error) { next(error); }
}

router.post("/events", (req, res, next) => saveManagedEvent(req, res, next));
router.patch("/events/:id", (req, res, next) => saveManagedEvent(req, res, next, Number(req.params.id)));

router.patch("/events/:id/status", async (req, res, next) => {
  try {
    await ensureEventSchema();
    const status = eventStatuses.has(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "Invalid event status" });
    const [event] = await query(
      "SELECT starts_at FROM events WHERE id=? AND created_by IS NOT NULL",
      [req.params.id],
    );
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (status === "published" && new Date(event.starts_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: "Past events cannot be published" });
    }
    const result = await query(
      "UPDATE events SET status=? WHERE id=? AND created_by IS NOT NULL",
      [status, req.params.id],
    );
    res.json({ message: status === "published" ? "Event is visible to students" : "Event is hidden from the student portal" });
  } catch (error) { next(error); }
});

router.delete("/events/:id", async (req, res, next) => {
  try {
    await ensureEventSchema();
    const result = await query("DELETE FROM events WHERE id=? AND created_by IS NOT NULL", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Event not found" });
    res.json({ message: "Event deleted" });
  } catch (error) { next(error); }
});

router.get("/jobs", async (_req, res, next) => {
  try {
    await Promise.all([ensureJobSchema(), ensureMatchingSchema()]);
    res.json(await query(
      `SELECT j.id, j.title, j.slug, j.description, j.responsibilities, j.requirements,
       j.category, j.employment_type, j.location, j.workplace_type,
       j.salary_min, j.salary_max, j.currency, j.status, j.expires_at,
       j.application_mode, j.external_apply_url, j.source_label,
       j.created_at, j.updated_at, c.name company_name, c.description company_description,
       c.website company_website, c.logo_url company_logo,
       COALESCE(application_totals.application_count, 0) application_count,
       COALESCE(application_totals.withdrawn_count, 0) withdrawn_count,
       COALESCE(application_totals.in_review_count, 0) in_review_count,
       COALESCE(application_totals.assessment_count, 0) assessment_count,
       COALESCE(application_totals.interview_count, 0) interview_count,
       COALESCE(application_totals.offer_count, 0) offer_count
       ,COALESCE((
         SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ')
         FROM job_skills js JOIN skills s ON s.id=js.skill_id
         WHERE js.job_id=j.id
       ), '') required_skills
       FROM jobs j
       JOIN companies c ON c.id=j.company_id
       LEFT JOIN (
         SELECT job_id,
          SUM(CASE WHEN status<>'withdrawn' THEN 1 ELSE 0 END) application_count,
          SUM(CASE WHEN status='withdrawn' THEN 1 ELSE 0 END) withdrawn_count,
          SUM(CASE WHEN status='in_review' THEN 1 ELSE 0 END) in_review_count,
          SUM(CASE WHEN status='assessment' THEN 1 ELSE 0 END) assessment_count,
          SUM(CASE WHEN status='interview' THEN 1 ELSE 0 END) interview_count,
          SUM(CASE WHEN status='offer' THEN 1 ELSE 0 END) offer_count
         FROM applications
         GROUP BY job_id
       ) application_totals ON application_totals.job_id=j.id
       WHERE j.created_by IS NOT NULL
       ORDER BY j.created_at DESC`,
    ));
  } catch (error) { next(error); }
});

async function saveManagedJob(req, res, next, jobId = null) {
  const payload = jobPayload(req.body);
  const validationError = validateJob(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  await Promise.all([ensureJobSchema(), ensureMatchingSchema()]);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (jobId) {
      const [existingJobs] = await connection.execute(
        "SELECT id FROM jobs WHERE id=? AND created_by IS NOT NULL",
        [jobId],
      );
      if (!existingJobs[0]) {
        await connection.rollback();
        return res.status(404).json({ error: "Job not found" });
      }
    }

    let [companyRows] = await connection.execute(
      "SELECT id FROM companies WHERE name=? LIMIT 1",
      [payload.companyName],
    );
    let companyId = companyRows[0]?.id;
    if (companyId) {
      await connection.execute(
        `UPDATE companies SET
         description=COALESCE(?, description), website=COALESCE(?, website)
         WHERE id=?`,
        [payload.companyDescription, payload.companyWebsite, companyId],
      );
    } else {
      const [companyResult] = await connection.execute(
        "INSERT INTO companies (name, description, website) VALUES (?, ?, ?)",
        [payload.companyName, payload.companyDescription, payload.companyWebsite],
      );
      companyId = companyResult.insertId;
    }

    const values = [
      companyId,
      payload.title,
      payload.description,
      payload.responsibilities,
      payload.requirements,
      payload.category,
      payload.employmentType,
      payload.location,
      payload.workplaceType,
      payload.salaryMin,
      payload.salaryMax,
      payload.currency,
      payload.status,
      payload.expiresAt,
      payload.applicationMode,
      payload.externalApplyUrl,
      payload.sourceLabel,
    ];

    let savedJobId = jobId;
    if (jobId) {
      await connection.execute(
        `UPDATE jobs SET company_id=?, title=?, description=?, responsibilities=?,
         requirements=?, category=?, employment_type=?, location=?, workplace_type=?,
         salary_min=?, salary_max=?, currency=?, status=?, expires_at=?, application_mode=?,
         external_apply_url=?, source_label=?
         WHERE id=? AND created_by IS NOT NULL`,
        [...values, jobId],
      );
    } else {
      const [jobResult] = await connection.execute(
        `INSERT INTO jobs
         (company_id, title, slug, description, responsibilities, requirements, category,
          employment_type, location, workplace_type, salary_min, salary_max, currency,
          status, expires_at, application_mode, external_apply_url, source_label, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          payload.title,
          createJobSlug(payload.title, payload.companyName),
          payload.description,
          payload.responsibilities,
          payload.requirements,
          payload.category,
          payload.employmentType,
          payload.location,
          payload.workplaceType,
          payload.salaryMin,
          payload.salaryMax,
          payload.currency,
          payload.status,
          payload.expiresAt,
          payload.applicationMode,
          payload.externalApplyUrl,
          payload.sourceLabel,
          req.user.id,
        ],
      );
      savedJobId = jobResult.insertId;
    }

    await syncJobSkills(connection, savedJobId, payload.requiredSkills);

    await connection.commit();
    res.status(jobId ? 200 : 201).json({
      id: savedJobId,
      message: jobId ? "Job updated" : "Job created",
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

router.post("/jobs", (req, res, next) => saveManagedJob(req, res, next));
router.patch("/jobs/:id", (req, res, next) => saveManagedJob(req, res, next, Number(req.params.id)));

router.patch("/jobs/:id/status", async (req, res, next) => {
  try {
    await ensureJobSchema();
    const status = jobStatuses.has(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "Invalid job status" });
    const result = await query(
      "UPDATE jobs SET status=? WHERE id=? AND created_by IS NOT NULL",
      [status, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Job not found" });
    res.json({ message: status === "live" ? "Job is visible to students" : "Job is hidden from students" });
  } catch (error) { next(error); }
});

router.delete("/jobs/:id", async (req, res, next) => {
  try {
    await ensureJobSchema();
    const result = await query(
      "DELETE FROM jobs WHERE id=? AND created_by IS NOT NULL",
      [req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Job not found" });
    res.json({ message: "Job deleted" });
  } catch (error) { next(error); }
});

router.get("/applications", async (_req, res, next) => {
  try {
    await ensureJobSchema();
    res.json(await query(
      `SELECT a.id, a.user_id, a.job_id, a.status, a.match_percentage, a.applied_at,
              a.updated_at, a.resume_file_name,
              (a.resume_snapshot IS NOT NULL) has_resume_snapshot,
              (a.resume_file_data IS NOT NULL) has_resume_file,
              u.name applicant_name, u.email applicant_email,
              p.university, p.degree, p.graduation_year, p.location, p.phone,
              p.readiness_score, p.avatar_url,
              j.title job_title, c.name company_name
       FROM applications a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN student_profiles p ON p.user_id=u.id
       JOIN jobs j ON j.id=a.job_id
       JOIN companies c ON c.id=j.company_id
       WHERE j.created_by IS NOT NULL
       ORDER BY a.applied_at DESC`,
    ));
  } catch (error) { next(error); }
});

router.get("/applications/:id", async (req, res, next) => {
  try {
    await ensureJobSchema();
    const [application] = await query(
      `SELECT a.id, a.user_id, a.job_id, a.status, a.match_percentage, a.resume_url,
              a.resume_snapshot, a.resume_file_name, a.resume_file_type,
              (a.resume_file_data IS NOT NULL) has_resume_file,
              a.cover_letter, a.notes, a.applied_at, a.updated_at,
              u.name applicant_name, u.email applicant_email,
              p.university, p.degree, p.graduation_year, p.location, p.phone,
              p.bio, p.readiness_score, p.avatar_url,
              j.title job_title, j.location job_location, j.workplace_type,
              j.employment_type, c.name company_name
       FROM applications a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN student_profiles p ON p.user_id=u.id
       JOIN jobs j ON j.id=a.job_id
       JOIN companies c ON c.id=j.company_id
       WHERE a.id=? AND j.created_by IS NOT NULL
       LIMIT 1`,
      [req.params.id],
    );
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json(application);
  } catch (error) { next(error); }
});

router.get("/applications/:id/resume-file", async (req, res, next) => {
  try {
    await ensureJobSchema();
    const [application] = await query(
      `SELECT a.resume_file_name, a.resume_file_type, a.resume_file_data
       FROM applications a JOIN jobs j ON j.id=a.job_id
       WHERE a.id=? AND j.created_by IS NOT NULL LIMIT 1`,
      [req.params.id],
    );
    if (!application?.resume_file_data) return res.status(404).json({ error: "Uploaded resume file not found" });
    const fileName = String(application.resume_file_name || "resume").replace(/[\r\n"]/g, "_");
    const fileType = application.resume_file_type || "application/octet-stream";
    const file = Buffer.from(application.resume_file_data, "base64");
    res.setHeader("Content-Type", fileType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${fileType === "application/pdf" ? "inline" : "attachment"}; filename="${fileName}"`);
    res.send(file);
  } catch (error) { next(error); }
});

router.patch("/applications/:id/status", async (req, res, next) => {
  try {
    await ensureJobSchema();
    const status = applicationStatuses.has(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "Invalid application status" });
    const [application] = await query(
      `SELECT a.id FROM applications a JOIN jobs j ON j.id=a.job_id
       WHERE a.id=? AND j.created_by IS NOT NULL AND a.status<>'withdrawn' LIMIT 1`,
      [req.params.id],
    );
    if (!application) return res.status(404).json({ error: "Active application not found" });
    await query("UPDATE applications SET status=?, updated_at=NOW() WHERE id=?", [status, application.id]);
    res.json({ message: "Application status updated" });
  } catch (error) { next(error); }
});

router.get("/users", async (req, res, next) => {
  try {
    const search = `%${req.query.search || ""}%`;
    res.json(await query(
      `SELECT u.id, u.name, u.email, u.status, u.created_at, p.university,
              p.readiness_score, p.profile_completion
       FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id
       WHERE u.role='student' AND (u.name LIKE ? OR u.email LIKE ? OR p.university LIKE ?)
       ORDER BY u.created_at DESC`,
      [search, search, search],
    ));
  } catch (error) { next(error); }
});

router.get("/users/:id", async (req, res, next) => {
  try {
    await ensureProfileSchema();
    const [student] = await query(
      `SELECT u.id, u.name, u.email, u.status, u.last_login_at, u.created_at, u.updated_at,
              p.university, p.degree, p.graduation_year, p.target_role, p.career_interests, p.location,
              p.phone, p.bio, p.avatar_url, p.avatar_data, p.readiness_score, p.profile_completion,
              p.updated_at profile_updated_at
       FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id
       WHERE u.id=? AND u.role='student'
       LIMIT 1`,
      [req.params.id],
    );
    if (!student) return res.status(404).json({ error: "Student account not found" });
    let careerInterests = student.career_interests;
    if (typeof careerInterests === "string") {
      try { careerInterests = JSON.parse(careerInterests); } catch { careerInterests = []; }
    }
    res.json({
      ...student,
      career_interests: Array.isArray(careerInterests) ? careerInterests : [],
      graduation_year: student.graduation_year == null ? null : Number(student.graduation_year),
      readiness_score: Number(student.readiness_score || 0),
      profile_completion: Number(student.profile_completion || 0),
    });
  } catch (error) { next(error); }
});

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    if (!["active", "suspended"].includes(req.body.status)) return res.status(400).json({ error: "Invalid user status" });
    const result = await query("UPDATE users SET status=? WHERE id=? AND role='student'", [req.body.status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Student account not found" });
    res.json({ message: "User status updated" });
  } catch (error) { next(error); }
});

router.get("/community", async (req, res, next) => {
  try {
    await ensureCommunitySchema();
    const [posts, totals, reports, today] = await Promise.all([
      query(
        `SELECT p.id, p.user_id, p.content, p.link_url, p.tags, p.status, p.risk_score,
                p.risk_label, p.risk_reasons, p.share_count, p.created_at, p.reviewed_at,
                u.name author, u.email author_email, u.role author_role,
                sp.university, sp.avatar_url,
                (SELECT COUNT(*) FROM post_likes l WHERE l.post_id=p.id) likes,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.status='visible') comments,
                (SELECT COUNT(*) FROM content_reports r WHERE r.post_id=p.id AND r.status='open') report_count,
                EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id=p.id AND mine.user_id=?) liked,
                (p.user_id=?) is_owner
         FROM community_posts p
         JOIN users u ON u.id=p.user_id
         LEFT JOIN student_profiles sp ON sp.user_id=u.id
         ORDER BY
           CASE p.status WHEN 'pending_review' THEN 0 WHEN 'visible' THEN 1 ELSE 2 END,
           report_count DESC, p.risk_score DESC, p.created_at DESC
         LIMIT 250`,
        [req.user.id, req.user.id],
      ),
      query(
        `SELECT COUNT(*) total,
                SUM(status='visible') visible,
                SUM(status='pending_review') pending,
                SUM(status='removed') removed
         FROM community_posts`,
      ),
      query("SELECT COUNT(*) open_reports FROM content_reports WHERE status='open'"),
      query("SELECT COUNT(*) posts_today FROM community_posts WHERE created_at >= CURDATE()"),
    ]);
    res.json({
      posts,
      stats: {
        total: Number(totals[0]?.total || 0),
        visible: Number(totals[0]?.visible || 0),
        pending: Number(totals[0]?.pending || 0),
        removed: Number(totals[0]?.removed || 0),
        openReports: Number(reports[0]?.open_reports || 0),
        postsToday: Number(today[0]?.posts_today || 0),
      },
    });
  } catch (error) { next(error); }
});

router.patch("/community/posts/:id", async (req, res, next) => {
  try {
    await ensureCommunitySchema();
    const action = String(req.body.action || "");
    if (!["approve", "remove", "restore", "rescan"].includes(action)) {
      return res.status(400).json({ error: "Invalid moderation action" });
    }
    const [post] = await query(
      "SELECT id, user_id, content, link_url, status FROM community_posts WHERE id=? LIMIT 1",
      [req.params.id],
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    let message = "Moderation action saved";
    if (action === "rescan") {
      const duplicate = await query(
        `SELECT id FROM community_posts
         WHERE user_id=? AND id<>? AND LOWER(TRIM(content))=LOWER(?) AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         LIMIT 1`,
        [post.user_id, post.id, post.content],
      );
      const moderation = analyseContent(`${post.content} ${post.link_url || ""}`, { duplicate: duplicate.length > 0 });
      const nextStatus = post.status === "removed"
        ? "removed"
        : moderation.requiresReview ? "pending_review" : "visible";
      await query(
        `UPDATE community_posts
         SET risk_score=?, risk_label=?, risk_reasons=?, status=?, reviewed_by=NULL, reviewed_at=NULL
         WHERE id=?`,
        [
          moderation.score,
          moderation.label,
          moderation.reasons.length ? JSON.stringify(moderation.reasons) : null,
          nextStatus,
          post.id,
        ],
      );
      message = moderation.requiresReview ? "Risk signals found; post needs review" : "Rescan complete; no blocking signals found";
    } else {
      const nextStatus = action === "remove" ? "removed" : "visible";
      await query(
        "UPDATE community_posts SET status=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
        [nextStatus, req.user.id, post.id],
      );
      await query(
        `UPDATE content_reports
         SET status=?, reviewed_by=?, reviewed_at=NOW()
         WHERE post_id=? AND status='open'`,
        [action === "remove" ? "actioned" : "dismissed", req.user.id, post.id],
      );
      message = action === "remove"
        ? "Post removed from the community"
        : action === "restore" ? "Post restored to the community" : "Post approved and published";
    }

    await query(
      "INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address) VALUES (?, ?, 'community_post', ?, ?, ?)",
      [req.user.id, `community.${action}`, String(post.id), JSON.stringify({ previousStatus: post.status }), req.ip],
    );
    res.json({ message });
  } catch (error) { next(error); }
});

router.get("/reports", async (_req, res, next) => {
  try {
    res.json(await query(
      `SELECT r.*, p.content, u.name author, reporter.name reporter_name
       FROM content_reports r JOIN community_posts p ON p.id=r.post_id
       JOIN users u ON u.id=p.user_id JOIN users reporter ON reporter.id=r.reporter_id
       WHERE r.status='open' ORDER BY r.created_at`,
    ));
  } catch (error) { next(error); }
});

router.patch("/reports/:id", async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!["dismiss", "remove"].includes(action)) return res.status(400).json({ error: "Invalid moderation action" });
    const [report] = await query("SELECT post_id FROM content_reports WHERE id=?", [req.params.id]);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (action === "remove") await query("UPDATE community_posts SET status='removed' WHERE id=?", [report.post_id]);
    await query("UPDATE content_reports SET status=?, reviewed_at=NOW(), reviewed_by=? WHERE id=?", [action === "remove" ? "actioned" : "dismissed", req.user.id, req.params.id]);
    res.json({ message: "Moderation action saved" });
  } catch (error) { next(error); }
});

module.exports = router;
