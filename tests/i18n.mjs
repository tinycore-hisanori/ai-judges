// JA/EN UI toggle: strings, persistence, no effect on judge requests, and no overflow in either language.
import { chromium } from "playwright-core";
import { mockOllama } from "./mock.mjs";

const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const browser = await chromium.launch({ channel: "chrome" });

const EN = {
  reason: 'Band 40-60 (vague): "Runs fully on your PC via Ollama, so pitches never leave your machine." This statement lacks specifics about the technical implementation, which model is used, how verdicts are validated, and whether it can handle long pitches reliably.',
  fix: "Add one sentence naming the model, the schema-checked JSON verdict and the retry rule, e.g. 'Each judge is a local qwen2.5:32b prompt that returns a schema-validated score, reason and fix, retried once if unusable.'",
};
const JA = {
  reason: "Band 40-60 (vague): 「AIが食材を見分けて」という表現は、具体的な技術的アプローチや検証方法、精度、対応できる食材の範囲などを一切示しておらず、実際に動作するかどうかを判断できない。",
  fix: "「既存の物体認識モデルで冷蔵庫の写真から食材を検出し、検出精度は社内テストで90%以上」のように、使う技術と実測値を1文で書き加える。",
};
const verdict = (score, text) => ({ evidence: "x", band: "vague", score, ...text });

