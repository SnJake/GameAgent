@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 goto error
)

call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
if errorlevel 1 goto error

python -m backend.app.rebuild_index
if errorlevel 1 goto error

endlocal
exit /b 0

:error
echo.
echo Build failed. Check the error above.
pause
endlocal
exit /b 1