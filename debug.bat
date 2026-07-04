@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Starting debug setup...
echo.

powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', '%~dp0debug.ps1'"

if %errorlevel% neq 0 (
    echo.
    echo Failed to start. Right-click and select "Run as administrator" instead.
    pause
)
