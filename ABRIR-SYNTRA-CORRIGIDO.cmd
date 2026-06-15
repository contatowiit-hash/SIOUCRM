@echo off
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
title Syntra Food Corrigido

echo.
echo ==========================================
echo   Syntra Food - VERSAO CORRIGIDA
echo ==========================================
echo.
echo Vou abrir:
echo - Backend corrigido em http://127.0.0.1:3334
echo - Site corrigido em http://127.0.0.1:5174
echo - WhatsApp Gateway em http://127.0.0.1:3001
echo.
echo Deixe as janelas abertas.
echo.

if exist "%APP_DIR%abrir-whatsapp-gateway.cmd" (
  start "Syntra Food WhatsApp Gateway" /D "%APP_DIR%" "%APP_DIR%abrir-whatsapp-gateway.cmd"
)

start "Syntra Food Backend Corrigido" /D "%APP_DIR%" cmd /k "set API_PORT=3334&& set PORT=3334&& set APP_URL=http://127.0.0.1:5174&& npm.cmd run dev:api"

start "Syntra Food Site Corrigido" /D "%APP_DIR%" cmd /k "set SITE_PORT=5174&& npm.cmd run serve:site"

echo.
echo Aguarde 10 segundos e abra:
echo http://127.0.0.1:5174/login
echo.
timeout /t 10 /nobreak >nul
start "" "http://127.0.0.1:5174/login"
pause
