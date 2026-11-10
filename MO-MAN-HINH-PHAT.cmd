@echo off
setlocal
rem Open the overlay in a separate portrait Google Chrome window.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -View overlay
if errorlevel 1 pause
endlocal
