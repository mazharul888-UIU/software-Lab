import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { Window } from "happy-dom";

const scenario = process.argv[2] || "public";
const startPath = {
  public: "/",
  student: "/student",
  brand: "/student",
  "login-student": "/login/student",
  "login-admin": "/login/admin",
  signup: "/login/student?mode=register",
  "guard-student": "/student",
  "guard-admin": "/admin",
}[scenario];
if (!startPath) throw new Error(`Unknown navigation scenario: ${scenario}`);
const window = new Window({ url: `http://localhost${startPath}` });
if (scenario === "student" || scenario === "brand") {
  window.localStorage.setItem("careerforge_token", "navigation-test-token");
  window.localStorage.setItem("careerforge_session", JSON.stringify({
    role: "student",
    name: "Test Student",
    email: "test.student@example.com",
  }));
}

const mockFetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || "{}");
  if (String(url).endsWith("/auth/register/verify")) {
    return new window.Response(JSON.stringify({
      message: "Email verified. Your CareerCube account is ready.",
      token: "navigation-test-token",
      user: { name: "New Student", email: body.email, role: "student" },
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  }
  if (String(url).endsWith("/auth/register")) {
    return new window.Response(JSON.stringify({
      message: "We sent a 6-digit verification code to your email.",
      verificationRequired: true,
      email: body.email,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    }), { status: 202, headers: { "Content-Type": "application/json" } });
  }
  if (String(url).endsWith("/auth/login")) {
    return new window.Response(JSON.stringify({
      token: "navigation-test-token",
      user: {
        name: body.role === "admin" ? "Private Administrator" : "New Student",
        email: body.email,
        role: body.role,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new window.Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};

const browserGlobals = {
  window,
  self: window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  FormData: window.FormData,
  Response: window.Response,
  fetch: mockFetch,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};

for (const [key, value] of Object.entries(browserGlobals)) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

document.body.innerHTML = '<div id="root"></div>';

const assetsDir = path.resolve("dist", "client", "assets");
const bundleName = fs.readdirSync(assetsDir).find((file) => /^index-.*\.js$/.test(file));
if (!bundleName) throw new Error("Production JavaScript bundle was not found.");

vm.runInThisContext(fs.readFileSync(path.join(assetsDir, bundleName), "utf8"), {
  filename: bundleName,
});
await window.happyDOM.waitUntilComplete();

async function clickAndAssert(href, expectedPath, expectedText, label) {
  const expectedUrl = new URL(href, window.location.origin);
  const links = [...document.querySelectorAll("a")].filter((item) => {
    const candidate = new URL(item.href, window.location.origin);
    return candidate.pathname === expectedUrl.pathname &&
      (!expectedUrl.search || candidate.search === expectedUrl.search);
  });
  const link = label
    ? links.find((item) => item.textContent.replace(/\s+/g, " ").trim().includes(label))
    : links[0];
  if (!link) throw new Error(`Link ${href} was not found on ${window.location.pathname}.`);

  link.click();
  await new Promise((resolve) => setTimeout(resolve, 40));

  const text = document.getElementById("root")?.textContent?.replace(/\s+/g, " ").trim() || "";
  if (
    window.location.pathname !== expectedPath ||
    (expectedText && !text.includes(expectedText))
  ) {
    throw new Error(`Click ${href} did not render ${expectedPath} immediately.`);
  }
}

async function clickButtonAndAssert(label, expectedPath, expectedText) {
  const button = [...document.querySelectorAll("button")].find((item) =>
    item.textContent.replace(/\s+/g, " ").trim().includes(label));
  if (!button) throw new Error(`Button ${label} was not found on ${window.location.pathname}.`);

  button.dispatchEvent(new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  }));
  await new Promise((resolve) => setTimeout(resolve, 40));

  const text = document.getElementById("root")?.textContent?.replace(/\s+/g, " ").trim() || "";
  if (
    window.location.pathname !== expectedPath ||
    (expectedText && !text.includes(expectedText))
  ) {
    throw new Error(`Button ${label} did not update the view immediately.`);
  }
}

async function submitLoginAndAssert(expectedPath) {
  const form = document.querySelector("form");
  if (!form) throw new Error(`Login form was not found on ${window.location.pathname}.`);

  const email = form.querySelector('input[name="email"]');
  const password = form.querySelector('input[name="password"]');
  email.value = expectedPath === "/admin" ? "private.admin@example.com" : "student@example.com";
  password.value = "private-password";

  form.dispatchEvent(new window.Event("submit", {
    bubbles: true,
    cancelable: true,
  }));
  await new Promise((resolve) => setTimeout(resolve, 80));

  if (window.location.pathname !== expectedPath) {
    throw new Error(`Login form did not navigate to ${expectedPath}.`);
  }
}

function assertCredentialsAreBlank() {
  const email = document.querySelector('input[name="email"]');
  const password = document.querySelector('input[name="password"]');
  if (!email || !password || email.value || password.value) {
    throw new Error(`Credentials are prefilled on ${window.location.pathname}.`);
  }
}

function assertLandingResourcesStayOnTheLandingPage() {
  const resourcesLink = [...document.querySelectorAll("a")].find((item) =>
    item.textContent.replace(/\s+/g, " ").trim() === "Resources" &&
    item.getAttribute("href") === "#resources");
  if (!resourcesLink) {
    throw new Error("Landing header Resources link does not target the landing Resources section.");
  }
  if (!document.getElementById("resources")) {
    throw new Error("Landing Resources section is missing.");
  }
}

async function registerThenVerify() {
  await new Promise((resolve) => setTimeout(resolve, 40));
  const registrationForm = document.querySelector("form");
  registrationForm.querySelector('input[name="name"]').value = "New Student";
  registrationForm.querySelector('input[name="email"]').value = "new.student@example.com";
  registrationForm.querySelector('input[name="password"]').value = "private-password";
  registrationForm.querySelector('input[type="checkbox"]').checked = true;
  registrationForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));

  const verificationText = document.getElementById("root")?.textContent || "";
  const verificationForm = document.querySelector("form");
  const code = verificationForm?.querySelector('input[name="code"]');
  if (!verificationText.includes("Check your inbox.") || !code) {
    throw new Error("Registration did not request the email verification code.");
  }
  code.value = "123456";
  verificationForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (window.location.pathname !== "/student") {
    throw new Error("Verified registration did not enter the student workspace.");
  }
}

if (scenario === "public") {
  assertLandingResourcesStayOnTheLandingPage();
  await clickAndAssert("/login/student", "/login/student", "Welcome back.");
  assertCredentialsAreBlank();
  await clickAndAssert("/login/admin", "/login/admin", "Admin access.");
  assertCredentialsAreBlank();
  await clickAndAssert("/login/student", "/login/student", "Welcome back.");
  await clickAndAssert("/", "/", "Career growth, made tangible", "Back home");
  await clickAndAssert("/login/student?mode=register", "/login/student", "Start your journey.");
} else if (scenario === "student") {
  await clickButtonAndAssert("Available jobs", "/student", "Available jobs");
  await clickButtonAndAssert("Sign out", "/");
} else if (scenario === "brand") {
  await clickAndAssert("/student", "/student", "My CareerCube");
} else if (scenario === "login-student") {
  await submitLoginAndAssert("/student");
} else if (scenario === "login-admin") {
  await submitLoginAndAssert("/admin");
} else if (scenario === "signup") {
  await registerThenVerify();
} else if (scenario === "guard-student") {
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (window.location.pathname !== "/login/student") throw new Error("Unauthenticated student route was not blocked.");
} else if (scenario === "guard-admin") {
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (window.location.pathname !== "/login/admin") throw new Error("Unauthenticated admin route was not blocked.");
} else {
  throw new Error(`Unknown navigation scenario: ${scenario}`);
}

console.log(JSON.stringify({
  status: "passed",
  scenario,
  finalPath: window.location.pathname,
  finalSearch: window.location.search,
}));

await window.happyDOM.close();
