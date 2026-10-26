import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
let ingridEnglish = 0; // how many of Ingrid's calls ignore the Japanese rule
const bodies = await mockOllama(page, (b) => {
  const english = b.options.seed >= 303 && ingridEnglish-- > 0;
  return { verdict: verdict(50), keepLang: english };
});
await page.goto("http://localhost:8000/");
const run = async () => { bodies.length = 0; await page.fill("#pitch", "AI Judges: three AI judges critique your hackathon pitch on a local LLM."); await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 }); };
const sys = () => bodies.map((b) => b.messages[0].content);

(await page.inputValue("#verdictLang")) === "auto" ? ok("default Auto") : fail("default");
await run();
const base = sys();
base.every((c) => !/Hard rule: Write reason/.test(c)) ? ok("Auto adds no line") : fail("auto line");

await page.selectOption("#verdictLang", "en");
await run();
sys().every((c, i) => c === base[i]) ? ok("English on an English pitch adds nothing") : fail("en");

await page.selectOption("#verdictLang", "ja");
await page.reload();
(await page.inputValue("#verdictLang")) === "ja" ? ok("choice persists after reload") : fail("persist");
await run();
sys().every((c, i) => c === base[i] + "\n\nHard rule: Write reason and fix in Japanese. Keep the quoted evidence in its original language.") ? ok("Japanese rule is the last line for all 3") : fail("ja");

const seeds = () => bodies.map((b) => b.options.seed).join();
ingridEnglish = 1;
await run();
seeds() === "101,202,303,304" && (await page.textContent("#card-investor .reason")).includes("は弱い")
  ? ok("Ingrid answered English under 日本語 -> retried with seed+1, Japanese accepted") : fail("lang retry " + seeds());
const retry = bodies.find((b) => b.options.seed === 304), first = bodies.find((b) => b.options.seed === 303);
retry.messages.length === first.messages.length + 1 && retry.messages.at(-2).role === "system"
  && retry.messages.at(-2).content.startsWith("Hard rule: Write reason and fix in Japanese") && retry.messages.at(-1).content === first.messages.at(-1).content
  ? ok("language retry repeats the rule right before the pitch") : fail("retry messages " + JSON.stringify(retry.messages.map((m) => m.role)));
ingridEnglish = 2;
bodies.length = 0; await page.click("#submit");
await page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 });
seeds() === "101,202,303,304" && (await page.locator("#card-investor.failed").count()) ? ok("English twice under 日本語 -> left the room") : fail("lang fail " + seeds());
ingridEnglish = 0;

// Quotes don't count: an English reason quoting Japanese passes under English; a Japanese pitch is checked too.
const res = await page.evaluate(async () => {
  const { validateVerdict } = await import("/app.js");
  const v = (reason, lang) => ({ score: 50, reason, fix: lang === "ja" ? "対象者を書く。" : "x" });
  const t = (reason, lang) => { try { validateVerdict(v(reason, lang), null, lang); return true; } catch { return false; } };
  return [
    t('Band 40-60 (vague): 「チームで使える」 never says which team.', "en"),
    t('Band 40-60 (vague): "It helps teams" never says which team.', "ja"),
    t('Band 40-60 (vague): "It helps teams" はどのチームか言っていない。', "ja"),
    t('Band 40-60 (vague): どのチームか言っていない。', "en"),
    t('anything', null),
    // ≥ 50% of the judge's own letters Japanese passes; a long English quote doesn't count against it.
    t('Band 70-85 (specific): "Free and open source for individuals; a $9/month team tier adds a shared judge panel tuned to a company’s own pitch criteria." 市場規模が不明。', "ja"),
    t('Band 70-85 (specific): ターゲットの「people」 is too broad, why would 彼ら care about this tool?', "ja"),
    t('Band 70-85 (specific): "people who enter hackathons" is too broad. Why would they specifically care about this tool compared to what they use now?', "ja"),
    t('Band 40-60 (vague): "x" は具体的なAPIやUIの説明がない。', "ja"),
    // A fix that is only a quoted sentence for the pitch has too few own words to judge.
    (() => { try { validateVerdict({ score: 50, reason: "Band 40-60 (vague): 「x」は誰のためのツールかを書いていない。", fix: 'Add: "This tool helps hackathon participants improve their pitches."' }, null, "ja"); return true; } catch { return false; } })(),
    (() => { try { validateVerdict({ score: 50, reason: "Band 40-60 (vague): 「x」は誰のためのツールかを書いていない。", fix: "Add a sentence that names the target user." }, null, "ja"); return true; } catch { return false; } })(),
  ].join();
});
res === "true,false,true,false,true,true,false,false,true,true,false" ? ok("quotes and band label ignored, ≥50% Japanese passes: " + res) : fail("quote check " + res);

// Locked while deliberating
await page.unroute("**/api/chat");
await mockOllama(page, async () => { await new Promise((r) => setTimeout(r, 800)); return { verdict: verdict(50) }; });
await page.click("#submit");
(await page.isDisabled("#verdictLang")) ? ok("selector disabled during a round") : fail("not disabled");
await page.waitForFunction(() => !document.querySelector("#submit").disabled, null, { timeout: 15000 });

// Layout: both UI languages, desktop + phone; no overlap with title, no horizontal scroll
for (const ui of ["en", "ja"]) {
  await page.click(`[data-lang=${ui}]`);
  for (const w of [1200, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    const r = await page.evaluate(() => {
      const a = document.querySelector(".top-controls").getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(document.querySelector(".masthead h1")); const h = rg.getBoundingClientRect();
      const overlap = !(a.right <= h.left || a.left >= h.right || a.bottom <= h.top || a.top >= h.bottom);
      return { overlap, hscroll: document.documentElement.scrollWidth > innerWidth, label: document.querySelector(".verdict-lang span").textContent, auto: document.querySelector("#verdictLang option[value=auto]").textContent };
    });
    !r.overlap && !r.hscroll ? ok(`${ui} ${w}px: no overlap/scroll (${r.label} / ${r.auto})`) : fail(`${ui} ${w}px ${JSON.stringify(r)}`);
    await page.screenshot({ path: `vlang-${ui}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 220 } });
  }
}
await browser.close();
