@echo off
chcp 65001 >nul
rem =============================================================
rem  Publier AZETIN : vérifie la compilation, envoie le code (et les voix)
rem  sur GitHub ; Cloudflare met le prototype en ligne en 1 à 2 minutes
rem  sur https://azetin.heyhappystudio.com
rem  Usage : double-clic, ou  publier.bat "message de la mise à jour"
rem =============================================================
cd /d "%~dp0"
where git >nul 2>nul || (echo Git n est pas installe : https://git-scm.com & pause & exit /b 1)
rem met a jour les dependances (nouvelles bibliotheques de rendu, etc.)
call npm install --no-audit --no-fund
echo Verification de la compilation...
call npm run build
if errorlevel 1 (
  choice /c ON /m "La compilation a echoue. Publier quand meme (O = oui, N = non)"
  if errorlevel 2 (echo Rien n a ete publie. & pause & exit /b 1)
)
git add -A
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Mise a jour AZETIN"
git commit -m "%MSG%"
git push -u origin main
if errorlevel 1 (echo. & echo L envoi a echoue : copie le message ci-dessus a Claude. & pause & exit /b 1)
echo.
echo Envoye ! Cloudflare met le prototype en ligne dans 1 a 2 minutes.
echo https://azetin.heyhappystudio.com
pause
