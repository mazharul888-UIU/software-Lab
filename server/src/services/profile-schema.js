const { query } = require("../config/db");

let schemaPromise;

async function buildProfileSchema() {
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS avatar_data LONGTEXT NULL AFTER avatar_url");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS career_interests JSON NULL AFTER target_role");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500) NULL AFTER avatar_data");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500) NULL AFTER facebook_url");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL AFTER instagram_url");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(500) NULL AFTER whatsapp");
  await query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram VARCHAR(32) NULL AFTER twitter_url");
}

async function ensureProfileSchema() {
  if (!schemaPromise) {
    schemaPromise = buildProfileSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureProfileSchema };
