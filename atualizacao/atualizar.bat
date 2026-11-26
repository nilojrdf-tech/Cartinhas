@echo off
setlocal enabledelayedexpansion
title Atualizar Cartinhas
set "FONTE=https://raw.githubusercontent.com/nilojrdf-tech/Cartinhas/main/instalacao/Cartinhas.html"
set "NOVO=%TEMP%\Cartinhas-novo.html"
set "ALVO="
echo.
echo  Atualizador do Cartinhas
echo.

rem 1) a pasta de sempre, a que o instalar.bat usa
if exist "%USERPROFILE%\Cartinhas\Cartinhas.html" set "ALVO=%USERPROFILE%\Cartinhas\Cartinhas.html"

rem 2) senao, pergunta ao atalho "Cartinhas" da Area de Trabalho para onde ele aponta
if not defined ALVO (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue';$d=[Environment]::GetFolderPath('Desktop');if($d){$c=Join-Path $d 'Cartinhas.url'};if($d -and (Test-Path $c)){$l=(Select-String -Path $c -Pattern 'URL=' -SimpleMatch | Select-Object -First 1).Line;$u=$l -replace '^URL=','';try{$p=([uri]$u).LocalPath}catch{$p=''};if($p -and (Test-Path $p)){Write-Output $p}}" 2^>nul`) do set "ALVO=%%A"
)
if not defined ALVO goto semInstalacao

rem a copia instalada se chama Cartinhas.html; nenhum outro arquivo e trocado
for %%I in ("!ALVO!") do set "NOME=%%~nxI"
if /I not "!NOME!"=="Cartinhas.html" goto atalhoOutro

echo  Atualizando o Cartinhas que esta em:
echo    !ALVO!
echo.
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
rem so troca depois de conferir que o que chegou e mesmo o Cartinhas inteiro
powershell -NoProfile -Command "$p=$env:NOVO;if(-not (Test-Path $p)){exit 1};if((Get-Item $p).Length -lt 500000){exit 1};if(-not (Select-String -Path $p -Pattern 'cartinhas-dados.json' -SimpleMatch -Quiet)){exit 1}"
if errorlevel 1 goto arquivoEstranho
copy /Y "%NOVO%" "!ALVO!" >nul
if errorlevel 1 goto naoGravou
del "%NOVO%" >nul 2>&1
echo.
echo  Pronto, o Cartinhas esta atualizado.
echo.
echo  Abra pelo atalho de sempre: nada mudou de lugar e nenhum atalho novo
echo  foi criado. Seus dados continuam no cartinhas-dados.json.
echo  Se a tela ainda parecer a antiga, aperte Ctrl+F5 na pagina.
echo.
pause
exit /b 0

:semInstalacao
echo  Nao achei o Cartinhas nesta maquina.
echo.
echo  Procurei em %USERPROFILE%\Cartinhas e no atalho "Cartinhas" da Area
echo  de Trabalho, e nao achei nenhum Cartinhas.html.
echo.
echo  Este arquivo e so para quem ja usa. Para instalar pela primeira vez,
echo  peca o pacote de instalacao e rode o instalar.bat.
echo.
pause
exit /b 1

:atalhoOutro
echo  O seu atalho "Cartinhas" aponta para:
echo    !ALVO!
echo.
echo  Essa nao e a copia instalada (ela se chama Cartinhas.html), entao nada
echo  foi trocado: um arquivo de projeto nao pode ser sobrescrito por aqui.
echo.
echo  Se voce abre o Cartinhas direto de uma pasta de projeto, atualize por
echo  la mesmo.
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

:naoGravou
echo.
echo  Nao consegui gravar em:
echo    !ALVO!
echo  O Cartinhas pode estar aberto no navegador, ou a pasta e so de leitura.
echo  Feche a pagina do Cartinhas e rode de novo. Nada foi trocado.
echo.
del "%NOVO%" >nul 2>&1
pause
exit /b 1
