const MAX_PHOTO_DATA_LENGTH = 1_400_000;

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanText(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function cleanId(value, fallback) {
  const id = cleanText(value, 96);
  return /^[a-z0-9_-]+$/i.test(id) ? id : fallback;
}

function cleanItems(value, maxItems, buildItem) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item, index) => buildItem(
    item && typeof item === "object" ? item : {},
    index,
  ));
}

function createResumeData(user = {}) {
  return {
    name: cleanText(user.name, 120) || "Student",
    title: "",
    email: cleanText(user.email, 190),
    phone: "",
    location: "",
    website: "",
    summary: "",
    skills: "",
    education: [],
    languages: [],
    experiences: [],
    projects: [],
    certifications: [],
  };
}

function normalizeResumeData(value, user = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw requestError("CV details must be provided as an object");
  }

  const fallback = createResumeData(user);
  return {
    name: cleanText(value.name, 120) || fallback.name,
    title: cleanText(value.title, 160),
    email: cleanText(value.email, 190) || fallback.email,
    phone: cleanText(value.phone, 50),
    location: cleanText(value.location, 140),
    website: cleanText(value.website, 500),
    summary: cleanText(value.summary, 5_000),
    skills: cleanText(value.skills, 2_000),
    education: cleanItems(value.education, 12, (item, index) => ({
      id: cleanId(item.id, `education-${index + 1}`),
      degree: cleanText(item.degree, 240),
      institution: cleanText(item.institution, 240),
      location: cleanText(item.location, 140),
      start: cleanText(item.start, 60),
      end: cleanText(item.end, 60),
    })),
    languages: cleanItems(value.languages, 12, (item, index) => ({
      id: cleanId(item.id, `language-${index + 1}`),
      name: cleanText(item.name, 120),
      proficiency: cleanText(item.proficiency, 120),
    })),
    experiences: cleanItems(value.experiences, 12, (item, index) => ({
      id: cleanId(item.id, `experience-${index + 1}`),
      title: cleanText(item.title, 180),
      company: cleanText(item.company, 180),
      location: cleanText(item.location, 140),
      start: cleanText(item.start, 60),
      end: cleanText(item.end, 60),
      details: cleanText(item.details, 4_000),
    })),
    projects: cleanItems(value.projects, 12, (item, index) => ({
      id: cleanId(item.id, `project-${index + 1}`),
      title: cleanText(item.title, 180),
      context: cleanText(item.context, 180),
      link: cleanText(item.link, 500),
      date: cleanText(item.date, 60),
      details: cleanText(item.details, 4_000),
    })),
    certifications: cleanItems(value.certifications, 20, (item, index) => ({
      id: cleanId(item.id, `certification-${index + 1}`),
      name: cleanText(item.name, 180),
      issuer: cleanText(item.issuer, 180),
      date: cleanText(item.date, 60),
      credential: cleanText(item.credential, 500),
    })),
  };
}

function parseStoredResume(value, user) {
  if (!value) return createResumeData(user);
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return normalizeResumeData(parsed, user);
  } catch {
    return createResumeData(user);
  }
}

function normalizeResumePhoto(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw requestError("CV photo must be an image upload");
  }
  const src = String(value.src || "").trim();
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) {
    throw requestError("CV photo must be a JPG, PNG or WebP image");
  }
  if (src.length > MAX_PHOTO_DATA_LENGTH) {
    throw requestError("CV photo is too large. Choose a smaller image.", 413);
  }
  return {
    src,
    name: cleanText(value.name, 255) || "CV photo",
  };
}

module.exports = {
  MAX_PHOTO_DATA_LENGTH,
  createResumeData,
  normalizeResumeData,
  normalizeResumePhoto,
  parseStoredResume,
};
