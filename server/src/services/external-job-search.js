const { createHash } = require("node:crypto");
const { query } = require("../config/db");
const { ensureExternalJobSchema } = require("./external-job-schema");

const SOURCE = "jsearch";
const SOURCE_LABEL = "JSearch";

function cleanText(value, maximum = 500) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function cleanLongText(value, maximum = 12000) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobLocation(item) {
  const values = [item.job_city, item.job_state, item.job_country]
    .map((value) => cleanText(value, 100))
    .filter(Boolean);
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ") || cleanText(item.job_location, 220) || "Bangladesh";
}

function employmentType(value) {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || "");
  const normalized = raw.toLowerCase();
  if (normalized.includes("intern")) return "Internship";
  if (normalized.includes("part")) return "Part-time";
  if (normalized.includes("contract") || normalized.includes("freelance")) return "Contract";
  if (normalized.includes("full")) return "Full-time";
  return cleanText(raw, 80) || "Full-time";
}

function workplaceType(item) {
  if (item.job_is_remote === true || String(item.job_is_remote).toLowerCase() === "true") return "Remote";
  const location = `${item.job_location || ""} ${item.job_city || ""}`.toLowerCase();
  if (location.includes("hybrid")) return "Hybrid";
  return "On-site";
}

function highlightsText(item, key) {
  const source = item?.job_highlights?.[key];
  return Array.isArray(source) ? source.map((line) => cleanText(line, 400)).filter(Boolean).join("\n") : "";
}

function stableExternalId(item, applicationUrl) {
  const directId = cleanText(item.job_id || item.job_uuid || "", 255);
  if (directId) return directId;
  return createHash("sha256")
    .update(`${applicationUrl}|${item.job_title || ""}|${item.employer_name || ""}`)
    .digest("hex");
}

function normalizeJSearchJob(item) {
  const applicationUrl = safeUrl(item?.job_apply_link || item?.job_google_link);
  const title = cleanText(item?.job_title, 300);
  if (!applicationUrl || !title) return null;

  const qualifications = highlightsText(item, "Qualifications");
  const responsibilities = highlightsText(item, "Responsibilities");
  const listedSkills = Array.isArray(item?.job_required_skills)
    ? item.job_required_skills.map((skill) => cleanText(skill, 80)).filter(Boolean).join(", ")
    : cleanText(item?.job_required_skills, 1000);
  const requirements = [listedSkills, qualifications].filter(Boolean).join("\n") || cleanLongText(item?.job_description, 6000);

  return {
    source: SOURCE,
    externalId: stableExternalId(item, applicationUrl),
    title,
    company: cleanText(item?.employer_name, 300) || "External employer",
    companyWebsite: safeUrl(item?.employer_website),
    description: cleanLongText(item?.job_description, 12000) || qualifications || "Job details are available on the original listing.",
    requirements,
    responsibilities: responsibilities || null,
    category: cleanText(item?.job_title || item?.job_employment_type, 160) || "External opportunity",
    location: jobLocation(item),
    workplaceType: workplaceType(item),
    employmentType: employmentType(item?.job_employment_type),
    salaryMin: numberOrNull(item?.job_min_salary),
    salaryMax: numberOrNull(item?.job_max_salary),
    currency: cleanText(item?.job_salary_currency, 3).toUpperCase() || "BDT",
    applicationUrl,
    postedAt: dateOrNull(item?.job_posted_at_datetime_utc || item?.job_posted_at_timestamp * 1000),
  };
}

function jSearchConfigured() {
  return Boolean(String(process.env.JSEARCH_API_KEY || "").trim());
}

function cacheMinutes() {
  const configured = Number(process.env.JSEARCH_CACHE_MINUTES || 720);
  return Math.max(60, Math.min(1440, Number.isFinite(configured) ? configured : 720));
}

function errorRetryMinutes() {
  const configured = Number(process.env.JSEARCH_ERROR_RETRY_MINUTES || 5);
  return Math.max(1, Math.min(60, Number.isFinite(configured) ? configured : 5));
}

function cacheCutoff() {
  return new Date(Date.now() - (cacheMinutes() * 60 * 1000));
}

