import { JUDGES, buildMessages } from "./judges.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:14b";
const MIN_PITCH_CHARS = 20;

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    fix: { type: "string" },
  },
  required: ["score", "reason", "fix"],
};

// --- State ---------------------------------------------------------------

const state = {
  pitch: "",
  current: { engineer: null, marketer: null, investor: null },
  status: { engineer: "waiting", marketer: "waiting", investor: "waiting" },
  running: false,
};

// --- Model access (the one seam for a future provider switch) -------------

async function callJudge(judge, messages) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: VERDICT_SCHEMA,
      options: { temperature: 0.2, seed: judge.seed },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.message.content);
}

export function validateVerdict(v) {
  if (!v || typeof v !== "object") throw new Error("verdict is not an object");
  if (!Number.isInteger(v.score) || v.score < 0 || v.score > 100) throw new Error("score out of range");
  if (typeof v.reason !== "string" || !v.reason.trim()) throw new Error("empty reason");
  if (typeof v.fix !== "string" || !v.fix.trim()) throw new Error("empty fix");
  return { score: v.score, reason: v.reason.trim(), fix: v.fix.trim() };
}

// --- Round controller ------------------------------------------------------

async function runJudge(judge) {
  state.status[judge.id] = "reading";
  renderCard(judge);
  try {
    const raw = await callJudge(judge, buildMessages(judge, state.pitch));
    state.current[judge.id] = validateVerdict(raw);
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
    state.status[judge.id] = "reading";
    renderCard(judge);
  }
  renderControls();

  for (const judge of JUDGES) {
    await runJudge(judge);
  }

  state.running = false;
  renderControls();
}

// --- Rendering ---------------------------------------------------------------

const els = {
  panel: document.getElementById("panel"),
  pitch: document.getElementById("pitch"),
  counter: document.getElementById("counter"),
  submit: document.getElementById("submit"),
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
    body.innerHTML = `
      <div class="score-row"><span class="score">${v.score}<small>/100</small></span></div>
      <p class="reason">${escapeHTML(v.reason)}</p>
      <p class="fix">${escapeHTML(v.fix)}</p>`;
  }
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
