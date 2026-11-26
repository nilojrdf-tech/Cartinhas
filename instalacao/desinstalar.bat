@echo off
setlocal
title Desinstalar Cartinhas
set "DEST=%USERPROFILE%\Cartinhas"
echo.
echo  Desinstalar o Cartinhas
echo.
if not exist "%DEST%\Cartinhas.html" goto naoInstalado
echo  Vou remover o programa de:
echo    %DEST%
echo.
echo  Os seus dados NAO sao apagados: o cartinhas-dados.json fica onde esta.
echo.
echo  Para desistir, feche esta janela agora.
pause

rem o atalho so sai se for o desta instalacao; atalho para outro lugar fica
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue';$d=[Environment]::GetFolderPath('Desktop');if(-not $d){exit 1};$c=Join-Path $d 'Cartinhas.url';if(-not (Test-Path $c)){exit 1};$l=(Select-String -Path $c -Pattern 'URL=' -SimpleMatch | Select-Object -First 1).Line;$u=$l -replace '^URL=','';try{$p=([uri]$u).LocalPath}catch{exit 1};if(-not $p){exit 1};$alvo=Join-Path $env:DEST 'Cartinhas.html';if($p -eq $alvo){Remove-Item $c -Force;exit 0};exit 1" 2^>nul
if errorlevel 1 (set "ATALHO=outro") else (set "ATALHO=removido")
del /Q "%DEST%\Cartinhas.html" 2>nul
del /Q "%DEST%\cartinhas.ico" 2>nul
echo.
echo  Pronto, o Cartinhas foi removido.
if "%ATALHO%"=="removido" echo  O atalho da Area de Trabalho tambem saiu.
if "%ATALHO%"=="outro" echo  O atalho da Area de Trabalho nao era desta instalacao: deixei como estava.
echo.
echo  O que ficou guardado em %DEST%:
echo    cartinhas-dados.json  (os seus meses e correcoes)
echo    desinstalar.bat       (este arquivo)
echo.
echo  Se um dia quiser o Cartinhas de volta, rode o instalar.bat e conecte
echo  nesse mesmo arquivo: nada se perde.
echo  Se quiser apagar os dados tambem, apague a pasta %DEST% a mao.
echo.
pause
exit /b 0

:naoInstalado
echo  Nao achei o Cartinhas em:
echo    %DEST%
echo.
echo  Nada foi removido. Se voce abre o Cartinhas de outra pasta, ele nao
echo  foi instalado por aqui: basta apagar o arquivo e o atalho a mao.
echo.
pause
exit /b 1
