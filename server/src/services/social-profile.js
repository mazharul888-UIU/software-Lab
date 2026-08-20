const SOCIAL_PROFILE_FIELDS = [
  "facebook_url",
  "instagram_url",
  "whatsapp",
  "twitter_url",
  "telegram",
];

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function optionalString(value, label, maxLength) {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw validationError(`${label} must be text`);
  }
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw validationError(`${label} is too long`);
  }
  return cleaned;
}

function normalizeHostedUrl(value, label, allowedHosts) {
  const cleaned = optionalString(value, label, 500);
  if (!cleaned) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw validationError(`Enter a valid ${label} profile link`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !allowedHosts.includes(hostname)
  ) {
    throw validationError(`Enter a valid ${label} profile link`);
  }
  try {
    decodeURIComponent(parsed.pathname);
  } catch {
    throw validationError(`Enter a valid ${label} profile link`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function normalizeFacebookUrl(value) {
  return normalizeHostedUrl(value, "Facebook", ["facebook.com", "www.facebook.com", "m.facebook.com"]);
}

function normalizeInstagramUrl(value) {
  return normalizeHostedUrl(value, "Instagram", ["instagram.com", "www.instagram.com"]);
}

function normalizeTwitterUrl(value) {
  return normalizeHostedUrl(value, "X (Twitter)", ["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
}

function normalizeWhatsapp(value) {
  const cleaned = optionalString(value, "WhatsApp number", 50);
  if (!cleaned) return null;
  const normalized = cleaned.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw validationError("Enter the WhatsApp number in international format, for example +8801712345678");
  }
  return normalized;
}

function normalizeTelegram(value) {
  const cleaned = optionalString(value, "Telegram username", 500);
  if (!cleaned) return null;
  let username = cleaned;
  const candidate = /^(?:www\.)?t\.me\//i.test(cleaned) ? `https://${cleaned}` : cleaned;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw validationError("Enter a valid Telegram username or t.me link");
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.port
      || !["t.me", "www.t.me"].includes(hostname)
      || pathParts.length !== 1
      || parsed.search
      || parsed.hash
    ) {
      throw validationError("Enter a valid Telegram username or t.me link");
    }
    [username] = pathParts;
  } else {
    username = cleaned.replace(/^@/, "");
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw validationError("Telegram username must contain 5 to 32 letters, numbers or underscores");
  }
  return username;
}

const normalizers = {
  facebook_url: normalizeFacebookUrl,
  instagram_url: normalizeInstagramUrl,
  whatsapp: normalizeWhatsapp,
  twitter_url: normalizeTwitterUrl,
  telegram: normalizeTelegram,
};

function normalizeSocialProfilePatch(body = {}) {
  const values = {};
  const provided = {};
  for (const field of SOCIAL_PROFILE_FIELDS) {
    provided[field] = Object.prototype.hasOwnProperty.call(body, field);
    values[field] = provided[field] ? normalizers[field](body[field]) : null;
  }
  return { values, provided };
}

module.exports = {
  SOCIAL_PROFILE_FIELDS,
  normalizeFacebookUrl,
  normalizeInstagramUrl,
  normalizeSocialProfilePatch,
  normalizeTelegram,
  normalizeTwitterUrl,
  normalizeWhatsapp,
};
