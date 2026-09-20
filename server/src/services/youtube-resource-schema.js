const { query } = require("../config/db");

let schemaPromise;

async function buildYouTubeResourceSchema() {
  await query(`CREATE TABLE IF NOT EXISTS youtube_video_resources (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    youtube_video_id VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    channel_title VARCHAR(255) NULL,
    thumbnail_url VARCHAR(1000) NULL,
    watch_url VARCHAR(500) NOT NULL,
    duration_iso VARCHAR(40) NULL,
    tags JSON NULL,
    source ENUM('youtube', 'admin') NOT NULL DEFAULT 'youtube',
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_youtube_video_resource_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_youtube_video_resources_status_updated (status, updated_at),
    INDEX idx_youtube_video_resources_source (source)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS youtube_video_resource_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    resource_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NULL,
    recommendation_reason VARCHAR(600) NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_youtube_video_resource_student (resource_id, student_id),
    CONSTRAINT fk_youtube_video_assignment_resource FOREIGN KEY (resource_id) REFERENCES youtube_video_resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_youtube_video_assignment_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_youtube_video_assignment_admin FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_youtube_video_assignments_student (student_id, assigned_at),
    INDEX idx_youtube_video_assignments_admin (assigned_by, assigned_at)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS youtube_video_search_cache (
    cache_key CHAR(64) PRIMARY KEY,
    skill_query VARCHAR(160) NOT NULL,
    video_ids JSON NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_youtube_video_cache_expiry (expires_at)
  )`);
}

function ensureYouTubeResourceSchema() {
  if (!schemaPromise) {
    schemaPromise = buildYouTubeResourceSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureYouTubeResourceSchema };
