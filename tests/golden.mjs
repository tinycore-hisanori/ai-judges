// Records (GOLDEN=write) or checks the exact request bodies of the 3-round demo story with no attachments.
// Compared: model, messages, format, stream, temperature, seed. num_ctx is reported separately.
// Usage: GOLDEN=write node golden.mjs   |   node golden.mjs [verdictLang]
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { mockOllama, verdict } from "./mock.mjs";
const LANG = process.argv[2] ?? "auto";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const bodies = await mockOllama(page, (b) => ({ verdict: verdict(40 + (b.options.seed % 7)) }));
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
if (LANG !== "auto") await page.selectOption("#verdictLang", LANG);
for (const f of ["p1.txt", "p2.txt", "p3.txt"]) {
  await page.fill("#pitch", readFileSync(f, "utf8").trim());
  await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 });
}
await browser.close();
const strip = (b) => JSON.stringify({ model: b.model, messages: b.messages, format: b.format, stream: b.stream, temperature: b.options.temperature, seed: b.options.seed });
const now = bodies.map(strip);
if (process.env.GOLDEN === "write") {
  writeFileSync("golden.json", JSON.stringify(now, null, 1));
  console.log(`wrote golden.json: ${now.length} requests`);
} else {
  const gold = JSON.parse(readFileSync("golden.json", "utf8"));
  const same = gold.length === now.length && gold.every((g, i) => g === now[i]);
  console.log(same ? `ok: ${now.length} requests byte-identical to golden (verdictLang=${LANG})` : `FAIL: requests differ from golden (verdictLang=${LANG})`);
  if (!same) { for (let i = 0; i < Math.max(gold.length, now.length); i++) if (gold[i] !== now[i]) { console.log(" first diff at request", i, "\n gold:", gold[i]?.slice(-300), "\n now: ", now[i]?.slice(-300)); break; } process.exitCode = 1; }
  console.log("  num_ctx per request:", bodies.map((b) => b.options.num_ctx).join(","));
}
