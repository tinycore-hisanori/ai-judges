import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
let mode = "ok";
const bodies = await mockOllama(page, (b) => {
  if (mode === "down") return { abort: true };
  if (mode === "marketer-down" && b.options.seed === 202) return { abort: true };
  return { verdict: verdict(50 + (b.options.seed % 7)) };
});
await page.goto("http://localhost:8000/");
const settle = () => page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").textContent.includes("deliberating"), null, { timeout: 15000 });

// Input gate + counter
await page.fill("#pitch", "x".repeat(19));
(await page.locator("#submit").isDisabled()) ? ok("19 chars: submit disabled") : fail("19 enabled");
await page.fill("#pitch", "x".repeat(20));
(await page.locator("#submit").isEnabled()) ? ok("20 chars: submit enabled") : fail("20 disabled");
(await page.$eval("#counter", (e) => e.className)).includes("ok") ? ok("counter ok") : fail("counter ok");
await page.fill("#pitch", "x".repeat(3000));
(await page.$eval("#counter", (e) => e.className)).includes("ok") ? ok("3000: counter still ok") : fail("3000 class");
await page.fill("#pitch", "x".repeat(3001));
(await page.$eval("#counter", (e) => e.className)).includes("warn") ? ok("3001: counter amber") : fail("3001 class");
await page.fill("#pitch", "x".repeat(6000));
(await page.$eval("#counter", (e) => e.className)).includes("warn") ? ok("6000: still amber, not red") : fail("6000 class");
await page.fill("#pitch", "y".repeat(6001));
const c = await page.$eval("#counter", (e) => [e.className, e.textContent]);
c[0].includes("over") && c[1].includes("Judges stop reading after ~6000 characters") ? ok("6001: counter red + warning") : fail("6001 " + c);

// Truncation: long pitch still submits, only 6000 chars sent
await page.click("#submit"); await settle();
bodies.every((b) => b.messages.at(-1).content.length === 6000) ? ok("long pitch submitted, 6000 chars sent") : fail("truncation " + bodies.map((b) => b.messages.at(-1).content.length));

// One judge fails
mode = "marketer-down"; bodies.length = 0;
await page.fill("#pitch", "A pitch that is long enough to submit to the panel.");
await page.click("#submit"); await settle();
(await page.locator(".card.failed").count()) === 1 && (await page.locator("#card-marketer.failed [data-retry]").count()) ? ok("only marketer failed, with retry") : fail("one-fail cards");
(await page.locator("#card-engineer.done").count()) && (await page.locator("#card-investor.done").count()) ? ok("other two kept results") : fail("others");
(await page.locator(".badge-wait").textContent()) === "Waiting for 1 judge" ? ok("badge held: waiting for 1 judge") : fail("badge");
(await page.locator("#banner").isHidden()) ? ok("no banner for single failure") : fail("banner shown");
bodies.filter((b) => b.options.seed === 202).length === 1 ? ok("network failure not auto-retried") : fail("auto-retried network error");
mode = "ok"; bodies.length = 0;
await page.click("#card-marketer [data-retry]");
await page.waitForSelector("#card-marketer.done", { timeout: 15000 });
bodies.length === 1 && bodies[0].options.seed === 202 ? ok("retry asked only the marketer") : fail("retry bodies " + bodies.length);
(await page.locator(".badge-total").count()) ? ok("badge resolved after retry") : fail("badge not resolved");

// Ollama down
mode = "down";
await page.click("#submit"); await settle();
(await page.locator(".card.failed").count()) === 3 ? ok("all three failed") : fail("not all failed");
(await page.locator("#banner").isVisible()) && (await page.locator("#banner").textContent()).includes("Is Ollama running?") ? ok("banner shown") : fail("banner hidden");
await page.screenshot({ path: "s3-down.png", fullPage: true });
mode = "ok";
await page.click("#card-engineer [data-retry]");
await page.waitForSelector("#card-engineer.done", { timeout: 15000 });
(await page.locator("#banner").isHidden()) ? ok("banner hides after a successful retry") : fail("banner still shown");

// validateVerdict, from the live module
const v = await page.evaluate(async () => {
  const { validateVerdict } = await import("/app.js");
  const t = (x) => { try { validateVerdict(x); return "accepted"; } catch { return "rejected"; } };
  const base = { score: 50, reason: "r", fix: "f" };
  return { s101: t({ ...base, score: 101 }), s425: t({ ...base, score: 42.5 }), str: t({ ...base, score: "58" }), emptyReason: t({ ...base, reason: "  " }), noFix: t({ score: 50, reason: "r" }), emptyQuote: t({ ...base, reason: "Band 0-30 (absent): \"\" the pitch says nothing." }), curlyEmpty: t({ ...base, reason: "Band 0-30 (absent): “” nothing." }), jpEmpty: t({ ...base, reason: "Band 0-30 (absent): 「」 なし。" }), longFix: t({ ...base, fix: "x".repeat(301) }), good: t(base), fix300: t({ ...base, fix: "x".repeat(300) }), jpQuote: t({ ...base, reason: "Band 40-60 (vague): 「ローカルLLMで動く」 は曖昧。" }), goodQuote: t({ ...base, reason: "Band 40-60 (vague): \"Runs on a local LLM.\" names no model." }) };
});
const { good, goodQuote, fix300, jpQuote, ...bad } = v;
[good, goodQuote, fix300, jpQuote].every((x) => x === "accepted") && Object.values(bad).every((x) => x === "rejected") ? ok("validateVerdict: " + JSON.stringify(v)) : fail(JSON.stringify(v));
errors.length ? fail(errors.join(" | ")) : ok("no page errors");
await browser.close();
