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
| Frapper | Clic gauche |
| Clé démonte-roue / cric | 1 / 2 |
| Se cacher (QTE du hibou) | C maintenu, sans bouger |
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
  world/    Village, chargement des modèles (Assets.ts), calques vu / vérité
  mirror/   Le rétroviseur
  story/    Compteurs des 4 fins, objectifs, sauvegarde
  ui/       Menu, smartphone, sous-titres
public/models/  modèles .glb (Blender + repris de Dantokpa Dash)
tools/blender/  azetin.py (modélisation), lib.py, pack-model.mjs
```

## Ce qui marche (semaine 2, en cours)

- Habitants en 3D (corps Quaternius habillés, comme Dantokpa Dash) : Kossi (vivant), Mama Dossi et les villageois (Azévi).
  Chacun existe en version « vue » et en version « vérité » calcinée, visible seulement dans le rétroviseur.
- Le hibou : QTE de 3,5 s (se cacher avec C, ou lever le rétroviseur). Raté → un Brûlé surgit derrière Happy.
- Les Brûlés : ressemblent à des villageois, chassent, frappent ; un coup les fait reculer, trois les font fuir.
  Ils n'approchent pas du 4×4 (refuge).
- Combat : clé démonte-roue (rapide) et cric (lent, puissant), endurance.
- Souffle (vie) sans HUD : bords rouges ; il remonte lentement, vite près du 4×4.
- Mort : écran de cendre avec une citation selon la cause, puis « Wake up » (dernière sauvegarde).

### Ajouts (26 nov., après-midi)

- **Ciel selon l'heure** (`src/world/Sky.ts`) : coucher de soleil à 19h, crépuscule, nuit avec lune et étoiles, aube vers 5h30.
  Brouillard et lumières suivent le même horaire. Le menu montre le coucher du soleil.
- **Torche** : le flash du téléphone (faisceau + halo) baisse avec la batterie, jaunit et vacille sous 15 %.
- **Voix** (`Audio.babble`) : chaque réplique a sa voix synthétisée (homme, femme, enfant) placée dans l'espace ;
  les Azévi chuchotent quand Happy passe, et des voix lointaines traversent la nuit. À remplacer par ElevenLabs.
- **Village peuplé** : une vingtaine d'habitants (debout, assis, accroupis autour du feu de la place), feux et lampes.
- **Ayaba** : la petite-fille du guérisseur ; dans le rétroviseur elle est noyée (mouillée), pas brûlée. Elle guide Happy jusqu'à Kossi.
- **Acte 1 jouable de bout en bout** : coffre → Ayaba → Kossi → chambre à air (taxi-moto) → akassa de Mama Dossi
  (manger : +1 Marque ; refuser) et kit de rustines → machette de Kossi → batterie du générateur à la station (réveille deux Brûlés)
  → réparation → **Fin I « The Survivor »** au volant du 4×4 (ou **Fin II** si la Marque atteint 3).
- Choix à deux touches : **E** / **R**. Machette : touche **3**.

### Acte 1 peaufiné (26 nov., soir)

- **Repères** : l'étape en cours reste affichée en haut à gauche (« Step 4 / 11 ») ; un **marqueur** à l'écran
  montre où aller avec la distance (désactivable dans Réglages) ; le **nom du lieu** s'affiche en arrivant.
- **Carte évolutive** (touche **M**, ou l'app Map du téléphone) : les lieux et les chemins apparaissent quand on les découvre ;
  flèche bleue = Happy, anneau orange = objectif.
- **Notes du téléphone** : les 11 étapes de l'Acte 1, cochées au fur et à mesure, avec un conseil pour l'étape en cours.
- **Chemins de terre battue** au sol entre les lieux, visibles à la lune et à la torche.
- **Torche morte** (5 %) : Happy le dit, l'objectif devient « retourne au 4×4 », les warnings orange se voient de loin.
- **Luminosité** réglable dans Réglages ; nuits un peu plus claires (lune).
- **Voix** : fragments des vraies voix ElevenLabs de Dantokpa Dash (hommes, femmes, la voix d'Ayaba) découpés et
  mélangés (`Audio.voiceMix`) — on entend l'accent sans comprendre les mots ; les Azévi parlent voilé, en partie à l'envers, avec écho.
- **Combat** : les Brûlés prennent leur élan (grognement), frappent, et parfois **attrapent** Happy (marteler **E**).
  Happy peut frapper tout le monde : un villageois frappé se réveille en Brûlé ; frapper Kossi ou Ayaba fait monter la Marque.
  Braises à chaque coup, sifflement de l'arme.

## Outil de test

Ou double-clic sur `lancer-jeu.bat`. Ajouter `#at=x,z,orientation` à l'adresse
(ex. `http://localhost:5173/#at=2,16,0.45`) pour démarrer directement à un endroit du village.
Ajouter `&truth` montre la « vérité » (comme le rétroviseur) ; `&owl` fait crier le hibou au bout de 4 s.

