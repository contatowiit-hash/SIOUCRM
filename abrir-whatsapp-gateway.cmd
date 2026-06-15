@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\start-whatsapp-gateway.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo O WhatsApp Gateway foi encerrado com erro.
) else (
  echo O WhatsApp Gateway foi encerrado.
)
echo Consulte o log sanitizado na pasta .logs.
echo.
pause
exit /b %EXIT_CODE%
