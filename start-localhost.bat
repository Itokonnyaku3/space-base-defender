@echo off
rem ============================================================
rem  Space Base Defender - localhost dev server launcher
rem  Double-click this file to start the game at localhost:5173
rem ============================================================
cd /d "%~dp0"

echo ============================================================
echo   Space Base Defender - dev server
echo   URL : http://localhost:5173/
echo   The browser opens automatically in a few seconds.
echo   Press Ctrl+C in this window to stop the server.
echo ============================================================
echo.

rem Open the browser shortly after, once Vite is ready (explorer = default browser; no nested quotes)
start "" /b cmd /c "timeout /t 3 /nobreak >nul & explorer http://localhost:5173/"

rem Start the Vite dev server (blocks; keeps this window open)
call npm run dev

rem If npm exits/errors, keep the window open so the message is readable
echo.
echo (dev server stopped)
pause
