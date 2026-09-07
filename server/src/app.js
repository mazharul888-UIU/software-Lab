require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { query } = require("./config/db");
const authRoutes = require("./routes/auth");
const jobsRoutes = require("./routes/jobs");
const learningRoutes = require("./routes/learning");
const communityRoutes = require("./routes/community");
const adminRoutes = require("./routes/admin");
const adaptiveAssessmentRoutes = require("./routes/adaptive-assessment");
const studentRoutes = require("./routes/student");
const studentNetworkRoutes = require("./routes/student-network");
const resumeRoutes = require("./routes/resume");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const developmentOrigins = process.env.NODE_ENV === "production"
  ? []
  : [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`);
const allowedOrigins = new Set([...configuredOrigins, ...developmentOrigins, ...vercelOrigins]);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.get("/api/health", async (_req, res) => {
  let database = "unavailable";
  try { await query("SELECT 1"); database = "healthy"; } catch {}
  res.json({ status: "ok", service: "careercube-api", database, timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api", learningRoutes);
app.use("/api/adaptive-assessment", adaptiveAssessmentRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/network", studentNetworkRoutes);
app.use("/api/resume", resumeRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.statusCode) || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
  const message = error.code === "ER_DUP_ENTRY"
    ? "This record already exists"
    : status >= 500
      ? "Unexpected server error"
      : error.message;
  res.status(status).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CareerCube API running on http://localhost:${PORT}`));
}

module.exports = app;
