import { getRoleToken, getRouteRole } from "./roleSession";

const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();
const isLocalApiUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(configuredApiUrl);
const API_URL = import.meta.env.PROD
  ? (isLocalApiUrl || !configuredApiUrl ? "/api" : configuredApiUrl)
  : (configuredApiUrl || "http://localhost:4000/api");

export async function apiRequest(path, options = {}) {
  const token = getRoleToken(getRouteRole());
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Account service is temporarily unavailable. Please try again shortly.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || (response.status >= 500
      ? "Account service is temporarily unavailable. Please try again shortly."
      : "Request failed"));
    error.status = response.status;
    error.details = data;
    if (data.retryAfterSeconds != null) error.retryAfterSeconds = Number(data.retryAfterSeconds);
    if (data.attemptsRemaining != null) error.attemptsRemaining = Number(data.attemptsRemaining);
    throw error;
  }
  return data;
}

export async function apiDownload(path) {
  const token = getRoleToken(getRouteRole());
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "File download failed");
  }
  return {
    blob: await response.blob(),
    disposition: response.headers.get("Content-Disposition") || "",
  };
}

export async function signIn({ email, password, role }) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export async function registerStudent({ name, email, password, university }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, university }),
  });
}

export async function verifyStudentEmail({ email, code }) {
  return apiRequest("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function resendRegistrationCode(email) {
  return apiRequest("/auth/register/resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function requestPasswordReset(email) {
  return apiRequest("/auth/password/reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resendPasswordResetCode(email) {
  return apiRequest("/auth/password/reset/resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasswordResetCode({ email, code }) {
  return apiRequest("/auth/password/reset/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function confirmPasswordReset({ resetToken, password }) {
  return apiRequest("/auth/password/reset/confirm", {
    method: "POST",
    body: JSON.stringify({ resetToken, password }),
  });
}
