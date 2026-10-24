---
doc: scope
status: approved
---

# AI Judges

A panel of three AI judges that critique your hackathon pitch harshly, then change their minds when you rewrite it.

## The Unique Kernel
**Three judges with conflicting priorities who change their minds when you rewrite your pitch.** A skeptical engineer, a "who would actually use this?" marketer, and a "how does it make money?" investor each give one reason to reject the pitch, a score, and one concrete fix. You rewrite and resubmit, and the scores move (42 → 71), so you can see which judge you won over and which you didn't.

What a chat can't give: the tension between judges who disagree, "like real panels feel"; "a number that moves"; and the weight of "three faces staring at me," which "makes me take the critique seriously instead of skimming it."

## Who It's For
The learner first: an indie game developer who enters several hackathons a month and would use this on every submission. More broadly, anyone entering hackathons and pitch contests.
Today: "Before submitting, you can't get honest, harsh feedback on your pitch. After losing, you never learn why you lost." A chat gives "a wall of text once."

## The Core Loop
Paste a 3–5 line pitch → three judge cards appear → read the rejection reasons and fixes → edit the pitch in the same box → Resubmit → see which scores moved. Repeat.
Why they come back: "a loop I'll actually run five times before submitting," on every contest entry.

## Inspiration & Identity
A real judging panel: three faces, three conflicting priorities, harsh but specific. "Your pitch never leaves your PC" is part of the identity, so it runs on a local model.

## Why This Matters to the Learner
They'd use it on every submission. Building it is also practice in their chosen skill, scope cutting: "keeping the first version small and shipping it in a day."

## What "Working" Looks Like
In their words: paste a real pitch about to be submitted. Three judge cards appear one at a time, each with a portrait, a one-line rejection reason, a score out of 100, and one concrete fix. A total badge reads "42 — would not advance." Edit the pitch in the same box using the fixes and hit Resubmit. The cards update, the investor's score jumps, and the total becomes "71 — would advance."
**The "oh, that's cool" beat:** "watching the same panel change its mind because I changed three sentences."

## The POC Boundary
- Single-page web app, English only.
- One pitch box, with Submit and Resubmit.
- Three judge cards (engineer, marketer, investor): static portrait, one-line rejection reason, score out of 100, one concrete fix. Cards appear one at a time.
- A total score badge with an advance / would-not-advance verdict.
- Resubmitting updates the cards and makes the score changes visible.
- LLM: local Ollama with Qwen2.5 only, called through Ollama's native `/api/chat` endpoint (JSON-schema output), with all model access in one function so a later switch to another provider is cheap.

## Later
- **Post-mortem tab** (paste the contest criteria and winners' descriptions to see where you lost). "Same judges with two extra input boxes": cheap once the panel works, but not in the demo.
- **Japanese UI.** "Adding a strings file is a day-2 job"; the demo video is for English-speaking judges.
- **Claude API provider switch via an env var.** The endpoint choice keeps it cheap, but it isn't built or tested now.

## Explicitly Cut
- **Three expressions per portrait.** One static portrait per judge. "The score moving is the emotion; expressions are polish."