async function fetchJSearchListings() {
  const key = String(process.env.JSEARCH_API_KEY || "").trim();
  if (!key) return [];
  const params = new URLSearchParams({
    query: String(process.env.JSEARCH_QUERY || "jobs in Bangladesh").trim().slice(0, 180),
    page: "1",
    num_pages: "1",
    country: String(process.env.JSEARCH_COUNTRY || "bd").trim().slice(0, 8),
    date_posted: "all",
  });
  // The original /search route was retired by JSearch. RapidAPI's current
  // JSearch route is /search-v2 and wraps the job array in data.jobs.
  const response = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    const error = new Error(`JSearch request failed with status ${response.status}`);
    error.code = response.status === 429 ? "rate_limited" : `http_${response.status}`;
    throw error;
  }
  const payload = await response.json();
  const incoming = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.jobs)
      ? payload.data.jobs
      : [];
  const seen = new Set();
  return incoming
    .map(normalizeJSearchJob)
    .filter(Boolean)
    .filter((item) => {
      const key = item.externalId.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

async function readListings({ freshOnly = false } = {}) {
  const clauses = ["source=?"];
  const params = [SOURCE];
  if (freshOnly) {
    clauses.push("fetched_at>=?");
    params.push(cacheCutoff());
  }
  return query(
    `SELECT source, external_id, title, company, company_website, description, requirements,
            responsibilities, category, location, workplace_type, employment_type, salary_min,
            salary_max, currency, application_url, posted_at, fetched_at
     FROM external_job_listings
     WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(posted_at, fetched_at) DESC
     LIMIT 60`,
    params,
  );
}

async function readSyncState() {
  const [state] = await query(
    "SELECT last_attempt_at, last_success_at, last_error_code FROM external_job_sync_state WHERE source=? LIMIT 1",
    [SOURCE],
  );
  return state || null;
}

function isRecent(value, minutes = cacheMinutes()) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time >= Date.now() - (minutes * 60 * 1000);
}

function statusForError(errorCode) {
  if (errorCode === "http_401" || errorCode === "http_403") return "subscription_required";
  if (errorCode === "rate_limited") return "rate_limited";
  if (errorCode === "no_results") return "no_results";
  return "unavailable";
}

async function saveSyncState({ success, errorCode = null }) {
  await query(
    `INSERT INTO external_job_sync_state (source, last_attempt_at, last_success_at, last_error_code)
     VALUES (?, NOW(), ${success ? "NOW()" : "NULL"}, ?)
     ON DUPLICATE KEY UPDATE
      last_attempt_at=NOW(),
      last_success_at=${success ? "NOW()" : "last_success_at"},
      last_error_code=VALUES(last_error_code)`,
    [SOURCE, errorCode],
  );
}

async function persistListings(listings) {
  for (const item of listings) {
    await query(
      `INSERT INTO external_job_listings
       (source, external_id, title, company, company_website, description, requirements,
        responsibilities, category, location, workplace_type, employment_type, salary_min,
        salary_max, currency, application_url, posted_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        title=VALUES(title), company=VALUES(company), company_website=VALUES(company_website),
        description=VALUES(description), requirements=VALUES(requirements),
        responsibilities=VALUES(responsibilities), category=VALUES(category), location=VALUES(location),
        workplace_type=VALUES(workplace_type), employment_type=VALUES(employment_type),
        salary_min=VALUES(salary_min), salary_max=VALUES(salary_max), currency=VALUES(currency),
        application_url=VALUES(application_url), posted_at=VALUES(posted_at), fetched_at=NOW()`,
      [
        item.source, item.externalId, item.title, item.company, item.companyWebsite, item.description,
        item.requirements, item.responsibilities, item.category, item.location, item.workplaceType,
        item.employmentType, item.salaryMin, item.salaryMax, item.currency, item.applicationUrl, item.postedAt,
      ],
    );
  }
}

function toRecommendationJob(row) {
  return {
    id: `external:${row.source}:${row.external_id}`,
    external_source: true,
    title: row.title,
    company: row.company,
    company_description: "Live Bangladesh opportunity supplied by JSearch. Review the original listing before applying.",
    company_website: row.company_website,
    description: row.description,
    requirements: row.requirements,
    responsibilities: row.responsibilities,
    category: row.category || "External opportunity",
    location: row.location || "Bangladesh",
    workplace_type: row.workplace_type || "On-site",
    employment_type: row.employment_type || "Full-time",
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    currency: row.currency || "BDT",
    application_mode: "external",
    external_apply_url: row.application_url,
    source_label: SOURCE_LABEL,
    source_name: SOURCE_LABEL,
    required_skills: "",
    already_applied: false,
    created_at: row.posted_at || row.fetched_at,
    updated_at: row.fetched_at,
    expires_at: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
  };
}

async function getBangladeshExternalJobs() {
  await ensureExternalJobSchema();
  if (!jSearchConfigured()) {
    return { items: [], configured: false, status: "disabled", errorCode: null, syncedAt: null };
  }

  const [state, freshRows] = await Promise.all([readSyncState(), readListings({ freshOnly: true })]);
  const retryAfterMinutes = state?.last_error_code ? errorRetryMinutes() : cacheMinutes();
  // A prior empty response must never keep the feed in a false "ready" state
  // for the normal cache window. Retry immediately so a new API key or an
  // upstream data recovery becomes visible without waiting up to 12 hours.
  if (freshRows.length > 0 && isRecent(state?.last_attempt_at, retryAfterMinutes)) {
    return {
      items: freshRows.map(toRecommendationJob),
      configured: true,
      status: state?.last_error_code ? statusForError(state.last_error_code) : "ready",
      errorCode: state?.last_error_code || null,
      syncedAt: state?.last_success_at || null,
    };
  }

  try {
    const listings = await fetchJSearchListings();
    if (!listings.length) {
      await saveSyncState({ success: false, errorCode: "no_results" });
      return { items: freshRows.map(toRecommendationJob), configured: true, status: "no_results", errorCode: "no_results", syncedAt: state?.last_success_at || null };
    }
    await persistListings(listings);
    await saveSyncState({ success: true });
    const rows = await readListings({ freshOnly: true });
    return { items: rows.map(toRecommendationJob), configured: true, status: "ready", errorCode: null, syncedAt: new Date().toISOString() };
  } catch (error) {
    const errorCode = String(error?.code || "unavailable").slice(0, 120);
    console.warn("JSearch Bangladesh sync did not complete", { errorCode });
    await saveSyncState({ success: false, errorCode });
    const fallback = freshRows.length ? freshRows : await readListings();
    return {
      items: fallback.map(toRecommendationJob),
      configured: true,
      status: statusForError(errorCode),
      errorCode,
      syncedAt: state?.last_success_at || null,
    };
  }
}

module.exports = {
  SOURCE,
  SOURCE_LABEL,
  normalizeJSearchJob,
  jSearchConfigured,
  fetchJSearchListings,
  getBangladeshExternalJobs,
};
