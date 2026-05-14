@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example. Fill BOTHUB_API_KEY and BOTHUB_MODEL when you want real model answers.
)

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
)

call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt

if not exist "frontend\node_modules" (
  pushd frontend
  npm install
  popd
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8017 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo API is already running on http://127.0.0.1:8017
) else (
  start "Arknights Agent API" cmd /k "call .venv\Scripts\activate.bat && uvicorn backend.app.main:app --host 127.0.0.1 --port 8017"
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo UI is already running on http://127.0.0.1:5173
) else (
  start "Arknights Agent UI" cmd /k "cd /d %~dp0frontend && npm run dev"
)

echo API: http://127.0.0.1:8017
echo UI:  http://127.0.0.1:5173
echo.
echo If this is the first run, open the UI and click rebuild index, or run rebuild_index.bat.
endlocal
