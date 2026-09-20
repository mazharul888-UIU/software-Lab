const express = require("express");
const { pool, query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { ensureEventSchema } = require("../services/event-schema");
const { getStudentPlaylistRecommendations, setStudentPlaylistState } = require("../services/youtube-playlists");
const { getStudentSkillResources } = require("../services/youtube-resources");

const router = express.Router();

router.get("/assessments", authenticate, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT a.id, a.title, a.description, a.category, a.difficulty,
       a.time_limit_minutes, a.passing_percentage, COUNT(q.id) question_count,
       (SELECT MAX(aa.percentage) FROM assessment_attempts aa WHERE aa.assessment_id=a.id AND aa.user_id=?) best_score
       FROM assessments a
       LEFT JOIN questions q ON q.assessment_id=a.id AND q.status='published'
       WHERE a.status='published' AND a.created_by IS NOT NULL
       GROUP BY a.id
       HAVING COUNT(q.id) > 0
       ORDER BY a.created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

router.get("/assessments/:id/questions", authenticate, async (req, res, next) => {
  try {
    const [assessment] = await query(
      "SELECT id FROM assessments WHERE id=? AND status='published' AND created_by IS NOT NULL",
      [req.params.id],
    );
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    const questions = await query(
      "SELECT id, prompt, question_type, difficulty, points FROM questions WHERE assessment_id=? AND status='published' ORDER BY id",
      [req.params.id],
    );
    for (const question of questions) {
      question.options = await query("SELECT id, option_text FROM question_options WHERE question_id=? ORDER BY sort_order", [question.id]);
    }
    res.json(questions);
  } catch (error) { next(error); }
});

router.post("/assessments/:id/submit", authenticate, async (req, res, next) => {
  try {
    const { answers = [], startedAt } = req.body;
    const [assessment] = await query(
      "SELECT id FROM assessments WHERE id=? AND status='published' AND created_by IS NOT NULL",
      [req.params.id],
    );
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const questions = await query(
      "SELECT id, points FROM questions WHERE assessment_id=? AND status='published'",
      [req.params.id],
    );
    if (!questions.length) return res.status(400).json({ error: "This assessment has no published questions" });

    const answerMap = new Map(
      (Array.isArray(answers) ? answers : [])
        .map((answer) => [Number(answer.questionId), Number(answer.optionId)])
        .filter(([questionId, optionId]) => questionId && optionId),
    );
    let score = 0;
    let correctAnswers = 0;
    const total = questions.reduce((sum, question) => sum + Number(question.points), 0);
    for (const question of questions) {
      const optionId = answerMap.get(Number(question.id));
      if (!optionId) continue;
      const rows = await query(
        `SELECT qo.is_correct FROM question_options qo
         JOIN questions q ON q.id=qo.question_id
         WHERE q.id=? AND q.assessment_id=? AND qo.id=?`,
        [question.id, req.params.id, optionId],
      );
      if (rows[0]?.is_correct) {
        score += Number(question.points);
        correctAnswers += 1;
      }
    }
    const percentage = total ? Math.round((score / total) * 100) : 0;
    const parsedStartedAt = startedAt && !Number.isNaN(Date.parse(startedAt)) ? new Date(startedAt) : new Date();
    await query(
      "INSERT INTO assessment_attempts (user_id, assessment_id, score, total_points, percentage, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [req.user.id, req.params.id, score, total, percentage, parsedStartedAt],
    );
    res.json({ score, total, percentage, correctAnswers, questionCount: questions.length });
  } catch (error) { next(error); }
});

router.get("/resources", authenticate, async (req, res, next) => {
  try {
    res.json(await query("SELECT * FROM learning_resources WHERE status='published' ORDER BY featured DESC, created_at DESC"));
  } catch (error) { next(error); }
});

router.get("/playlists/recommendations", authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Student account required" });
    res.json(await getStudentPlaylistRecommendations(req.user.id));
  } catch (error) { next(error); }
});

