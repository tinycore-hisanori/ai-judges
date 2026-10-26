// Mocked Ollama for checks that don't need the real model.
export const verdict = (score, extra = {}) => ({ evidence: "x", band: "vague", reason: `Band 40-60 (vague): "x" is weak (${score}).`, score, fix: "Say who it is for.", ...extra });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
// handler(body) -> { status, verdict } | { abort: true } ; records bodies.
// /api/tags answers with the app's model unless a check routes it itself (footer.mjs).
export async function mockOllama(page, handler, { tags = true } = {}) {
  const bodies = [];
  if (tags) await page.route("**/api/tags", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: CORS,
    body: JSON.stringify({ models: [{ name: "qwen2.5:32b", model: "qwen2.5:32b" }] }) }));
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    const r = await handler(body, bodies.length);
    if (r.abort) return route.abort("connectionrefused");
    // Answer in Japanese when asked to, like the real model usually does (r.keepLang opts out).
    if (!r.keepLang && r.verdict && body.messages[0].content.includes("Write reason and fix in Japanese")) {
      r.verdict = { ...r.verdict, reason: r.verdict.reason.replace(/is weak/, "は弱い"), fix: "誰のためのものかを書く。" };
    }
    return route.fulfill({ status: r.status ?? 200, contentType: "application/json", headers: CORS,
      body: JSON.stringify({ message: { role: "assistant", content: JSON.stringify(r.verdict) }, done: true }) });
  });
  return bodies;
}
