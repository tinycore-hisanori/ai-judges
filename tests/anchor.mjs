// Mocked check: in submission mode the previous-verdict note carries the old complaint and the "search for an answer" rule.
import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
const RULE = "Before scoring, search the documents for a sentence that answers your previous complaint. If one exists, quote THAT sentence as evidence and move your score; repeating the previous complaint when it has been addressed is an error.";
let n = 0;
const bodies = await mockOllama(page, (b) => ({
  verdict: b.format.properties.criterion
    ? verdict(45, { source: "Pitch", evidence: "AI Judges", criterion: b.format.properties.criterion.enum[0],
        reason: `Band 40-60 (vague): "AI Judges" doesn't explain how mechanics and story integrate (${b.options.seed}-${++n}).` })
    : verdict(50),
}));
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM.");
const round = async () => { bodies.length = 0; await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 }); };
const notes = () => bodies.map((b) => b.messages.find((m, i) => i > 0 && m.role === "system")?.content);

// Pitch-only: the note is unchanged (score only).
await round(); await round();
notes().every((c) => /^For reference, last round you gave 50\.$/.test(c)) ? ok("pitch-only note unchanged: score only") : fail("pitch note " + notes()[0]);

// Submission mode: round 1 has no note (new rubric), round 2 carries the complaint + rule.
await page.click("#submission summary");
await page.fill(".attachment:nth-child(1) .att-text", "Project story: the judges' mechanics and the story integrate because each fix feeds the next round.");
await round();
notes().every((c) => c === undefined) ? ok("first submission round: no note (new rubric)") : fail("first " + notes()[0]);
const reasons = await page.$$eval(".card .reason", (els) => els.map((e) => e.textContent));
await round();
const [vera] = notes();
vera === `For reference, last round you gave 45. Your previous complaint: ${reasons[0]}\n${RULE}`
  ? ok("Vera's note: last score + her own previous complaint + the search rule") : fail("vera note\n" + vera);
notes().every((c, i) => c.includes(reasons[i]) && c.endsWith(RULE)) ? ok("each judge gets their own previous complaint") : fail("per-judge");
const b = bodies[0];
b.messages.length === 3 && b.messages[1].role === "system" && b.messages[2].role === "user" && b.messages[2].content.startsWith("=== Pitch ===")
  ? ok("order: system prompt, previous-verdict note, documents") : fail("order " + b.messages.map((m) => m.role));
console.log(errors.length ? "ERRORS " + errors.join(" | ") : "no page errors");
await browser.close();
