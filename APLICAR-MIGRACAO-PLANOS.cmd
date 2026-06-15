@echo off
setlocal
cd /d "%~dp0"

echo Aplicando atualizacao dos planos no banco Neon...
echo.

call npm.cmd run db:migrate

if errorlevel 1 (
  echo.
  echo Nao foi possivel aplicar a migracao.
  echo Confira se o arquivo .env tem DATABASE_URL e DIRECT_DATABASE_URL corretos.
  echo.
  pause
  exit /b 1
)

echo.
echo Migracao aplicada com sucesso.
echo O Syntra Food ja reconhece Free, Starter, Pro, Premium e Fundador Vitalicio.
echo.
pause
