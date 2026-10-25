---
doc: spec
status: approved
---

# AI Judges — Technical Spec

## How This Works, In Plain Language
AI Judges is one web page made of four plain files (`index.html`, `style.css`, `app.js`, `judges.js`), served from your PC by a tiny static server. There's no build step, framework, or backend.

When you press Submit, the page asks the Ollama app on your PC, which runs the Qwen2.5 14B model, to play each judge in turn. Vera, then Marco, then Ingrid each get their own persona instructions and your pitch, and each must answer in a fixed JSON shape: `{score, reason, fix}`. Ollama enforces that shape. The page then checks the answer: the score must be a whole number from 0 to 100, and the reason and fix must not be empty. If the answer is good, that card is filled. If it isn't, that card shows "The judge left the room — retry."

When all three judges have answered, the page averages the scores into the badge. It also saves the pitch and the round in the browser's `localStorage` (a sticky note the browser keeps for this site), so a reload brings everything back.

On a resubmit, each judge also gets a short reminder of their own last score and reason, so they judge whether *that point* improved. They don't reward change for its own sake. A low temperature and a fixed seed per judge mean the same pitch gets the same score. A score moves because the pitch changed, not because of randomness.

Your pitch only ever travels from the browser to `localhost:11434`. Nothing leaves the PC.

**Why this shape:** one page with three cards doesn't earn a build step or a server. Your browser talks to Ollama directly, and all model access goes through one function, `callJudge`, so a later Claude proxy is a one-function swap.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. **Arrive.** The browser loads `index.html` from the static server. `app.js` reads `localStorage`. If nothing is saved, it renders three cards in the waiting state, an empty box, and an empty badge. If a round is saved, it restores the pitch, verdicts and deltas.
2. **Write.** On each keystroke, `app.js` updates the character counter (amber > 3000, red > 6000) and enables Submit at 20 or more characters.
3. **Submit.** `app.js` locks the box, changes the button to "Panel is deliberating…", sets all cards to Reading…, and sets the badge to "Waiting for 3 judges." Each judge's last completed verdict becomes "previous" (in memory).
4. **Judges run in sequence.** For each judge in `JUDGES` order (engineer → marketer → investor):
   - `buildMessages(judge, pitch, previous)` in `judges.js` builds the persona system prompt, an optional "last round" note, and the pitch, cut to 6000 characters.
   - `callJudge(judge, messages)` in `app.js` POSTs to Ollama `/api/chat` with the JSON schema, temperature 0.2, the judge's seed, and `num_ctx: 6144` (the default 32k context pushed 32B partly onto the CPU; 6144 holds a 6000-character pitch even in Japanese, about 4,500 prompt tokens plus the answer, while 8192 spilled into system RAM).
   - `validateVerdict()` checks the answer. A good verdict fills that card with the score, reason, fix and delta. A bad one sets that card to "left the room."
   - The badge updates its "Waiting for N judges" count.
5. **Round ends.** When the loop finishes:
   - If all three verdicts are in, the badge shows the average, the verdict colour and the three small scores, counting up from the old total. The round is saved to `localStorage`.
   - If some judges failed, the badge stays "Waiting for N judges" and nothing is saved. If all three failed, the "Can't reach the local model. Is Ollama running?" banner appears above the cards.
   - Either way, the box unlocks.
6. **Retry.** A failed card's retry button runs step 4 for that judge only, with the same pitch and previous note. When the last missing judge succeeds, step 5 runs.
7. **Resubmit.** You edit the box and press Submit, which goes back to step 3. The cards show "old → new ▲/▼delta" or "no change," and the "Previous round" disclosure shows the prior reason and fix.
8. **New pitch.** Clears `localStorage` and in-memory state and goes back to the step 1 empty view.

