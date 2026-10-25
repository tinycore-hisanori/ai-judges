// Renders the SVG sources here to ../{vera,marco,ingrid}.png at 512x512.
// Needs playwright-core and a local Chrome:  npm i --no-save playwright-core && node assets/portraits/src/render.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const name of ["vera", "marco", "ingrid"]) {
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${readFileSync(here(`${name}.svg`), "utf8")}`);
  await page.locator("svg").screenshot({ path: here(`../${name}.png`) });
}
await browser.close();
