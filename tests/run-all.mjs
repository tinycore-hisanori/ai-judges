// Runs every mocked check (no model needed; the app must be served on http://localhost:8000).
// Usage, from tests/: npm install && node run-all.mjs
import { spawnSync } from "node:child_process";
const CHECKS = ["golden", "retry", "s3", "s4", "i18n", "vlang", "newpitch", "attach", "rubric", "anchor", "footer"];
let failed = [];
for (const name of CHECKS) {
  const r = spawnSync(process.execPath, [`${name}.mjs`], { encoding: "utf8" });
  const out = r.stdout + r.stderr;
  const bad = r.status !== 0 || /FAIL|ERRORS/.test(out);
  console.log(`${bad ? "FAIL" : "ok  "} ${name}`);
  if (bad) { failed.push(name); console.log(out.replace(/^/gm, "    ")); }
}
console.log(failed.length ? `\n${failed.length} failed: ${failed.join(", ")}` : `\nall ${CHECKS.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
