import { JUDGES, MODEL, buildMessages } from "./judges.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MIN_PITCH_CHARS = 20;
const ADVANCE_THRESHOLD = 70;

// Evidence-first: the model copies the relevant pitch sentence and picks a band
// before it writes the reason and score. Only reason/score/fix are kept.
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    evidence: { type: "string" },
    band: { type: "string", enum: ["absent", "vague", "specific", "exceptional"] },
    reason: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    fix: { type: "string" },
  },
  required: ["evidence", "band", "reason", "score", "fix"],
};

// --- State ---------------------------------------------------------------

const state = {
  pitch: "",
  current: { engineer: null, marketer: null, investor: null },
  previous: { engineer: null, marketer: null, investor: null },
  status: { engineer: "waiting", marketer: "waiting", investor: "waiting" },
  lastTotal: null,
  running: false,
};

// --- Scoring rules (pure) ----------------------------------------------------

export function panelTotal(scores) {
  const total = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { total, advances: total >= ADVANCE_THRESHOLD };
}

export function scoreDelta(prev, next) {
  if (prev == null) return null;
  const d = next - prev;
  if (d === 0) return { kind: "same", text: "no change" };
  return d > 0 ? { kind: "up", text: `▲${d}` } : { kind: "down", text: `▼${-d}` };
}

// --- Model access (the one seam for a future provider switch) -------------

async function callJudge(judge, messages, seed = judge.seed) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: VERDICT_SCHEMA,
      options: { temperature: 0.2, seed },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.message.content);
}

class UnusableVerdict extends Error {}

export function validateVerdict(v) {
  const fail = (msg) => { throw new UnusableVerdict(msg); };
  if (!v || typeof v !== "object") fail("verdict is not an object");
  if (!Number.isInteger(v.score) || v.score < 0 || v.score > 100) fail("score out of range");
  if (typeof v.reason !== "string" || !v.reason.trim()) fail("empty reason");
  if (typeof v.fix !== "string" || !v.fix.trim()) fail("empty fix");
  return { score: v.score, reason: v.reason.trim(), fix: v.fix.trim() };
}

// --- Round controller ------------------------------------------------------

async function askJudge(judge) {
  const messages = buildMessages(judge, state.pitch, state.previous[judge.id]);
  try {
    return validateVerdict(await callJudge(judge, messages));
  } catch (err) {
    if (!(err instanceof UnusableVerdict)) throw err;
    // One automatic retry for an unusable answer. A different seed, or the
    // deterministic model would repeat the same answer.
    console.warn(`${judge.name} gave an unusable answer (${err.message}); retrying once`);
    return validateVerdict(await callJudge(judge, messages, judge.seed + 1));
  }
}

async function runJudge(judge) {
  state.status[judge.id] = "reading";
  renderCard(judge);
  try {
    state.current[judge.id] = await askJudge(judge);
    state.status[judge.id] = "done";
  } catch (err) {
    console.warn(`${judge.name} failed:`, err);
    state.status[judge.id] = "failed";
  }
  renderCard(judge);
}

async function submitRound() {
  if (state.running) return;
  state.running = true;
  state.pitch = els.pitch.value;
  for (const judge of JUDGES) {
    // Each judge's last completed verdict becomes the one we compare against.
    if (state.current[judge.id]) state.previous[judge.id] = state.current[judge.id];
    state.current[judge.id] = null;
    state.status[judge.id] = "reading";
    renderCard(judge);
  }
  renderControls();
  renderBadge();

  for (const judge of JUDGES) {
    await runJudge(judge);
    renderBadge();
  }

  finishRound();
}

function finishRound() {
  state.running = false;
  const verdicts = JUDGES.map((j) => state.current[j.id]);
  if (verdicts.every(Boolean)) {
    state.lastTotal = panelTotal(verdicts.map((v) => v.score)).total;
  }
  renderBadge();
  renderControls();
}

// --- Rendering ---------------------------------------------------------------

