const assert = require("node:assert/strict");
const {
  SOURCE,
  SOURCE_LABEL,
  normalizeJSearchJob,
} = require("../server/src/services/external-job-search");

const listing = normalizeJSearchJob({
  job_id: "bd-frontend-42",
  job_title: "Junior Frontend Engineer",
  employer_name: "Example Bangladesh Ltd.",
  employer_website: "https://example.com",
  job_description: "Build interfaces with React, JavaScript and CSS.",
  job_required_skills: ["React", "JavaScript", "CSS"],
  job_city: "Dhaka",
  job_country: "Bangladesh",
  job_employment_type: "FULLTIME",
  job_apply_link: "https://example.com/jobs/42",
  job_posted_at_datetime_utc: "2026-09-10T00:00:00.000Z",
});

assert.equal(SOURCE, "jsearch");
assert.equal(SOURCE_LABEL, "JSearch");
assert.equal(listing.externalId, "bd-frontend-42");
assert.equal(listing.location, "Dhaka, Bangladesh");
assert.equal(listing.employmentType, "Full-time");
assert.match(listing.requirements, /React/);
assert.equal(listing.applicationUrl, "https://example.com/jobs/42");
assert.equal(normalizeJSearchJob({ job_title: "No application URL" }), null);

console.log("External JSearch job normalization smoke test passed.");
