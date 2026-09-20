const legacySessionKey = "careerforge_session";
const legacyTokenKey = "careerforge_token";

const readJson = (key) => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const isKnownRole = (role) => role === "student" || role === "admin";
const sessionKey = (role) => `careerforge_${role}_session`;
const tokenKey = (role) => `careerforge_${role}_token`;

export function getRoleSession(role) {
  if (!isKnownRole(role)) return readJson(legacySessionKey);
  const scoped = readJson(sessionKey(role));
  if (scoped?.role === role) return scoped;
  const legacy = readJson(legacySessionKey);
  return legacy?.role === role ? legacy : null;
}

export function getRoleToken(role) {
  if (typeof window === "undefined") return null;
  if (!isKnownRole(role)) return localStorage.getItem(legacyTokenKey);
  const scoped = localStorage.getItem(tokenKey(role));
  if (scoped) return scoped;
  return getRoleSession(role) ? localStorage.getItem(legacyTokenKey) : null;
}

export function getRouteRole() {
  if (typeof window === "undefined") return null;
  if (window.location.pathname.startsWith("/student")) return "student";
  if (window.location.pathname.startsWith("/admin")) return "admin";
  return null;
}

export function saveRoleSession(session, token) {
  const role = session?.role;
  if (!isKnownRole(role) || typeof window === "undefined") return;
  localStorage.setItem(sessionKey(role), JSON.stringify(session));
  if (token) localStorage.setItem(tokenKey(role), token);

  // Retain the original keys for existing pages and older saved sessions, without
  // replacing another role's active legacy session during a background profile update.
  const legacy = readJson(legacySessionKey);
  if (token || !legacy || legacy.role === role) {
    localStorage.setItem(legacySessionKey, JSON.stringify(session));
    if (token) localStorage.setItem(legacyTokenKey, token);
  }
}

export function clearRoleSession(role) {
  if (!isKnownRole(role) || typeof window === "undefined") return;
  localStorage.removeItem(sessionKey(role));
  localStorage.removeItem(tokenKey(role));
  if (getRoleSession(role)?.role === role) {
    localStorage.removeItem(legacySessionKey);
    localStorage.removeItem(legacyTokenKey);
  }
}
