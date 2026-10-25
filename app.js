import { JUDGES, MODEL, MAX_PITCH_CHARS, VERDICT_LANG_LINES, buildMessages } from "./judges.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MIN_PITCH_CHARS = 20;
const WARN_PITCH_CHARS = 3000;
const JUDGE_TIMEOUT_MS = 60_000;
const STORAGE_KEY = "aiJudges.v1";
const COUNT_UP_MS = 600;
const ADVANCE_THRESHOLD = 70;
const MAX_FIX_CHARS = 300; // longer than this is a rewrite of the pitch, not one change
const LANG_KEY = "aiJudges.lang";
const VERDICT_LANG_KEY = "aiJudges.verdictLang";

// --- UI strings ----------------------------------------------------------------
// UI only: the judges' answer language is the separate "Verdicts in" selector.

const STRINGS = {
  en: {
    pageTitle: "AI Judges",
    title: "AI Judges",
    tagline: "Three judges. One pitch. Rewrite until they change their minds.",
    placeholder: "Paste your pitch — 3 to 5 lines",
    submit: "Submit to the panel",
    deliberating: "Panel is deliberating…",
    newPitch: "New pitch",
    banner: "Can't reach the local model. Is Ollama running?",
    waitingPitch: "Waiting for your pitch…",
    reading: "Reading…",
    failed: "The judge left the room — retry",
    retry: "Retry",
    fixLabel: "Fix: ",
    noChange: "no change",
    previousRound: "Previous round",
    waitingJudges: (n) => `Waiting for ${n} judge${n === 1 ? "" : "s"}`,
    advance: "Would advance",
    reject: "Would not advance",
    counter: (n) => `${n} characters`,
    counterOver: (n, max) => `${n} characters — Judges stop reading after ~${max} characters`,
    role: (j) => j.role,
    verdictLangLabel: "Verdicts in",
    verdictLangAuto: "Auto (language of the pitch)",
  },
  ja: {
    pageTitle: "AI審査員",
    title: "AI審査員",
    tagline: "審査員は3人、ピッチは1つ。考えが変わるまで書き直そう。",
    placeholder: "ピッチを貼り付けてください（3〜5行）",
    submit: "審査に出す",
    deliberating: "審査中…",
    newPitch: "新しいピッチ",
    banner: "ローカルモデルに接続できません。Ollama は起動していますか？",
    waitingPitch: "ピッチを待っています…",
    reading: "読んでいます…",
    failed: "審査員が退席しました — 再試行してください",
    retry: "再試行",
    fixLabel: "改善案：",
    noChange: "変化なし",
    previousRound: "前回のラウンド",
    waitingJudges: (n) => `あと${n}人の審査員を待っています`,
    advance: "通過",
    reject: "不通過",
    counter: (n) => `${n}文字`,
    counterOver: (n, max) => `${n}文字 — 審査員が読むのは約${max}文字までです`,
    role: (j) => j.roleJa,
    verdictLangLabel: "講評の言語",
    verdictLangAuto: "自動（ピッチの言語）",
  },
};

function loadLang() {
  try { return localStorage.getItem(LANG_KEY) === "ja" ? "ja" : "en"; } catch { return "en"; }
}

let lang = loadLang();

function loadVerdictLang() {
  try {
    const v = localStorage.getItem(VERDICT_LANG_KEY);
    return v && Object.hasOwn(VERDICT_LANG_LINES, v) ? v : "auto";
  } catch { return "auto"; }
}

let verdictLang = loadVerdictLang();
const t = (key, ...args) => {
  const s = STRINGS[lang][key];
  return typeof s === "function" ? s(...args) : s;
};

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
  if (d === 0) return { kind: "same", text: STRINGS.en.noChange };
  return d > 0 ? { kind: "up", text: `▲${d}` } : { kind: "down", text: `▼${-d}` };
}

// --- Model access (the one seam for a future provider switch) -------------

