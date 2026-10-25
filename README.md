# AI Judges

Three AI judges (an engineer, a marketer and an investor) harshly critique your 3–5 line hackathon pitch. Rewrite it, resubmit, and watch the panel change its mind.

Runs entirely on your PC against a local model: your pitch never leaves the machine.

## Prerequisites

- [Ollama](https://ollama.com) installed and running
- The model, pulled once: `ollama pull qwen2.5:32b`
- Python 3 (only for the static file server), or any static server

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
