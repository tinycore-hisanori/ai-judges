@echo off
rem One-click launcher for AI Judges: Ollama, the model, the static server, the browser.
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "MODEL=qwen2.5:32b"
set "OLLAMA=http://localhost:11434"
set "APP=http://localhost:8000"
set "FAILED="
set "TAGS=%TEMP%\ai-judges-tags.json"

where curl >nul 2>&1 || (echo [failed] curl not found ^(it ships with Windows 10 and later^). & goto :fail)

rem Find the ollama command: PATH first, then the default install folder.
set "OLLAMA_EXE="
for /f "delims=" %%p in ('where ollama 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%p"
if not defined OLLAMA_EXE if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"

rem 1. Ollama
curl -s -f -o nul --max-time 3 %OLLAMA%/api/tags
if not errorlevel 1 (
  echo [OK] Ollama is running
) else (
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
  ) else if defined OLLAMA_EXE (
    start "Ollama" "!OLLAMA_EXE!" serve
  ) else (
    echo [failed] Ollama is not installed. Get it from https://ollama.com
    goto :fail
  )
  set "UP="
  for /l %%i in (1,1,30) do if not defined UP (
    ping -n 2 127.0.0.1 >nul
    curl -s -f -o nul --max-time 2 %OLLAMA%/api/tags && set "UP=1"
  )
  if not defined UP (echo [failed] Ollama did not answer within 30 s & goto :fail)
  echo [started] Ollama
)

rem 2. Model
curl -s -f --max-time 5 -o "%TAGS%" %OLLAMA%/api/tags
findstr /c:"\"%MODEL%\"" "%TAGS%" >nul
if not errorlevel 1 (
  echo [OK] Model %MODEL% is pulled
) else (
  echo [..] Model %MODEL% is not pulled yet. Downloading it now ^(about 20 GB, once^)...
  if not defined OLLAMA_EXE (echo [failed] ollama command not found, so the model can't be pulled & goto :fail)
  "!OLLAMA_EXE!" pull %MODEL%
  if errorlevel 1 (echo [failed] ollama pull %MODEL% & goto :fail)
  echo [started] Model %MODEL% pulled
)
del "%TAGS%" >nul 2>&1

rem 3. Warm the model. num_ctx matches the app's pitch-only rounds, so Ollama doesn't reload for the first round.
echo [..] Loading %MODEL% into memory...
curl -s -f -o nul --max-time 300 %OLLAMA%/api/generate -d "{\"model\":\"%MODEL%\",\"prompt\":\"OK\",\"stream\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1,\"num_ctx\":6144}}"
if errorlevel 1 (
  echo [failed] Could not load %MODEL%; the first round may be slow or fail
  set "FAILED=1"
) else (
  echo [OK] Model loaded ^(kept in memory for 30 min^)
)

rem 4. Static server
curl -s -f -o nul --max-time 3 %APP%/
if not errorlevel 1 (
  echo [OK] Web server is running on port 8000
) else (
  set "SERVER="
  python --version >nul 2>&1 && set "SERVER=python -m http.server 8000"
  if not defined SERVER py -3 --version >nul 2>&1 && set "SERVER=py -3 -m http.server 8000"
  if not defined SERVER where npx >nul 2>&1 && set "SERVER=npx --yes serve -l 8000"
  if not defined SERVER (echo [failed] No Python 3 or Node.js found to serve the page & goto :fail)
  start "AI Judges server" /d "%~dp0." cmd /k !SERVER!
  set "UP="
  for /l %%i in (1,1,20) do if not defined UP (
    ping -n 2 127.0.0.1 >nul
    curl -s -f -o nul --max-time 2 %APP%/ && set "UP=1"
  )
  if not defined UP (echo [failed] Web server did not answer within 20 s & goto :fail)
  echo [started] Web server ^(!SERVER!^)
)

rem 5. Browser
start "" %APP%/
echo [OK] Opened %APP%

if defined FAILED goto :fail
echo.
echo All set. Keep the "AI Judges server" window open while you use the app.
ping -n 4 127.0.0.1 >nul
exit /b 0

:fail
echo.
echo Something failed; see the lines above.
pause
exit /b 1