async function callJudge(judge, messages, seed = judge.seed) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: VERDICT_SCHEMA,
      // 6144 tokens fits the prompt + a 6000-char pitch (even in Japanese, ~4,800 tokens); 8192 spilled 32B into system RAM.
      options: { temperature: 0.2, seed, num_ctx: 6144 },
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
  if (/["“「]\s*["”」]/.test(v.reason)) fail("empty quote in reason");
  if (typeof v.fix !== "string" || !v.fix.trim()) fail("empty fix");
  if (v.fix.trim().length > MAX_FIX_CHARS) fail("fix is a rewrite, not one change");
  return { score: v.score, reason: v.reason.trim(), fix: v.fix.trim() };
}

// --- Round controller ------------------------------------------------------

async function askJudge(judge) {
  const messages = buildMessages(judge, state.pitch, state.previous[judge.id], verdictLang);
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
  if (state.status[judge.id] === "done") els.banner.hidden = true;
}

async function retryJudge(id) {
  if (state.running) return;
  const judge = JUDGES.find((j) => j.id === id);
  state.running = true;
  renderControls();
  renderBadge();
  await runJudge(judge);
  finishRound();
}

async function submitRound() {
  if (state.running) return;
  state.running = true;
  state.pitch = els.pitch.value;
  els.banner.hidden = true;
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
  // All three down usually means Ollama itself isn't reachable: say so once.
  els.banner.hidden = !JUDGES.every((j) => state.status[j.id] === "failed");
  const verdicts = JUDGES.map((j) => state.current[j.id]);
  if (verdicts.every(Boolean)) {
    const from = state.lastTotal;
    state.lastTotal = panelTotal(verdicts.map((v) => v.score)).total;
    renderBadge(from);
    save(); // only complete rounds are saved; a reload mid-round restores the last one
  } else {
    renderBadge();
  }
  renderControls();
}

// --- Persistence ---------------------------------------------------------------

function save() {
  try {
    const { pitch, current, previous, lastTotal } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pitch, current, previous, lastTotal }));
  } catch (err) {
    console.warn("Could not save round:", err);
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !JUDGES.every((j) => saved.current?.[j.id])) return;
    Object.assign(state, {
      pitch: saved.pitch,
      current: saved.current,
      previous: { ...state.previous, ...saved.previous },
      lastTotal: saved.lastTotal,
    });
    for (const j of JUDGES) state.status[j.id] = "done";
    els.pitch.value = saved.pitch;
  } catch (err) {
    console.warn("Ignoring unreadable saved round:", err);
  }
}

function newPitch() {
  if (state.running) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  for (const j of JUDGES) {
    state.current[j.id] = null;
    state.previous[j.id] = null;
    state.status[j.id] = "waiting";
  }
  state.pitch = "";
  state.lastTotal = null;
  els.pitch.value = "";
  els.banner.hidden = true;
  JUDGES.forEach(renderCard);
  renderBadge();
  renderControls();
}

// --- Rendering ---------------------------------------------------------------

