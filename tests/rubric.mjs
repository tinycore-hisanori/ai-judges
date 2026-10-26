// Mocked check: a rubric change (pitch-only <-> submission, or new criteria) shows "New rubric", no deltas, no previous round.
import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
let score = 40;
const bodies = await mockOllama(page, (b) => ({
  verdict: b.format.properties.criterion
    ? verdict(score, { source: "Pitch", evidence: "AI Judges", criterion: b.format.properties.criterion.enum[0] })
    : verdict(score),
}));
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM.");
const round = async (s) => { score = s; bodies.length = 0; await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 }); };
const card = () => page.evaluate(() => {
  const c = document.querySelector("#card-engineer");
  return { delta: c.querySelector(".delta")?.textContent ?? "", deltaClass: c.querySelector(".delta")?.className ?? "", previous: !!c.querySelector(".previous") };
});
const note = () => bodies.every((b) => b.messages.some((m) => m.content.startsWith("For reference, last round you gave")));
const noNote = () => bodies.every((b) => !b.messages.some((m) => m.content.startsWith("For reference")));
const expectNew = async (label) => {
  const c = await card();
  c.delta === "New rubric" && c.deltaClass === "delta same" && !c.previous && noNote()
    ? ok(`${label}: "New rubric" (grey), no Previous round, no last-round note to the model`) : fail(`${label} ${JSON.stringify(c)} note=${!noNote()}`);
};
const expectDelta = async (label, text) => {
  const c = await card();
  c.delta === text && c.previous && note() ? ok(`${label}: delta "${text}", Previous round shown, note sent`) : fail(`${label} ${JSON.stringify(c)}`);
};

await round(40);
await round(50);
await expectDelta("pitch-only -> pitch-only", "40 → 50 ▲10");

await page.click("#submission summary");
await page.fill(".attachment:nth-child(1) .att-text", "Project story text about AI Judges.");
await round(70);
await expectNew("pitch-only -> submission");
(await page.textContent(".badge-total")) === "70" ? ok("badge shows the new total without counting up from the old one") : fail("badge " + await page.textContent(".badge-total"));

await round(75);
await expectDelta("submission -> same criteria", "70 → 75 ▲5");

await page.fill(".attachment:nth-child(1) .att-text", "A different story text; documents are content, not rubric.");
await round(80);
await expectDelta("changed attachment text, same criteria", "75 → 80 ▲5");

await page.fill("#criteria", "Impact — Does it matter?\nCraft — Is it well made?");
await round(60);
await expectNew("criteria text changed");

await page.fill("#criteria", "Impact — Does it   matter?\nCraft — Is it well made?  ");
await round(65);
await expectDelta("criteria whitespace-only edit", "60 → 65 ▲5");

await page.fill(".attachment:nth-child(1) .att-text", "");
await round(55);
await expectNew("submission -> pitch-only");

await page.reload();
await expectNew("after reload").catch(() => {});
const c = await card();
c.delta === "New rubric" && !c.previous ? ok("New rubric persists across reload") : fail("reload " + JSON.stringify(c));
await page.click("[data-lang=ja]");
(await card()).delta === "新しい基準" ? ok('JA: "新しい基準"') : fail("ja " + (await card()).delta);
await page.click("[data-lang=en]");

await round(58);
await expectDelta("pitch-only again", "55 → 58 ▲3");
console.log(errors.length ? "ERRORS " + errors.join(" | ") : "no page errors");
await browser.close();
