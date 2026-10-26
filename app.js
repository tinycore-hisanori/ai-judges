// MAJOR.MINOR.PATCH: MINOR for a feature, PATCH for a bug fix. Bump in the same commit, and in CHANGELOG.md.
const APP_VERSION = "1.3.0";

import {
  JUDGES, MODEL, MAX_PITCH_CHARS, MAX_TOTAL_CHARS, VERDICT_LANG_LINES, DEFAULT_CRITERIA,
  activeSubmission, criterionNames, homeCriterion, submissionDocuments, buildMessages,
} from "./judges.js";
import { ACCEPTED_FILES, MIN_EXTRACTED_CHARS, extractText, readableLength } from "./extract.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";
const OLLAMA_CHECK_TIMEOUT_MS = 5_000;
const MIN_PITCH_CHARS = 20;
const WARN_PITCH_CHARS = 3000;
const JUDGE_TIMEOUT_MS = 60_000;
const STORAGE_KEY = "aiJudges.v1";
const COUNT_UP_MS = 600;
const ADVANCE_THRESHOLD = 70;
const MAX_FIX_CHARS = 300; // longer than this is a rewrite of the pitch, not one change
const LANG_KEY = "aiJudges.lang";
const VERDICT_LANG_KEY = "aiJudges.verdictLang";
const SUBMISSION_KEY = "aiJudges.submission";
const DEFAULT_LABELS = ["Project story", "README", "Demo video script", "Other"];
// 6144 tokens fits the prompt + a 6000-char pitch (even in Japanese, ~4,800 tokens); 8192 spilled 32B into system RAM.
const PITCH_NUM_CTX = 6144;
// 12,000 characters of pitch + criteria + documents (Japanese ~9,000 tokens). Needs Ollama's q8_0 KV cache
// (OLLAMA_FLASH_ATTENTION=1, OLLAMA_KV_CACHE_TYPE=q8_0) to stay fully on a 24 GB GPU; 16384 did not fit.
const SUBMISSION_NUM_CTX = 12288;

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
    ollamaChecking: "Ollama: checking…",
    ollamaConnected: (model) => `Ollama: connected · ${model}`,
    ollamaNoModel: (model) => `Ollama: ${model} not pulled — run: ollama pull ${model}`,
    waitingPitch: "Waiting for your pitch…",
    reading: "Reading…",
    failed: "The judge left the room — retry",
    retry: "Retry",
    fixLabel: "Fix: ",
    noChange: "no change",
    newRubric: "New rubric",
    previousRound: "Previous round",
    waitingJudges: (n) => `Waiting for ${n} judge${n === 1 ? "" : "s"}`,
    advance: "Would advance",
    reject: "Would not advance",
    counter: (n) => `${n} characters`,
    counterOver: (n, max) => `${n} characters — Judges stop reading after ~${max} characters`,
    role: (j) => j.role,
    verdictLangLabel: "Verdicts in",
    verdictLangAuto: "Auto (language of the pitch)",
    attachTitle: "Attach your submission (optional)",
    attachHint: "The judges read these only when at least one document has text.",
    labelField: "Label",
    docPlaceholder: "Paste the document text",
    loadFile: "Load file",
    loadFileTitle: "Load .md, .txt, .pdf, .docx, .pptx or .xlsx; the text is extracted in your browser",
    fileReading: "Reading the file…",
    fileEmpty: "No readable text found (scanned image?)",
    fileFailed: "Couldn't read this file.",
    criteriaLabel: "Judging criteria",
    totalCounter: (n, max) => `${n} / ${max} characters sent to the judges`,
    totalOver: (n, max) => `${n} / ${max} characters — Judges stop reading after ${max} characters`,
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
    ollamaChecking: "Ollama: 確認中…",
    ollamaConnected: (model) => `Ollama: 接続済み · ${model}`,
    ollamaNoModel: (model) => `Ollama: ${model} がありません — ollama pull ${model} を実行してください`,
    waitingPitch: "ピッチを待っています…",
    reading: "読んでいます…",
    failed: "審査員が退席しました — 再試行してください",
    retry: "再試行",
    fixLabel: "改善案：",
    noChange: "変化なし",
    newRubric: "新しい基準",
    previousRound: "前回のラウンド",
    waitingJudges: (n) => `あと${n}人の審査員を待っています`,
    advance: "通過",
    reject: "不通過",
    counter: (n) => `${n}文字`,
    counterOver: (n, max) => `${n}文字 — 審査員が読むのは約${max}文字までです`,
    role: (j) => j.roleJa,
    verdictLangLabel: "講評の言語",
    verdictLangAuto: "自動（ピッチの言語）",
    attachTitle: "提出物を添付（任意）",
    attachHint: "文書に1つでも本文があるときだけ、審査員がこれを読みます。",
    labelField: "ラベル",
    docPlaceholder: "文書の本文を貼り付け",
    loadFile: "ファイルを読み込む",
    loadFileTitle: ".md、.txt、.pdf、.docx、.pptx、.xlsx を読み込みます（文字の抽出はブラウザ内で行います）",
    fileReading: "ファイルを読み込んでいます…",
    fileEmpty: "読み取れる文字がありません（スキャン画像？）",
    fileFailed: "このファイルは読み込めませんでした。",
    criteriaLabel: "審査基準",
    totalCounter: (n, max) => `審査員に送る文字数 ${n} / ${max}`,
    totalOver: (n, max) => `${n} / ${max}文字 — 審査員が読むのは${max}文字までです`,
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

// Submission review: the quote comes first, then the document it came from, then the criterion.
// With "source" first the model named the pitch for quotes it then took from the Project story.
const SUBMISSION_SCHEMA = {
  type: "object",
  properties: {
    evidence: { type: "string" },
    source: { type: "string" },
    criterion: { type: "string" },
    band: VERDICT_SCHEMA.properties.band,
    reason: { type: "string" },
    score: VERDICT_SCHEMA.properties.score,
    fix: { type: "string" },
  },
  required: ["evidence", "source", "criterion", "band", "reason", "score", "fix"],
};

// --- State ---------------------------------------------------------------

const state = {
  pitch: "",
  current: { engineer: null, marketer: null, investor: null },
  previous: { engineer: null, marketer: null, investor: null },
  status: { engineer: "waiting", marketer: "waiting", investor: "waiting" },
  lastTotal: null,
  running: false,
  submission: null, // the documents + criteria this round was judged with, or null
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

// Pinned in the schema: the source is one of the documents sent, and the criterion is
// the judge's home criterion or one of the listed names.
function verdictSchema(judge, submission, documents) {
  if (!submission) return VERDICT_SCHEMA;
  const names = criterionNames(submission.criteria);
  const home = homeCriterion(judge, names);
  const criterion = { type: "string", ...(home ? { enum: [home] } : names.length ? { enum: names } : {}) };
  const source = { type: "string", enum: documents.map((d) => d.label) };
  return { ...SUBMISSION_SCHEMA, properties: { ...SUBMISSION_SCHEMA.properties, source, criterion } };
}

async function callJudge(judge, messages, seed = judge.seed, submission = null, documents = null) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: verdictSchema(judge, submission, documents),
      options: { temperature: 0.2, seed, num_ctx: submission ? SUBMISSION_NUM_CTX : PITCH_NUM_CTX },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.message.content);
}

class UnusableVerdict extends Error {
  constructor(message, { raw, language = false } = {}) {
    super(message);
    this.raw = raw;           // the answer as the model sent it, for the console
    this.language = language; // rejected only for answering in the wrong language
  }
}

const normalizeSpace = (s) => s.replace(/\s+/g, " ").trim();

// Quotes keep the document's own language and the band label is always English,
// so only the judge's own words count: "ja" when kana/kanji are at least half of
// the letters left, "en" otherwise, null when too few are left to tell
// (a fix that is just `Add: "<sentence for an English pitch>"`).
export function ownLanguage(s) {
  const own = s.replace(/"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』/g, "").replace(/^\s*Band \d+-\d+ \([a-z]+\):/, "");
  const ja = (own.match(/[぀-ヿ㐀-鿿]/g) || []).length;
  const latin = (own.match(/[A-Za-z]/g) || []).length;
  if (ja + latin < 10) return null;
  return ja >= latin ? "ja" : "en";
}
const wrongLanguage = (s, lang) => lang && ownLanguage(s) !== null && ownLanguage(s) !== lang;

// `documents`: what the judge was sent in submission review ([{ label, text }], "Pitch" first), else null.
// `lang`: "en" or "ja" when a verdict language is selected, else null; reason and fix must be in it.
export function validateVerdict(v, documents = null, lang = null) {
  const fail = (msg, language = false) => { throw new UnusableVerdict(msg, { raw: v, language }); };
  if (!v || typeof v !== "object") fail("verdict is not an object");
  if (!Number.isInteger(v.score) || v.score < 0 || v.score > 100) fail("score out of range");
  if (typeof v.reason !== "string" || !v.reason.trim()) fail("empty reason");
  if (/["“「]\s*["”」]/.test(v.reason)) fail("empty quote in reason");
  if (typeof v.fix !== "string" || !v.fix.trim()) fail("empty fix");
  if (v.fix.trim().length > MAX_FIX_CHARS) fail("fix is a rewrite, not one change");
  if (wrongLanguage(v.reason, lang)) fail(`language check: reason is not in ${lang}`, true);
  if (wrongLanguage(v.fix, lang)) fail(`language check: fix is not in ${lang}`, true);
  const verdict = { score: v.score, reason: v.reason.trim(), fix: v.fix.trim() };
  if (!documents) return verdict;
  if (typeof v.criterion !== "string" || !v.criterion.trim()) fail("empty criterion");
  // The source must be a document the judge was given, and the evidence must really be in it.
  const doc = documents.find((d) => d.label === v.source?.trim());
  if (!doc) fail(`source "${v.source}" is not one of the documents`);
  if (typeof v.evidence !== "string" || !normalizeSpace(doc.text).includes(normalizeSpace(v.evidence))) {
    fail(`evidence is not in ${doc.label}`);
  }
  return { ...verdict, criterion: v.criterion.trim(), source: doc.label };
}

// --- Round controller ------------------------------------------------------

// What a score was measured against: the pitch-only rubric, or the listed criteria.
// Scores under different rubrics aren't compared (no delta, no "last round you gave").
const rubricOf = (submission) => (submission ? `criteria:${normalizeSpace(submission.criteria)}` : "pitch");
const comparable = (prev, rubric) => Boolean(prev) && (prev.rubric ?? "pitch") === rubric;

async function askJudge(judge) {
  const { submission } = state;
  const prev = state.previous[judge.id];
  const previous = comparable(prev, rubricOf(submission)) ? prev : null;
  const messages = buildMessages(judge, state.pitch, previous, { verdictLang, submission });
  const documents = submission && submissionDocuments(state.pitch, submission);
  const replyLang = verdictLang === "auto" ? null : verdictLang;
  try {
    return validateVerdict(await callJudge(judge, messages, judge.seed, submission, documents), documents, replyLang);
  } catch (err) {
    if (!(err instanceof UnusableVerdict)) throw err;
    // One automatic retry for an unusable answer. A different seed, or the
    // deterministic model would repeat the same answer.
    console.warn(`${judge.name} gave an unusable answer (${err.message}); retrying once. Raw:`, JSON.stringify(err.raw));
    // A wrong-language answer gets the language rule again, right before the pitch:
    // at the end of a long system prompt it is sometimes ignored.
    const retryMessages = err.language
      ? [...messages.slice(0, -1), { role: "system", content: VERDICT_LANG_LINES[replyLang] }, messages.at(-1)]
      : messages;
    return validateVerdict(await callJudge(judge, retryMessages, judge.seed + 1, submission, documents), documents, replyLang);
  }
}

async function runJudge(judge) {
  state.status[judge.id] = "reading";
  renderCard(judge);
  try {
    state.current[judge.id] = { ...(await askJudge(judge)), rubric: rubricOf(state.submission) };
    state.status[judge.id] = "done";
  } catch (err) {
    console.warn(`${judge.name} failed:`, err, err.raw ? `Raw: ${JSON.stringify(err.raw)}` : "");
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
  state.submission = activeSubmission(readSubmission());
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
  checkOllama();
  // All three down usually means Ollama itself isn't reachable: say so once.
  els.banner.hidden = !JUDGES.every((j) => state.status[j.id] === "failed");
  const verdicts = JUDGES.map((j) => state.current[j.id]);
  if (verdicts.every(Boolean)) {
    // The badge counts up from the last total only when that round used the same rubric.
    const sameRubric = JUDGES.every((j) => !state.previous[j.id] || comparable(state.previous[j.id], state.current[j.id].rubric));
    const from = sameRubric ? state.lastTotal : null;
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
    const { pitch, current, previous, lastTotal, submission } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pitch, current, previous, lastTotal, submission }));
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
      submission: saved.submission ?? null,
    });
    for (const j of JUDGES) state.status[j.id] = "done";
    els.pitch.value = saved.pitch;
  } catch (err) {
    console.warn("Ignoring unreadable saved round:", err);
  }
}

function newPitch() {
  if (state.running) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SUBMISSION_KEY);
  } catch {}
  resetSubmissionForm();
  for (const j of JUDGES) {
    state.current[j.id] = null;
    state.previous[j.id] = null;
    state.status[j.id] = "waiting";
  }
  state.pitch = "";
  state.lastTotal = null;
  state.submission = null;
  els.pitch.value = "";
  els.banner.hidden = true;
  JUDGES.forEach(renderCard);
  renderBadge();
  renderControls();
}

// --- Submission form (attachments + criteria) -----------------------------------
// Kept in the browser across reloads; "New pitch" resets it to the defaults.

function readSubmission() {
  return {
    attachments: [...els.attachments.querySelectorAll(".attachment")].map((slot) => ({
      label: slot.querySelector(".att-label").value,
      text: slot.querySelector(".att-text").value,
    })),
    criteria: els.criteria.value,
  };
}

function buildSubmissionForm() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SUBMISSION_KEY)); } catch {}
  els.attachments.innerHTML = DEFAULT_LABELS.map(() => `
    <div class="attachment">
      <div class="att-head">
        <input class="att-label" type="text">
        <button type="button" class="btn ghost att-load" data-i18n="loadFile"></button>
        <input class="att-file" type="file" accept="${ACCEPTED_FILES}" hidden>
      </div>
      <textarea class="att-text" rows="4"></textarea>
      <p class="att-status" role="status" hidden></p>
    </div>`).join("");
  els.attachments.querySelectorAll(".attachment").forEach((slot, i) => {
    slot.querySelector(".att-label").value = saved?.attachments?.[i]?.label ?? DEFAULT_LABELS[i];
    slot.querySelector(".att-text").value = saved?.attachments?.[i]?.text ?? "";
  });
  els.criteria.value = saved?.criteria ?? DEFAULT_CRITERIA;
  if (activeSubmission(readSubmission())) els.submission.open = true;
}

function resetSubmissionForm() {
  els.attachments.querySelectorAll(".attachment").forEach((slot, i) => {
    slot.querySelector(".att-label").value = DEFAULT_LABELS[i];
    slot.querySelector(".att-text").value = "";
    slot.querySelector(".att-file").value = "";
    setFileStatus(slot, null);
  });
  els.criteria.value = DEFAULT_CRITERIA;
  els.submission.open = false;
}

function onSubmissionInput() {
  try { localStorage.setItem(SUBMISSION_KEY, JSON.stringify(readSubmission())); } catch {}
  renderControls();
}

// A message under a slot's textarea (a STRINGS key, kept so the EN/JA toggle retranslates it), or null to hide it.
function setFileStatus(slot, key) {
  const el = slot.querySelector(".att-status");
  el.hidden = !key;
  if (key) el.dataset.i18n = key;
  else delete el.dataset.i18n;
  el.textContent = key ? t(key) : "";
}

// Client-side only: the file is read in the browser and never uploaded. The extracted
// text goes into the textarea, so it is exactly what the judges read.
async function loadAttachmentFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = "";
  const slot = input.closest(".attachment");
  setFileStatus(slot, "fileReading");
  let text;
  try {
    text = await extractText(file);
  } catch (err) {
    console.warn(`Couldn't read ${file.name}:`, err);
    setFileStatus(slot, "fileFailed");
    return;
  }
  if (readableLength(text) < MIN_EXTRACTED_CHARS) {
    setFileStatus(slot, "fileEmpty");
    return;
  }
  setFileStatus(slot, null);
  slot.querySelector(".att-text").value = text;
  onSubmissionInput();
}

// --- Rendering ---------------------------------------------------------------

