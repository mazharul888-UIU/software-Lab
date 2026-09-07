const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  MAX_PHOTO_DATA_LENGTH,
  createResumeData,
  normalizeResumeData,
  normalizeResumePhoto,
  parseStoredResume,
} = require("../server/src/services/resume-profile");

const user = { name: "Mazharul Islam", email: "mazharul@example.com" };
const empty = createResumeData(user);
assert.equal(empty.name, "Mazharul Islam");
assert.equal(empty.email, "mazharul@example.com");

const resume = normalizeResumeData({
  name: "  Sami  ",
  title: " Junior Backend Engineer ",
  education: [{ id: "degree_01", degree: "BSc", institution: "UIU" }],
  experiences: [{ id: "invalid id", title: "Intern", details: "Built an API" }],
  projects: "not-an-array",
}, user);
assert.equal(resume.name, "Sami");
assert.equal(resume.title, "Junior Backend Engineer");
assert.equal(resume.education[0].id, "degree_01");
assert.equal(resume.experiences[0].id, "experience-1");
assert.deepEqual(resume.projects, []);
assert.equal(parseStoredResume(JSON.stringify(resume), user).name, "Sami");
assert.throws(
  () => normalizeResumeData(null, user),
  (error) => error.statusCode === 400,
  "A malformed resume payload must be rejected",
);

const photo = normalizeResumePhoto({ src: "data:image/png;base64,aGVsbG8=", name: " headshot.png " });
assert.deepEqual(photo, { src: "data:image/png;base64,aGVsbG8=", name: "headshot.png" });
assert.throws(
  () => normalizeResumePhoto({ src: "https://example.com/photo.png" }),
  (error) => error.statusCode === 400,
  "Remote photo URLs must not be persisted as uploads",
);
assert.throws(
  () => normalizeResumePhoto({ src: `data:image/jpeg;base64,${"a".repeat(MAX_PHOTO_DATA_LENGTH)}` }),
  (error) => error.statusCode === 413,
  "Oversized photos must be rejected before the database write",
);

const schema = fs.readFileSync("database/schema.sql", "utf8");
const app = fs.readFileSync("server/src/app.js", "utf8");
const route = fs.readFileSync("server/src/routes/resume.js", "utf8");
const vaultUi = fs.readFileSync("components/student/StudentWorkspace.jsx", "utf8");
assert.match(schema, /CREATE TABLE IF NOT EXISTS student_resumes/, "The base schema needs student CV storage");
assert.match(app, /app\.use\("\/api\/resume", resumeRoutes\)/, "The resume API must be registered");
assert.match(route, /router\.get\("\/"/, "The resume API must load saved CVs");
assert.match(route, /router\.patch\("\/"/, "The resume API must save CVs");
assert.match(route, /ensureResumeSchema\(\)/, "The resume API must provision its storage safely");
assert.match(vaultUi, /apiRequest\("\/resume"/, "The Career Vault must use the saved CV API");
assert.match(vaultUi, /Save CV/, "Students need an explicit Save CV action");
assert.match(vaultUi, /Saved to account/, "The status must reflect database-backed saves");

console.log("Resume persistence smoke test passed.");
