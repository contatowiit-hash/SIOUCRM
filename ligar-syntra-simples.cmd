@echo off
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
echo.
echo Ligando Syntra Food em janelas separadas...
echo.
echo Feche janelas antigas do Syntra Food antes se tiver alguma aberta.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = 3333,5173,3001; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo.
echo Janela 1: backend/login/banco em http://127.0.0.1:3333
start "Syntra Food Backend" /D "%APP_DIR%" cmd /k "npm.cmd run dev:api"
echo Janela 2: site em http://127.0.0.1:5173
start "Syntra Food Site" /D "%APP_DIR%" cmd /k "npm.cmd run build && npm.cmd run serve:site"
if exist "%APP_DIR%abrir-whatsapp-gateway.cmd" (
  echo Janela 3: WhatsApp Gateway em http://127.0.0.1:3001
  start "Syntra Food WhatsApp Gateway" /D "%APP_DIR%" "%APP_DIR%abrir-whatsapp-gateway.cmd"
)
echo.
echo Aguarde uns 15 segundos e abra:
echo http://127.0.0.1:5173/login
echo.
pause
