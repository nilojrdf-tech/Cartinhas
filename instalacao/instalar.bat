@echo off
setlocal
title Instalar Cartinhas
set "DEST=%USERPROFILE%\Cartinhas"
echo.
echo  Instalando o Cartinhas em: %DEST%
echo.
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0Cartinhas.html" "%DEST%\Cartinhas.html" >nul
copy /Y "%~dp0cartinhas.ico" "%DEST%\cartinhas.ico" >nul
rem o desinstalador fica junto do programa, para nao depender deste pacote depois
copy /Y "%~dp0desinstalar.bat" "%DEST%\desinstalar.bat" >nul
if not exist "%DEST%\cartinhas-dados.json" type nul > "%DEST%\cartinhas-dados.json"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $u='file:///'+(($env:USERPROFILE+'\Cartinhas\Cartinhas.html') -replace '\\','/'); $i=$env:USERPROFILE+'\Cartinhas\cartinhas.ico'; Set-Content -Path (Join-Path $d 'Cartinhas.url') -Value @('[InternetShortcut]',('URL='+$u),('IconFile='+$i),'IconIndex=0') -Encoding ASCII"
echo  Pronto! O atalho "Cartinhas" foi criado na Area de Trabalho.
echo  Abra pelo atalho, no Chrome ou no Edge.
echo  Na primeira vez, clique em "Conectar cartinhas-dados.json" e escolha
echo  o arquivo que esta em %DEST%
echo.
pause
