@echo off
setlocal
title VaaniTrack

REM Run from wherever this file lives, so a desktop shortcut works too.
cd /d "%~dp0"

echo.
echo   ==================================================
echo      VaaniTrack
echo   ==================================================
echo.

REM --- 1. Clear anything left running from last time -----------------
REM A server still holding port 3000 makes the new one fail with an error
REM that reads like a code problem. Clearing first is cheaper than
REM debugging it at 9am.
echo   [1/5] Clearing anything still running...
taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)

REM --- 2. Dependencies ------------------------------------------------
if not exist "node_modules\" (
  echo   [2/5] Installing dependencies ^(first run only, takes a minute^)...
  call npm install
  if errorlevel 1 goto :failed
) else (
  echo   [2/5] Dependencies present.
)

REM --- 3. API key -----------------------------------------------------
REM Checked before building, because a missing key fails at the moment you
REM speak into the app - long after you have stopped watching this window.
if not exist ".env.local" (
  echo.
  echo   PROBLEM: .env.local is missing.
  echo.
  echo   The voice model needs it. Create a file called .env.local
  echo   in this folder containing one line:
  echo.
  echo       GROQ_API_KEY=your_key_here
  echo.
  pause
  exit /b 1
)
echo   [3/5] API key file found.

REM --- 4. How are you working today? ----------------------------------
echo.
echo   [4/5] What are you doing?
echo.
echo      1  Testing on your phone   ^(production build - most reliable^)
echo      2  Writing code            ^(hot reload - updates as files change^)
echo.
echo      Just wait 10 seconds and it picks 1 for you.
echo.
choice /c 12 /t 10 /d 1 /n /m "      Press 1 or 2: "
if errorlevel 2 goto :hot

REM --- Phone mode: build, then serve the built files -------------------
echo.
echo   [5/5] Building...
echo.
call npx next build
if errorlevel 1 goto :failed
set MODE_ARGS=
goto :serve

:hot
REM Hot reload skips the build and serves through next dev. Faster while
REM editing, but flakier over the tunnel on a phone - which is exactly why
REM phone testing is the other option.
echo.
echo   [5/5] Hot reload - skipping the build.
set MODE_ARGS=--dev

:serve
echo.
echo   --------------------------------------------------
echo     Starting the server and your phone link.
echo.
echo     This can take up to a minute. It waits until the
echo     link genuinely answers before printing it, so you
echo     never get handed a dead URL.
echo.
echo     A QR code is saved to phone-link.png as well.
echo.
echo     KEEP THIS WINDOW OPEN - closing it stops everything.
echo   --------------------------------------------------
echo.

node scripts\dev-tunnel.mjs %MODE_ARGS%
goto :done

:failed
echo.
echo   ==================================================
echo      Something failed. The error is just above.
echo   ==================================================
echo.
pause
exit /b 1

:done
echo.
echo   Stopped. Everything is shut down.
pause
