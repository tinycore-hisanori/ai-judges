#!/usr/bin/env bash
# One-click launcher for AI Judges: Ollama, the model, the static server, the browser.
cd "$(dirname "$0")" || exit 1

MODEL="qwen2.5:32b"
OLLAMA="http://localhost:11434"
APP="http://localhost:8000"
LOGS="${TMPDIR:-/tmp}"
FAILED=

fail() {
  echo "[failed] $1"
  echo
  read -r -p "Something failed; see the lines above. Press Enter to close." _
  exit 1
}

up() { curl -s -f -o /dev/null --max-time 2 "$1"; }

# Poll a URL once a second, up to $2 seconds.
wait_for() {
  for _ in $(seq "$2"); do
    sleep 1
    up "$1" && return 0
  done
  return 1
}

command -v curl >/dev/null || fail "curl not found"

# 1. Ollama
if up "$OLLAMA/api/tags"; then
  echo "[OK] Ollama is running"
else
  if [ "$(uname)" = Darwin ] && [ -d /Applications/Ollama.app ]; then
    open -a Ollama
  elif command -v ollama >/dev/null; then
    nohup ollama serve >"$LOGS/ai-judges-ollama.log" 2>&1 &
  else
    fail "Ollama is not installed. Get it from https://ollama.com"
  fi
  wait_for "$OLLAMA/api/tags" 30 || fail "Ollama did not answer within 30 s"
  echo "[started] Ollama"
fi

# 2. Model
if curl -s -f --max-time 5 "$OLLAMA/api/tags" | grep -q "\"$MODEL\""; then
  echo "[OK] Model $MODEL is pulled"
else
  echo "[..] Model $MODEL is not pulled yet. Downloading it now (about 20 GB, once)..."
  command -v ollama >/dev/null || fail "ollama command not found, so the model can't be pulled"
  ollama pull "$MODEL" || fail "ollama pull $MODEL"
  echo "[started] Model $MODEL pulled"
fi

# 3. Warm the model. num_ctx matches the app's pitch-only rounds, so Ollama doesn't reload for the first round.
echo "[..] Loading $MODEL into memory..."
if curl -s -f -o /dev/null --max-time 300 "$OLLAMA/api/generate" \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"OK\",\"stream\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1,\"num_ctx\":6144}}"; then
  echo "[OK] Model loaded (kept in memory for 30 min)"
else
  echo "[failed] Could not load $MODEL; the first round may be slow or fail"
  FAILED=1
fi

# 4. Static server
if up "$APP/"; then
  echo "[OK] Web server is running on port 8000"
else
  if command -v python3 >/dev/null; then SERVER="python3 -m http.server 8000"
  elif command -v python >/dev/null; then SERVER="python -m http.server 8000"
  elif command -v npx >/dev/null; then SERVER="npx --yes serve -l 8000"
  else fail "No Python 3 or Node.js found to serve the page"
  fi
  nohup $SERVER >"$LOGS/ai-judges-server.log" 2>&1 &
  wait_for "$APP/" 20 || fail "Web server did not answer within 20 s (log: $LOGS/ai-judges-server.log)"
  echo "[started] Web server ($SERVER, log: $LOGS/ai-judges-server.log)"
fi

# 5. Browser
if command -v open >/dev/null && [ "$(uname)" = Darwin ]; then open "$APP/"
elif command -v xdg-open >/dev/null; then xdg-open "$APP/" >/dev/null 2>&1
else echo "[..] Open $APP/ in your browser"
fi
echo "[OK] Opened $APP"

[ -n "$FAILED" ] && fail "see above"
echo
echo "All set. The web server keeps running in the background."
