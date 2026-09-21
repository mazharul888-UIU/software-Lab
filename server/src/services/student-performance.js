const { query } = require("../config/db");

let schemaReady;

async function ensureStudentPerformanceSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS student_activity_days (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          activity_date DATE NOT NULL,
          activity_type VARCHAR(60) NOT NULL,
          minutes SMALLINT UNSIGNED NOT NULL DEFAULT 1,
          occurrence_count INT UNSIGNED NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_student_activity_day_type (user_id, activity_date, activity_type),
          INDEX idx_student_activity_days (user_id, activity_date),
          CONSTRAINT fk_student_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
      await query(`
        CREATE TABLE IF NOT EXISTS student_weekly_reports (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          week_start DATE NOT NULL,
          week_end DATE NOT NULL,
          readiness_score DECIMAL(5,2) NOT NULL DEFAULT 0,
          assessment_score DECIMAL(5,2) NOT NULL DEFAULT 0,
          learning_progress DECIMAL(5,2) NOT NULL DEFAULT 0,
          active_days TINYINT UNSIGNED NOT NULL DEFAULT 0,
          current_streak TINYINT UNSIGNED NOT NULL DEFAULT 0,
          total_minutes INT UNSIGNED NOT NULL DEFAULT 0,
          report_json JSON NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_student_weekly_report (user_id, week_start),
          CONSTRAINT fk_student_weekly_report_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function formatDayLabel(date) {
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
}

async function recordStudentActivity({ userId, type, minutes = 1 }) {
  await ensureStudentPerformanceSchema();
  const safeMinutes = Math.max(1, Math.min(240, Math.round(Number(minutes) || 1)));
  await query(
    `INSERT INTO student_activity_days (user_id, activity_date, activity_type, minutes, occurrence_count)
     VALUES (?, CURDATE(), ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       minutes=IF(VALUES(activity_type)='dashboard', GREATEST(minutes, VALUES(minutes)), LEAST(480, minutes + VALUES(minutes))),
       occurrence_count=occurrence_count + 1`,
    [userId, String(type || "general").slice(0, 60), safeMinutes],
  );
}

async function getPerformanceSnapshot(userId, values = {}) {
  await ensureStudentPerformanceSchema();
  const today = new Date();
  const monday = startOfWeek(today);
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);
  const rows = await query(
    `SELECT activity_date, SUM(minutes) minutes, SUM(occurrence_count) activity_count,
            GROUP_CONCAT(DISTINCT activity_type ORDER BY activity_type SEPARATOR ',') activity_types
     FROM student_activity_days
     WHERE user_id=? AND activity_date BETWEEN ? AND LEAST(?, CURDATE())
     GROUP BY activity_date ORDER BY activity_date`,
    [userId, toDateKey(monday), toDateKey(weekEnd)],
  );
  const byDate = new Map(rows.map((row) => [toDateKey(new Date(row.activity_date)), row]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const row = byDate.get(toDateKey(date));
    return {
      date: toDateKey(date),
      day: formatDayLabel(date),
      minutes: Number(row?.minutes || 0),
      activityCount: Number(row?.activity_count || 0),
      activityTypes: row?.activity_types ? String(row.activity_types).split(",") : [],
    };
  });
  const activeDays = days.filter((day) => day.minutes > 0).length;
  let currentStreak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (!days[index].minutes) break;
    currentStreak += 1;
  }
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const report = {
    readinessScore: Number(values.readinessScore || 0),
    assessmentScore: Number(values.assessmentScore || 0),
    learningProgress: Number(values.learningProgress || 0),
    applicationsActive: Number(values.applicationsActive || 0),
    activeDays,
    currentStreak,
    totalMinutes,
    weekStart: toDateKey(monday),
    weekEnd: toDateKey(weekEnd),
  };
  await query(
    `INSERT INTO student_weekly_reports
      (user_id, week_start, week_end, readiness_score, assessment_score, learning_progress,
       active_days, current_streak, total_minutes, report_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       week_end=VALUES(week_end), readiness_score=VALUES(readiness_score),
       assessment_score=VALUES(assessment_score), learning_progress=VALUES(learning_progress),
       active_days=VALUES(active_days), current_streak=VALUES(current_streak),
       total_minutes=VALUES(total_minutes), report_json=VALUES(report_json)`,
    [userId, report.weekStart, report.weekEnd, report.readinessScore, report.assessmentScore,
      report.learningProgress, report.activeDays, report.currentStreak, report.totalMinutes, JSON.stringify(report)],
  );
  const [saved] = await query(
    `SELECT updated_at saved_at FROM student_weekly_reports WHERE user_id=? AND week_start=? LIMIT 1`,
    [userId, report.weekStart],
  );
  return {
    ...report,
    todayIndex: Math.min(6, Math.max(0, (today.getDay() + 6) % 7)),
    days,
    savedAt: saved?.saved_at || null,
  };
}

module.exports = {
  ensureStudentPerformanceSchema,
  recordStudentActivity,
  getPerformanceSnapshot,
};
