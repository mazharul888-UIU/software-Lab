const express = require("express");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { ensureJobSchema } = require("../services/job-schema");
const { ensureMatchingSchema } = require("../services/matching-schema");
const { getPlatformSettings } = require("../services/platform-settings");
const { getBangladeshExternalJobs } = require("../services/external-job-search");
const {
  profileForMatching,
  missingProfileFields,
  buildLocalMatch,
  profileSignature,
  jobSignature,
  geminiMatchingConfigured,
  generateGeminiInsights,
} = require("../services/job-matching");

const router = express.Router();
const aiGenerationWindows = new Map();

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || "[]"); } catch { return []; }
}

function consumeAiGeneration(userId) {
  const now = Date.now();
  const current = aiGenerationWindows.get(userId) || [];
  const active = current.filter((time) => now - time < 10 * 60 * 1000);
  if (active.length >= 3) {
    aiGenerationWindows.set(userId, active);
    return false;
  }
  active.push(now);
  aiGenerationWindows.set(userId, active);
  return true;
}

async function fetchCachedInsights(userId, profileFingerprint, matches) {
  if (!matches.length) return new Map();
  const jobIds = matches.map((job) => Number(job.id));
  const placeholders = jobIds.map(() => "?").join(",");
  const expected = new Map(matches.map((job) => [Number(job.id), jobSignature(job)]));
  const cache = new Map();
  const rows = await query(
    `SELECT job_id, job_signature, reasons, skill_gaps, generated_model
     FROM job_match_insights
     WHERE user_id=? AND profile_signature=? AND expires_at>NOW()
       AND job_id IN (${placeholders})`,
    [userId, profileFingerprint, ...jobIds],
  );
  for (const row of rows) {
    const id = Number(row.job_id);
    if (expected.get(id) !== row.job_signature) continue;
    const reasons = parseArray(row.reasons).filter((item) => typeof item === "string").slice(0, 3);
    const skillGaps = parseArray(row.skill_gaps).filter((item) => typeof item === "string").slice(0, 4);
    if (reasons.length) cache.set(id, { reasons, skillGaps, model: row.generated_model });
  }
  return cache;
}

