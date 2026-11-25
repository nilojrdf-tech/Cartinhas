@echo off
setlocal
title Desinstalar Cartinhas
set "DEST=%USERPROFILE%\Cartinhas"
echo.
echo  Isto remove o atalho e o programa. Seus dados (cartinhas-dados.json) ficam guardados em %DEST%
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); Remove-Item -ErrorAction SilentlyContinue (Join-Path $d 'Cartinhas.url')"
del /Q "%DEST%\Cartinhas.html" 2>nul
del /Q "%DEST%\cartinhas.ico" 2>nul
echo  Cartinhas removido.
pause
