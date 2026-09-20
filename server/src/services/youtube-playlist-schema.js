const { query } = require("../config/db");

let schemaPromise;

async function buildYouTubePlaylistSchema() {
  await query(`CREATE TABLE IF NOT EXISTS youtube_playlists (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    youtube_playlist_id VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    channel_title VARCHAR(255) NULL,
    thumbnail_url VARCHAR(1000) NULL,
    playlist_url VARCHAR(500) NOT NULL,
    item_count SMALLINT UNSIGNED NULL,
    tags JSON NULL,
    source ENUM('youtube', 'admin') NOT NULL DEFAULT 'youtube',
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_youtube_playlist_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_youtube_playlists_status_updated (status, updated_at),
    INDEX idx_youtube_playlists_source (source)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS youtube_playlist_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    playlist_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NULL,
    assignment_source ENUM('admin', 'auto') NOT NULL DEFAULT 'admin',
    recommendation_reason VARCHAR(600) NULL,
    state ENUM('suggested', 'saved', 'completed') NOT NULL DEFAULT 'suggested',
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    saved_at DATETIME NULL,
    completed_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_youtube_playlist_student (playlist_id, student_id),
    CONSTRAINT fk_youtube_assignment_playlist FOREIGN KEY (playlist_id) REFERENCES youtube_playlists(id) ON DELETE CASCADE,
    CONSTRAINT fk_youtube_assignment_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_youtube_assignment_admin FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_youtube_assignments_student_state (student_id, state, assigned_at),
    INDEX idx_youtube_assignments_admin (assigned_by, assigned_at)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS youtube_playlist_search_cache (
    cache_key CHAR(64) PRIMARY KEY,
    query_text VARCHAR(500) NOT NULL,
    playlist_ids JSON NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_youtube_playlist_cache_expiry (expires_at)
  )`);
}

function ensureYouTubePlaylistSchema() {
  if (!schemaPromise) {
    schemaPromise = buildYouTubePlaylistSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureYouTubePlaylistSchema };
