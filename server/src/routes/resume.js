const express = require("express");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { ensureResumeSchema } = require("../services/resume-schema");
const {
  createResumeData,
  normalizeResumeData,
  normalizeResumePhoto,
  parseStoredResume,
} = require("../services/resume-profile");

const router = express.Router();

router.use(authenticate);
router.use((req, res, next) => {
  if (req.user?.role !== "student") return res.status(403).json({ error: "Student access required" });
  next();
});
router.use(async (_req, _res, next) => {
  try {
    await ensureResumeSchema();
    next();
  } catch (error) {
    next(error);
  }
});

function responseFor(record, user, saved = Boolean(record)) {
  const photo = record?.photo_data
    ? { src: String(record.photo_data), name: String(record.photo_name || "CV photo") }
    : null;
  return {
    resume: record ? parseStoredResume(record.resume_data, user) : createResumeData(user),
    photo,
    saved,
    updatedAt: record?.updated_at || null,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const [record] = await query(
      `SELECT resume_data, photo_data, photo_name, updated_at
       FROM student_resumes WHERE user_id=? LIMIT 1`,
      [req.user.id],
    );
    res.json(responseFor(record, req.user));
  } catch (error) {
    next(error);
  }
});

router.patch("/", async (req, res, next) => {
  try {
    const resume = normalizeResumeData(req.body?.resume, req.user);
    const photo = normalizeResumePhoto(req.body?.photo);
    await query(
      `INSERT INTO student_resumes (user_id, resume_data, photo_data, photo_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         resume_data=VALUES(resume_data),
         photo_data=VALUES(photo_data),
         photo_name=VALUES(photo_name)`,
      [req.user.id, JSON.stringify(resume), photo?.src || null, photo?.name || null],
    );
    const [record] = await query(
      `SELECT resume_data, photo_data, photo_name, updated_at
       FROM student_resumes WHERE user_id=? LIMIT 1`,
      [req.user.id],
    );
    res.json(responseFor(record, req.user, true));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