## Modèles 3D (Blender, même chaîne que Dantokpa Dash)

Les modèles sont construits **par script** avec le module Python de Blender (`pip install bpy`), l'ombre douce
(occlusion ambiante) est précalculée par Cycles dans la couleur des sommets, puis le `.glb` est compressé (meshopt).

```
python tools/blender/azetin.py                  # tous les modèles -> tools/blender/work/az-*.glb (+ aperçus .png)
python tools/blender/azetin.py -- 4x4 station   # seulement certains
node tools/blender/pack-model.mjs az-4x4 az-station …   # -> public/models/
```

| Modèle | Contenu |
| --- | --- |
| `az-4x4` | 4×4 de location sans marque, pare-buffle, galerie chargée, pneu avant gauche à plat, rétroviseur conducteur arraché |
| `az-hut-thatch` / `az-hut-tin` / `az-hut-burnt` | cases en banco (paille, tôle ondulée, brûlée) |
| `az-healer`, `az-asen` | maison de Dah Agossou (signes de kaolin, palissade, canaris) et autel des ancêtres |
| `az-atelier` | atelier de Kossi : enseigne VULCANISATEUR, pneus, compresseur, établi |
| `az-buvette` | « Chez Mama Dossi » : auvent, comptoir, bassines d'akassa, marmite sur trois pierres |
| `az-station` | station de kpayo en ruine : dalle, piliers cassés, auvent effondré, fûts calcinés, arbre mort |
| `az-stump` | souche de l'iroko Loko, racines-contreforts, tissu blanc noué, offrandes de kaolin |
| `az-stele`, `az-sign` | stèle des morts et panneau calciné AZÉ-TIN |

Repris de Dantokpa Dash : arbres (`tr-*`), taxi-moto (`ob-zem`), pneus (`ob-tires`), fût, bouteille de gaz,
générateur, bidons, pirogue (voir `CREDITS.md`). Les personnages auront deux versions : « vue » (calque 1)
et « vérité » brûlée (calque 2, visible seulement dans le rétroviseur).

## Rappels jam

- Garder un historique Git depuis le début : l'organisation peut demander l'historique de développement.
- Aucun compte, aucune pub, aucun paiement, aucun service externe pour démarrer.
- Déploiement : `npm i -g @opengamehq/cli`, `opengame setup`, `opengame login`, `opengame init`, puis `opengame check --build --json` et `opengame deploy --json`.

## Voix, bruitages et musique (ElevenLabs)

