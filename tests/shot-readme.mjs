// Real model: plays the 3-round demo story and saves the README screenshot (assets/screenshot.png).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.goto("http://localhost:8000/");
await page.evaluate(() => localStorage.clear()); await page.reload();
for (const f of ["p1.txt", "p2.txt", "p3.txt"]) {
  await page.fill("#pitch", readFileSync(f, "utf8").trim());
  await page.click("#submit");
  await page.waitForFunction(() => document.querySelectorAll(".card.done, .card.failed").length === 3 && !document.querySelector("#submit").disabled, null, { timeout: 300000 });
  await page.waitForTimeout(1500); // badge count-up
  console.log(f, await page.textContent(".badge-total"), await page.$$eval(".card .score", (s) => s.map((e) => e.textContent).join(" ")));
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: "../assets/screenshot.png", fullPage: true });
await browser.close();
