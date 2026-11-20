@echo off
rem Starts a small local web server for the Games collection and opens it in your browser.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it from https://www.python.org/downloads/ and run this again.
  pause
  exit /b 1
)
start "Games server" /min python -m http.server 8000 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"
echo Games are running at http://127.0.0.1:8000/
echo Close the minimised "Games server" window to stop the game server.
timeout /t 5 >nul
