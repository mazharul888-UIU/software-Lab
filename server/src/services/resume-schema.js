const { query } = require("../config/db");

let schemaPromise;

async function buildResumeSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS student_resumes (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      resume_data JSON NOT NULL,
      photo_data LONGTEXT NULL,
      photo_name VARCHAR(255) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_student_resumes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );
}

async function ensureResumeSchema() {
  if (!schemaPromise) {
    schemaPromise = buildResumeSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureResumeSchema };
