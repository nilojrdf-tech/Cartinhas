@echo off
setlocal
title Atualizar Cartinhas
set "DEST=%USERPROFILE%\Cartinhas"
echo.
if not exist "%DEST%\Cartinhas.html" (
  echo  Nao achei o Cartinhas em %DEST%
  echo  Use instalar.bat: ele instala e cria o atalho na Area de Trabalho.
  echo.
  pause
  exit /b 1
)
echo  Atualizando o Cartinhas em: %DEST%
echo  Seus dados ficam no cartinhas-dados.json e nao sao tocados.
echo.
copy /Y "%DEST%\Cartinhas.html" "%DEST%\Cartinhas-anterior.html" >nul
copy /Y "%~dp0Cartinhas.html" "%DEST%\Cartinhas.html" >nul
if exist "%~dp0cartinhas.ico" copy /Y "%~dp0cartinhas.ico" "%DEST%\cartinhas.ico" >nul
echo  Pronto! Abra pelo atalho de sempre.
echo  Se a tela ainda parecer a antiga, atualize a pagina com Ctrl+F5.
echo.
echo  A versao anterior ficou guardada como Cartinhas-anterior.html,
echo  caso voce queira voltar.
echo.
pause
