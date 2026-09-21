const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { query } = require("../config/db");

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFICATION_ATTEMPTS = 5;

let schemaPromise;
let gmailTransporter;

async function ensureEmailVerificationSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS pending_student_registrations (
        email VARCHAR(190) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        university VARCHAR(190) NULL,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        send_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pending_registration_expiry (expires_at)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS pending_student_password_resets (
        email VARCHAR(190) PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        send_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pending_password_reset_expiry (expires_at),
        CONSTRAINT fk_pending_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function verificationSecret() {
  const secret = String(
    process.env.EMAIL_VERIFICATION_SECRET ||
    process.env.MAIL_VERIFICATION_SECRET ||
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "careerforge-local-email-verification"),
  );
  if (!secret) {
    const error = new Error("Email verification is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return secret;
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashVerificationCode(email, code) {
  return crypto
    .createHmac("sha256", verificationSecret())
    .update(`${String(email).trim().toLowerCase()}:${String(code).trim()}`)
    .digest("hex");
}

function hashPasswordResetCode(email, code) {
  return crypto
    .createHmac("sha256", verificationSecret())
    .update(`password-reset:${String(email).trim().toLowerCase()}:${String(code).trim()}`)
    .digest("hex");
}

function matchesVerificationCode(email, code, expectedHash) {
  const actual = Buffer.from(hashVerificationCode(email, code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function matchesPasswordResetCode(email, code, expectedHash) {
  const actual = Buffer.from(hashPasswordResetCode(email, code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function verificationEmailContent({ name, code }) {
  const safeName = escapeHtml(name);
  return {
    subject: `${code} is your CareerCube verification code`,
    text: `Hi ${name}, your CareerCube verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you did not request this account, you can ignore this email.`,
    html: `
      <div style="margin:0;background:#f5f1ea;padding:36px 16px;font-family:Inter,Arial,sans-serif;color:#1e2532">
        <div style="max-width:560px;margin:0 auto;border:1px solid #e3ddd3;border-radius:24px;background:#ffffff;padding:36px">
          <div style="font-size:22px;font-weight:800">Career<span style="color:#3559d5">Cube</span></div>
          <h1 style="margin:32px 0 10px;font-family:Georgia,serif;font-size:34px;line-height:1.1">Verify your email</h1>
          <p style="margin:0 0 24px;color:#697386;line-height:1.7">Hi ${safeName}, use this code to finish creating your student account.</p>
          <div style="border-radius:18px;background:#f2f4fb;padding:22px;text-align:center;font-size:36px;font-weight:800;letter-spacing:10px;color:#3559d5">${code}</div>
          <p style="margin:22px 0 0;color:#697386;font-size:14px;line-height:1.6">This code expires in ${CODE_TTL_MINUTES} minutes. Never share it with anyone. If you did not request this account, ignore this email.</p>
        </div>
      </div>
    `,
  };
}

function passwordResetEmailContent({ name, code }) {
  const safeName = escapeHtml(name);
  return {
    subject: `${code} is your CareerCube password reset code`,
    text: `Hi ${name}, your CareerCube password reset code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you did not request a password reset, you can ignore this email.`,
    html: `
      <div style="margin:0;background:#f5f1ea;padding:36px 16px;font-family:Inter,Arial,sans-serif;color:#1e2532">
        <div style="max-width:560px;margin:0 auto;border:1px solid #e3ddd3;border-radius:24px;background:#ffffff;padding:36px">
          <div style="font-size:22px;font-weight:800">Career<span style="color:#3559d5">Cube</span></div>
          <h1 style="margin:32px 0 10px;font-family:Georgia,serif;font-size:34px;line-height:1.1">Reset your password</h1>
          <p style="margin:0 0 24px;color:#697386;line-height:1.7">Hi ${safeName}, use this code to choose a new password for your student account.</p>
          <div style="border-radius:18px;background:#f2f4fb;padding:22px;text-align:center;font-size:36px;font-weight:800;letter-spacing:10px;color:#3559d5">${code}</div>
          <p style="margin:22px 0 0;color:#697386;font-size:14px;line-height:1.6">This code expires in ${CODE_TTL_MINUTES} minutes. Never share it with anyone. If you did not request this reset, ignore this email.</p>
        </div>
      </div>
    `,
  };
}

function providerConfigurationError() {
  const error = new Error("Verification email delivery is not configured.");
  error.statusCode = 503;
  return error;
}

function selectedEmailProvider() {
  const explicitProvider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (explicitProvider) return explicitProvider;
  if (String(process.env.RESEND_API_KEY || "").trim()) return "resend";
  if (
    String(process.env.GMAIL_USER || "").trim() &&
    String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "")
  ) {
    return "gmail";
  }
  return "console";
}

async function sendWithGmail({ email, content }) {
  const user = String(process.env.GMAIL_USER || "").trim();
  const appPassword = String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !appPassword) throw providerConfigurationError();

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      pool: false,
      auth: {
        user,
        pass: appPassword,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 12_000,
    });
  }

  try {
    const result = await gmailTransporter.sendMail({
      from: String(process.env.EMAIL_FROM || `CareerCube <${user}>`).trim(),
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    return { provider: "gmail", id: result.messageId || null };
  } catch (providerError) {
    console.error("Gmail verification email failed", {
      code: providerError?.code || "provider_error",
      responseCode: providerError?.responseCode || null,
    });
    const error = new Error("Verification email could not be sent. Please try again shortly.");
    error.code = "email_delivery_unavailable";
    error.statusCode = 503;
    throw error;
  }
}

async function sendWithResend({ email, code, content, purpose = "registration" }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw providerConfigurationError();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `careerforge-${purpose}-${hashVerificationCode(email, code)}`,
    },
    body: JSON.stringify({
      from: String(process.env.EMAIL_FROM || "CareerCube <onboarding@resend.dev>").trim(),
      to: [email],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend verification email failed", {
      status: response.status,
      code: responseBody?.name || responseBody?.statusCode || "provider_error",
    });
    const error = new Error("Verification email could not be sent. Please try again shortly.");
    error.code = "email_delivery_unavailable";
    error.statusCode = 503;
    throw error;
  }
  return { provider: "resend", id: responseBody.id || null };
}

async function sendVerificationEmail({ email, name, code }) {
  const provider = selectedEmailProvider();
  const content = verificationEmailContent({ name, code });
  const isHostedProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  if (provider === "gmail") {
    return sendWithGmail({ email, content });
  }
  if (provider === "resend") {
    return sendWithResend({ email, code, content, purpose: "registration" });
  }
  if (
    provider === "console" &&
    !isHostedProduction &&
    String(process.env.EMAIL_DELIVERY_MODE || "console").toLowerCase() === "console"
  ) {
    console.info(`[CareerCube local verification] ${email}: ${code} (valid for ${CODE_TTL_MINUTES} minutes)`);
    return { provider: "console" };
  }
  throw providerConfigurationError();
}

async function sendPasswordResetEmail({ email, name, code }) {
  const provider = selectedEmailProvider();
  const content = passwordResetEmailContent({ name, code });
  const isHostedProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  if (provider === "gmail") return sendWithGmail({ email, content });
  if (provider === "resend") return sendWithResend({ email, code, content, purpose: "password-reset" });
  if (
    provider === "console" &&
    !isHostedProduction &&
    String(process.env.EMAIL_DELIVERY_MODE || "console").toLowerCase() === "console"
  ) {
    console.info(`[CareerCube local password reset] ${email}: ${code} (valid for ${CODE_TTL_MINUTES} minutes)`);
    return { provider: "console" };
  }
  throw providerConfigurationError();
}

module.exports = {
  CODE_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  MAX_VERIFICATION_ATTEMPTS,
  ensureEmailVerificationSchema,
  generateVerificationCode,
  hashVerificationCode,
  matchesVerificationCode,
  hashPasswordResetCode,
  matchesPasswordResetCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
