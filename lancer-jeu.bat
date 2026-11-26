@echo off
chcp 65001 >nul
rem =============================================================
rem  Lancer AZETIN en local : le jeu s'ouvre sur http://localhost:5173
rem  (fermer cette fenêtre pour l'arrêter). Usage : double-clic
rem =============================================================
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n est pas installe : https://nodejs.org & pause & exit /b 1)
if not exist "node_modules" call npm install
echo.
echo AZETIN demarre sur http://localhost:5173 ...
echo.
call npx vite --port 5173 --strictPort
pause
