// Mocked check: "New pitch" resets pitch, attachments, labels, criteria, cards, badge, previous round and storage.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
const bodies = await mockOllama(page, (b) => ({
  verdict: b.format.properties.criterion
    ? verdict(60, { source: "Pitch", evidence: "x", criterion: b.format.properties.criterion.enum[0] })
    : verdict(60),
}));
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
const DEFAULT_CRITERIA = readFileSync("criteria-default.txt", "utf8");
const run = async () => { await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 }); };

// Fill everything, run two rounds so there's a previous round, change labels and criteria.
await page.fill("#pitch", "x AI Judges: three AI judges critique your hackathon pitch on a local LLM.");
await page.click("#submission summary");
for (let i = 1; i <= 4; i++) {
  await page.fill(`.attachment:nth-child(${i}) .att-label`, `Doc ${i}`);
  await page.fill(`.attachment:nth-child(${i}) .att-text`, `x text of document ${i}`);
}
await page.fill("#criteria", "Impact — Does it matter?\nCraft — Is it well made?");
await page.selectOption("#verdictLang", "en");
await run(); await run();
const before = await page.evaluate(() => Object.keys(localStorage).sort().join());
before.includes("aiJudges.v1") && before.includes("aiJudges.submission") ? ok("before: storage has round + submission (" + before + ")") : fail("before " + before);
(await page.locator(".delta").count()) ? ok("before: previous-round deltas shown") : fail("no deltas before");

await page.click("#newPitch");
const check = async (when) => {
  const s = await page.evaluate(() => ({
    pitch: document.querySelector("#pitch").value,
    labels: [...document.querySelectorAll(".att-label")].map((e) => e.value).join("|"),
    texts: [...document.querySelectorAll(".att-text")].map((e) => e.value).join(""),
    criteria: document.querySelector("#criteria").value,
    open: document.querySelector("#submission").open,
    waiting: document.querySelectorAll(".card.waiting").length,
    scores: document.querySelectorAll(".card .score").length,
    deltas: document.querySelectorAll(".delta").length,
    criterionLines: document.querySelectorAll(".criterion").length,
    badge: document.querySelector(".badge-total")?.textContent ?? "",
    total: document.querySelector("#totalCounter").textContent,
    keys: Object.keys(localStorage).sort().join(),
  }));
  s.pitch === "" ? ok(`${when}: pitch empty`) : fail(`${when}: pitch ${s.pitch}`);
  s.labels === "Project story|README|Demo video script|Other" ? ok(`${when}: labels back to defaults`) : fail(`${when}: labels ${s.labels}`);
  s.texts === "" ? ok(`${when}: all 4 attachments empty`) : fail(`${when}: texts ${s.texts}`);
  s.criteria === DEFAULT_CRITERIA ? ok(`${when}: criteria back to the default three`) : fail(`${when}: criteria ${s.criteria.slice(0, 40)}`);
  !s.open ? ok(`${when}: submission section collapsed`) : fail(`${when}: open`);
  s.waiting === 3 && !s.scores && !s.deltas && !s.criterionLines ? ok(`${when}: cards waiting, no scores/deltas/criterion lines`) : fail(`${when}: cards ${JSON.stringify(s)}`);
  !/\d/.test(s.badge) ? ok(`${when}: badge cleared ("${s.badge}")`) : fail(`${when}: badge ${s.badge}`);
  s.keys === "aiJudges.lang,aiJudges.verdictLang" || s.keys === "aiJudges.verdictLang"
    ? ok(`${when}: storage holds only settings (${s.keys})`) : fail(`${when}: storage ${s.keys}`);
};
await check("after New pitch");
await page.reload();
await check("after reload");
(await page.inputValue("#verdictLang")) === "en" ? ok("verdict-language setting kept") : fail("setting lost");

// Next round is a fresh pitch-only round with no previous-round note.
await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM.");
bodies.length = 0;
await run();
bodies.length === 3 && bodies.every((b) => b.messages.length === 2 && !b.format.properties.criterion && b.options.num_ctx === 6144)
  ? ok("next round: pitch-only, no previous-round note") : fail("next round " + bodies.map((b) => b.messages.length));
console.log(errors.length ? "ERRORS " + errors.join(" | ") : "no page errors");
await browser.close();
