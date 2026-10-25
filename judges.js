// The panel: who the judges are, how they're prompted, and what they're sent.

// Switch models here (one line). Must be pulled in Ollama first.
export const MODEL = "qwen2.5:32b";

const SHARED_RULES = `You are one judge on a harsh hackathon pitch panel. You are reading a 3-5 line pitch.
Read the pitch fresh and judge it on its own. Judge it ONLY from your own priority below; other judges cover the other angles.

Hard rules:
- If the pitch explicitly states something, you may not cite it as missing.
- When you reject, quote the pitch's exact weakest sentence (or phrase) in double quotes.
- Be blunt. No praise, no "however". Name the single weakest sentence.

Scoring rubric for your priority:
- absent (0-30): nothing in the pitch addresses what you care about.
- vague (40-60): it is mentioned but vague.
- specific (70-85): it is specific and credible.
- exceptional (90-100): exceptional.

Work in this order:
1. "evidence": copy, word for word, the sentence or phrase in the pitch that addresses YOUR priority. If nothing in the pitch addresses it, write "".
2. "band": "absent" only if evidence is "". Otherwise "vague", "specific" or "exceptional" depending on how concrete and credible that evidence is.
3. "reason": exactly ONE sentence. Start it with one of these labels, written exactly:
   "Band 0-30 (absent):", "Band 40-60 (vague):", "Band 70-85 (specific):", "Band 90-100 (exceptional):".
   Then quote the weakest sentence or phrase from the pitch in double quotes, then say why it fails your priority.
   If evidence exists, attack how it is too broad or not credible; never claim it is unspecified or missing.
   Example of the shape (content invented): Band 40-60 (vague): "It saves teams time" never says whose time, how much, or compared to what.
   Even in a high band, the reason is still a rejection: name what is weakest, never what is good. No "but", no "however".
4. "score": an integer inside your band.
5. "fix": exactly ONE sentence: a concrete change to the pitch text that would most raise your score.
   The fix is ONE sentence to add or change, never a rewrite of the pitch.
   There is always a fix; never answer "no change needed".`;

export const JUDGES = [
  {
    id: "engineer",
    name: "Vera Lind",
    role: "Engineer",
    roleJa: "エンジニア",
    initials: "VL",
    color: "#5b7a99",
    portrait: "assets/portraits/vera.png",
    seed: 101,
    homeCriterion: {
      name: "Design",
      focus: "a complete, coherent product",
      question: "is this a complete, coherent product someone can use end to end, not just a technical proof of concept, and is that shown?",
    },
    // Submission review keeps who the judge is but not their priority: the criterion replaces it.
    submissionPersona: "You are Vera Lind, a skeptical senior engineer.",
    systemPrompt: `${SHARED_RULES}

You are Vera Lind, a skeptical senior engineer. Your priority: can this actually be built and does it actually work?
You look for hand-waving ("uses AI to..."), unclear technical approach, impossible scope, and missing proof it works.
Judge only what is claimed; do not invent requirements.
If the pitch states what the product does or how it works, the band cannot be 0-30; "absent" is only for pitches that never say what the thing does.`,
  },
  {
    id: "marketer",
    name: "Marco Reyes",
    role: "Marketer",
    roleJa: "マーケター",
    initials: "MR",
    color: "#b5563b",
    portrait: "assets/portraits/marco.png",
    seed: 202,
    homeCriterion: {
      name: "Presentation",
      focus: "the problem, who it is for, and why it matters",
      question: "does the submission clearly say what problem is solved, who it is for, and why it matters, and is it easy to follow?",
    },
    // Submission review keeps who the judge is but not their priority: the criterion replaces it.
    submissionPersona: "You are Marco Reyes, a blunt product marketer.",
    systemPrompt: `${SHARED_RULES}

You are Marco Reyes, a blunt product marketer. Your priority: who would actually use this, and why would they care?
You look for a vague audience ("everyone"), no clear pain, no reason to switch from what people use today.
If the idea resembles a well-known existing product, name it and ask what's different.`,
  },
  {
    id: "investor",
    name: "Ingrid Haas",
    role: "Investor",
    roleJa: "投資家",
    initials: "IH",
    color: "#3f6b4f",
    portrait: "assets/portraits/ingrid.png",
    seed: 303,
    homeCriterion: {
      name: "Innovation/Idea",
      focus: "how novel it is next to existing concepts",
      question: "what is new here compared with existing tools, and is that stated?",
    },
    // Submission review keeps who the judge is but not their priority: the criterion replaces it.
    submissionPersona: "You are Ingrid Haas, an unimpressed early-stage investor.",
    systemPrompt: `${SHARED_RULES}

You are Ingrid Haas, an unimpressed early-stage investor. Your priority: how does this make money, and is it worth anything?
You look for no business model, no paying customer, a tiny market, and nothing that stops a competitor copying it.`,
  },
];


export const MAX_PITCH_CHARS = 6000;
export const MAX_TOTAL_CHARS = 12000; // pitch + criteria + attachments, in submission review

// "auto" adds nothing: the judges already answer in the pitch's language,
// and an explicit "answer in the pitch's language" line shifted the demo scores.
// The line goes last in the system prompt so it overrides the English rules above.
export const VERDICT_LANG_LINES = {
  auto: "",
  en: "Hard rule: Write reason and fix in English. Keep the quoted evidence in its original language.",
  ja: "Hard rule: Write reason and fix in Japanese. Keep the quoted evidence in its original language.",
};

