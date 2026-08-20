const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  normalizeSocialProfilePatch,
  normalizeTelegram,
  normalizeWhatsapp,
} = require("../server/src/services/social-profile");

const schema = fs.readFileSync("database/schema.sql", "utf8");
const profileSchema = fs.readFileSync("server/src/services/profile-schema.js", "utf8");
const setupDatabase = fs.readFileSync("server/src/scripts/setup-database.js", "utf8");
const authRoute = fs.readFileSync("server/src/routes/auth.js", "utf8");
const networkRoute = fs.readFileSync("server/src/routes/student-network.js", "utf8");
const profileUi = fs.readFileSync("components/student/StudentWorkspace.jsx", "utf8");
const connectionsUi = fs.readFileSync("components/student/ConnectionsExperience.jsx", "utf8");
const browserHelpers = fs.readFileSync("lib/socialProfiles.js", "utf8");

for (const [field, definition] of Object.entries({
  facebook_url: "VARCHAR(500)",
  instagram_url: "VARCHAR(500)",
  whatsapp: "VARCHAR(20)",
  twitter_url: "VARCHAR(500)",
  telegram: "VARCHAR(32)",
})) {
  assert.match(schema, new RegExp(`${field} ${definition.replace(/[()]/g, "\\$&")} NULL`), `${field} needs a base schema column`);
  assert.match(profileSchema, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`), `${field} needs a production runtime migration`);
  assert.match(setupDatabase, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`), `${field} needs a setup migration`);
  assert.match(authRoute, new RegExp(`p\\.${field}`), `${field} must be returned by the authenticated profile API`);
  assert.match(authRoute, new RegExp(`${field}=IF\\(\\?, VALUES\\(${field}\\), ${field}\\)`), `${field} updates must respect PATCH field presence`);
}

const patch = normalizeSocialProfilePatch({
  facebook_url: "facebook.com/careercube.student",
  instagram_url: "https://www.instagram.com/careercube.student/#profile",
  whatsapp: "+880 1712-345678",
  twitter_url: "x.com/careercube_student",
  telegram: "https://t.me/careercube_student",
});
assert.equal(patch.values.facebook_url, "https://facebook.com/careercube.student");
assert.equal(patch.values.instagram_url, "https://www.instagram.com/careercube.student/");
assert.equal(patch.values.whatsapp, "+8801712345678");
assert.equal(patch.values.twitter_url, "https://x.com/careercube_student");
assert.equal(patch.values.telegram, "careercube_student");
assert.ok(Object.values(patch.provided).every(Boolean), "Every supplied social field should be marked as provided");

const omitted = normalizeSocialProfilePatch({ facebook_url: "" });
assert.equal(omitted.values.facebook_url, null, "An empty supplied value should clear that social link");
assert.equal(omitted.provided.facebook_url, true, "A cleared field must still be treated as supplied");
assert.equal(omitted.provided.instagram_url, false, "An omitted field must be preserved by PATCH");

assert.equal(normalizeWhatsapp("+1 (212) 555-0123"), "+12125550123");
assert.equal(normalizeTelegram("@CareerCube_Student"), "CareerCube_Student");
assert.equal(normalizeTelegram("t.me/careercube_student"), "careercube_student");
for (const invalid of [
  { facebook_url: "https://facebook.com.example.net/student" },
  { instagram_url: "http://instagram.com/student" },
  { instagram_url: "https://instagram.com/%E0%A4%A" },
  { twitter_url: "javascript:alert(1)" },
  { whatsapp: "01712345678" },
  { telegram: "https://t.me/+private-invite" },
]) {
  assert.throws(
    () => normalizeSocialProfilePatch(invalid),
    (error) => error.statusCode === 400,
    `Invalid social data should be rejected: ${JSON.stringify(invalid)}`,
  );
}

const studentFieldHelper = networkRoute.match(/function studentFields[\s\S]*?\n}/)?.[0] || "";
assert.doesNotMatch(studentFieldHelper, /facebook_url|instagram_url|whatsapp|twitter_url|telegram/, "Student search summaries must not expose private social contacts");
assert.match(networkRoute, /function connectedSocialFields/, "Accepted connections need a separate social-field projection");
assert.equal((networkRoute.match(/connectedSocialFields\(\)/g) || []).length, 2, "Social contacts should only be projected by the accepted-connections query");
assert.match(networkRoute, /Promise\.all\(\[ensureStudentNetworkSchema\(\), ensureProfileSchema\(\)\]\)/, "Network routes must migrate social columns before querying them");
for (const field of ["facebook_url", "instagram_url", "whatsapp", "twitter_url", "telegram"]) {
  assert.match(profileUi, new RegExp(`socialProfileApiValue\\(\"${field}\"`), `${field} must be sent by the profile save flow`);
  assert.match(browserHelpers, new RegExp(field), `${field} needs a safe browser link helper`);
}
assert.match(profileUi, /SocialProfilePreview/, "The owner profile must render social cards with the CareerCube photo preview");
assert.match(profileUi, /Your CareerCube photo is used as the DP preview/, "The DP preview must accurately explain its photo source");
assert.match(connectionsUi, /ConnectionSocialLinks/, "Accepted conversation headers must render saved social links");
assert.match(connectionsUi, /noopener noreferrer/, "External social links must prevent opener access");

const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(browserHelpers).toString("base64")}`;
import(helperModuleUrl)
  .then(({ socialProfileHref, socialProfileDisplay }) => {
    assert.equal(
      socialProfileHref("instagram_url", "https://instagram.com/%E0%A4%A"),
      null,
      "Malformed encoded Instagram paths must fail closed instead of crashing render",
    );
    assert.equal(
      socialProfileDisplay("facebook_url", "https://facebook.com/%E0%A4%A"),
      "facebook.com",
      "Malformed encoded Facebook paths must render a safe fallback",
    );
    console.log("Social profile smoke test passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
