import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1100 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
let round = 1, slow = false;
await mockOllama(page, async (b) => {
  if (slow) await new Promise((r) => setTimeout(r, 4000));
  const base = { 101: 30, 202: 40, 303: 20 }[b.options.seed];
  return { verdict: verdict(round === 1 ? base : base + 50, { reason: `round ${round} reason ${b.options.seed}` }) };
});
const settle = () => page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").textContent.includes("deliberating"), null, { timeout: 15000 });
const snapshot = () => page.evaluate(() => ({
  pitch: document.querySelector("#pitch").value,
  cards: [...document.querySelectorAll(".card")].map((c) => c.querySelector(".score-row")?.textContent.replace(/\s+/g, " ").trim() + " | " + c.querySelector(".reason")?.textContent),
  badge: document.querySelector("#badge").textContent.replace(/\s+/g, " ").trim(),
}));

await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
await page.fill("#pitch", "Round one pitch, long enough to submit.");
await page.click("#submit"); await settle();
round = 2;
await page.fill("#pitch", "Round two pitch, rewritten with the judges' fixes.");
await page.click("#submit");
// sample the badge during the count-up
await page.waitForFunction(() => document.querySelector(".badge-total"), null, { timeout: 15000 });
const samples = [];
for (let i = 0; i < 20; i++) { samples.push(await page.locator(".badge-total").textContent()); await page.waitForTimeout(40); }
const nums = [...new Set(samples.map(Number))];
console.log("badge samples:", nums.join(","));
nums[0] < 80 && nums.at(-1) === 80 && nums.length > 2 ? ok("badge counted up from 30 to 80 through intermediate values") : fail("count-up " + nums);
await settle();
const before = await snapshot();
await page.reload();
await page.waitForSelector(".card.done");
const after = await snapshot();
JSON.stringify(before) === JSON.stringify(after) ? ok("reload restores pitch, scores, deltas, reasons, badge") : fail("reload\n" + JSON.stringify(before) + "\n" + JSON.stringify(after));
after.cards[0].includes("30 → 80 ▲50") ? ok("delta survives reload: " + after.cards[0].split("|")[0]) : fail("delta " + after.cards[0]);
(await page.locator("#card-engineer details.previous").textContent()).includes("round 1 reason") ? ok("previous round survives reload") : fail("previous");

// reload mid-round → last completed round
slow = true; round = 3;
await page.fill("#pitch", "Round three pitch, interrupted by a reload.");
await page.click("#submit");
await page.waitForTimeout(500);
await page.reload();
await page.waitForSelector(".card.done");
const mid = await snapshot();
JSON.stringify(mid) === JSON.stringify(after) ? ok("reload mid-round shows last completed round") : fail("mid-round\n" + JSON.stringify(mid));
slow = false;

// New pitch
await page.click("#newPitch");
const cleared = await page.evaluate(() => ({ key: localStorage.getItem("aiJudges.v1"), pitch: document.querySelector("#pitch").value,
  waiting: [...document.querySelectorAll(".card .status")].map((e) => e.textContent), badge: document.querySelector("#badge").className }));
cleared.key === null && cleared.pitch === "" && cleared.waiting.length === 3 && cleared.waiting.every((t) => t === "Waiting for your pitch…") && cleared.badge.includes("empty")
  ? ok("New pitch clears storage, box, cards, badge") : fail("new pitch " + JSON.stringify(cleared));
await page.reload();
(await page.locator(".card.waiting").count()) === 3 ? ok("after New pitch, reload stays empty") : fail("reload after new pitch");
errors.length ? fail(errors.join(" | ")) : ok("no page errors");
await browser.close();
