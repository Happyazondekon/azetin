# AZETIN: The Last Healer

Survival-horror à la première personne pour l'**OpenGame Game Jam #1** (clôture le 18 déc. 2026, 23h59 heure du Pacifique).
Moteur : **Three.js + TypeScript + Vite**. Studio : HeyHappy Studio.

Game Design Document : https://claude.ai/artifact/PwKvLsCtSkHQZxi2GQpMVP

## Lancer le jeu

Prérequis : Node.js 18.17 ou plus récent.

```bash
npm install
npm run dev      # ouvre http://localhost:5173
npm run build    # build statique dans dist/ (index.html à la racine, pour OpenGame)
npm run preview  # teste le build
```

## Commandes

| Action | Touche |
| --- | --- |
| Se déplacer | ZQSD (AZERTY) ou WASD (QWERTY), ou flèches |
| Regarder | Souris (cliquer dans le jeu pour capturer la souris) |
| Courir / s'accroupir | Maj / C |
| Interagir | E |
| Flash du smartphone | F |
| Rétroviseur | Clic droit maintenu (après avoir fouillé le coffre) |
| Smartphone | Tab |
| Pause | Échap |

## Ce qui marche déjà (semaine 1, prototype)

- Menu principal dans la DA horreur, sur fond 3D du 4×4 en panne
- Village d'Azé-tin en blocs (blockout) : piste, 4×4, panneau, stèle, cases, atelier de Kossi, buvette, souche de Loko, station de kpayo, lagune
- Déplacement FPS, course, accroupi, endurance, collisions
- Flash du smartphone avec batterie (recharge près du 4×4)
- **Rétroviseur** : une caméra arrière qui montre le calque « vérité » — Mama Dossi et les villageois apparaissent brûlés
- Smartphone : Notes (objectifs), Galerie, Messages, Dictaphone, Sac, Fins, Réglages, écran de pause
- Prologue jouable : coffre → village → Kossi → Mama Dossi → découverte dans le rétroviseur
- Sauvegarde locale (localStorage, sans compte)
- Ambiance sonore provisoire (vent, grillons, hibou) synthétisée, à remplacer par ElevenLabs

## Structure

```
src/
  core/     Game (boucle, états, interactions), Input, Audio
  player/   Contrôleur FPS et collisions
  world/    Village (blockout) et calques vu / vérité
  mirror/   Le rétroviseur
  story/    Compteurs des 4 fins, objectifs, sauvegarde
  ui/       Menu, smartphone, sous-titres
public/models/  (à venir) exports Blender en .glb
```

## Remplacer les blocs par les modèles Blender

Exporter en **glTF binaire (.glb)** dans `public/models/`, avec compression Meshopt et textures 1024 px max.
Les personnages ont deux versions : « vue » (calque 1) et « vérité » brûlée (calque 2, visible seulement dans le rétroviseur).

## Rappels jam

- Garder un historique Git depuis le début : l'organisation peut demander l'historique de développement.
- Aucun compte, aucune pub, aucun paiement, aucun service externe pour démarrer.
- Déploiement : `npm i -g @opengamehq/cli`, `opengame setup`, `opengame login`, `opengame init`, puis `opengame check --build --json` et `opengame deploy --json`.
