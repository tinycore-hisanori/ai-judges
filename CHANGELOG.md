# Changelog

Versions are MAJOR.MINOR.PATCH: MINOR for a feature, PATCH for a bug fix. Each release is tagged `vX.Y.Z` in git, and `APP_VERSION` in `app.js` matches the latest entry.

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
