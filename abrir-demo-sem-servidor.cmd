@echo off
cd /d "%~dp0"
echo.
echo Preparando a demo local do Syntra Food...
echo.
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo Nao consegui preparar a demo. Me envie um print desta janela.
  pause
  exit /b 1
)
set "PROJECT=%CD%"
set "URL=%PROJECT:\=/%"
echo.
echo Abrindo a pagina de cadastro sem depender do servidor local...
start "" "file:///%URL%/dist/index.html#/cadastro"
echo.
echo Se quiser abrir o dashboard demo depois, use:
echo file:///%URL%/dist/index.html#/demo/dashboard
echo.
pause
