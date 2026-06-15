@echo off
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
title Syntra Food - Abridor

echo.
echo ==========================================
echo   Syntra Food
echo ==========================================
echo.
echo Vou ligar o sistema agora.
echo.
echo IMPORTANTE:
echo - Vai abrir uma janela chamada Syntra Food Backend Corrigido
echo - Vai abrir uma janela chamada Syntra Food Site Corrigido
echo - Vai abrir uma janela chamada Syntra Food WhatsApp Gateway
echo - Deixe as janelas abertas.
echo.

echo Abrindo o backend/login/banco corrigido...
start "Syntra Food Backend Corrigido" /D "%APP_DIR%" cmd /k "set API_PORT=3334&& set PORT=3334&& set APP_URL=http://127.0.0.1:5174&& npm.cmd run dev:api"

echo Abrindo o site...
start "Syntra Food Site Corrigido" /D "%APP_DIR%" cmd /k "set SITE_PORT=5174&& npm.cmd run serve:site"

if exist "%APP_DIR%abrir-whatsapp-gateway.cmd" (
  echo Abrindo o WhatsApp Gateway...
  start "Syntra Food WhatsApp Gateway" /D "%APP_DIR%" "%APP_DIR%abrir-whatsapp-gateway.cmd"
)

echo.
echo Espere 15 a 30 segundos.
echo Depois abra este endereco:
echo.
echo http://127.0.0.1:5174/login
echo.
echo Se aparecer erro no navegador:
echo 1. Veja se as janelas pretas continuam abertas.
echo 2. Se alguma janela tiver texto vermelho, mande print dela.
echo.
pause
