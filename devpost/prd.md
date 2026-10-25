---
doc: prd
status: approved
---

# AI Judges — Product Requirements

A single-page web app where three illustrated AI judges harshly critique your 3–5 line hackathon pitch, then change their minds when you rewrite it. It's for people who enter hackathons and pitch contests, starting with the builder.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. **Arrive.** The page opens on a dark stage. The three judges are already there in a row (portrait, name, role, and "Waiting for your pitch…" in grey) above an empty pitch box. The total badge is empty.
2. **Write.** Paste a pitch into the box. Submit unlocks once there are at least 20 characters. A character counter warns when the pitch gets long.
3. **Submit.** Press "Submit to the panel." The box locks, the button reads "Panel is deliberating…", and all three cards switch to "Reading…".
4. **Verdicts reveal.** Each judge reveals left to right (engineer, marketer, investor) as soon as it finishes: a big score out of 100, a one-line rejection reason, and one concrete fix.
5. **Total.** When all three are in, the badge shows the average, e.g. "42 — Would not advance" in red, with the three scores small underneath.
6. **Rewrite.** Edit the pitch in the same box using the fixes, then press Submit again.
7. **See who moved.** Each card shows the new score large, with the previous score and a delta beside it ("58 → 81 ▲23"). The badge animates from old to new, e.g. 42 → 71 "Would advance" in green.
8. **Repeat** until the panel advances you, or press "New pitch" to start over.

**Success:** the same panel visibly changes its mind because you changed a few sentences.

## Screens and Layout
One page, single column, no sidebar, no other screens. Source: `scope.md > The POC Boundary`.

From top to bottom:
1. **Header:** the title "AI Judges" and the tagline "Three judges. One pitch. Rewrite until they change their minds."
2. **The Panel:** three judge cards in a row, engineer, marketer, investor from left to right. They sit *above* the pitch box so the panel is what you look at.
3. **Pitch Box:** a large textarea (placeholder "Paste your pitch — 3 to 5 lines") with a character counter underneath.
4. **Controls:** a "Submit to the panel" button and a "New pitch" button.
5. **Total Badge:** empty until the first complete round.

## Look and Feel
- **Mood:** a TV pitch-show stage, Shark Tank / Dragons' Den, but illustrated rather than photoreal.
- **Colors:** a near-black navy background with a warm spotlight gradient behind the three cards. Cards are off-white with a thin gold border. Green means up / would advance, red means down / would not advance, grey means neutral or no change.
- **Type:** a condensed, theatrical display font (e.g. Bebas Neue) for judge names, scores and the badge. A clean sans (Inter) for body text. Scores are big, like a scoreboard.
- **Portraits:** illustrated, flat-shaded, slightly caricatured, the same style for all three, square crop. One static image per judge.

## Features and Behavior

### The Judges
Source: `scope.md > The Unique Kernel`.

| Judge | Role | Priority | Portrait |
|---|---|---|---|
| **Vera Lind** | Engineer | Skeptical: will this actually work / is it buildable? | Grey-haired, arms crossed, reading glasses |
| **Marco Reyes** | Marketer | "Who would actually use this?" | Loud patterned jacket, raised eyebrow |
| **Ingrid Haas** | Investor | "How does it make money?" | Dark suit, pen tapping, unimpressed |

Each verdict has three parts: **one-line rejection reason**, **score (0–100)**, and **one concrete fix**. Judges stay in character and judge from their own priority, so they can disagree.

- [ ] Each completed card shows the judge's name, role, portrait, a score from 0 to 100, a one-line reason, and one fix.
- [ ] The three reasons visibly come from different angles (engineering, users, money) on the same pitch.

### Pitch Box and Submit
Source: `scope.md > The POC Boundary`.

- Submit is disabled until the box has at least 20 characters. There's no error dialog.
- The counter under the box turns amber past 3000 characters and red past 6000, with the message "Judges stop reading after ~6000 characters." The app still submits, but only the first 6000 characters go to the judges.
- There's only one button, "Submit to the panel," for both the first submit and every resubmit.
- One round at a time. While a round runs, the box is read-only and the button is disabled and reads "Panel is deliberating…". A second submit can't be queued.

- [ ] With fewer than 20 characters, Submit can't be pressed. At 20 or more, it can.
- [ ] Past 3000 characters the counter is amber. Past 6000 it's red and the warning appears.
- [ ] During a round you can't type in the box and the button can't be pressed.

### Deliberation and Reveal
Source: `scope.md > What "Working" Looks Like`.

- On submit, all three cards go to **Reading…**: portrait dimmed, a small spinner, no text.
- Each card reveals with its verdict as that judge finishes, in left-to-right order (engineer, marketer, investor).

- [ ] After pressing Submit, all three cards show the Reading… state right away.
- [ ] The cards fill in one at a time, left to right, not all at once.

### Total Badge and Verdict
Source: `scope.md > The POC Boundary`.

- Total = the plain average of the three scores, rounded to an integer.
- **70 or above** shows "Would advance" in a green badge. **Below 70** shows "Would not advance" in a red badge. The threshold is fixed, with no settings.
- The three individual scores appear small under the total, so you can see who's dragging it down.
- The badge stays held ("Waiting for N judge(s)" in grey) until all three verdicts are in. A partial panel isn't a verdict.

- [ ] With scores 30 / 45 / 50, the badge reads 42, "Would not advance," in red.
- [ ] With scores 70 / 70 / 71, the badge reads 70, "Would advance," in green.
- [ ] While any judge is still pending or failed, the badge shows "Waiting for N judge(s)" and no verdict.

### Resubmit and Score Movement
Source: `scope.md > The Unique Kernel` ("a number that moves").

- On every round after the first, each card shows the new score large and, beside it, the previous score with an arrow and delta: "58 → 81 ▲23" in green when it rose, a red ▼ when it fell, and "no change" in grey when it stayed the same.
- The new reason and fix replace the old ones on the card.
- A collapsed **"Previous round"** disclosure on each card shows that judge's immediately previous score, reason and fix. It holds the last round only, not a full history.
- The total badge animates from the old number to the new one.

- [ ] After a resubmit where the investor goes from 40 to 75, her card shows "40 → 75 ▲35" in green.
- [ ] A judge whose score didn't change shows "no change" in grey and no arrow.
- [ ] "Previous round" is collapsed by default. Opening it shows the prior reason and fix.
- [ ] The badge number visibly counts from the old total to the new one.
- [ ] On the first round, no deltas or "Previous round" appear.

### Per-Judge Retry
- If one judge fails, that card shows "The judge left the room — retry" with a retry button for that judge only. The other judges keep their results.
- Retry re-asks only that judge about the same pitch. When it succeeds, the card fills in and the total badge resolves.

- [ ] Simulating one failed judge leaves the other two cards filled and the badge waiting.
- [ ] Pressing that judge's retry button fills their card without re-running the other two.

### Persistence and New Pitch
- The current pitch, the latest round, and the previous round are kept in this browser, so a reload brings back the same screen, including the deltas.
- "New pitch" clears the box, all verdicts, the previous round and the badge, plus the submission-review attachments (labels and criteria back to the defaults), and returns to the first-arrival screen.

- [ ] After a completed round, reloading the page shows the same pitch, scores, reasons, fixes and deltas.
- [ ] Pressing "New pitch" returns the cards to "Waiting for your pitch…", empties the box and empties the badge.

### Submission Review (v1.1, after shipping)
- Below the pitch box, a collapsed **"Attach your submission (optional)"** section holds up to four documents, each with an editable label (defaults: "Project story", "README", "Demo video script", "Other"), a text area and a **"Load .md/.txt"** button (read in the browser, never uploaded), plus a **"Judging criteria"** box pre-filled with this hackathon's three criteria and their Devpost definitions (Design / Innovation/Idea / Presentation), editable.
- **Review mode turns on only when at least one document has text.** Then the judges get the pitch, the labelled documents and the criteria. Each judge keeps their persona but maps the verdict to one criterion: with exactly three criteria including the defaults, the criterion is fixed per judge (Engineer → Design, Marketer → Presentation, Investor → Innovation/Idea) so the panel covers all of them; with a different number, the judge picks freely from the list. The reason may mention a second criterion.
- Each judge quotes from one document and names it. The card shows "Criterion · Source" (e.g. "Design · Project story") as a small line above the reason.
- The judges are told to judge evidence against the criteria, not volume: restating the same point in another document earns nothing.
- A combined counter shows pitch + criteria + documents against **12,000 characters**; past that it turns red and the judges stop reading.
- Documents and criteria survive a reload; "New pitch" leaves them in place.

- [ ] With no document text, the request to the judges is byte-identical to v1's, and the demo story still ends 30 → 48 → 75, Would advance.
- [ ] With the Project story attached, each card shows its home criterion and the document it quoted.
- [ ] A source that isn't one of the documents, or a quote that isn't in the named document, gets one retry, then "The judge left the room".

## States and Boundaries
- **First arrival / empty:** cards show "Waiting for your pitch…", the box is empty, Submit is disabled, and the badge is empty.
- **Deliberating:** cards show "Reading…", the box is locked, and the button reads "Panel is deliberating…".
- **Partial:** some cards are revealed and the badge shows "Waiting for N judge(s)."
- **Judge failed:** "The judge left the room — retry" on that card only.
- **Complete:** all three verdicts are in and the badge shows the total and the verdict.
- **Resubmitted:** deltas, "no change" labels, and a "Previous round" disclosure on each card.
- **Persists:** the pitch, the latest round, and the previous round (this browser only).
- **Privacy:** the pitch goes only to the local model on this PC and never leaves the machine (`scope.md > Inspiration & Identity`).
- **Model not running / all three fail:** all three cards show "The judge left the room — retry", and a single banner above the cards reads "Can't reach the local model. Is Ollama running?" so the real cause is named once, not as three identical errors. There's no separate setup screen.
  - [ ] With Ollama stopped, submitting shows the banner above the cards and all three cards in the failed state.
- **Unusable answer** (no score, or a score outside 0–100): treated the same as a failed judge.
- **Reload mid-round:** the unfinished round is dropped. The page shows the last completed round and the pitch, and you can submit again.

## Product Decisions
- **Panel above the pitch box, visible before you type.** "They're the panel; they should be staring at you before you type."
- **The screen shows the current verdict, not history.** Old reasons are tucked into a collapsed "Previous round."
- **Only the last round is kept.** "The loop is about the current rewrite"; history is later.
- **One round at a time, with the box locked.** No queued submits.
- **Total = plain average, 70 is the bar, fixed.** No settings UI in v1.
- **No verdict from a partial panel.** "A partial panel isn't a verdict."
- **Per-judge retry** instead of re-running the whole round.
- **A soft length limit, not a block.** Warn at 3000, warn harder and truncate at 6000 (raised from 800 / 1500 after the build).
- **Reload keeps your work.** "New pitch" is the only way to clear it.
- **All-fail banner.** When all three judges fail, name the real cause ("Is Ollama running?") instead of showing three identical errors.
- **Cut order:** the badge animation first, then persistence.
- **Submission review is opt-in by content (v1.1).** Only document text switches it on, so the pitch-only demo stays exactly as recorded. Criteria are spread across the judges rather than chosen freely, because left free all three picked Presentation.
- **A TV pitch-show stage, illustrated.** Named, caricatured judges, not photoreal.

## What We're Building
- One page: header, three judge cards, pitch box with counter, Submit and New pitch buttons, total badge.
- Three in-character judges (Vera Lind, Marco Reyes, Ingrid Haas), each returning a reason, a score and a fix from the local model.
- Left-to-right reveal with Reading… states and a locked box during a round.
- A total badge (average, 70 threshold, small individual scores, held until complete, animated on change).
- Resubmit deltas (green ▲ / red ▼ / grey "no change") and a one-round "Previous round" disclosure.
- Per-judge failure state with retry.
- Persistence of the pitch, the latest round and the previous round across reloads, plus New pitch to clear.
- Stage styling and three static illustrated portraits.
- **v1.1, after shipping:** submission review (`Submission Review` above).

**Cut order if time runs short:** (1) the badge's count-up animation (just show the new number), then (2) reload persistence. Neither is needed to show the panel changing its mind.

## Deferred From the POC
- **Full round history** (a timeline of every rewrite). Only the last round is kept now. History is a separate feature.
- **Adjustable advance threshold.** Fixed at 70. A settings UI isn't needed to prove the idea.
- **Post-mortem tab** (contest criteria + winners' descriptions). Cheap once the panel works, but not part of the demo (`scope.md > Later`).
- ~~**Japanese UI.**~~ Built after the final review: an EN / JA toggle for UI text only (`spec.md > UI Language Toggle`). English stays the default for the demo.
- **Claude API provider switch.** The endpoint choice keeps it cheap, but it isn't built or tested now (`scope.md > Later`).

## Possible Later Enhancements
- Per-judge emphasis or weighting in the total, if plain averaging feels wrong in practice.
- Exporting the final pitch alongside the panel's verdict as a pre-submission checklist.

## Non-Goals
- **Multiple portrait expressions.** "The score moving is the emotion; expressions are polish" (`scope.md > Explicitly Cut`).
- **Accounts, cloud saving or sharing.** The pitch stays on this PC.
- **Chat with the judges or follow-up questions.** The loop is rewrite → resubmit, not conversation.
- **Rewriting the pitch for you.** Judges give fixes; you do the rewrite.
- **More judges or custom judges.** The three fixed priorities are the kernel.

## Open Questions
- **Where the three portraits come from** (generated, drawn, or placeholder first). Decide in `4-spec`/`5-build`. Doesn't block spec.
