CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_status (role, status),
  INDEX idx_users_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS pending_student_registrations (
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
);

CREATE TABLE IF NOT EXISTS pending_student_password_resets (
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
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  university VARCHAR(190) NULL,
  degree VARCHAR(190) NULL,
  graduation_year SMALLINT NULL,
  target_role VARCHAR(140) NULL,
  career_interests JSON NULL,
  location VARCHAR(140) NULL,
  phone VARCHAR(50) NULL,
  bio TEXT NULL,
  avatar_url VARCHAR(500) NULL,
  avatar_data LONGTEXT NULL,
  facebook_url VARCHAR(500) NULL,
  instagram_url VARCHAR(500) NULL,
  whatsapp VARCHAR(20) NULL,
  twitter_url VARCHAR(500) NULL,
  telegram VARCHAR(32) NULL,
  resume_url VARCHAR(500) NULL,
  readiness_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  profile_completion DECIMAL(5,2) NOT NULL DEFAULT 0,
  preferences JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0,
  source ENUM('profile', 'assessment', 'admin') NOT NULL DEFAULT 'profile',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, skill_id),
  CONSTRAINT fk_user_skills_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_skills_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  description TEXT NULL,
  website VARCHAR(300) NULL,
  logo_url VARCHAR(500) NULL,
  employee_rating DECIMAL(2,1) NULL,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  title VARCHAR(200) NULL,
  review_text TEXT NULL,
  status ENUM('pending', 'published', 'removed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_company_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description LONGTEXT NOT NULL,
  responsibilities TEXT NULL,
  requirements TEXT NULL,
  category VARCHAR(100) NOT NULL,
  employment_type ENUM('Full-time', 'Part-time', 'Internship', 'Contract') NOT NULL,
  location VARCHAR(180) NOT NULL,
  workplace_type ENUM('On-site', 'Hybrid', 'Remote') NOT NULL,
  salary_min DECIMAL(12,2) NULL,
  salary_max DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BDT',
  status ENUM('draft', 'pending', 'live', 'closed') NOT NULL DEFAULT 'draft',
  expires_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  application_mode ENUM('careerforge', 'external') NOT NULL DEFAULT 'careerforge',
  external_apply_url VARCHAR(1000) NULL,
  source_label VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_jobs_status_category (status, category)
);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS created_by BIGINT UNSIGNED NULL AFTER expires_at;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_mode ENUM('careerforge', 'external') NOT NULL DEFAULT 'careerforge' AFTER created_by;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS external_apply_url VARCHAR(1000) NULL AFTER application_mode;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS source_label VARCHAR(120) NULL AFTER external_apply_url;

CREATE TABLE IF NOT EXISTS job_skills (
  job_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  weight DECIMAL(4,3) NOT NULL DEFAULT 1,
  required_score DECIMAL(5,2) NOT NULL DEFAULT 50,
  PRIMARY KEY (job_id, skill_id),
  CONSTRAINT fk_job_skills_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_skills_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_match_insights (
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  profile_signature CHAR(64) NOT NULL,
  job_signature CHAR(64) NOT NULL,
  reasons JSON NOT NULL,
  skill_gaps JSON NOT NULL,
  generated_model VARCHAR(180) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, job_id, profile_signature, job_signature),
  INDEX idx_job_match_insights_lookup (user_id, profile_signature, expires_at),
  CONSTRAINT fk_job_match_insights_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_match_insights_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  status ENUM('applied', 'in_review', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn') NOT NULL DEFAULT 'applied',
  match_percentage DECIMAL(5,2) NULL,
  resume_url VARCHAR(500) NULL,
  resume_snapshot JSON NULL,
  resume_file_name VARCHAR(255) NULL,
  resume_file_type VARCHAR(100) NULL,
  resume_file_data LONGTEXT NULL,
  cover_letter LONGTEXT NULL,
  notes TEXT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_application (user_id, job_id),
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  INDEX idx_applications_status (status)
);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS resume_snapshot JSON NULL AFTER resume_url;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS resume_file_name VARCHAR(255) NULL AFTER resume_snapshot;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS resume_file_type VARCHAR(100) NULL AFTER resume_file_name;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS resume_file_data LONGTEXT NULL AFTER resume_file_type;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS career_interests JSON NULL AFTER target_role;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS avatar_data LONGTEXT NULL AFTER avatar_url;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500) NULL AFTER avatar_data;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500) NULL AFTER facebook_url;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL AFTER instagram_url;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(500) NULL AFTER whatsapp;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS telegram VARCHAR(32) NULL AFTER twitter_url;

CREATE TABLE IF NOT EXISTS assessments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL,
  difficulty ENUM('Beginner', 'Intermediate', 'Advanced') NOT NULL,
  time_limit_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  passing_percentage DECIMAL(5,2) NOT NULL DEFAULT 60,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assessment_skills (
  assessment_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  weight DECIMAL(4,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (assessment_id, skill_id),
  CONSTRAINT fk_assessment_skills_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessment_skills_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  prompt TEXT NOT NULL,
  question_type ENUM('multiple_choice', 'true_false', 'numeric', 'code') NOT NULL DEFAULT 'multiple_choice',
  difficulty ENUM('Beginner', 'Intermediate', 'Advanced') NOT NULL,
  explanation TEXT NULL,
  points DECIMAL(7,2) NOT NULL DEFAULT 1,
  status ENUM('draft', 'published', 'needs_review') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT UNSIGNED NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  assessment_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_points DECIMAL(8,2) NOT NULL DEFAULT 0,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  INDEX idx_attempts_user_assessment (user_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS adaptive_assessment_programs (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  current_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  highest_level_completed TINYINT UNSIGNED NOT NULL DEFAULT 0,
  total_questions INT UNSIGNED NOT NULL DEFAULT 0,
  total_correct INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_adaptive_program_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS adaptive_assessment_attempts (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  level_number TINYINT UNSIGNED NOT NULL,
  difficulty_label VARCHAR(80) NOT NULL,
  profile_snapshot JSON NOT NULL,
  questions_json JSON NOT NULL,
  answers_json JSON NULL,
  generated_model VARCHAR(100) NOT NULL,
  status ENUM('started', 'completed', 'expired') NOT NULL DEFAULT 'started',
  correct_count TINYINT UNSIGNED NULL,
  percentage DECIMAL(5,2) NULL,
  passed BOOLEAN NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  CONSTRAINT fk_adaptive_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_adaptive_attempt_user_level (user_id, level_number, started_at),
  INDEX idx_adaptive_attempt_status_expiry (status, expires_at)
);

CREATE TABLE IF NOT EXISTS learning_resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL,
  difficulty ENUM('Beginner', 'Intermediate', 'Advanced') NOT NULL,
  resource_type ENUM('article', 'video', 'course', 'pdf', 'template') NOT NULL,
  resource_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500) NULL,
  estimated_minutes SMALLINT UNSIGNED NULL,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_progress (
  user_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  progress_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_id),
  CONSTRAINT fk_resource_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_progress_resource FOREIGN KEY (resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  media_url VARCHAR(500) NULL,
  link_url VARCHAR(500) NULL,
  tags JSON NULL,
  share_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('visible', 'removed', 'pending_review') NOT NULL DEFAULT 'visible',
  risk_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  risk_label ENUM('safe', 'spam', 'fraud', 'suspicious') NOT NULL DEFAULT 'safe',
  risk_reasons JSON NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_posts_status_created (status, created_at)
);

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(500) NULL AFTER media_url;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS risk_score TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS risk_label ENUM('safe', 'spam', 'fraud', 'suspicious') NOT NULL DEFAULT 'safe' AFTER risk_score;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS risk_reasons JSON NULL AFTER risk_label;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT UNSIGNED NULL AFTER risk_reasons;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS reviewed_at DATETIME NULL AFTER reviewed_by;

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  content TEXT NOT NULL,
  status ENUM('visible', 'removed') NOT NULL DEFAULT 'visible',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_shares (
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_shares_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  reporter_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(120) NOT NULL,
  details TEXT NULL,
  status ENUM('open', 'dismissed', 'actioned') NOT NULL DEFAULT 'open',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_a_id BIGINT UNSIGNED NOT NULL,
  user_b_id BIGINT UNSIGNED NOT NULL,
  requested_by_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_connection_pair (user_a_id, user_b_id),
  INDEX idx_student_connections_requested (requested_by_id, status),
  INDEX idx_student_connections_status (status, updated_at),
  CONSTRAINT chk_student_connection_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT fk_student_connections_user_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_connections_user_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_connections_requester FOREIGN KEY (requested_by_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  connection_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  connection_key VARCHAR(64) NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_messages_connection (connection_key, created_at),
  INDEX idx_student_messages_recipient_unread (recipient_id, read_at),
  CONSTRAINT fk_student_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Earlier message table variants used a numeric connection ID. Keep the new
-- stable pair key alongside it so both schema variants can be read safely.
ALTER TABLE student_messages
  ADD COLUMN IF NOT EXISTS connection_key VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  description TEXT NULL,
  event_type VARCHAR(100) NOT NULL,
  host VARCHAR(180) NOT NULL,
  location VARCHAR(220) NULL,
  event_url VARCHAR(500) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  capacity INT UNSIGNED NULL,
  status ENUM('draft', 'published', 'cancelled') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_events_student_feed (created_by, status, starts_at)
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS created_by BIGINT UNSIGNED NULL AFTER status;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE IF NOT EXISTS event_registrations (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  attended BOOLEAN NOT NULL DEFAULT FALSE,
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_event_reg_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_reg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS achievements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(80) NULL,
  xp_reward INT UNSIGNED NOT NULL DEFAULT 0,
  criteria JSON NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_id BIGINT UNSIGNED NOT NULL,
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  unlocked_at DATETIME NULL,
  PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_achievements_achievement FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  metadata JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