## Stack
- **Plain HTML + CSS + vanilla JavaScript (ES modules, no TypeScript, no build step).** Your choice. A build step is overhead for one page in a one-day project. You'd use Vite for games, not here. The tradeoff: DOM updates are hand-written.
- **Static server:** `python -m http.server 8000` (or `npx serve`). It's needed because ES modules and Ollama's CORS allowlist work for `http://localhost` origins, not `file://`.
- **Ollama, native API**, model **`qwen2.5:32b`** (Q4, ~21 GB with `num_ctx: 6144` for pitches and `12288` for submission review), running on an RTX 4090 (24 GB) with Ollama's KV cache quantized (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`). Docs: https://github.com/ollama/ollama/blob/main/docs/api.md · structured outputs: https://ollama.com/blog/structured-outputs · CORS/`OLLAMA_ORIGINS`: https://github.com/ollama/ollama/blob/main/docs/faq.md
- **File extraction (v1.2), vendored in `vendor/`:** pdf.js 4.10.38 (Apache-2.0, https://mozilla.github.io/pdf.js/), JSZip 3.10.1 (MIT, https://stuk.github.io/jszip/) for `.docx`/`.pptx`, SheetJS Community Edition 0.20.3 mini build (Apache-2.0, https://docs.sheetjs.com/) for `.xlsx`. No CDN: they're loaded with dynamic `import()` from `vendor/` the first time a file of that type is attached, so the page loads no faster or slower than before and works offline. SheetJS comes from its own CDN tarball because the npm `xlsx` package stopped at 0.18.5, which has known vulnerabilities.
- **Fonts:** Bebas Neue (https://fonts.google.com/specimen/Bebas+Neue) and Inter (https://rsms.me/inter/), both under the OFL licence, self-hosted as woff2.
- **Portraits:** flat-shaded SVG illustrations in `assets/portraits/src/`, rendered to 512×512 PNGs by `assets/portraits/src/render.mjs` (Playwright + local Chrome). Changed from Codex image generation: the build session had no image model, so they were drawn as vectors; a Codex PNG can still replace any of them under the same filename.

**Not verified in this session (check in the first build step):** that Ollama's default allowed origins include `http://localhost:8000`, and that `format: <schema>` is honoured by your installed Ollama version.

## Where It Runs and How Someone Tries It
- **Runtime:** a desktop browser on your Windows PC, with Ollama running locally.
- **Prerequisites:** Ollama installed and running, and `ollama pull qwen2.5:32b` done once. For submission review on a 24 GB GPU, quantize the KV cache (Windows):
  1. `setx OLLAMA_FLASH_ATTENTION 1`
  2. `setx OLLAMA_KV_CACHE_TYPE q8_0`
  3. Quit Ollama from the tray icon, then start it again from the Start menu (setx only reaches newly started programs).
  4. Check: `%LOCALAPPDATA%\Ollama\server.log` shows `OLLAMA_FLASH_ATTENTION:true` and `OLLAMA_KV_CACHE_TYPE:q8_0`.
- **Start:**
  ```
  python -m http.server 8000
  ```
  Then open **http://localhost:8000** (not `0.0.0.0:8000`, which isn't in Ollama's allowed origins).
- **Demo recording:** paste a real weak pitch and submit. You get about 15 s of left-to-right reveals and a red badge (e.g. 42). Then rewrite three sentences using the fixes and resubmit. Deltas appear and the badge counts up to green (≥ 70). Optionally, stop Ollama and submit to show the banner.
- **Submission:** a short demo video plus a public GitHub repo with a README covering the prerequisites and the start command above. There's **no deployment**: the model runs on your PC, and "never leaves your PC" is part of the identity.
- **Public repository:** https://github.com/tinycore-hisanori/ai-judges (branch `main`; verified anonymously after the first push).
- **Demo video:** https://youtu.be/zHcQsPfdxQE (unlisted; reachable without login).

## Look and Feel
Carried forward from `prd.md > Look and Feel`.

- **CSS custom properties** in `:root`:
  - `--bg` near-black navy (~`#0b1020`)
  - `--card` off-white (~`#f5f1e8`)
  - `--gold` thin border (~`#c9a24a`)
  - `--up` green, `--down` red, `--muted` grey
  - `--ink` dark text on cards
- **Stage:** the body background is `--bg`, with a warm radial spotlight gradient (amber, low opacity) centred behind the card row.
- **Type:** `@font-face` for `assets/fonts/BebasNeue-Regular.woff2` (names, scores, badge, buttons) and `Inter` (body, reason, fix). Card scores around 4rem, badge total around 5rem, like a scoreboard.
- **Cards:**
  - **Layout:** three across in a single centred column (max ~1000px), each with a square portrait at the top, name and role, then the score row, reason and fix.
  - **States:** the Reading… state sets the portrait to `opacity: .4` and shows a small CSS spinner.
  - **Placeholders:** each portrait is a coloured square with the judge's initials (VL / MR / IH) until the PNGs exist.
- **Copy tone:** terse and theatrical, using the exact strings from the PRD.

## Components

### Page Shell (`index.html`)
Static markup: the header (title and tagline), the all-fail banner (hidden), the panel container, the pitch box with counter, the Submit and New pitch buttons, and the total badge. Loads `style.css` and `app.js` as `type="module"`.
PRD ref: `prd.md > Screens and Layout`.

### Judge Definitions (`judges.js`)
- Exports `JUDGES`, an ordered array of `{ id, name, role, roleJa, priority, initials, color, portrait, seed, homeCriterion, systemPrompt }` (`roleJa` is the Japanese UI label: エンジニア / マーケター / 投資家; `homeCriterion` is `{ name, focus }` for submission review: Design / Presentation / Innovation/Idea):
  - `engineer` (Vera Lind, seed 101)
  - `marketer` (Marco Reyes, seed 202)
  - `investor` (Ingrid Haas, seed 303)
- Each `systemPrompt` sets the persona and priority and the shared rules:
  - read the pitch fresh; never cite as missing something the pitch states
  - be blunt: no praise, no "however"; quote the pitch's weakest sentence
  - rubric bands: 0–30 absent, 40–60 vague, 70–85 specific and credible, 90+ exceptional; the score must sit inside a band
  - the reason is one sentence starting "Band X-Y (label):" plus the quote and why; the fix is one concrete sentence, never "no change needed", and "ONE sentence to add or change, never a rewrite of the pitch"
  - no explicit language rule: 32B already answers in the pitch's language. An explicit "answer in the language of the pitch" line was tried and dropped, because it moved the engineer's round-3 verdict on the demo story from 75 to 50 (wherever the line was placed). The optional **Verdict Language Selector** below adds a fixed-language line only when the user picks one
  - the engineer also gets "Judge only what is claimed; do not invent requirements." and "If the pitch states what the product does or how it works, the band cannot be 0-30; 'absent' is only for pitches that never say what the thing does." (stopped a 45 → 20 flip on the recipe rewrite)
  - the marketer also gets "If the idea resembles a well-known existing product, name it and ask what's different."
- Exports `VERDICT_LANG_LINES` (`auto`: nothing, `en`: "Hard rule: Write reason and fix in English. Keep the quoted evidence in its original language.", `ja`: "Hard rule: Write reason and fix in Japanese. Keep the quoted evidence in its original language."), added as the last paragraph of the system prompt.
- Exports `pitchLanguage(text)` (`"ja"` when kana/kanji are more than a quarter of the Latin letters, else `"en"`).
- Exports `buildMessages(judge, pitch, previous, { verdictLang = "auto", submission = null })`, which returns:
  - `system`: `judge.systemPrompt`; in submission review, then the submission rules, the source/evidence rule, the criterion rule (home or free) and "Judging criteria:" + the criteria; last, the `VERDICT_LANG_LINES` line when `verdictLang` is neither `auto` nor the pitch's own language
  - if `previous` exists, a `system` note: "For reference, last round you gave {score}." (score only; the persona prompt already says to read the pitch fresh)
  - `user`: `pitch.slice(0, 6000)`; in submission review, the pitch and each document between `=== <name> ===` and `=== End of <name> ===` markers

PRD ref: `prd.md > The Judges`, `prd.md > Resubmit and Score Movement`.

### Judge Call (`callJudge` in `app.js`)
The only function that talks to the model, and the seam for a later provider switch. The model name is the `MODEL` constant at the top of `judges.js` (one line to switch, e.g. to `qwen2.5:32b`). It POSTs to `http://localhost:11434/api/chat` (see **External Services and Dependencies**), with a 60 s `AbortController` timeout. It parses `message.content` as JSON and returns the parsed object. Network, HTTP, timeout and parse errors all throw.
PRD ref: `prd.md > Deliberation and Reveal`.

### Verdict Validation (`validateVerdict` in `app.js`)
In submission review it also requires a non-empty `criterion`, a `source` that is "Pitch" or one of the document labels as sent, and an `evidence` string found verbatim (whitespace-normalized) in that document; it then keeps `{score, reason, fix, criterion, source}`. Otherwise: accepts only when `score` is an integer from 0 to 100 and `reason` and `fix` are non-empty strings after trimming, and `reason` contains no empty quote (`""`, `“”` or `「」`), and `fix` is at most 300 characters (longer is a rewrite of the pitch, not one change), and keeps only `{score, reason, fix}`. An unusable answer gets **one automatic retry with `seed + 1`** (the same seed would repeat the same answer); a second unusable answer marks the judge failed. Network, HTTP and timeout errors are not retried, so "Ollama is down" doesn't double the wait.
PRD ref: `prd.md > States and Boundaries` (unusable answer).

### Round Controller (`app.js`)
- **`submitRound()`:**
  - guards that no round is running
  - rotates current → previous per judge (each judge's last *completed* verdict becomes their previous)
  - sets UI states, then `await`s each judge in order via `runJudge(judge)`
  - calls `finishRound()`
- **`runJudge(judge)`:** calls `buildMessages` → `callJudge` → `validateVerdict`, then either sets `current[judge.id]` and renders the card, or marks the judge failed.
- **`retryJudge(id)`:** runs `runJudge` for one judge, disabled while a round is running, then calls `finishRound()`.
- **`finishRound()`:**
  - if all three succeeded, renders the badge and saves
  - otherwise shows "Waiting for N judges"
  - shows the banner if all three failed
  - unlocks the box

PRD ref: `prd.md > Pitch Box and Submit`, `prd.md > Deliberation and Reveal`, `prd.md > Per-Judge Retry`.

### Judge Card Rendering (`app.js` + `style.css`)
`renderCard(judge, state)` handles these states:
- `waiting` ("Waiting for your pitch…" in grey)
- `reading` (dimmed portrait and spinner)
- `done` (score, delta, reason, fix, and a "Previous round" `<details>` collapsed by default)
- `failed` ("The judge left the room — retry" with a button)

**Delta:** no previous verdict shows nothing; equal scores show "no change" in grey; otherwise it shows "prev → new ▲d" (green) or "▼d" (red).
PRD ref: `prd.md > The Judges`, `prd.md > Resubmit and Score Movement`.

### Total Badge (`app.js` + `style.css`)
`renderBadge()`:
- **empty:** before the first complete round
- **waiting:** "Waiting for N judge(s)" in grey
- **complete:**
  - the total is `Math.round(avg)`
  - ≥ 70 shows "Would advance" in green; < 70 shows "Would not advance" in red
  - the three scores appear small underneath
  - the number counts from the old total to the new one with `requestAnimationFrame` over about 600 ms (**first to cut**)

PRD ref: `prd.md > Total Badge and Verdict`.

### Pitch Box and Counter (`app.js`)
An `input` listener updates the counter text and its class (`ok` / `warn` > 3000 / `over` > 6000 with the "Judges stop reading after ~6000 characters" message) and toggles Submit (≥ 20 characters and no round running).
PRD ref: `prd.md > Pitch Box and Submit`.

### Persistence (`app.js`)
`save()` and `load()` use one `localStorage` key, `aiJudges.v1`. Saving happens only after a complete round, so a reload mid-round restores the last completed one. `newPitch()` removes the key and resets the UI. **Second to cut.**
PRD ref: `prd.md > Persistence and New Pitch`.

### UI Language Toggle (`index.html` + `app.js` + `style.css`)
An EN / JA toggle at the top right (above the title on phones). English is the default; the choice is saved under `localStorage` key `aiJudges.lang`. Every UI string lives in one `STRINGS` object in `app.js` with `en` and `ja` keys, read through `t(key, ...args)`; static page text is tagged `data-i18n`, and the "Fix:" label comes from a `data-label` attribute. Switching sets `<html lang>`, re-renders cards, badge and controls, and in Japanese falls back to Japanese system fonts (Bebas Neue and Inter have no kana or kanji). Judge names stay as they are; roles use `roleJa`. **The toggle is UI only:** requests to the judges are identical in both languages, and judges answer in the language of the pitch.
Added after the PoC review (it was deferred in `prd.md > Deferred From the POC`).

### Verdict Language Selector (`index.html` + `app.js` + `judges.js`)
A "Verdicts in" select next to the EN / JA toggle: Auto (language of the pitch) / English / 日本語. Default Auto, saved under `localStorage` key `aiJudges.verdictLang`, and disabled while a round runs. Auto sends exactly the prompts above (so the demo story is unaffected), and so does picking the pitch's own language (`pitchLanguage`), so English on an English pitch scores exactly like Auto. A different language adds a hard rule as the last paragraph of every judge's system prompt: "Write reason and fix in English/Japanese. Keep the quoted evidence in its original language." Because the language is part of the prompt (the seed stays the same), switching it and resubmitting an unchanged pitch produces a fresh verdict. Fixing the language shifts scores: on the demo story, 日本語 gave 28 → 47 → 75 (Would advance) and English gave 28 → 47 → 65 (the engineer stays at 45), so the demo is recorded with Auto. With English or 日本語 selected, `validateVerdict` also requires the reason and fix to be in that language (kana/kanji present for Japanese, absent for English, ignoring quoted text); otherwise one retry with seed + 1, then "left the room." `ownLanguage()` ignores quoted spans and the English band label, calls the text Japanese when kana/kanji are at least half of the letters left, and skips the check when fewer than 10 letters are left (a fix that is only `Add: "<sentence for an English pitch>"`). A wrong-language retry also repeats the language rule as a system message right before the pitch: on the round-3 demo pitch under 日本語, Marco wrote his reason in English on both seeds with the rule only at the end of the system prompt, and complied once it was repeated. Rejected answers are logged to the console with the raw JSON and the rule that rejected them.

### Submission Review (`index.html` + `app.js` + `judges.js` + `style.css`)
v1.1, added after shipping. Implements `prd.md > Submission Review`.
- **Form:** a `<details id="submission">` under the pitch counter, with a `<fieldset>` (disabled during a round) holding four slots (label input, "Load file" button + hidden file input, textarea, status line; see **File Attachments**), the criteria textarea (pre-filled with `DEFAULT_CRITERIA`, verbatim from Devpost) and the combined counter. The form is saved under `localStorage` key `aiJudges.submission`. "New pitch" resets it too: all four attachments emptied, labels and criteria back to the defaults, section collapsed, and the `aiJudges.submission` entry removed (the UI and verdict-language settings stay).
- **On/off:** `activeSubmission(form)` returns `{ attachments, criteria }` only when at least one attachment has text; otherwise `null`, and every request is the v1 one (checked byte-for-byte against a recorded golden copy of the demo story's 9 requests).
- **Limit:** `MAX_TOTAL_CHARS = 12000` for pitch (≤ 6000) + criteria + documents, filled in that order; the combined counter turns red past it.
- **Criteria:** `criterionNames()` takes the text before " — " on each line. With exactly three criteria and all three home criteria listed, `homeCriterion()` pins each judge's criterion; otherwise the judge chooses from the list.
- **Schema (`SUBMISSION_SCHEMA`):** `evidence, source, criterion, band, reason, score, fix`. Per request, `source` is an enum of "Pitch" + the labels sent, and `criterion` an enum of the home criterion (or the listed names). Evidence comes before source: with source first, the model named "Pitch" for quotes it then took from the Project story (2 of 2 marketer answers), and naming a section heading ("How it's built") as the source; evidence-first got 6 of 6 right.
- **Context:** `num_ctx: 12288` in review mode (`SUBMISSION_NUM_CTX`), 6144 otherwise. 12,000 characters is up to ~9,000 tokens in Japanese. On the 24 GB card this needs the q8_0 KV cache: with the default f16 cache, 16384 put only 62 of 65 layers on the GPU and 12288 spilled into shared memory, and one judge took over 5 minutes at both. With q8_0 + flash attention, 12288 is 100% on the GPU (KV cache 1.6 GB instead of 3 GB, no shared-memory spill) at ~38 tokens/s: 4–7 s per judge, ~15–17 s per round.
- **Criterion only:** review mode replaces each judge's priority paragraph with just their identity line (`submissionPersona`, e.g. "You are Ingrid Haas, an unimpressed early-stage investor.") plus the rule "Your criterion is the ONLY thing you score. Your profession colors your tone and what you notice, but you may not reject for anything outside the criterion." A pinned criterion adds its question (Innovation/Idea: "what is new here compared with existing tools, and is that stated?"). The rule alone wasn't enough: with the full persona, Ingrid scored Innovation/Idea on revenue and market size.
- **Cards:** a `.criterion` line ("Design · Project story") above the reason.

### File Attachments (`extract.js` + `app.js`)
v1.2. Implements `prd.md > Submission Review` (loading a document instead of pasting it).
- **Accepted:** `.md .markdown .txt .pdf .docx .pptx .xlsx` (`ACCEPTED_FILES`). `extractText(file)` picks the extractor by extension; the result replaces the slot's textarea, which is saved and counted like pasted text, so the judges read exactly what the user sees.
- **docx:** `word/document.xml`, one line per `w:p`, with `w:tab` → tab and `w:br` → newline.
- **pptx:** slides in presentation order (`p:sldIdLst` → `presentation.xml.rels`, not file names). Each slide is `--- Slide N ---`, then its `a:p` lines, then `Notes:` and the notes slide's body placeholder (the slide-image and slide-number placeholders are skipped).
- **xlsx:** SheetJS; each sheet is `--- Sheet: name ---` then rows as tab-separated formatted values, blank rows dropped, at most 200 rows per sheet.
- **pdf:** pdf.js text layer; each page is `--- Page N ---` then its text, with line ends where pdf.js reports them. The worker is `vendor/pdfjs/pdf.worker.min.mjs`.
- **Status line** under each slot (`.att-status`, retranslated by the EN/JA toggle): "Reading the file…"; "No readable text found (scanned image?)" when fewer than 50 characters remain after removing markers and whitespace (the textarea is left as it was); "Couldn't read this file." if extraction throws (details in the console).
- **Limit:** unchanged: pitch + criteria + documents are cut at 12,000 characters when sent.

### Version Footer (`index.html` + `app.js`)
`APP_VERSION` at the top of `app.js` (MAJOR.MINOR.PATCH: MINOR for a feature, PATCH for a bug fix, bumped in the same commit and in `CHANGELOG.md`; each release is tagged `vX.Y.Z` in git). The footer shows "AI Judges v1.2.0 · qwen2.5:32b · local", with the model from `MODEL`.

### All-Fail Banner (`index.html` + `app.js`)
Shown when all three judges failed in the latest attempt. Hidden on the next submit, or as soon as any judge succeeds.
PRD ref: `prd.md > States and Boundaries` (model not running / all three fail).

## Data Model
In-memory state in `app.js`, with the persisted subset in `localStorage["aiJudges.v1"]`:

```js
{
  pitch: "string",                       // the textarea contents
  current:  { engineer: Verdict|null, marketer: Verdict|null, investor: Verdict|null },
  previous: { engineer: Verdict|null, marketer: Verdict|null, investor: Verdict|null },
  lastTotal: number|null                 // badge's previous total, the starting point for the count-up
}
// Verdict = { score: 0–100 integer, reason: string, fix: string, criterion?: string, source?: string }
// submission: { attachments: [{ label, text }], criteria } | null — what the latest round was judged with (v1.1)
```

| Data | Lives in | Updated when | On reload |
|---|---|---|---|
| Pitch text | textarea + state | on typing; saved at round completion | restored from the last completed round |
| Current verdicts | state | each judge success | restored if the round completed |
| Previous verdicts | state | rotated at submit | restored, so deltas survive |
| Failed / reading flags | state only | during a round | not saved; an unfinished round is dropped |
| Last total | state | at round completion | restored |

## File Structure
```
AiJudgements/
├── index.html            # page shell: header, banner, panel, pitch box, buttons, badge
├── style.css             # stage theme, cards, states, counter, badge, spinner, @font-face
├── app.js                # state, round controller, callJudge, validateVerdict, rendering, counter, persistence
├── judges.js             # JUDGES definitions (persona prompts, seeds, portraits) + buildMessages
├── extract.js            # text extraction for attached .md/.txt/.pdf/.docx/.pptx/.xlsx
├── vendor/               # pdf.js, JSZip, SheetJS (+ licences, README with versions), loaded on demand
├── CHANGELOG.md          # one entry per tagged version
├── assets/
│   ├── portraits/        # vera.png, marco.png, ingrid.png (512×512, rendered from src/)
│   │   └── src/          # vera.svg, marco.svg, ingrid.svg + render.mjs (SVG → PNG)
│   └── fonts/            # BebasNeue-Regular.woff2, Inter (woff2) + OFL licence files
├── README.md             # what it is, prerequisites, start command, privacy note
├── .gitignore
└── devpost/              # Devpost learning workspace (scope, prd, spec, checklist)
```

## External Services and Dependencies

### Ollama `/api/chat` (local)
- **Endpoint:** `POST http://localhost:11434/api/chat`. No key, no cost, no rate limit.
- **Request:**
  ```json
  {
    "model": "qwen2.5:32b",
    "messages": [
      { "role": "system", "content": "<persona prompt>" },
      { "role": "system", "content": "Last round you gave 58 because: ... (only on resubmit)" },
      { "role": "user", "content": "<pitch, ≤6000 chars>" }
    ],
    "stream": false,
    "format": {
      "type": "object",
      "properties": {
        "evidence": { "type": "string" },
        "band":     { "type": "string", "enum": ["absent", "vague", "specific", "exceptional"] },
        "reason":   { "type": "string" },
        "score":    { "type": "integer", "minimum": 0, "maximum": 100 },
        "fix":      { "type": "string" }
      },
      "required": ["evidence", "band", "reason", "score", "fix"]
    },
    "options": { "temperature": 0.2, "seed": 101, "num_ctx": 6144 }
  }
  ```
- **Evidence-first order:** the model fills the properties in schema order, so it copies the pitch sentence that addresses its priority (`evidence`, `""` if none) and picks a `band` *before* writing the reason and score. This was the only variant that stopped the marketer claiming a stated audience was missing. `evidence` and `band` aren't displayed or stored.
- **Response (relevant part):** `{ "message": { "role": "assistant", "content": "{\"evidence\":\"...\",\"band\":\"vague\",\"reason\":\"...\",\"score\":45,\"fix\":\"...\"}" }, "done": true }`. Parse `message.content` as JSON, then validate. Don't rely on the schema's `minimum`/`maximum` alone.
- **Timing:** with the q8_0 KV cache, about 3–4 s per judge and 9–12 s per round for a pitch; 4–7 s per judge in submission review. With the default f16 cache, `num_ctx: 6144` spilled ~260 MB into shared memory and halved generation speed (12–13 s per judge). The first call after Ollama starts also loads the model, so expect a slower first round.
- **CORS:** browser calls from `http://localhost:*` should be allowed by default. If they're blocked, set `OLLAMA_ORIGINS=http://localhost:8000` and restart Ollama.
- **Docs:** https://github.com/ollama/ollama/blob/main/docs/api.md · https://ollama.com/blog/structured-outputs

## Important Failure Modes
- **Ollama isn't running or the port is unreachable** → each judge's fetch fails fast. All three cards show "left the room," and the banner reads "Can't reach the local model. Is Ollama running?"
- **The model isn't pulled** (HTTP 404) or **CORS is blocked** → treated as a failed judge, so with all three failing you get the same banner. The README covers `ollama pull` and `OLLAMA_ORIGINS`.
- **Bad or out-of-range JSON from a judge** → `validateVerdict` throws, and only that card shows "left the room — retry."
- **A judge hangs** → the 60 s timeout aborts it, and that card fails with retry.

## What Was Simplified and Why
- **No build step or framework**, instead of Vite. One page, one day. The fuller version would add tooling with no demo payoff.
- **Browser → Ollama directly**, instead of a local proxy. There's no second process, and the pitch stays on the PC. A proxy is only needed for the deferred Claude switch, and `callJudge` is the seam for it.
- **Sequential judge calls**, instead of parallel. This matches the left-to-right reveal and doesn't depend on Ollama's parallel settings. The cost is about 15 s per round.
- **Placeholder portraits first**, instead of waiting on art. Nothing blocks on image generation.
- **Fixed threshold, fixed seeds, last round only.** Per the PRD, there are no settings or history.
- **Cut order if time runs short:** (1) the badge count-up animation, (2) persistence.

## Decisions and Open Issues

**Your decisions**
- **Plain HTML/CSS/JS, served statically.** No build overhead for a one-day page.
- **Browser calls Ollama directly, with `callJudge` as the single seam.**
- **Native `/api/chat` with `format: <JSON schema>`, instead of the OpenAI-compatible `/v1` endpoint.** It's documented to enforce the schema. `scope.md > The POC Boundary` has been updated to match (it previously said "OpenAI-compatible endpoint"). The cheap switch is preserved by `callJudge` owning the request shape, not by the endpoint.
- **`qwen2.5:32b` on an RTX 4090, judges run one after another.** The model is one constant (`MODEL` in `judges.js`). Chosen over 14B from a comparison on the recipe pair, the learner's real pair and the marketer test: only 32B passed the marketer test (it stopped calling a stated audience missing, and the investor stayed low). Cost: ~2.7 s per judge vs ~1.4 s for 14B, both fully on the GPU at `num_ctx: 6144`.
- **Evidence-first verdict schema, plus one automatic retry (seed + 1) on an unusable answer.**
- **Resubmits give each judge only its previous score, as reference** ("For reference, last round you gave N."), after the instruction to read the pitch fresh. Changed at the slice-2 checkpoint: passing the old reason anchored judges to it.
- **Temperature 0.2 and a fixed seed per judge**, so the same pitch reproduces the same score.
- **Portraits drawn as SVG and rendered to PNG** (one shared navy-and-spotlight background, flat shading), with the initials placeholders still used if a PNG is missing.
- **Self-hosted OFL fonts**, so the app works fully offline.

**Implementation details derived from those decisions**
- the 60 s timeout
- the localStorage key and schema
- saving only on round completion (which implements the PRD's reload-mid-round rule)
- each judge's previous verdict is their last *completed* one
- seed values 101 / 202 / 303
- the ~600 ms count-up

**The useful unknown:** "format: json or json_schema" on the `/v1` endpoint. `json_object` only guarantees valid JSON, and support for `json_schema` on `/v1` was uncertain. You resolved it by moving to native `/api/chat` with a schema, while keeping validation in `app.js` either way. **Check in build step 1:** a curl to `/api/chat` with the schema returns `{score, reason, fix}`, and a browser fetch from `http://localhost:8000` isn't blocked by CORS.

**Open (doesn't block the build)**
- Portrait art is done (SVG sources in `assets/portraits/src/`). The initials placeholders stay as the fallback.
- Prompt wording and rubric: tune during the build against two or three real pitches. The check is that a rewrite that applies a judge's fix visibly moves that judge's score.