router.post("/playlists/:id/state", authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Student account required" });
    const result = await setStudentPlaylistState({
      userId: req.user.id,
      playlistId: Number(req.params.id),
      state: req.body?.state,
    });
    res.json({ ...result, message: result.state === "completed" ? "Playlist marked complete" : "Playlist saved to your learning list" });
  } catch (error) { next(error); }
});

router.get("/youtube-resources", authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Student account required" });
    res.json(await getStudentSkillResources({ userId: req.user.id, skill: req.query?.skill }));
  } catch (error) { next(error); }
});

router.get("/events", authenticate, async (req, res, next) => {
  try {
    await ensureEventSchema();
    if (req.user.role !== "student") return res.status(403).json({ error: "Student account required" });
    const rows = await query(
      `SELECT e.id, e.title, e.description, e.event_type, e.host, e.location, e.event_url,
              e.starts_at, e.ends_at, e.capacity, e.status, e.created_at, e.updated_at,
              EXISTS(SELECT 1 FROM event_registrations er WHERE er.event_id=e.id AND er.user_id=?) registered,
              (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id=e.id) registration_count
       FROM events e
       WHERE e.created_by IS NOT NULL AND e.status='published' AND e.starts_at>=NOW()
       ORDER BY e.starts_at`,
      [req.user.id],
    );
    res.json(rows.map((event) => ({
      ...event,
      registration_count: Number(event.registration_count || 0),
      seats_remaining: event.capacity == null ? null : Math.max(0, Number(event.capacity) - Number(event.registration_count || 0)),
    })));
  } catch (error) { next(error); }
});

router.post("/events/:id/register", authenticate, async (req, res, next) => {
  let connection;
  try {
    await ensureEventSchema();
    if (req.user.role !== "student") return res.status(403).json({ error: "Only students can reserve event seats" });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [events] = await connection.execute(
      `SELECT e.id, e.capacity,
              EXISTS(SELECT 1 FROM event_registrations er WHERE er.event_id=e.id AND er.user_id=?) registered,
              (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id=e.id) registration_count
       FROM events e
       WHERE e.id=? AND e.created_by IS NOT NULL AND e.status='published' AND e.starts_at>=NOW()
       FOR UPDATE`,
      [req.user.id, req.params.id],
    );
    const event = events[0];
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ error: "This event is no longer available" });
    }
    const registrationCount = Number(event.registration_count || 0);
    if (!event.registered && event.capacity != null && registrationCount >= Number(event.capacity)) {
      await connection.rollback();
      return res.status(409).json({ error: "This event is fully reserved" });
    }
    if (!event.registered) {
      await connection.execute("INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)", [event.id, req.user.id]);
    }
    await connection.commit();
    const nextCount = registrationCount + (event.registered ? 0 : 1);
    res.status(event.registered ? 200 : 201).json({
      message: event.registered ? "Your seat is already reserved" : "Seat reserved successfully",
      registered: true,
      registrationCount: nextCount,
      seatsRemaining: event.capacity == null ? null : Math.max(0, Number(event.capacity) - nextCount),
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

router.delete("/events/:id/register", authenticate, async (req, res, next) => {
  let connection;
  try {
    await ensureEventSchema();
    if (req.user.role !== "student") return res.status(403).json({ error: "Only students can cancel event reservations" });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [events] = await connection.execute(
      `SELECT e.id, e.capacity,
              (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id=e.id) registration_count
       FROM events e
       WHERE e.id=? AND e.created_by IS NOT NULL AND e.starts_at>=NOW()
       FOR UPDATE`,
      [req.params.id],
    );
    const event = events[0];
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ error: "This event can no longer be cancelled" });
    }

    const [result] = await connection.execute(
      "DELETE FROM event_registrations WHERE event_id=? AND user_id=?",
      [event.id, req.user.id],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ error: "You do not have an active reservation for this event" });
    }

    await connection.commit();
    const nextCount = Math.max(0, Number(event.registration_count || 0) - 1);
    res.json({
      message: "Reservation cancelled. Your seat is available again.",
      registered: false,
      registrationCount: nextCount,
      seatsRemaining: event.capacity == null ? null : Math.max(0, Number(event.capacity) - nextCount),
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;