async function scenario(width, lang) {
  const page = await browser.newPage({ viewport: { width, height: 1400 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let round = 0, mode = "ok";
  const text = lang === "ja" ? JA : EN;
  const bodies = await mockOllama(page, (b) => {
    if (mode === "down") return { abort: true };
    const base = { 101: 50, 202: 45, 303: 20 }[b.options.seed];
    // Round 2: engineer unchanged ("no change"), marketer up, investor up.
    return { verdict: verdict(round === 1 ? base : { 101: 50, 202: 75, 303: 75 }[b.options.seed], text) };
  });
  await page.goto("http://localhost:8000/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (lang === "ja") await page.click('[data-lang="ja"]');
  const settle = () => page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled || document.querySelectorAll(".card.failed").length === 3, null, { timeout: 15000 });
  for (round = 1; round <= 2; round++) {
    await page.fill("#pitch", "AI Judges: a pitch-critique tool for people who enter hackathons. Runs on Ollama.");
    await page.click("#submit");
    await settle();
  }
  await page.waitForTimeout(800);
  await page.locator("details.previous").first().evaluate((d) => (d.open = true));

  // Overflow: any element whose content is wider than its box, inside cards, badge, header or toggle.
  const overflow = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".card, .card *, .badge, .badge *, .masthead, .masthead *, .lang-toggle, .controls, .controls *")) {
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) bad.push(`${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    }
    const page = document.documentElement;
    if (page.scrollWidth > page.clientWidth + 1) bad.push(`page ${page.scrollWidth}>${page.clientWidth}`);
    // The toggle must not sit on top of the title.
    const a = document.querySelector(".lang-toggle").getBoundingClientRect(), b = document.querySelector(".masthead h1").getBoundingClientRect();
    const tb = document.querySelector(".masthead h1");
    const range = document.createRange(); range.selectNodeContents(tb); const tr = range.getBoundingClientRect();
    if (!(a.right < tr.left || a.left > tr.right || a.bottom < tr.top || a.top > tr.bottom)) bad.push("toggle overlaps title");
    return bad;
  });
  overflow.length ? fail(`${lang} @${width}: overflow ${overflow.join(", ")}`) : ok(`${lang} @${width}: no overflow (done state, previous round open, badge)`);
  await page.screenshot({ path: `i18n-${lang}-${width}.png`, fullPage: true });

  const ui = await page.evaluate(() => ({
    lang: document.documentElement.lang, title: document.title, h1: document.querySelector("h1").textContent,
    roles: [...document.querySelectorAll(".card .role")].map((e) => e.textContent),
    deltas: [...document.querySelectorAll(".delta")].map((e) => e.textContent),
    summary: document.querySelector("details.previous summary").textContent,
    fixLabel: getComputedStyle(document.querySelector(".card .fix"), "::before").content,
    verdict: document.querySelector(".badge-verdict").textContent,
    badgeRoles: [...document.querySelectorAll(".badge-scores span")].map((e) => e.textContent),
    counter: document.querySelector("#counter").textContent,
    submit: document.querySelector("#submit").textContent, newPitch: document.querySelector("#newPitch").textContent,
    placeholder: document.querySelector("#pitch").placeholder, pressed: document.querySelector('[data-lang][aria-pressed="true"]').dataset.lang,
  }));
  console.log("  ", JSON.stringify(ui));

  // Failed card + "waiting for N" + banner, in the same language.
  mode = "down";
  await page.fill("#pitch", "A third pitch that the panel will never see because Ollama is down.");
  await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 15000 });
  const down = await page.evaluate(() => ({
    failed: document.querySelector(".failed-msg").textContent, retry: document.querySelector("[data-retry]").textContent,
    wait: document.querySelector(".badge-wait").textContent, banner: document.querySelector("#banner").hidden ? null : document.querySelector("#banner").textContent,
  }));
  console.log("  ", JSON.stringify(down));
  const overflowDown = await page.evaluate(() => [...document.querySelectorAll(".card, .card *, .banner, .badge *")].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName));
  overflowDown.length ? fail(`${lang} @${width}: failed-state overflow ${overflowDown}`) : ok(`${lang} @${width}: no overflow (failed state, banner)`);
  await page.screenshot({ path: `i18n-${lang}-${width}-down.png`, fullPage: true });
  errors.length ? fail(errors.join(" | ")) : ok(`${lang} @${width}: no page errors`);
  await page.close();
  return { ui, down, bodies };
}

const results = {};
for (const width of [1200, 390]) for (const lang of ["en", "ja"]) results[`${lang}${width}`] = await scenario(width, lang);

const { ui: en, down: enDown } = results.en1200, { ui: ja, down: jaDown } = results.ja1200;
en.lang === "en" && en.h1 === "AI Judges" && en.roles.join() === "Engineer,Marketer,Investor" && en.deltas[0] === "no change" && en.summary === "Previous round"
  && en.fixLabel === '"Fix: "' && en.verdict === "Would not advance" && en.submit === "Submit to the panel" && enDown.failed === "The judge left the room — retry"
  && enDown.wait === "Waiting for 3 judges" && enDown.banner === "Can't reach the local model. Is Ollama running?" ? ok("English strings unchanged") : fail("en strings");
ja.lang === "ja" && ja.title === "AI審査員" && ja.roles.join() === "エンジニア,マーケター,投資家" && ja.badgeRoles[0].startsWith("エンジニア") && ja.deltas[0] === "変化なし"
  && ja.summary === "前回のラウンド" && ja.fixLabel === '"改善案："' && ["通過", "不通過"].includes(ja.verdict) && ja.counter.endsWith("文字") && ja.pressed === "ja"
  && jaDown.retry === "再試行" && jaDown.wait === "あと3人の審査員を待っています" && jaDown.banner?.includes("Ollama") ? ok("Japanese strings, roles relabelled, names unchanged") : fail("ja strings");

// The toggle is UI only: the requests to the judges are identical in both languages.
const strip = (bs) => JSON.stringify(bs.slice(0, 6).map((b) => ({ ...b, messages: b.messages.map((m) => m.content.replace(/last round you gave \d+/, "")) })));
strip(results.en1200.bodies) === strip(results.ja1200.bodies) ? ok("judge requests identical in EN and JA") : fail("requests differ by UI language");

// Persistence: choice survives a reload; default is English.
const page = await browser.newPage();
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
const def = await page.evaluate(() => document.documentElement.lang);
await page.click('[data-lang="ja"]'); await page.reload();
const kept = await page.evaluate(() => [document.documentElement.lang, localStorage.getItem("aiJudges.lang"), document.querySelector(".card .status").textContent]);
await page.click('[data-lang="en"]'); await page.reload();
const back = await page.evaluate(() => document.documentElement.lang);
def === "en" && kept[0] === "ja" && kept[1] === "ja" && kept[2] === "ピッチを待っています…" && back === "en" ? ok(`default en; ja kept after reload; back to en (${kept[2]})`) : fail(`persistence ${def} ${kept} ${back}`);
await browser.close();
