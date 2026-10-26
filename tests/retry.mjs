import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
let mode = "empty-once";
const bodies = await mockOllama(page, (b) => {
  if (b.options.seed === 202 && mode === "empty-once") { mode = "done"; return { verdict: verdict(45, { reason: "Band 0-30 (absent): \"\" the pitch says nothing." }) }; }
  if (b.options.seed === 304 && mode === "always-empty") return { verdict: verdict(45, { fix: "" }) };
  if (b.options.seed === 303 && mode === "always-empty") return { verdict: verdict(45, { fix: " " }) };
  return { verdict: verdict(50) };
});
await page.goto("http://localhost:8000/");
const run = async () => { await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM."); await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 }); };
await run();
const s1 = bodies.map((b) => b.options.seed).join();
s1 === "101,202,203,303" ? ok("empty quote retried once with seed+1 → " + s1) : fail("seeds " + s1);
(await page.locator(".card.done").count()) === 3 ? ok("all three cards filled") : fail("cards");
bodies.length = 0; mode = "always-empty";
await run();
const s2 = bodies.map((b) => b.options.seed).join();
s2 === "101,202,303,304" ? ok("investor retried once only → " + s2) : fail("seeds " + s2);
(await page.locator("#card-investor.failed").count()) ? ok("investor shows failed after second unusable answer") : fail("investor not failed");
(await page.locator(".badge-wait").textContent()) === "Waiting for 1 judge" ? ok("badge waiting for 1 judge") : fail("badge");
const schema = bodies[0].format.properties; Object.keys(schema).join() === "evidence,band,reason,score,fix" ? ok("evidence-first schema order") : fail("schema " + Object.keys(schema));
bodies[0].model === "qwen2.5:32b" && bodies[0].options.num_ctx === 6144 ? ok("MODEL constant + num_ctx used") : fail("model");
await browser.close();
