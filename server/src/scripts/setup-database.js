require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { connectionOptions, pool } = require("../config/db");

async function setupDatabase() {
  const {
    waitForConnections: _waitForConnections,
    connectionLimit: _connectionLimit,
    queueLimit: _queueLimit,
    ...singleConnectionOptions
  } = connectionOptions;
  const connection = await mysql.createConnection({
    ...singleConnectionOptions,
    multipleStatements: true,
  });

  try {
    const databaseDir = path.resolve(__dirname, "../../../database");
    const schema = fs.readFileSync(path.join(databaseDir, "schema.sql"), "utf8");
    const seed = fs.readFileSync(path.join(databaseDir, "seed.sql"), "utf8");
    await connection.query(schema);
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS avatar_data LONGTEXT NULL AFTER avatar_url");
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500) NULL AFTER avatar_data");
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500) NULL AFTER facebook_url");
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20) NULL AFTER instagram_url");
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(500) NULL AFTER whatsapp");
    await connection.query("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram VARCHAR(32) NULL AFTER twitter_url");
    await connection.query(seed);
    console.log("CareerCube database schema and reference data are ready.");
  } finally {
    await connection.end();
  }
}

setupDatabase()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
