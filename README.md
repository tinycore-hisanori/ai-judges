# AI Judges

Three AI judges (an engineer, a marketer and an investor) harshly critique your 3–5 line hackathon pitch. Rewrite it, resubmit, and watch the panel change its mind.

Runs entirely on your PC against a local model: your pitch never leaves the machine.

**Demo video:** https://youtu.be/zHcQsPfdxQE

- **Any pitch language.** The judges generally answer in the language of the pitch: paste a Japanese pitch and you get Japanese verdicts. (This is the model's own behaviour, not a translation step, so an occasional sentence can come back in English.) To force one language, set **Verdicts in** at the top right to English or 日本語.
- **Japanese UI.** The EN / JA toggle at the top right switches the interface text. It doesn't change the judges' language; that's the separate **Verdicts in** selector (Auto, English or 日本語). Picking the pitch's own language changes nothing (same prompt as Auto); only a different language adds an instruction.
- **Submission review (v1.1).** Under the pitch box, **Attach your submission (optional)** takes up to four documents (Project story, README, Demo video script, Other; paste or load a `.md`/`.txt`, read in the browser only) and the judging criteria, pre-filled with this hackathon's Design / Innovation/Idea / Presentation. When at least one document has text, each judge keeps their persona but is pinned to a home criterion (Engineer → Design, Marketer → Presentation, Investor → Innovation/Idea; free choice if you list a different number of criteria), quotes from one document, and the card shows e.g. "Design · Project story". The quote must really be in the named document, or the judge gets one retry. Pitch + criteria + documents are capped at 12,000 characters. With no document text, the request is exactly the pitch-only one.

## Prerequisites

- [Ollama](https://ollama.com) installed and running
- The model, pulled once: `ollama pull qwen2.5:32b`. It needs about 20 GB of free GPU memory (built on an RTX 4090, 24 GB). On a smaller GPU, set `MODEL = "qwen2.5:14b"` in `judges.js` (about 10 GB); it runs, but its judging is noticeably weaker.
- Python 3 (only for the static file server), or any static server
- For submission review on a 24 GB GPU: a quantized KV cache, so the 12,288-token context stays on the GPU (pitch-only use doesn't need it, but it also makes pitch rounds faster):
  1. `setx OLLAMA_FLASH_ATTENTION 1`
  2. `setx OLLAMA_KV_CACHE_TYPE q8_0`
  3. Quit Ollama from the tray icon, then start it again from the Start menu (setx only reaches newly started programs).
  4. Check: `%LOCALAPPDATA%\Ollama\server.log` shows `OLLAMA_FLASH_ATTENTION:true` and `OLLAMA_KV_CACHE_TYPE:q8_0`.

## Run

```
python -m http.server 8000
```

Open **http://localhost:8000** (use `localhost`, not `0.0.0.0` — Ollama only accepts browser requests from allowed origins).

If the browser's requests to Ollama are blocked by CORS, set `OLLAMA_ORIGINS=http://localhost:8000` and restart Ollama.

## Files

- `index.html`, `style.css`: the page and the stage theme
- `app.js`: round logic, the single model call (`callJudge`), rendering
- `judges.js`: the three judges' personas and prompts
- `assets/fonts`: Bebas Neue and Inter, self-hosted under the SIL Open Font License
- `assets/portraits`: the judge portraits; SVG sources and the render script are in `assets/portraits/src`
