@echo off
chcp 65001 >nul
title Pubblica Manofuori Cup
echo.
echo  ===== PUBBLICAZIONE MANOFUORI CUP =====
echo.
echo  1) Cerco la versione PIU' RECENTE del progetto (puo' volerci un minuto)...
set "DIR="
set "VER="
set "FOUND="
rem Cerca in questa cartella, in Download, Documenti, Desktop e in tutta la cartella utente:
rem tra tutte le copie del progetto sceglie quella con il numero di versione piu' alto (index.html, v=...).
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$bv=0; $best=''; foreach ($r in @('%~dp0', $env:USERPROFILE)) { Get-ChildItem -LiteralPath $r -Filter 'firebase.json' -Recurse -ErrorAction SilentlyContinue | Where-Object { (Test-Path -LiteralPath (Join-Path $_.DirectoryName 'js\legal.js')) -and ((Get-Content -LiteralPath (Join-Path $_.DirectoryName 'index.html') -Raw) -match 'Manofuori Cup') } | ForEach-Object { $i = Join-Path $_.DirectoryName 'index.html'; if (Test-Path -LiteralPath $i) { $m = [regex]::Match((Get-Content -LiteralPath $i -Raw), 'v=(\d{12})'); if ($m.Success -and [int64]$m.Groups[1].Value -gt $bv) { $bv = [int64]$m.Groups[1].Value; $best = $_.DirectoryName } } } }; if ($best) { Write-Output ([string]$bv + '*' + $best) }"`) do set "FOUND=%%L"
if not defined FOUND (
  echo.
  echo  NON TROVO il progetto.
  echo  Scarica lo ZIP da https://github.com/Elsina71/Manofuori-Cup
  echo  ^(pulsante verde "Code" - "Download ZIP"^), estrailo e rilancia questo file.
  echo.
  pause
  exit /b 1
)
for /f "tokens=1,* delims=*" %%a in ("%FOUND%") do (
  set "VER=%%a"
  set "DIR=%%b"
)
echo     Trovata: %DIR%
echo     Versione: %VER%
echo.
echo     Se hai appena scaricato un nuovo ZIP e la versione non e' quella nuova,
echo     chiudi questa finestra ed estrai di nuovo lo ZIP.
echo.
cd /d "%DIR%"
set "PROJECT="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw '.firebaserc' | ConvertFrom-Json).projects.default"`) do set "PROJECT=%%P"
if not defined PROJECT set "PROJECT=DA_COMPILARE"
if /i "%PROJECT%"=="DA_COMPILARE" (
  echo  L'app non e' ancora collegata al suo progetto Firebase.
  echo  Manda a Claude i dati del progetto ^(vedi README di Manofuori-Cup^) e riprova.
  echo.
  pause
  exit /b 1
)
echo     Progetto Firebase: %PROJECT%
echo.
echo  2) Account Google di MANOFUORI CUP
echo     ^(quello con cui vedi il progetto "%PROJECT%" su console.firebase.google.com^)
set /p EMAIL=    Scrivi l'email e premi Invio: 
call firebase login:list 2>nul | findstr /i /c:"%EMAIL%" >nul
if errorlevel 1 (
  echo.
  echo     Si apre il browser: accedi con %EMAIL% e autorizza.
  call firebase login:add
)
echo.
echo  3) Pubblico sito e regole del database...
echo.
call firebase deploy --only hosting,firestore:rules --project %PROJECT% --account %EMAIL%
echo.
if errorlevel 1 (
  echo  ***** QUALCOSA NON E' ANDATO: fai una foto di questa finestra e mandala. *****
) else (
  echo  ***** FATTO: pubblicata la versione %VER% su https://%PROJECT%.web.app *****
  echo  ***** Nel browser premi Ctrl+F5 per vedere la nuova versione. *****
)
echo.
pause
