@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
title Syntra Food - Instalar e abrir

echo.
echo ==========================================
echo   Syntra Food - INSTALAR E ABRIR
echo ==========================================
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o Node.js/npm neste computador.
  echo Instale o Node.js LTS e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "%APP_DIR%.env" (
  if exist "%APP_DIR%.env.example" (
    copy "%APP_DIR%.env.example" "%APP_DIR%.env" >nul
    echo Criei o arquivo .env a partir do .env.example.
    echo Abra o .env e preencha DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY e os outros segredos.
    echo Depois rode este arquivo de novo.
    echo.
    pause
    exit /b 0
  )
)

if not exist "%APP_DIR%node_modules\vite\package.json" (
  echo Instalando dependencias do Syntra Food...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo A instalacao do Syntra Food falhou.
    pause
    exit /b 1
  )
)

if exist "%APP_DIR%whatsapp-gateway\whatsapp-gateway\package.json" (
  if not exist "%APP_DIR%whatsapp-gateway\whatsapp-gateway\node_modules\tsx\package.json" (
    echo Instalando dependencias do WhatsApp Gateway...
    call npm.cmd install --prefix "%APP_DIR%whatsapp-gateway\whatsapp-gateway"
    if errorlevel 1 (
      echo.
      echo A instalacao do WhatsApp Gateway falhou.
      pause
      exit /b 1
    )
  )
)

echo.
echo Compilando o site...
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo A compilacao falhou. Mande print desta janela.
  pause
  exit /b 1
)

echo.
echo Abrindo o Syntra Food...
call "%APP_DIR%abrir-syntra-food.cmd"
