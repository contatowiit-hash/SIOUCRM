@echo off
setlocal
set "APP_DIR=%~dp0"
set "GATEWAY_DIR=%APP_DIR%whatsapp-gateway\whatsapp-gateway"

echo.
echo Instalando WhatsApp Gateway...
echo.

if not exist "%GATEWAY_DIR%\package.json" (
  echo Nao encontrei o projeto do gateway em:
  echo %GATEWAY_DIR%
  echo.
  pause
  exit /b 1
)

cd /d "%GATEWAY_DIR%"
call npm.cmd install
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Verifique sua internet/firewall e tente novamente.
  echo.
  pause
  exit /b 1
)

call npm.cmd run build
if errorlevel 1 (
  echo.
  echo O gateway instalou, mas encontrou erro na validacao.
  echo.
  pause
  exit /b 1
)

echo.
echo Gateway instalado com sucesso.
echo Agora abra o arquivo abrir-whatsapp-gateway.cmd.
echo.
pause