1. Copie `.env.example` en `.env` et mets ta clé : `ELEVENLABS_API_KEY=...` (le fichier `.env` n'est jamais poussé sur GitHub).
2. Double-clique `generer-voix.bat` (ou `node tools/voices/generate.mjs [lines|sfx|music] [--force]`).
3. Les fichiers arrivent dans `public/voices/lines/`, `public/sfx/` et `public/music/` ; le jeu les utilise tout seul.

- Répliques et distribution des voix : `src/story/lines.json` (champ `_voices` : nom de la voix dans « Mes voix » ElevenLabs).
- Bruitages : `tools/voices/sfx.json` (texte décrivant le son, durée, boucle).
- Sans ces fichiers, le jeu garde ses sons de secours (fragments de voix mélangés, sons synthétisés).

## Mise en scène (passe 5)

Prologue « The Road » (radio, appel à maman, le hibou dans le pare-brise, le pneu qui éclate), cartons d'actes, silhouette au bord de la route, chuchotements à la stèle et Ayaba qui surgit derrière, la place qui se lève, Mama Dossi qui rit dans ton dos, embuscade au zem, SMS de « H. », histoire de Kossi, battement de cœur et nappe sonore, fin de l'Acte 1 (les feux s'éteignent un à un), son d'horreur sur les clics. Espace pour passer une cinématique.

## Acte II — La station (passe 6)

Le calao guide (son grave en deux temps, il crie depuis la direction de ce qu'il reste à trouver). Scène de la souche de Loko (Dah Agossou parle), calebasse et kaolin (touche A en AZERTY / Q en QWERTY, 5 charges, recharge à l'asen), 5 fragments du secret photographiés dans la galerie du téléphone (2 au village, 3 à la station), 3 plantes du guérisseur, flashback jouable de la nuit du feu (au 3e fragment, par les yeux d'Ayaba), et la fin de l'acte : le chef Houngbo, l'éclair de vérité, minuit. Outil de test : `#test` expose `window.game`.

## Acte II, passe « waouh » (passe 7)

- **Le feu** (`src/world/Fire.ts`) : flammes animées par shader (bruit qui monte), braises, fumée, explosion (boule de feu déformée par le bruit, onde de choc, débris, champignon de fumée). Utilisé pour le feu de la place, les lampes, la station qui couve, et le flashback.
- **Nouveaux modèles Blender** : `az-lamp` (lampe tempête), `az-drum` (tam-tam), `az-barrels` (le dépôt de fûts), `az-throne` (siège du chef et parasol). `python3 tools/blender/azetin.py -- lamp drum barrels throne` puis `node tools/blender/pack-model.mjs az-lamp az-drum az-barrels az-throne`.
- **Le flashback en film** : la fête (danseurs, tambours, fanions, le chef sur son siège), Dah Agossou qui regarde les fûts, la lampe qui tombe, l'explosion ; puis la fuite jouable dans le village en flammes ; puis la rive, Dah Agossou qui retourne dans le feu, Ayaba qui tombe dans l'eau.
- **Les gens de cendre** à la station : ils avancent quand on ne les regarde pas ; le kaolin les renvoie.

## Acte III et le nouveau téléphone (passe 8)

- **Téléphone** (`src/ui/Phone.ts`) : vrai smartphone (îlot, barre d'état, widgets Horloge et Notes, icônes, dock, pastilles), apps Plans, Notes, Photos (vraies miniatures des fragments, plein écran), Messages (conversations), Téléphone (appels manqués), Mémos vocaux (réécouter le hibou et le calao), Sac, Azé-tin (les fins), Réglages (interrupteurs). Notifications en bannière (SMS de H., photo enregistrée…).
- **Fins vues** gardées d'une partie à l'autre (`src/ui/Endings.ts`), affichées dans le menu et le téléphone. Après une fin, la sauvegarde repart de zéro.
- **Acte III** : les cases s'allument, les Brûlés se lèvent un à un, l'horloge avance vers l'aube (5 h = Fin II). Trois choix : fuir en voiture (Fin I / II) ; brûler la maison du guérisseur pour Houngbo (Fin III : seconde explosion, « HAPPY » gravé sur la stèle) ; le rite à l'asen sous la station (3 plantes, 5 fragments, Marque ≤ 1) : combat contre Houngbo en 3 phases (vagues repoussées au kaolin ; Houngbo dans la fumée, visible seulement dans le rétroviseur ; le chant en 3 strophes avec les flèches pendant qu'il frappe) → Fin IV (âmes libérées, Houngbo jugé, adieu d'Ayaba, pousse d'iroko, appel à maman) et la scène « un an plus tard ».

## Passe 9 — tout dans le thème

- **Pistes de latérite** : texture faite par script (`tools/blender/roadtex.py` → `public/textures/road.png` : ornières, cailloux, fissures, flaques, bords d'herbe), tracés lissés en courbes et bombés, touffes d'herbe et flaques qui reflètent la lune.
- **Icônes rendues dans Blender** (`tools/blender/icons.py` → `public/ui/icon-*.png`) : carte, carnet, polaroïds, cassette, lettre cachetée, combiné, appareil photo, bourse de cuir, hibou sculpté, roue dentée, boule de kaolin, braise (repère d'objectif), flèche peinte au kaolin (chant du rite). Plus aucun pictogramme ni emoji standard.
- **Générique en « motion horror »** (`src/ui/Credits.ts`) après chaque fin : les noms naissent des braises, tressaillent, partent en cendre ; des yeux de hibou s'ouvrent dans le noir. Version blanc kaolin et or après la vraie fin.
- **Fin IV** : après l'adieu d'Ayaba et la pousse d'iroko, le village revient au grand jour — tout le monde danse autour du feu sous les fanions, Kossi sourit, Dah Agossou bénit la fête — puis tous s'effacent dans la lumière, et Happy appelle sa mère.

## Passe 10 — identité, performances, équilibrage

- **Logo** (`public/ui/logo.png`, au menu et sur l'app « Azé-tin » du téléphone), **favicon** (`favicon.ico/.png`, `apple-touch-icon.png`, `icon-192/512.png`, `manifest.webmanifest`), **vignette** `public/thumbnail.jpg` (1280×720, pour OpenGame) et **image de partage** `public/og-image.jpg` (1200×630, balises Open Graph / Twitter dans `index.html`).
- Téléphone : icônes modernes de smartphone ; l'app du jeu porte le logo.
- **Performances** : une réserve fixe de 8 lumières partagées par tous les feux et lueurs (plus aucune recompilation de shaders en cours de jeu), shaders compilés au chargement, qualité automatique (résolution, puis ombres) si l'ordinateur peine.
- **Combat** : Brûlés un peu moins rapides que Happy qui court, élan plus lisible, dégâts réduits, jamais plus de deux attaquants à la fois, visée plus tolérante. Les gens de cendre de la station peuvent être frappés (ils éclatent en cendre, reculent, et retombent en poussière au 3e coup).
