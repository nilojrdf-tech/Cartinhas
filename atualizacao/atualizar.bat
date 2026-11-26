@echo off
setlocal
title Atualizar Cartinhas
set "DEST=%USERPROFILE%\Cartinhas"
set "FONTE=https://raw.githubusercontent.com/nilojrdf-tech/Cartinhas/main/instalacao/Cartinhas.html"
set "NOVO=%TEMP%\Cartinhas-novo.html"
echo.
echo  Atualizador do Cartinhas
echo.
if not exist "%DEST%\Cartinhas.html" goto semInstalacao
if exist "%~dp0Cartinhas.html" goto daPasta
goto baixa

:daPasta
echo  Usando o Cartinhas.html que esta nesta mesma pasta.
copy /Y "%~dp0Cartinhas.html" "%NOVO%" >nul
goto confere

:baixa
echo  Baixando a versao nova...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;Invoke-WebRequest -Uri $env:FONTE -OutFile $env:NOVO -UseBasicParsing}catch{exit 1}"
if errorlevel 1 goto semRede
goto confere

:confere
rem so troca depois de conferir que o que veio e mesmo o Cartinhas inteiro
powershell -NoProfile -Command "$p=$env:NOVO;if(!(Test-Path $p)){exit 1};if((Get-Item $p).Length -lt 500000){exit 1};if(!(Select-String -Path $p -Pattern 'cartinhas-dados.json' -SimpleMatch -Quiet)){exit 1}"
if errorlevel 1 goto arquivoEstranho
copy /Y "%DEST%\Cartinhas.html" "%DEST%\Cartinhas-anterior.html" >nul
copy /Y "%NOVO%" "%DEST%\Cartinhas.html" >nul
del "%NOVO%" >nul 2>&1
echo.
echo  Pronto! Abra pelo atalho de sempre.
echo  Se a tela ainda parecer a antiga, aperte Ctrl+F5 na pagina.
echo.
echo  Seus dados nao foram tocados: continuam no cartinhas-dados.json.
echo  A versao anterior ficou guardada como:
echo    %DEST%\Cartinhas-anterior.html
echo.
pause
exit /b 0

:semInstalacao
echo  Nao achei o Cartinhas em:
echo    %DEST%
echo.
echo  Este arquivo e so para quem ja usa o Cartinhas. Para instalar pela
echo  primeira vez, peca o pacote de instalacao e rode o instalar.bat.
echo.
pause
exit /b 1

:semRede
echo.
echo  Nao consegui baixar. A rede daqui pode estar bloqueando o site.
echo  Peca o arquivo Cartinhas.html a quem cuida do Cartinhas, deixe ele
echo  nesta mesma pasta, ao lado deste atualizar.bat, e rode de novo.
echo.
pause
exit /b 1

:arquivoEstranho
echo.
echo  O que chegou nao parece o Cartinhas (veio pela metade ou e outra
echo  coisa). Nada foi trocado: o seu Cartinhas continua como estava.
echo  Tente de novo mais tarde.
echo.
del "%NOVO%" >nul 2>&1
pause
exit /b 1