const els = {
  panel: document.getElementById("panel"),
  pitch: document.getElementById("pitch"),
  counter: document.getElementById("counter"),
  submit: document.getElementById("submit"),
  newPitch: document.getElementById("newPitch"),
  badge: document.getElementById("badge"),
  banner: document.getElementById("banner"),
  langButtons: document.querySelectorAll("[data-lang]"),
  verdictLang: document.getElementById("verdictLang"),
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
      <div class="who"><h2>${j.name}</h2><span class="role"></span></div>
      <div class="body"></div>
    </article>`
  ).join("");
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderCard(judge) {
  const card = document.getElementById(`card-${judge.id}`);
  card.querySelector(".role").textContent = t("role", judge);
  const status = state.status[judge.id];
  card.className = `card ${status}`;
  const body = card.querySelector(".body");

  if (status === "waiting") {
    body.innerHTML = `<p class="status">${t("waitingPitch")}</p>`;
  } else if (status === "reading") {
    body.innerHTML = `<p class="status">${t("reading")}</p>`;
  } else if (status === "failed") {
    body.innerHTML = `
      <p class="status failed-msg">${t("failed")}</p>
      <button class="btn retry" data-retry="${judge.id}" ${state.running ? "disabled" : ""}>${t("retry")}</button>`;
  } else {
    const v = state.current[judge.id];
    const prev = state.previous[judge.id];
    const delta = scoreDelta(prev?.score, v.score);
    const deltaHTML = !delta
      ? ""
      : delta.kind === "same"
        ? `<span class="delta same">${t("noChange")}</span>`
        : `<span class="delta ${delta.kind}">${prev.score} → ${v.score} ${delta.text}</span>`;
    const previousHTML = prev
      ? `<details class="previous">
           <summary>${t("previousRound")}</summary>
           <p><strong>${prev.score}/100</strong> — ${escapeHTML(prev.reason)}</p>
           <p class="fix" data-label="${t("fixLabel")}">${escapeHTML(prev.fix)}</p>
         </details>`
      : "";
    body.innerHTML = `
      <div class="score-row"><span class="score">${v.score}<small>/100</small></span>${deltaHTML}</div>
      <p class="reason">${escapeHTML(v.reason)}</p>
      <p class="fix" data-label="${t("fixLabel")}">${escapeHTML(v.fix)}</p>
      ${previousHTML}`;
  }
}

// `from` = previous total to count up from (only right after a round completes).
function renderBadge(from = null) {
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
    els.badge.innerHTML = `<span class="badge-wait">${t("waitingJudges", missing)}</span>`;
    return;
  }
  const { total, advances } = panelTotal(verdicts.map((v) => v.score));
  els.badge.className = `badge ${advances ? "advance" : "reject"}`;
  els.badge.innerHTML = `
    <div class="badge-total">${total}</div>
    <div class="badge-verdict">${t(advances ? "advance" : "reject")}</div>
    <div class="badge-scores">${JUDGES.map((j) => `<span>${t("role", j)} ${state.current[j.id].score}</span>`).join("")}</div>`;
  if (from != null && from !== total) countUp(els.badge.querySelector(".badge-total"), from, total);
}

function countUp(el, from, to) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / COUNT_UP_MS);
    el.textContent = Math.round(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = from;
  requestAnimationFrame(step);
}

function renderControls() {
  els.pitch.readOnly = state.running;
  els.submit.textContent = t(state.running ? "deliberating" : "submit");
  els.submit.disabled = state.running || els.pitch.value.trim().length < MIN_PITCH_CHARS;
  els.newPitch.disabled = state.running;
  els.verdictLang.disabled = state.running;
  const n = els.pitch.value.length;
  els.counter.className = `counter ${n > MAX_PITCH_CHARS ? "over" : n > WARN_PITCH_CHARS ? "warn" : "ok"}`;
  els.counter.textContent = n > MAX_PITCH_CHARS ? t("counterOver", n, MAX_PITCH_CHARS) : t("counter", n);
  // Retry buttons follow the round lock too.
  els.panel.querySelectorAll("[data-retry]").forEach((b) => (b.disabled = state.running));
}

// Static page text, then everything rendered from state, in the current language.
function applyLang() {
  document.documentElement.lang = lang;
  document.title = t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  els.pitch.placeholder = t("placeholder");
  els.langButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  JUDGES.forEach(renderCard);
  renderBadge();
  renderControls();
}

function setLang(next) {
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyLang();
}

function setVerdictLang(next) {
  verdictLang = next;
  try { localStorage.setItem(VERDICT_LANG_KEY, verdictLang); } catch {}
}

// --- Wiring --------------------------------------------------------------------

buildPanel();
load();
els.verdictLang.value = verdictLang;
applyLang();

els.pitch.addEventListener("input", renderControls);
els.submit.addEventListener("click", submitRound);
els.newPitch.addEventListener("click", newPitch);
els.langButtons.forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
els.verdictLang.addEventListener("change", () => setVerdictLang(els.verdictLang.value));
els.panel.addEventListener("click", (e) => {
  const id = e.target.closest("[data-retry]")?.dataset.retry;
  if (id) retryJudge(id);
});
