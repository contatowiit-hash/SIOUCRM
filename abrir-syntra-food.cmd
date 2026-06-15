@echo off
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
echo.
echo Ligando Syntra Food...
echo.
echo Vou abrir o backend, o site e o WhatsApp Gateway em janelas separadas.
echo Deixe as janelas abertas enquanto estiver usando o sistema.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = 3333,5173,3001; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo.
echo Backend/login/banco: http://127.0.0.1:3334
start "Syntra Food Backend Corrigido" /D "%APP_DIR%" cmd /k "set API_PORT=3334&& set PORT=3334&& set APP_URL=http://127.0.0.1:5174&& npm.cmd run dev:api"
echo Site: http://127.0.0.1:5174
start "Syntra Food Site Corrigido" /D "%APP_DIR%" cmd /k "set SITE_PORT=5174&& npm.cmd run serve:site"
if exist "%APP_DIR%abrir-whatsapp-gateway.cmd" (
  echo WhatsApp Gateway: http://127.0.0.1:3001
  start "Syntra Food WhatsApp Gateway" /D "%APP_DIR%" "%APP_DIR%abrir-whatsapp-gateway.cmd"
)
echo.
echo Aguarde uns 15 segundos e abra ou recarregue:
echo http://127.0.0.1:5174/login
echo.
pause