const els = {
  panel: document.getElementById("panel"),
  pitch: document.getElementById("pitch"),
  counter: document.getElementById("counter"),
  submit: document.getElementById("submit"),
  badge: document.getElementById("badge"),
};

function portraitHTML(judge) {
  // Placeholder initials sit underneath; the PNG covers them once it exists.
  return `
    <div class="portrait" style="background:${judge.color}">
      <div class="initials">${judge.initials}</div>
      <img src="${judge.portrait}" alt="${judge.name}" style="position:absolute;inset:0" onerror="this.remove()">
      <div class="spinner"></div>
    </div>`;
}

function buildPanel() {
  els.panel.innerHTML = JUDGES.map(
    (j) => `
    <article class="card waiting" id="card-${j.id}" data-judge="${j.id}">
      ${portraitHTML(j)}
      <div class="who"><h2>${j.name}</h2><span class="role">${j.role}</span></div>
      <div class="body"></div>
    </article>`
  ).join("");
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderCard(judge) {
  const card = document.getElementById(`card-${judge.id}`);
  const status = state.status[judge.id];
  card.className = `card ${status}`;
  const body = card.querySelector(".body");

  if (status === "waiting") {
    body.innerHTML = `<p class="status">Waiting for your pitch…</p>`;
  } else if (status === "reading") {
    body.innerHTML = `<p class="status">Reading…</p>`;
  } else if (status === "failed") {
    body.innerHTML = `<p class="status">The judge left the room</p>`;
  } else {
    const v = state.current[judge.id];
    const prev = state.previous[judge.id];
    const delta = scoreDelta(prev?.score, v.score);
    const deltaHTML = !delta
      ? ""
      : delta.kind === "same"
        ? `<span class="delta same">no change</span>`
        : `<span class="delta ${delta.kind}">${prev.score} → ${v.score} ${delta.text}</span>`;
    const previousHTML = prev
      ? `<details class="previous">
           <summary>Previous round</summary>
           <p><strong>${prev.score}/100</strong> — ${escapeHTML(prev.reason)}</p>
           <p class="fix">${escapeHTML(prev.fix)}</p>
         </details>`
      : "";
    body.innerHTML = `
      <div class="score-row"><span class="score">${v.score}<small>/100</small></span>${deltaHTML}</div>
      <p class="reason">${escapeHTML(v.reason)}</p>
      <p class="fix">${escapeHTML(v.fix)}</p>
      ${previousHTML}`;
  }
}

function renderBadge() {
  const verdicts = JUDGES.map((j) => state.current[j.id]);
  const anyActivity = JUDGES.some((j) => state.status[j.id] !== "waiting");
  if (!anyActivity) {
    els.badge.className = "badge empty";
    els.badge.innerHTML = "";
    return;
  }
  const missing = verdicts.filter((v) => !v).length;
  if (missing) {
    els.badge.className = "badge pending";
    els.badge.innerHTML = `<span class="badge-wait">Waiting for ${missing} judge${missing === 1 ? "" : "s"}</span>`;
    return;
  }
  const { total, advances } = panelTotal(verdicts.map((v) => v.score));
  els.badge.className = `badge ${advances ? "advance" : "reject"}`;
  els.badge.innerHTML = `
    <div class="badge-total">${total}</div>
    <div class="badge-verdict">${advances ? "Would advance" : "Would not advance"}</div>
    <div class="badge-scores">${JUDGES.map((j) => `<span>${j.role} ${state.current[j.id].score}</span>`).join("")}</div>`;
}

function renderControls() {
  els.pitch.readOnly = state.running;
  els.submit.textContent = state.running ? "Panel is deliberating…" : "Submit to the panel";
  els.submit.disabled = state.running || els.pitch.value.trim().length < MIN_PITCH_CHARS;
  els.counter.textContent = `${els.pitch.value.length} characters`;
}

// --- Wiring --------------------------------------------------------------------

buildPanel();
JUDGES.forEach(renderCard);
renderControls();

els.pitch.addEventListener("input", renderControls);
els.submit.addEventListener("click", submitRound);