// "ja" when kana/kanji make up a real share of the text, otherwise "en".
export function pitchLanguage(text) {
  const cjk = (text.match(/[぀-ヿ㐀-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk > latin / 4 ? "ja" : "en";
}

// Verbatim from the Devpost page; editable in the UI.
export const DEFAULT_CRITERIA = `Design — Does the project deliver a complete, coherent product experience — not just a technical proof of concept?
Innovation/Idea — How creative and novel is the concept and does the project differ from existing concepts?
Presentation — Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow?`;

const SUBMISSION_RULES = `This time you also get the team's submission documents and the hackathon's judging criteria.
Your criterion is the ONLY thing you score. Your profession colors your tone and what you notice, but you may not reject for anything outside the criterion.
Wherever the rules above say "your priority", read it as your criterion.
Judge evidence against the criteria, not volume. Restating the same point in another document earns nothing.
Each document sits between "=== <name> ===" and "=== End of <name> ===". Headings inside a document are part of it, not separate documents.
Extra fields:`;
const sourceRule = (names) =>
  `- "evidence": copied word for word from one document; it must appear in it exactly.
- "source": the name of the document that evidence was copied from, exactly one of: ${names.map((n) => `"${n}"`).join(", ")}.`;

const FREE_CRITERION_RULE = `- "criterion": the ONE judging criterion your verdict maps to, written exactly as named in the criteria (for example "Presentation").`;
const homeCriterionRule = ({ name, focus, question }) =>
  `- "criterion": always "${name}". It is your home criterion: judge ${focus}. You may mention a second criterion in the reason, but this field stays "${name}".
For ${name} the question is: ${question}`;
const REASON_SOURCE_RULE = `In "reason", name the document you quote from, e.g. In the Project story, "..." never says ...`;

// Submission review is on only when at least one attachment has text.
export function activeSubmission(submission) {
  const attachments = (submission?.attachments ?? []).filter((a) => a.text.trim());
  return attachments.length ? { attachments, criteria: submission.criteria.trim() } : null;
}

// One criterion per non-empty line; its name is the text before " — " (or " - " / ":").
export function criterionNames(criteria) {
  return criteria.split("\n").map((l) => l.split(/\s+[—–-]\s+|:\s/)[0].trim()).filter(Boolean);
}

// With exactly one criterion per judge and every home criterion listed, each judge's
// criterion is fixed so the panel covers them all. Otherwise the judge picks freely.
export function homeCriterion(judge, names) {
  const homes = JUDGES.map((j) => j.homeCriterion.name.toLowerCase());
  const lower = names.map((n) => n.toLowerCase());
  const fixed = names.length === JUDGES.length && homes.every((h) => lower.includes(h));
  return fixed ? names[lower.indexOf(judge.homeCriterion.name.toLowerCase())] : null;
}

// Pitch first, then criteria, then documents in order, until MAX_TOTAL_CHARS is used up.
function submissionParts(pitch, submission) {
  const pitchText = pitch.slice(0, MAX_PITCH_CHARS);
  let budget = MAX_TOTAL_CHARS - pitchText.length;
  const criteria = submission.criteria.slice(0, Math.max(0, budget));
  budget -= criteria.length;
  const docs = [];
  for (const a of submission.attachments) {
    if (budget <= 0) break;
    const text = a.text.trim().slice(0, budget);
    budget -= text.length;
    docs.push({ label: a.label.trim() || "Document", text });
  }
  return { pitchText, criteria, docs };
}

// The documents exactly as the judges received them, for checking "source" and "evidence".
export function submissionDocuments(pitch, submission) {
  const { pitchText, docs } = submissionParts(pitch, submission);
  return [{ label: "Pitch", text: pitchText }, ...docs];
}

export function buildMessages(judge, pitch, previous, { verdictLang = "auto", submission = null } = {}) {
  // A selected language equal to the pitch's own adds nothing, so it scores exactly like Auto.
  const langLine = verdictLang === pitchLanguage(pitch) ? "" : VERDICT_LANG_LINES[verdictLang] ?? "";
  const parts = submission && submissionParts(pitch, submission);
  let system = parts ? `${SHARED_RULES}\n\n${judge.submissionPersona}` : judge.systemPrompt;
  if (parts) {
    const home = homeCriterion(judge, criterionNames(parts.criteria));
    const criterionRule = home ? homeCriterionRule({ ...judge.homeCriterion, name: home }) : FREE_CRITERION_RULE;
    const names = ["Pitch", ...parts.docs.map((d) => d.label)];
    system += `\n\n${SUBMISSION_RULES}\n${sourceRule(names)}\n${criterionRule}\n${REASON_SOURCE_RULE}`;
    if (parts.criteria) system += `\n\nJudging criteria:\n${parts.criteria}`;
  }
  if (langLine) system += `\n\n${langLine}`;
  const messages = [{ role: "system", content: system }];
  if (previous) {
    messages.push({
      role: "system",
      content: `For reference, last round you gave ${previous.score}.`,
    });
  }
  const user = parts
    ? [{ label: "Pitch", text: parts.pitchText }, ...parts.docs]
        .map((d) => `=== ${d.label} ===\n${d.text}\n=== End of ${d.label} ===`).join("\n\n")
    : pitch.slice(0, MAX_PITCH_CHARS);
  messages.push({ role: "user", content: user });
  return messages;
}
