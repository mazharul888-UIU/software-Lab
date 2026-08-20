import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/student" });
const user = {
  id: 901,
  role: "student",
  name: "Section Test Student",
  email: "section-test@example.com",
};

window.localStorage.setItem("careerforge_token", "runtime-test-token");
window.localStorage.setItem("careerforge_session", JSON.stringify(user));
window.localStorage.setItem(`careerforge_student_section_${user.id}`, "profile");

for (const [key, value] of Object.entries({
  window,
  self: window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  FileReader: window.FileReader,
  Image: window.Image,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
})) {
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

vm.runInThisContext(fs.readFileSync(path.join(assetsDir, bundleName), "utf8"), { filename: bundleName });
await window.happyDOM.waitUntilComplete();
await new Promise((resolve) => setTimeout(resolve, 100));

const text = document.getElementById("root")?.textContent?.replace(/\s+/g, " ") || "";
if (!text.includes("Profile & preferences")) {
  throw new Error("The saved student section was not restored after a fresh render.");
}
if (!text.includes("Social profiles") || !text.includes("WhatsApp") || !text.includes("Telegram")) {
  throw new Error("The student profile must render the social contact editor.");
}

console.log(JSON.stringify({ status: "passed", restoredSection: "profile" }));
await window.happyDOM.close();