const els = {
  panel: document.getElementById("panel"),
  footer: document.getElementById("appFooter"),
  pitch: document.getElementById("pitch"),
  counter: document.getElementById("counter"),
  submit: document.getElementById("submit"),
  newPitch: document.getElementById("newPitch"),
  badge: document.getElementById("badge"),
  banner: document.getElementById("banner"),
  langButtons: document.querySelectorAll("[data-lang]"),
  verdictLang: document.getElementById("verdictLang"),
  submission: document.getElementById("submission"),
  submissionFields: document.getElementById("submissionFields"),
  attachments: document.getElementById("attachments"),
  criteria: document.getElementById("criteria"),
  totalCounter: document.getElementById("totalCounter"),
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
    const newRubric = Boolean(state.previous[judge.id]) && !comparable(state.previous[judge.id], v.rubric ?? "pitch");
    const prev = newRubric ? null : state.previous[judge.id];
    const delta = scoreDelta(prev?.score, v.score);
    const deltaHTML = newRubric
      ? `<span class="delta same">${t("newRubric")}</span>`
      : !delta
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
      ${v.criterion ? `<p class="criterion">${escapeHTML(v.criterion)} · ${escapeHTML(v.source)}</p>` : ""}
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
  // Combined counter: what a submission review would send (pitch + criteria + documents with text).
  const sub = activeSubmission(readSubmission());
  const total = n + (sub ? sub.criteria.length + sub.attachments.reduce((sum, a) => sum + a.text.trim().length, 0) : 0);
  els.totalCounter.className = `counter ${total > MAX_TOTAL_CHARS ? "over" : "ok"}`;
  els.totalCounter.textContent = t(total > MAX_TOTAL_CHARS ? "totalOver" : "totalCounter", total, MAX_TOTAL_CHARS);
  els.submissionFields.disabled = state.running;
  // Retry buttons follow the round lock too.
  els.panel.querySelectorAll("[data-retry]").forEach((b) => (b.disabled = state.running));
}

// Static page text, then everything rendered from state, in the current language.
function applyLang() {
  document.documentElement.lang = lang;
  document.title = t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  els.pitch.placeholder = t("placeholder");
  els.attachments.querySelectorAll(".att-text").forEach((el) => (el.placeholder = t("docPlaceholder")));
  els.attachments.querySelectorAll(".att-label").forEach((el) => el.setAttribute("aria-label", t("labelField")));
  els.attachments.querySelectorAll(".att-load").forEach((el) => (el.title = t("loadFileTitle")));
  els.langButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  JUDGES.forEach(renderCard);
  renderBadge();
  renderControls();
  renderFooter();
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

// --- Footer and Ollama status --------------------------------------------------

// "checking" | "connected" | "noModel" | "down"
let ollamaStatus = "checking";

// A bare model name means its ":latest" tag, as in Ollama itself.
const hasModel = (models) => {
  const want = MODEL.includes(":") ? MODEL : `${MODEL}:latest`;
  return models.some((m) => m.name === want || m.model === want);
};

async function checkOllama() {
  try {
    const res = await fetch(OLLAMA_TAGS_URL, { signal: AbortSignal.timeout(OLLAMA_CHECK_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    ollamaStatus = hasModel((await res.json()).models ?? []) ? "connected" : "noModel";
  } catch {
    ollamaStatus = "down";
  }
  renderFooter();
}

function renderFooter() {
  const text = { checking: t("ollamaChecking"), connected: t("ollamaConnected", MODEL), noModel: t("ollamaNoModel", MODEL), down: t("banner") }[ollamaStatus];
  els.footer.replaceChildren(`AI Judges v${APP_VERSION} · local · `);
  const status = document.createElement("span");
  status.className = `ollama-status ${ollamaStatus}`;
  status.textContent = text;
  els.footer.append(status);
}

// --- Wiring --------------------------------------------------------------------

buildPanel();
buildSubmissionForm();
load();
els.verdictLang.value = verdictLang;
applyLang();
checkOllama();

els.pitch.addEventListener("input", renderControls);
els.submit.addEventListener("click", submitRound);
els.newPitch.addEventListener("click", newPitch);
els.langButtons.forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
els.verdictLang.addEventListener("change", () => setVerdictLang(els.verdictLang.value));
els.submissionFields.addEventListener("input", onSubmissionInput);
els.attachments.addEventListener("click", (e) => {
  e.target.closest(".att-load")?.closest(".attachment").querySelector(".att-file").click();
});
els.attachments.addEventListener("change", (e) => {
  if (e.target.matches(".att-file")) loadAttachmentFile(e.target);
});
els.panel.addEventListener("click", (e) => {
  const id = e.target.closest("[data-retry]")?.dataset.retry;
  if (id) retryJudge(id);
});
