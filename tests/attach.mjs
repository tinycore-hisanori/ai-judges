// Mocked checks for v1.2 file attachments: one fixture per type, offline (only localhost reachable).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
const external = [], vendorLoads = [];
// Offline: anything not on localhost is refused (fonts included), and recorded.
await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => { external.push(route.request().url()); route.abort("internetdisconnected"); });
page.on("request", (r) => r.url().includes("/vendor/") && vendorLoads.push(r.url().split("/vendor/")[1]));
const bodies = await mockOllama(page, (b) => ({
  verdict: b.format.properties.criterion
    ? verdict(60, { source: "Pitch", evidence: "AI Judges", criterion: b.format.properties.criterion.enum[0] })
    : verdict(60),
}));
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();

const version = readFileSync("../app.js", "utf8").match(/APP_VERSION = "(.+?)"/)[1];
await page.waitForSelector(".ollama-status.connected");
(await page.textContent("#appFooter")) === `AI Judges v${version} · local · Ollama: connected · qwen2.5:32b` ? ok("footer: " + await page.textContent("#appFooter")) : fail("footer " + await page.textContent("#appFooter"));
vendorLoads.length === 0 ? ok("no vendor library loaded until a file needs it") : fail("eager vendor " + vendorLoads);
(await page.getAttribute(".att-file", "accept")) === ".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx" ? ok("file picker accepts .md .txt .pdf .docx .pptx .xlsx") : fail("accept");
await page.click("#submission summary");
(await page.textContent(".att-load")) === "Load file" ? ok('button reads "Load file"') : fail("button " + await page.textContent(".att-load"));

const slot = ".attachment:nth-child(1)";
async function load(file, expectFilled = true) {
  await page.fill(`${slot} .att-text`, "");
  await page.setInputFiles(`${slot} .att-file`, typeof file === "string" ? `fixtures/${file}` : file);
  await page.waitForFunction((s) => {
    const st = document.querySelector(`${s} .att-status`);
    return document.querySelector(`${s} .att-text`).value || (!st.hidden && st.dataset.i18n !== "fileReading");
  }, slot, { timeout: 15000 });
  return { text: await page.inputValue(`${slot} .att-text`), status: await page.$eval(`${slot} .att-status`, (e) => (e.hidden ? "" : e.textContent)) };
}
const expect = {
  "notes.txt": "Plain text notes: the judges read exactly what is in the textarea.\n",
  "story.docx": "Project story\nAI Judges is a pitch-critique panel that runs entirely on your own PC.\n\nName\tRole\n審査員は三人います。",
  "deck.pptx": "--- Slide 1 ---\nAI Judges\nThree local judges critique your pitch\nRuns on Ollama\nNotes:\nSpeaker note: open with the demo story.\n--- Slide 2 ---\nBusiness model\nFree for individuals; $9/month team tier",
  "pitch.pdf": "--- Page 1 ---\nAI Judges: a pitch-critique tool for people who enter hackathons.\nThree local judges reject your pitch with a quoted reason.\n--- Page 2 ---\nFree and open source for individuals; a $9/month team tier.",
};
for (const [file, want] of Object.entries(expect)) {
  const { text, status } = await load(file);
  text === want && !status ? ok(`${file} -> textarea`) : fail(`${file}\n--- got ---\n${JSON.stringify(text)}\n--- want ---\n${JSON.stringify(want)} ${status}`);
}
{
  const { text } = await load("scores.xlsx");
  const sheets = text.split(/^--- Sheet: .* ---$/m).slice(1).map((s) => s.trim().split("\n"));
  text.startsWith("--- Sheet: Scores ---\nJudge\tCriterion\tScore\nVera\tDesign\t45\nMarco\tPresentation\t75\n--- Sheet: Long ---\nRow\tNote\n1\tnote 1\n")
    && sheets[1].length === 200 && sheets[1].at(-1) === "199\tnote 199"
    ? ok("scores.xlsx -> sheet markers, tab-separated rows, 250-row sheet capped at 200") : fail("xlsx " + JSON.stringify(text.slice(0, 200)) + " rows " + sheets[1]?.length);
}
console.log("  vendor files loaded:", [...new Set(vendorLoads)].join(", "));

// Scanned PDF: message, textarea left as it was.
await page.fill(`${slot} .att-text`, "keep me");
await page.setInputFiles(`${slot} .att-file`, "fixtures/scanned.pdf");
await page.waitForFunction((s) => document.querySelector(`${s} .att-status`).dataset.i18n === "fileEmpty", slot, { timeout: 15000 });
(await page.textContent(`${slot} .att-status`)) === "No readable text found (scanned image?)" && (await page.inputValue(`${slot} .att-text`)) === "keep me"
  ? ok('scanned.pdf -> "No readable text found (scanned image?)", textarea untouched') : fail("scanned");
await page.click("[data-lang=ja]");
(await page.textContent(`${slot} .att-status`)) === "読み取れる文字がありません（スキャン画像？）" ? ok("message follows the JA toggle") : fail("ja status");
await page.click("[data-lang=en]");

// Broken file: a .docx that isn't a zip.
await page.setInputFiles(`${slot} .att-file`, { name: "broken.docx", mimeType: "application/octet-stream", buffer: Buffer.from("not a zip file at all") });
await page.waitForFunction((s) => document.querySelector(`${s} .att-status`).dataset.i18n === "fileFailed", slot, { timeout: 15000 });
ok(`broken.docx -> "${await page.textContent(`${slot} .att-status`)}"`);

// A good load clears the message, the text is saved, counted, and sent to the judges.
await load("deck.pptx");
(await page.$eval(`${slot} .att-status`, (e) => e.hidden)) ? ok("successful load hides the message") : fail("status stays");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aiJudges.submission")).attachments[0].text);
saved.startsWith("--- Slide 1 ---") ? ok("extracted text saved with the form") : fail("not saved");
(await page.textContent("#totalCounter")).match(/^[\d,]+ \/ 12[,.]?000/) ? ok("combined counter includes it: " + await page.textContent("#totalCounter")) : fail("counter " + await page.textContent("#totalCounter"));
await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM.");
await page.click("#submit");
await page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 });
bodies.at(-1).messages.at(-1).content.includes("=== Project story ===\n--- Slide 1 ---\nAI Judges") ? ok("judges receive exactly the textarea text") : fail("sent");

// 12,000 cap still applies to extracted text.
await page.fill(`${slot} .att-text`, "y".repeat(20000));
await page.dispatchEvent(`${slot} .att-text`, "input");
bodies.length = 0;
await page.click("#submit");
await page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 });
const user = bodies[0].messages.at(-1).content;
(user.match(/y{100,}/) || [""])[0].length < 12000 ? ok(`12,000 total cap holds (${(user.match(/y{100,}/) || [""])[0].length} chars of the document sent)`) : fail("cap");

await page.screenshot({ path: "attach.png", fullPage: true });
external.length === 0 ? ok("no requests left localhost") : console.log("  external requests refused (page still worked):", [...new Set(external.map((u) => new URL(u).hostname))].join(", "));
console.log(errors.length ? "ERRORS " + errors.join(" | ") : "no page errors");
await browser.close();