async function cacheInsights(userId, profileFingerprint, insights, matchingJobs, model) {
  const jobs = new Map(matchingJobs.map((job) => [Number(job.id), job]));
  for (const insight of insights) {
    const job = jobs.get(Number(insight.jobId));
    if (!job) continue;
    await query(
      `INSERT INTO job_match_insights
       (user_id, job_id, profile_signature, job_signature, reasons, skill_gaps, generated_model, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
       ON DUPLICATE KEY UPDATE
        reasons=VALUES(reasons), skill_gaps=VALUES(skill_gaps), generated_model=VALUES(generated_model),
        created_at=NOW(), expires_at=DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
      [userId, Number(job.id), profileFingerprint, jobSignature(job), JSON.stringify(insight.reasons), JSON.stringify(insight.skillGaps), model],
    );
  }
}

function mergeInsight(match, insight) {
  if (!insight?.reasons?.length) return match;
  const validGaps = (insight.skillGaps || []).filter((gap) => match.skill_gaps
    .some((actual) => actual.toLowerCase() === String(gap).toLowerCase()));
  return {
    ...match,
    reasons: insight.reasons,
    skill_gaps: validGaps.length ? validGaps : match.skill_gaps,
    ai_explained: true,
  };
}

router.get("/", authenticate, async (req, res, next) => {
  try {
    await ensureJobSchema();
    const { search = "", type = "", category = "" } = req.query;
    const clauses = ["j.created_by IS NOT NULL", "j.status = 'live'", "j.expires_at > NOW()"];
    const params = [];
    if (search) { clauses.push("(j.title LIKE ? OR c.name LIKE ? OR j.description LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (type) { clauses.push("j.employment_type = ?"); params.push(type); }
    if (category) { clauses.push("j.category = ?"); params.push(category); }
    const rows = await query(
      `SELECT j.*, c.name company, c.description company_description,
        c.website company_website, c.logo_url, c.employee_rating,
        EXISTS(
          SELECT 1 FROM applications a
          WHERE a.job_id=j.id AND a.user_id=? AND a.status<>'withdrawn'
        ) already_applied
       FROM jobs j JOIN companies c ON c.id=j.company_id
       WHERE ${clauses.join(" AND ")} ORDER BY j.created_at DESC LIMIT 100`,
      [req.user.id, ...params],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

router.get("/recommendations", authenticate, async (req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    if (req.user.role !== "student") return res.status(403).json({ error: "Student account required" });
    await Promise.all([ensureJobSchema(), ensureMatchingSchema()]);
    const [profile] = await query(
      `SELECT degree, target_role, career_interests, location
       FROM student_profiles WHERE user_id=? LIMIT 1`,
      [req.user.id],
    );
    const skills = await query(
      `SELECT s.name, us.score, us.source
       FROM user_skills us JOIN skills s ON s.id=us.skill_id WHERE us.user_id=?`,
      [req.user.id],
    );
    const jobs = await query(
      `SELECT j.*, c.name company, c.description company_description,
        c.website company_website, c.logo_url, c.employee_rating,
        EXISTS(
          SELECT 1 FROM applications a
          WHERE a.job_id=j.id AND a.user_id=? AND a.status<>'withdrawn'
        ) already_applied,
        COALESCE((
          SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ')
          FROM job_skills js JOIN skills s ON s.id=js.skill_id
          WHERE js.job_id=j.id
        ), '') required_skills
       FROM jobs j JOIN companies c ON c.id=j.company_id
       WHERE j.created_by IS NOT NULL AND j.status='live' AND j.expires_at>NOW()
       ORDER BY j.created_at DESC LIMIT 100`,
      [req.user.id],
    );
    const externalFeed = await getBangladeshExternalJobs();
    const matchProfile = profileForMatching(profile || {}, skills);
    const missingFields = missingProfileFields(matchProfile);
    const matchingEnabled = Boolean(settings.ai.jobRecommendationsEnabled);
    const matchingJobs = [
      ...jobs.map((job) => ({
        ...job,
        external_source: false,
        source_name: job.application_mode === "external" ? job.source_label || "Verified company source" : "CareerCube",
      })),
      ...externalFeed.items,
    ];
    let matches = matchingEnabled
      ? matchingJobs.map((job) => buildLocalMatch(matchProfile, job))
      : matchingJobs.map((job) => ({ ...job, match_percentage: null, reasons: [], skill_gaps: [], matched_skills: [] }));

    matches.sort((left, right) => {
      const scoreDifference = Number(right.match_percentage ?? -1) - Number(left.match_percentage ?? -1);
      if (scoreDifference) return scoreDifference;
      return new Date(right.created_at || 0) - new Date(left.created_at || 0);
    });

    let aiExplained = 0;
    if (matchingEnabled && missingFields.length === 0 && geminiMatchingConfigured() && matches.length) {
      // External provider IDs are strings and are not persisted in job_match_insights.
      // They still receive the deterministic profile match above; Gemini explanations
      // remain scoped to jobs stored in CareerCube's database.
      const topMatches = matches.filter((job) => !job.external_source).slice(0, 8);
      const fingerprint = profileSignature(matchProfile);
      const cachedInsights = await fetchCachedInsights(req.user.id, fingerprint, topMatches);
      const uncached = topMatches.filter((job) => !cachedInsights.has(Number(job.id)));
      if (uncached.length && consumeAiGeneration(req.user.id)) {
        const generated = await generateGeminiInsights(matchProfile, uncached);
        if (generated.insights.length) {
          await cacheInsights(req.user.id, fingerprint, generated.insights, uncached, generated.model);
          for (const insight of generated.insights) {
            cachedInsights.set(Number(insight.jobId), {
              reasons: insight.reasons,
              skillGaps: insight.skillGaps,
              model: generated.model,
            });
          }
        }
      }
      matches = matches.map((job) => {
        const merged = mergeInsight(job, cachedInsights.get(Number(job.id)));
        if (merged.ai_explained) aiExplained += 1;
        return merged;
      });
    }
    res.json({
      items: matches,
      matchingEnabled,
      profileReady: missingFields.length === 0,
      missingFields,
      aiConfigured: geminiMatchingConfigured(),
      aiExplained,
      verifiedSourceJobs: matchingJobs.filter((job) => job.application_mode === "external").length,
      externalSource: {
        provider: "JSearch",
        configured: externalFeed.configured,
        status: externalFeed.status,
        syncedAt: externalFeed.syncedAt,
        jobCount: externalFeed.items.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

router.patch("/applications/:applicationId/withdraw", authenticate, async (req, res, next) => {
  try {
    await ensureJobSchema();
    if (req.user.role !== "student") return res.status(403).json({ error: "Only students can withdraw applications" });
    const [application] = await query(
      `SELECT a.id, a.job_id, a.status
       FROM applications a
       JOIN jobs j ON j.id=a.job_id
       WHERE a.id=? AND a.user_id=? AND j.created_by IS NOT NULL
       LIMIT 1`,
      [req.params.applicationId, req.user.id],
    );
    if (!application) return res.status(404).json({ error: "Application not found" });
    if (application.status === "withdrawn") return res.status(409).json({ error: "This application is already cancelled" });
    if (application.status === "rejected") return res.status(409).json({ error: "A rejected application cannot be cancelled" });

    await query(
      "UPDATE applications SET status='withdrawn', updated_at=NOW() WHERE id=? AND user_id=?",
      [application.id, req.user.id],
    );
    const [applicationStats] = await query(
      "SELECT COUNT(*) application_count FROM applications WHERE job_id=? AND status<>'withdrawn'",
      [application.job_id],
    );
    res.json({
      message: "Application cancelled",
      applicationCount: Number(applicationStats.application_count || 0),
    });
  } catch (error) { next(error); }
});

router.post("/:jobId/apply", authenticate, async (req, res, next) => {
  try {
    await ensureJobSchema();
    const settings = await getPlatformSettings();
    if (req.user.role !== "student") return res.status(403).json({ error: "Only students can apply for jobs" });
    const {
      coverLetter = "",
      resumeUrl = null,
      resumeSnapshot = null,
      resumeFile = null,
    } = req.body;
    const snapshotJson = resumeSnapshot && typeof resumeSnapshot === "object"
      ? JSON.stringify(resumeSnapshot)
      : null;
    if (snapshotJson && snapshotJson.length > 250000) {
      return res.status(413).json({ error: "Career Vault CV is too large to submit" });
    }
    const allowedResumeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    let resumeFileName = null;
    let resumeFileType = null;
    let resumeFileData = null;
    if (resumeFile) {
      resumeFileName = String(resumeFile.name || "resume").trim().slice(0, 255);
      resumeFileType = String(resumeFile.type || "").trim().slice(0, 100);
      resumeFileData = String(resumeFile.data || "");
      if (!allowedResumeTypes.has(resumeFileType)) return res.status(400).json({ error: "Resume file must be PDF, DOC or DOCX" });
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(resumeFileData)) return res.status(400).json({ error: "Resume file data is invalid" });
      if (resumeFileData.length > 1750000) return res.status(413).json({ error: "Resume file must be smaller than 1.25 MB" });
    }
    const [job] = await query(
      `SELECT id, application_mode FROM jobs
       WHERE id=? AND created_by IS NOT NULL AND status='live' AND expires_at>NOW()`,
      [req.params.jobId],
    );
    if (!job) return res.status(404).json({ error: "This job is no longer accepting applications" });
    if (job.application_mode === "external") {
      return res.status(409).json({ error: "This verified job accepts applications on its original company page" });
    }
    const [existingApplication] = await query(
      "SELECT id, status FROM applications WHERE user_id=? AND job_id=? LIMIT 1",
      [req.user.id, req.params.jobId],
    );
    if (existingApplication && existingApplication.status !== "withdrawn") {
      return res.status(409).json({ error: "You have already applied for this job" });
    }
    let applicationId;
    if (existingApplication) {
      await query(
        `UPDATE applications
         SET status='applied', cover_letter=?, resume_url=?, resume_snapshot=?,
             resume_file_name=?, resume_file_type=?, resume_file_data=?,
             applied_at=NOW(), updated_at=NOW()
         WHERE id=? AND user_id=?`,
        [
          String(coverLetter || "").trim().slice(0, 15000),
          resumeUrl,
          snapshotJson,
          resumeFileName,
          resumeFileType,
          resumeFileData,
          existingApplication.id,
          req.user.id,
        ],
      );
      applicationId = existingApplication.id;
    } else {
      const result = await query(
        `INSERT INTO applications
         (user_id, job_id, status, cover_letter, resume_url, resume_snapshot,
          resume_file_name, resume_file_type, resume_file_data)
         VALUES (?, ?, 'applied', ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          req.params.jobId,
          String(coverLetter || "").trim().slice(0, 15000),
          resumeUrl,
          snapshotJson,
          resumeFileName,
          resumeFileType,
          resumeFileData,
        ],
      );
      applicationId = result.insertId;
    }
    const [applicationStats] = await query(
      "SELECT COUNT(*) application_count FROM applications WHERE job_id=? AND status<>'withdrawn'",
      [req.params.jobId],
    );
    if (settings.integrations.webhookEnabled && settings.integrations.webhookUrl) {
      try {
        await fetch(settings.integrations.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "careerforge.application.submitted",
            applicationId,
            jobId: Number(req.params.jobId),
            studentId: req.user.id,
            submittedAt: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // A third-party webhook must never prevent a student's application.
      }
    }
    res.status(201).json({
      message: "Application submitted",
      applicationCount: Number(applicationStats.application_count || 0),
    });
  } catch (error) { next(error); }
});

router.get("/applications/mine", authenticate, async (req, res, next) => {
  try {
    await ensureJobSchema();
    const rows = await query(
      `SELECT a.*, j.title, c.name company, j.location, j.workplace_type, j.employment_type
       FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
       WHERE a.user_id=? AND j.created_by IS NOT NULL ORDER BY a.created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

module.exports = router;
