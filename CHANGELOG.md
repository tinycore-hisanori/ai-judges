# Changelog

Versions are MAJOR.MINOR.PATCH: MINOR for a feature, PATCH for a bug fix. Each release is tagged `vX.Y.Z` in git, and `APP_VERSION` in `app.js` matches the latest entry.

## 1.3.0
- One-click launcher: `start.bat` (Windows) and `start.sh` (macOS/Linux). Each step prints one status line:
  - starts Ollama if needed;
  - pulls the model if it's missing;
  - preloads it for 30 minutes;
  - starts the static server on port 8000 if nothing answers there;
  - opens the browser.
  
  On failure the window stays open.
- The footer shows whether Ollama is reachable: a grey "checking…" while it checks, then a green "Ollama: connected · qwen2.5:32b", or red with the banner text (or the pull command if the model is missing). It's checked on load and again after each round.
- README rewritten as a setup guide: requirements, step-by-step setup, usage, troubleshooting, development.
- The mocked browser checks are now in `tests/` (`npm test`), with a new check for the footer indicator.

## 1.2.2
- Fix: in submission review, a judge could repeat the same complaint for several rounds after the documents had answered it. The previous-verdict note now includes the judge's previous complaint and tells them to look for a sentence that answers it, quote that sentence and move the score. Pitch-only rounds are unchanged.

## 1.2.1
- Fix: after switching between pitch-only and submission review, or changing the criteria, the cards compared scores across different rubrics. A round under a new rubric now shows "New rubric" instead of arrows, hides "Previous round", doesn't tell the judges their last score, and the badge doesn't count up from the old total.

## 1.2.0
- File attachments: each slot's **Load file** button takes `.md`, `.txt`, `.pdf`, `.docx`, `.pptx` or `.xlsx`, extracts the text in the browser and fills the slot's text box. PDF pages, slides (with speaker notes) and sheets (up to 200 rows each) are marked. A file with no readable text shows "No readable text found (scanned image?)".
- pdf.js, JSZip and SheetJS are vendored in `vendor/` and loaded only when needed, so the app still works offline.
- The version is shown in the footer.

## 1.1.2
- Fix: with 日本語 selected, the marketer could leave the room on every round because he wrote his reason in English. The language check now ignores quotes and the band label and accepts text that's at least half Japanese, and a wrong-language retry repeats the language rule. Rejected answers are logged to the console.

## 1.1.1
- Fix: **New pitch** now also clears the attachments and resets labels and criteria to the defaults.
- Fix: in submission review, judges score only their criterion (the investor was rejecting Innovation/Idea for revenue), and a selected verdict language is enforced with one retry.

## 1.1.0
- Submission review: up to four attached documents plus judging criteria, one home criterion per judge, source-checked quotes, 12,000-character total.
- Verdict language selector (Auto / English / 日本語).
- Pitch limits raised to 3,000 (warning) / 6,000 characters.

## 1.0.0
- First Devpost submission: three local judges, quoted rejections with one fix each, resubmit deltas, total badge, persistence, EN/JA interface.
