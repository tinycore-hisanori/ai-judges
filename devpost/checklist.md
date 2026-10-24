---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

Verification approach: API checks with `curl` against local Ollama, plus a throwaway Playwright script (`playwright-core` driving the installed Chrome, kept in the session scratchpad, not in the repo) that loads `http://localhost:8000` and asserts on the real page with the real model. No test framework is added to the project.

## Slices

- [ ] **1. Paste a pitch and the three judges deliver verdicts, one at a time**
  Becomes usable: The stage page with all three judges waiting. You paste a pitch, press "Submit to the panel", and Vera, Marco and Ingrid reveal left to right, each with a score, a one-line reason and one fix, from the real local model.
  Why now: It's the riskiest part (does `/api/chat` honour the schema, does CORS allow `localhost:8000`) and the heart of the kernel (three conflicting judges), so both get proven first. Scaffolding and fonts come along because this slice needs somewhere to render.
  PRD ref: `prd.md > The Core Journey` (steps 1–4), `prd.md > Screens and Layout`, `prd.md > The Judges`, `prd.md > Deliberation and Reveal`
  Spec ref: `spec.md > Page Shell (index.html)`, `spec.md > Judge Definitions (judges.js)`, `spec.md > Judge Call (callJudge in app.js)`, `spec.md > Verdict Validation (validateVerdict in app.js)`, `spec.md > Round Controller (app.js)`, `spec.md > Judge Card Rendering (app.js + style.css)`, `spec.md > Look and Feel`, `spec.md > Ollama /api/chat (local)`, `spec.md > File Structure`
  Build: First, curl `/api/chat` with the schema to confirm the response shape. Then create `index.html`, `style.css` (stage theme, cards, Reading… spinner, placeholder portraits with initials), `judges.js` (the three personas, seeds, `buildMessages` without the previous note for now), and `app.js` (`callJudge`, `validateVerdict`, a sequential `submitRound`/`runJudge`, card states waiting/reading/done, box lock and "Panel is deliberating…"). Self-host the Bebas Neue and Inter woff2 files with their OFL licences in `assets/fonts/`. Add `.gitignore` entries and a minimal README with the start command.
  Verify (mechanical): The curl returns JSON whose `message.content` parses to `{score:int, reason, fix}`. With `python -m http.server 8000` running, the Playwright script loads the page, finds 3 cards showing "Waiting for your pitch…", submits a sample pitch, sees all cards in Reading… and the button disabled, then sees cards fill in order engineer → marketer → investor, each with an integer 0–100, a non-empty reason and a non-empty fix. No console errors and no CORS failure.
  Learner check: Run `python -m http.server 8000`, open http://localhost:8000, paste a real pitch and submit. Watch the three judges reveal one by one. Do they sound like three different people with different priorities, and does the stage feel like the panel you pictured?
  Commit: `Add judge panel with sequential local-model verdicts`

- [ ] **2. Resubmit and watch the panel change its mind**
  Becomes usable: After the first round, the badge shows the total and "Would advance / Would not advance". Edit the pitch and resubmit: each card shows "old → new ▲/▼delta" or "no change", a collapsed "Previous round" holds the old reason and fix, and the judges are told their last score and reason.
  Why now: This is the other half of the kernel, "a number that moves", and the prompts and previous-verdict note need your feedback before the rest of the build depends on them. The early hands-on checkpoint comes right after this slice.
  PRD ref: `prd.md > The Core Journey` (steps 5–7), `prd.md > Total Badge and Verdict`, `prd.md > Resubmit and Score Movement`
  Spec ref: `spec.md > Total Badge (app.js + style.css)`, `spec.md > Judge Definitions (judges.js)`, `spec.md > Round Controller (app.js)`, `spec.md > Judge Card Rendering (app.js + style.css)`, `spec.md > Data Model`
  Build: Add the current → previous rotation at submit, the previous note in `buildMessages`, delta rendering (green ▲, red ▼, grey "no change", nothing on the first round), the "Previous round" `<details>`, and the badge (rounded average, ≥ 70 green "Would advance", < 70 red, three small scores, "Waiting for N judges" while incomplete). No animation yet.
  Verify (mechanical): Run the Playwright script with a deliberately weak pitch, then a rewrite that applies the investor's fix. Round 1 shows no deltas and a badge equal to `Math.round(avg)` of the three card scores, in the correct colour for the threshold. Round 2 shows a delta or "no change" on every card that matches the difference between the previous and new scores, plus a collapsed "Previous round" containing round 1's reason. Pure-function checks of the delta and total logic run in Node (30/45/50 → 42 red, 70/70/71 → 70 green, equal scores → "no change").
  Learner check: Submit a real pitch, then rewrite three sentences using one judge's fix and resubmit. Does that judge's score move, and do the others stay about the same where you didn't change anything? Is the badge readable at a glance?
  Commit: `Add total badge, resubmit deltas, and previous-round notes`

- [ ] **3. The panel copes with bad input and failures**
  Becomes usable: Submit stays disabled under 20 characters, the counter warns past 800 and 1500 (sending only the first 1500 characters), a failed judge shows "The judge left the room — retry" with its own retry button, and if all three fail the banner asks "Can't reach the local model. Is Ollama running?"
  Why now: The happy path works by this point. These are the PRD's what-ifs, and they touch the same round controller, so they go before persistence starts saving its results.
  PRD ref: `prd.md > Pitch Box and Submit`, `prd.md > Per-Judge Retry`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Pitch Box and Counter (app.js)`, `spec.md > Round Controller (app.js)`, `spec.md > All-Fail Banner (index.html + app.js)`, `spec.md > Verdict Validation (validateVerdict in app.js)`, `spec.md > Important Failure Modes`
  Build: Add the counter with its states and the 1500-character cut in `buildMessages`, the 20-character Submit gate, the 60 s `AbortController` timeout, the failed card state with `retryJudge`, the badge "Waiting for N judges" after a failure, and banner show/hide.
  Verify (mechanical): The Playwright script checks four things. Submit is disabled at 19 characters and enabled at 20. The counter class is amber at 801 characters and red at 1501, with the warning text. One judge is forced to fail by intercepting its request with an error: only that card shows the retry, the badge is held, and retrying fills it in and resolves the badge. All requests are blocked to simulate Ollama being down: the banner and three failed cards appear, and the banner hides after a successful retry. Node checks confirm `validateVerdict` rejects a score of 101, 42.5, "58", an empty reason, and a missing fix.
  Learner check: Quit Ollama and submit. You should see the banner and three "left the room" cards. Start Ollama again and hit retry on each card. Then paste a very long pitch and watch the counter change colour.
  Commit: `Handle input limits, per-judge retry, and model-down banner`

- [ ] **4. Your work survives a reload, and the badge counts up**
  Becomes usable: Reloading after a round restores the pitch, verdicts and deltas. "New pitch" clears everything back to the waiting panel. The badge number counts from the old total to the new one.
  Why now: These are the two items in the agreed cut order (animation first, then persistence), so they go last, where dropping them costs nothing that came before.
  PRD ref: `prd.md > Persistence and New Pitch`, `prd.md > Total Badge and Verdict`, `prd.md > What We're Building` (cut order)
  Spec ref: `spec.md > Persistence (app.js)`, `spec.md > Data Model`, `spec.md > Total Badge (app.js + style.css)`
  Build: Add `save()` and `load()` under the `aiJudges.v1` key, saving only after a complete round and restoring on start. Add `newPitch()`. Add the ~600 ms `requestAnimationFrame` count-up from `lastTotal`.
  Verify (mechanical): The Playwright script checks three things. After a complete round, a reload shows the same pitch, scores, reasons and deltas. A reload in the middle of a round shows the last completed round, not a partial one. "New pitch" leaves `localStorage` without the key and the panel waiting. It also samples the badge text during the count-up and sees intermediate values that end at the final total.
  Learner check: Do a round, resubmit, then reload the page. Everything should still be there, arrows included. Press "New pitch" and confirm you're back to the waiting panel.
  Commit: `Persist rounds, add New pitch, and animate the badge`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2: real pitches, resubmits, and feedback on judge tone, scoring, and stage look before slices 3–4
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions
