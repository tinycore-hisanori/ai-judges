// Mocked check: the footer's Ollama indicator (checking -> connected / model missing / not reachable), in EN and JA.
import { chromium } from "playwright-core";
import { mockOllama, verdict } from "./mock.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);
const errors = [];

// mode: "connected" | "noModel" | "down"; release() lets the held /api/tags answer go through.
async function open(mode) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  let release;
  const held = new Promise((r) => (release = r));
  await page.route("**/api/tags", async (route) => {
    await held;
    if (mode === "down") return route.abort("connectionrefused");
    const models = mode === "connected" ? [{ name: "qwen2.5:32b", model: "qwen2.5:32b" }] : [{ name: "qwen2.5:14b", model: "qwen2.5:14b" }];
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ models }) });
  });
  await mockOllama(page, () => ({ verdict: verdict(50) }), { tags: false });
  await page.goto("http://localhost:8000/");
  await page.evaluate(() => localStorage.clear());
  return { page, release };
}
const status = (page) => page.$eval(".ollama-status", (e) => ({ cls: e.className, text: e.textContent, color: getComputedStyle(e).color }));
const GREY = "rgb(138, 133, 120)", GREEN = "rgb(47, 158, 91)", RED = "rgb(200, 64, 47)";

{
  const { page, release } = await open("connected");
  await page.reload();
  const s = await status(page);
  s.text === "Ollama: checking…" && s.color === GREY ? ok('grey "Ollama: checking…" while /api/tags is pending') : fail("checking " + JSON.stringify(s));
  release();
  await page.waitForSelector(".ollama-status.connected");
  const c = await status(page);
  c.text === "Ollama: connected · qwen2.5:32b" && c.color === GREEN ? ok('green "Ollama: connected · qwen2.5:32b"') : fail("connected " + JSON.stringify(c));
  (await page.textContent("#appFooter")).startsWith("AI Judges v") ? ok("version still shown: " + await page.textContent("#appFooter")) : fail("version");
  await page.click("[data-lang=ja]");
  (await status(page)).text === "Ollama: 接続済み · qwen2.5:32b" ? ok("JA: 接続済み") : fail("ja connected");
  await page.close();
}
{
  const { page, release } = await open("down");
  release(); await page.reload();
  await page.waitForSelector(".ollama-status.down");
  const s = await status(page);
  s.text === "Can't reach the local model. Is Ollama running?" && s.color === RED ? ok("red with the banner text when Ollama is not reachable") : fail("down " + JSON.stringify(s));
  (await page.$eval("#banner", (e) => e.hidden)) ? ok("the all-fail banner itself stays hidden until a round fails") : fail("banner shown");
  await page.close();
}
{
  const { page, release } = await open("noModel");
  release(); await page.reload();
  await page.waitForSelector(".ollama-status.noModel");
  const s = await status(page);
  s.text === "Ollama: qwen2.5:32b not pulled — run: ollama pull qwen2.5:32b" && s.color === RED ? ok("red with the pull command when the model is missing") : fail("noModel " + JSON.stringify(s));
  await page.close();
}
console.log(errors.length ? "ERRORS " + errors.join(" | ") : "no page errors");
await browser.close();
