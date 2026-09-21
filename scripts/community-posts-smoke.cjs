const assert = require("node:assert/strict");
const fs = require("node:fs");

const route = fs.readFileSync("server/src/routes/community.js", "utf8");
const ui = fs.readFileSync("components/student/CommunityExperience.jsx", "utf8");
const workspace = fs.readFileSync("components/student/StudentWorkspace.jsx", "utf8");

assert.match(route, /p\.status='visible' OR \(p\.user_id=\? AND p\.status='pending_review'\)/, "Owners must see their posts awaiting review");
assert.match(route, /post:\s*createdRows\[0\]/, "Post creation must return a renderable post");
assert.match(ui, /Awaiting administrator review/, "Pending posts need a clear owner-visible status");
assert.match(ui, /Open \$\{post\.author\}'s profile/, "Community post authors must open a profile dialog");
assert.match(ui, /\/network\/students\?q=/, "The profile dialog must load the live student profile");
assert.match(ui, /\/network\/connections/, "The profile dialog must reuse the connection-request API");
assert.doesNotMatch(ui, /<b>Career role:<\/b>|<b>Location:<\/b>/, "Community profiles must not expose career role or location");
assert.match(ui, /document\.addEventListener\("mousedown", closeMenu\)/, "Post action menus must close when the user clicks outside them");
assert.match(ui, /event\.key === "Escape"/, "Post action menus must also close with Escape");
assert.match(workspace, /onOpenConnections=\{openCommunityConnection\}/, "Community profiles must open Connections & Inbox after requesting");
assert.match(workspace, /setStudentSearch\(String\(student\.student_id\)\)/, "Connections & Inbox must preload the requested student");
assert.match(workspace, /setPosts\(\(current\) => \[result\.post/, "Published posts should appear immediately without a reload");

console.log("Community post visibility smoke test passed.");
