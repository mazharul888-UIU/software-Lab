const { query } = require("../config/db");

let schemaPromise;

async function buildExternalJobSchema() {
  await query(`CREATE TABLE IF NOT EXISTS external_job_listings (
    source VARCHAR(40) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    title VARCHAR(300) NOT NULL,
    company VARCHAR(300) NOT NULL,
    company_website VARCHAR(1000) NULL,
    description LONGTEXT NULL,
    requirements LONGTEXT NULL,
    responsibilities LONGTEXT NULL,
    category VARCHAR(160) NULL,
    location VARCHAR(220) NULL,
    workplace_type VARCHAR(40) NULL,
    employment_type VARCHAR(80) NULL,
    salary_min DECIMAL(12,2) NULL,
    salary_max DECIMAL(12,2) NULL,
    currency CHAR(3) NULL,
    application_url VARCHAR(1000) NOT NULL,
    posted_at DATETIME NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source, external_id),
    INDEX idx_external_job_listings_source_fetched (source, fetched_at),
    INDEX idx_external_job_listings_posted (posted_at)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS external_job_sync_state (
    source VARCHAR(40) NOT NULL PRIMARY KEY,
    last_attempt_at DATETIME NULL,
    last_success_at DATETIME NULL,
    last_error_code VARCHAR(120) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
}

function ensureExternalJobSchema() {
  if (!schemaPromise) {
    schemaPromise = buildExternalJobSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureExternalJobSchema };
