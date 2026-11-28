@echo off
chcp 65001 >nul
rem =============================================================
rem  Génère les voix, bruitages et musique d'AZETIN avec ElevenLabs.
rem  Avant la première fois : crée un fichier .env (à côté de ce fichier) contenant
rem      ELEVENLABS_API_KEY=ta_clé
rem  (la clé se trouve sur elevenlabs.io > Profile > API Keys ; ne la partage avec personne)
rem  Ce que fait le script :
rem   - crée sur mesure les voix de Houngbo et de Dah Agossou (Voice Design), 3 essais
rem     dans tools\voices\essais\ : écoute-les ; le n°1 est gardé par défaut
rem   - génère toutes les répliques en anglais ET en français (public\voices\lines et lines\fr)
rem   - ne refait que ce qui a changé (texte, voix, modèle)
rem  Garder un autre essai (dans les 24 h) :  generer-voix.bat choisir houngbo 2
rem  Tout refaire :                          generer-voix.bat --force
rem =============================================================
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n est pas installe : https://nodejs.org & pause & exit /b 1)
if not exist ".env" (echo Il manque le fichier .env avec ELEVENLABS_API_KEY=... & pause & exit /b 1)
node tools/voices/generate.mjs %*
pause
