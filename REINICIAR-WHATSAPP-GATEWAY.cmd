@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"

echo.
echo Reiniciando WhatsApp Gateway do Syntra Food...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*whatsapp-gateway*' -and $_.CommandLine -like '*src/index.ts*' }; foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"

timeout /t 2 /nobreak >nul

start "Syntra Food WhatsApp Gateway" "%APP_DIR%abrir-whatsapp-gateway.cmd"

echo.
echo Pronto. Se abriu uma janela preta do gateway, deixe ela aberta.
echo Agora volte no Syntra Food e reconecte o QR se necessario.
echo.
pause
