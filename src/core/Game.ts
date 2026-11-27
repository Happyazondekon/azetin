import * as THREE from 'three';
import { Input } from './Input';
import { Audio } from './Audio';
import { Player } from '../player/Player';
import { buildVillage, type World } from '../world/Village';
import { loadModels } from '../world/Assets';
import { Mirror } from '../mirror/Mirror';
import { Menu } from '../ui/Menu';
import { Phone } from '../ui/Phone';
import { Hud } from '../ui/Hud';
import { GameOver, type DeathCause } from '../ui/GameOver';
import { Enemies } from '../combat/Enemies';
import { Viewmodel, WEAPONS, type WeaponDef } from '../combat/Weapon';
import { Sparks } from '../combat/Sparks';
import type { Enemy } from '../combat/Enemies';
import { PLACES, STEPS, currentStep, setAyabaPos } from '../story/Places';
import { Director } from '../story/Director';
import { buildAct2Props, type Pickup } from '../world/Act2Props';
import type { FireHandle, Glow } from '../world/Fire';
import { instance, type ModelName, type Models } from '../world/Assets';
import { markEnding, endingsSeen } from '../ui/Endings';
import { Credits } from '../ui/Credits';
import { LAYER_SEEN, LAYER_TRUTH } from '../world/Village';
import LINES from '../story/lines.json';
import { tr, lang } from '../story/i18n';
import { Look, savedQuality, type Quality } from './Look';
import { buildPerson, randomLook, type Person } from '../world/People';
import { story, resetStory, loadGame, saveGame, hasSave, hasFlag, setFlag, clearSave } from '../story/State';

type Mode = 'menu' | 'playing' | 'paused' | 'dead' | 'cine';
type LineId = Exclude<keyof typeof LINES, '_voices'>;

interface Beat { d?: number; enter?: () => void; cam?: (t: number) => void; qte?: () => void }
interface RiteState { aborted: boolean; pillar: THREE.Mesh | null; plants: THREE.Object3D[]; foes: Person[]; glows: Glow[] }

interface Interactable {
  label: () => string | null; // null = rien à faire ici pour l'instant
  pos: THREE.Vector3;
  range: number;
  use: () => void;
  low?: boolean; // simple « regarder » : passe après les vraies actions
}

// braises et fumée autour d'Ayaba pendant la fuite
function w_embers(world: World, pos: THREE.Vector3): void {
  world.fx.burstEmbers(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6)), 6, 2, 1.5);
  if (Math.random() < 0.3) world.fx.emitSmoke(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.5, 2 + Math.random() * 4)), 2.5, 0.8, 5, 0x1c1612);
}

export class Game {
  private look!: Look;
  private rawLook = location.hash.includes('nolook'); // outil de test : l'image sans les effets
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 220);
  private last = performance.now();
  private input: Input;
  private audio = new Audio();
  private world!: World;
  private player!: Player;
  private ready = false;
  private audioReady = false;
  private mirror = new Mirror();
  private flash: THREE.SpotLight;
  private flashOn = true;
  private hud: Hud;
  private phone: Phone;
  private menu: Menu;
  private mode: Mode = 'menu';
  private time = 0;
  private nextOwl = 0;
  private interactables: Interactable[] = [];
  private enemies!: Enemies;
  private viewmodel: Viewmodel;
  private gameOver: GameOver;
  private attackCd = 0;
  private lastHurt = -99;
  private shake = 0;
  private owlQte: { t: number; ok: boolean } | null = null;
  private choice: { a: string; onA: () => void; b: string; onB: () => void } | null = null;
  private nextMurmur = 0;
  private fill!: THREE.SpotLight;
  private nearT = 0; private nearD = 8; private nearK = 1;
  // Viseur de l'appareil photo (maintenir V) : l'objectif voit ce que l'œil ne voit pas
  private lens = 0;                       // 0 = baissé, 1 = levé
  private lensTruth = false;
  private lensMask = 0;
  private lensEl!: HTMLDivElement;
  private lensT = 0;
  private traces: { pk: Pickup; group: THREE.Group }[] = [];
  private nearRay = new THREE.Ray(); private tmpA = new THREE.Vector3(); private tmpB = new THREE.Vector3(); private tmpC = new THREE.Vector3();
  private sparks: Sparks;
  private grab: { e: Enemy; presses: number; t: number } | null = null;
  private markerOn = true;
  private director!: Director;
  private models!: Models;
  private figure: Person | null = null;      // la silhouette au bord de la route
  private figureT = 0;
  private scareEl!: HTMLDivElement;
  private blackout = 0;                       // la torche se coupe une fraction de seconde
  private dossiLaughT = 0;
  private kossiAsking = false;
  private creditsOn = false;
  // ---- Acte II
  private pickups: Pickup[] = [];
  private hornbill!: THREE.Object3D;
  private houngbo: Person | null = null;
  private kaolinFx!: Sparks;
  private kaolinCd = 0;
  private nextHornbill = 0;
  private act2Pending = false;
  private fb: { t: number; ran: boolean; back: [number, number, number]; weapon: string | null; light: Glow; done: boolean } | null = null;
  private camFlashEl!: HTMLDivElement;
  // les gens de cendre de la station : ils avancent quand on ne les regarde pas
  private statues: { p: Person; home: THREE.Vector3; lastSeen: THREE.Vector3; cd: number; seen: boolean; hits?: number }[] = [];
  private statueScareT = 0;
  private exposure = 1.6;
  private lastStep = -1;
  private hereId = '';
  private readonly proj = new THREE.Vector3();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(this.renderer.domElement);
    this.look = new Look(this.renderer, this.scene, this.camera, savedQuality());

    // La caméra principale voit le décor (0) et l'apparence "vue" des personnages (1)
    // (outil de test : #truth dans l'adresse montre la « vérité », comme dans le rétroviseur)
    this.camera.layers.enable(location.hash.includes('truth') ? 2 : 1);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);

    // Le flash du smartphone : la seule lumière dynamique avec ombres
    this.flash = new THREE.SpotLight(0xfff1dc, 38, 30, 0.45, 0.55, 1.15);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.bias = -0.0006;
    // le flash est tenu devant la main : l'arme reste dans l'ombre, hors du faisceau
    this.flash.position.set(0.16, -0.1, -0.75);
    this.flash.target.position.set(0.05, -0.15, -2);
    this.camera.add(this.flash, this.flash.target);
    // halo large et doux autour du faisceau (une vraie torche éclaire aussi un peu à côté)
    this.fill = new THREE.SpotLight(0xfff1dc, 6, 16, 1.0, 1, 1.6);
    this.fill.position.copy(this.flash.position);
    this.fill.target = this.flash.target;
    this.camera.add(this.fill);

    this.viewmodel = new Viewmodel(this.camera);
    this.sparks = new Sparks(this.scene);
    this.hud = new Hud(root);
    this.director = new Director(root);
    this.scareEl = document.createElement('div');
    this.scareEl.className = 'scareflash';
    root.appendChild(this.scareEl);
    this.camFlashEl = document.createElement('div');
    this.lensEl = document.createElement('div');
    this.lensEl.className = 'lens';
    this.lensEl.innerHTML = '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="l-top"><span class="rec">● REC</span><span class="l-time">00:00</span></div><div class="l-bot"><span class="l-bat"></span><span class="l-zoom">1.4×</span></div><div class="l-cross"></div>';
    document.body.appendChild(this.lensEl);
    this.camFlashEl.className = 'camflash';
    root.appendChild(this.camFlashEl);
    // Un son d'horreur sur chaque bouton du jeu (menu, téléphone, écrans de fin)
    document.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('button, input, label');
      if (b) this.audio.ui((b as HTMLElement).matches('.ph-back, .ph-home') ? 'back' : 'click');
    }, true);
    let lastHover: Element | null = null;
    document.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b !== lastHover && this.audioReady) this.audio.ui('hover');
      lastHover = b;
    });
    this.gameOver = new GameOver(root, () => this.wake());
    this.phone = new Phone(root, {
      onResume: () => this.resume(),
      onQuit: () => this.quitToTitle(),
      onClose: () => this.togglePhone(),
      onPlay: (snd) => this.audio.sfx(snd, { gain: 0.9 }),
      onTorch: () => this.toggleTorch(true),
      torch: () => ({ on: this.flashOn, hint: !hasFlag('torchOn') && hasFlag('intro') }),
      onSensitivity: (v) => (this.player.sensitivity = v),
      onVolume: (v) => this.audio.setVolume(v),
      onBrightness: (v) => (this.renderer.toneMappingExposure = this.exposure = v),
      onMarker: (on) => (this.markerOn = on),
      onQuality: (q) => this.setQuality(q),
      quality: () => this.look.quality,
      where: () => ({ x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw, target: this.target() }),
    });
    this.phone.onViewerClose = () => this.afterViewer();
    this.menu = new Menu(root, { onNew: () => this.start(false), onContinue: () => this.start(true), onCredits: () => void this.menuCredits() }, hasSave());
    this.menu.setLoading('Searching for network… 0%');

    addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.phone.open) this.lock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.pause();
    });

    void this.init();
    if (location.hash.includes('test')) (window as unknown as { game: Game }).game = this; // outil de test automatique
  }

  // Chargement des modèles Blender, puis construction du village
  private async init(): Promise<void> {
    const models = await loadModels((d, t) => this.menu.setLoading(`Searching for network… ${Math.round((d / t) * 100)}%`));
    this.models = models;
    this.world = buildVillage(this.scene, models);
    this.setQuality(this.look.quality); // la taille de l'ombre de la lune suit la qualité choisie
    this.buildFigure();
    const a2 = buildAct2Props(this.scene, this.world.fx);
    this.pickups = a2.pickups;
    this.buildTraces();
    this.hornbill = a2.hornbill;
    this.kaolinFx = new Sparks(this.scene, 'kaolin');
    this.houngbo = buildPerson(models, { id: 'houngbo', sex: 'm', height: 1.93, skin: '#4a3224', top: 'robe', wax: ['#6a1a5a', '#c8a030', '#2a0e24'], shoe: 'babouche', shoeColor: ['#e0a526', '#7b2cbf'],
      pants: '#2a0e24', beard: true, azevi: true, pose: 'Idle_Talking_Loop', slow: 0.6 });
    if (this.houngbo) { this.houngbo.root.visible = false; this.scene.add(this.houngbo.root); }
    this.buildStatues();
    this.player = new Player(this.camera, this.world.colliders, this.world.bounds);
    this.enemies = new Enemies(this.scene, models, this.world.colliders, {
      onWindup: (e) => {
        this.audio.grunt(e.person.def.sex, true, 1, this.panOf(e.pos));
        this.shake = Math.max(this.shake, 0.08);
      },
      onHitPlayer: (dmg, e) => {
        this.audio.thud();
        this.audio.grunt('m', false, 0.6, 0);
        this.hurt(dmg, e.fromOwl ? 'owl' : this.enemies.near(this.player.pos, 6) >= 2 ? 'crowd' : 'default');
      },
      onGrab: (e) => {
        this.grab = { e, presses: 0, t: 2.2 };
        this.hud.setGrabbed(true);
        this.audio.grunt(e.person.def.sex, true, 1.2, 0);
        this.shake = 0.4;
        // une combinaison pour se dégager (le kaolin à la fin, si Happy a la calebasse)
        const end = () => { this.grab = null; this.hud.setGrabbed(false); };
        const n = hasFlag('act2') ? 4 : 3;
        this.startQte(n, 'GRABBED! BREAK FREE', 'Arrows or ZQSD / WASD', () => {
          end(); this.enemies.releaseGrab(e, true); this.line('happy_free', 2); this.sparks.burst(e.pos.clone().setY(1.3), 25);
        }, () => { end(); this.enemies.releaseGrab(e, false); }, { per: 1.25, kaolinAt: hasFlag('calabash') && story.kaolin > 0 ? n : undefined });
      },
    });
    const ay = this.world.people['ayaba'];
    if (ay) setAyabaPos(() => ({ x: ay.root.position.x, z: ay.root.position.z }));
    this.interactables = this.buildInteractables();
    this.ready = true;
    this.restartPrompt();
    // le son démarre au premier geste sur l'accueil (le navigateur l'exige) : la musique du menu se lance
    const unlock = () => { this.audio.start(); this.audioReady = true; };
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    // la touche du kaolin telle qu'elle est écrite sur le clavier du joueur (Q en QWERTY, A en AZERTY)
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((m) => { const k = m.get('KeyQ'); if (k) this.kaolinKey = k.toUpperCase(); }).catch(() => {});
    // compile les shaders tout de suite (pas de saccade la première fois qu'on voit un feu ou un personnage)
    const unboom = this.world.fx.prewarm();
    const zoo = this.materialZoo();
    // la garde-robe complète (toutes coiffures, tenues, chaussures) : compilée d'avance, comme le reste
    for (let i = 0; i < 12; i++) {
      const sex = i % 2 ? 'f' : 'm';
      const { elder: _e, ...look } = randomLook(`wardrobe${i}`, sex);
      const hairs = sex === 'm' ? ['short04', 'short02', 'afro01', 'braid01'] as const : ['braid01', 'afro01', 'bob02', 'long01', 'ponytail01', 'short04'] as const;
      const shoes = ['sandale', 'babouche', 'tapette', 'derby', 'basket'] as const;
      const tops = ['bomba', 'chemise', 'robe', 'haut'] as const;
      const p = buildPerson(models, { ...look, id: `wardrobe${i}`, hair: hairs[(i >> 1) % hairs.length], shoe: shoes[(i >> 1) % shoes.length], top: tops[(i >> 1) % tops.length], gele: i === 3, azevi: i % 3 === 0 });
      if (p) zoo.add(p.root);
    }
    this.scene.add(zoo);
    await this.warmup(this.scene);
    this.scene.remove(zoo);
    unboom();
    this.menu.setLoading(null);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- États ----------

  // Après « Start again » : un écran noir, un clic (le navigateur exige un geste pour le son) et la partie repart du début
  private restartPrompt(): void {
    let again = false;
    try { again = sessionStorage.getItem('azetin.restart') === '1'; sessionStorage.removeItem('azetin.restart'); } catch { /* rien */ }
    if (!again) return;
    const el = document.createElement('div');
    el.className = 'restart-veil';
    el.innerHTML = '<div><small>AZÉ-TIN IS WAITING</small>Click to begin again</div>';
    document.body.appendChild(el);
    el.addEventListener('click', () => { el.remove(); this.start(false); }, { once: true });
  }

  private start(fromSave: boolean): void {
    if (!this.ready) return;
    if (!(fromSave && loadGame())) resetStory();
    const p = story.pos;
    // Outil de test : …/index.html#at=x,z,orientation place Happy directement à un endroit du village
    const at = /^#at=(-?[\d.]+),(-?[\d.]+),?(-?[\d.]+)?/.exec(location.hash);
    if (at) this.player.place(Number(at[1]), Number(at[2]), Number(at[3] ?? 0));
    else if (p) this.player.place(p[0], p[1], p[2]);
    else this.player.place(this.world.points.spawn.x, this.world.points.spawn.z, 0);
    this.menu.hide();
    this.mode = 'playing';
    this.resetDanger();
    this.audio.start();
    this.audioReady = true;
    this.lock();
    if (!hasFlag('intro') && !at) {
      this.prologue();
      return;
    }
    this.nextOwl = this.time + (location.hash.includes('owl') ? 4 : hasFlag('trunk') ? 40 : 7);
    if (!fromSave || !hasFlag('intro')) {
      setFlag('intro');
      this.line('prologue_flat', 5);
      setTimeout(() => this.hud.objective(story.objective), 1200);
    }
  }

  // Remet à zéro les dangers (nouvelle partie, réveil après une mort)
  private resetDanger(): void {
    for (const e of this.enemies.list) this.scene.remove(e.person.root);
    this.enemies.list = [];
    this.owlQte = null;
    this.grab = null;
    this.stopQte();
    this.hud.setGrabbed(false);
    this.lastHurt = -99;
    story.souffle = Math.max(story.souffle, 60);
    this.viewmodel.equip(story.inventory.includes('Tire iron') ? 'Tire iron' : null);
  }

  private hurt(dmg: number, cause: DeathCause): void {
    if (this.mode !== 'playing') return;
    story.souffle -= dmg;
    this.lastHurt = this.time;
    this.shake = 0.35;
    if (story.souffle <= 0) this.die(cause);
  }

  private die(cause: DeathCause): void {
    this.mode = 'dead';
    this.resetRite();
    this.grab = null;
    this.stopQte();
    this.hud.setGrabbed(false);
    this.hud.hideAll();
    this.mirror.raised = 0;
    document.exitPointerLock();
    this.gameOver.show(cause);
  }

  // Après une mort : retour à la dernière sauvegarde (objectif ou 4×4)
  private wake(): void {
    this.gameOver.hide();
    if (!loadGame()) resetStory();
    story.souffle = 100;
    const p = story.pos;
    if (p) this.player.place(p[0], p[1], p[2]);
    else this.player.place(this.world.points.spawn.x, this.world.points.spawn.z, 0);
    this.mode = 'playing';
    this.resetDanger();
    this.nextOwl = this.time + 45;
    this.lock();
    this.line('happy_wake', 4);
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.hud.setPrompt(null);
    this.phone.show('pause');
    document.exitPointerLock();
  }

  private resume(): void {
    this.phone.hide();
    this.mode = 'playing';
    this.lock();
  }

  private quitToTitle(): void {
    this.save();
    this.phone.hide();
    this.hud.hideAll();
    this.mode = 'menu';
    document.exitPointerLock();
    this.menu.show(hasSave());
  }

  // La torche du téléphone : bouton de l'écran d'accueil, ou F en raccourci
  private toggleTorch(fromPhone: boolean): void {
    if (story.battery <= 5) { this.line('happy_flash_low', 4); return; }
    this.flashOn = !this.flashOn;
    this.audio.ui('click');
    if (this.flashOn && !hasFlag('torchOn')) {
      // première fois : la torche s'allume, le téléphone se range tout seul, et on apprend le raccourci
      setFlag('torchOn');
      if (fromPhone) setTimeout(() => { if (this.phone.open && this.mode === 'playing') this.togglePhone(); }, 900);
      setTimeout(() => this.hud.say('[Torch on. Press F to switch it on or off — it drains the battery.]', 6), 1300);
    }
  }

  private togglePhone(): void {
    if (this.mode !== 'playing') return;
    if (this.phone.viewerOpen) { this.phone.closeViewer(); return; }
    if (!this.phone.open && !hasFlag('phoneOpened')) setFlag('phoneOpened');
    if (this.phone.open) {
      this.phone.hide();
      this.lock();
    } else {
      this.phone.show('home'); // ouvert AVANT de libérer la souris : pas de pause
      document.exitPointerLock();
    }
  }

  private lock(): void {
    const el = this.renderer.domElement;
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { /* l'utilisateur cliquera sur l'écran */ });
    } catch { /* navigateur ancien */ }
  }

  private onLockChange(): void {
    const locked = document.pointerLockElement === this.renderer.domElement;
    // Échap libère la souris : on met en pause, sauf si c'est le téléphone qui l'a libérée
    if (!locked && this.mode === 'playing' && !this.phone.open && !this.gameOver.open) this.pause();
  }

  private save(): void {
    story.pos = [this.player.pos.x, this.player.pos.z, this.player.yaw];
    saveGame();
  }

  private advance(minutes: number): void {
    story.minutes += minutes;
  }

  private setObjective(text: string): void {
    story.objective = text;
    this.save();
  }

  // Cible du repère : l'étape en cours (ou le 4×4 quand la torche est morte)
  private target(): { x: number; z: number } | null {
    if (story.battery <= 5 && hasFlag('trunk')) return { x: 1.2, z: 68 };
    return currentStep().step.target();
  }

  // ---------- Interactions (prologue et début de l'Acte 1) ----------

  // Une réplique : sous-titre + voix (bruits de paroles à la hauteur de la voix du personnage)
  // Une réplique de lines.json : la voix ElevenLabs si elle a été générée, sinon les bruits de paroles
  private line(id: LineId, seconds = 6): void {
    const l = LINES[id];
    this.speak(l.who, l.text, seconds, id);
  }

  private speak(who: string, text: string, seconds = 6, id?: string): void {
    const shown = lang() === 'fr' ? ((id && (LINES as Record<string, { fr?: string }>)[id]?.fr) || tr(text)) : text;
    const p = this.world.people[who];
    const name = who === 'happy' ? 'Happy' : who === 'kossi' ? 'Kossi' : who === 'dossi' ? 'Mama Dossi' : who === 'ayaba' ? 'Ayaba' : who === 'radio' ? 'Radio' : who === 'agossou' ? 'Dah Agossou' : who === 'houngbo' ? 'Houngbo' : /^v\d/.test(who) ? 'A villager' : '';
    this.subtitles(name, shown, seconds);
    const d = p ? p.root.position.distanceTo(this.player.pos) : 0;
    const gain = who === 'happy' ? 1.1 : who === 'radio' ? 0.8 : Math.max(1.0, 1.6 - d / 25) * (p?.def.azevi ? 1.25 : 1);
    this.talkUntil = this.time + seconds; // la musique se baisse pendant qu'on parle
    const pan = p ? this.panOf(p.root.position) : 0;
    const fallback = () => {
      if (who === 'happy') this.audio.voiceMix(text, 'm', { gain: 0.55, rate: 1.04 });
      else if (who === 'radio') this.audio.voiceMix(text, 'm', { gain: 0.35, rate: 1.1 });
      else if (p) this.audio.voiceMix(text, p.def.child ? 'c' : p.def.sex, { gain, pan, ghost: p.def.azevi, rate: p.def.child ? 1.05 : 1 });
    };
    if (!id) return fallback();
    void this.audio.playLine(id, { gain, pan, ghost: !!p?.def.azevi, radio: who === 'radio' }).then((dur) => {
      if (!dur) fallback();
      else if (dur + 0.6 > seconds) this.subtitles(name, shown, dur + 0.6); // le sous-titre suit la durée de la voix
    });
  }

  // Sous-titres : une longue réplique défile phrase par phrase
  private subTimers: number[] = [];
  private subtitles(name: string, text: string, seconds: number): void {
    this.subTimers.forEach(clearTimeout);
    this.subTimers = [];
    const parts = text.length > 120 ? text.match(/[^.!?…]+[.!?…]+["”]?\s*|[^.!?…]+$/g) ?? [text] : [text];
    // regroupe les morceaux trop courts
    const chunks: string[] = [];
    for (const p of parts) {
      if (chunks.length && (chunks[chunks.length - 1].length + p.length) < 110) chunks[chunks.length - 1] += p;
      else chunks.push(p);
    }
    let t = 0;
    for (const c of chunks) {
      const len = (seconds * c.length) / text.length;
      this.subTimers.push(window.setTimeout(() => this.hud.say(name ? `${tr(name)}: ${c.trim()}` : c.trim(), len + 0.3), t * 1000));
      t += len;
    }
  }

  // Position gauche/droite d'un son par rapport au regard de Happy (−1 à 1)
  private panOf(at: THREE.Vector3): number {
    const d = this.v2.copy(at).sub(this.player.pos);
    d.y = 0;
    if (d.lengthSq() < 0.01) return 0;
    d.normalize();
    const f = this.player.forward(this.v1);
    return THREE.MathUtils.clamp(f.x * d.z - f.z * d.x, -1, 1); // > 0 : à droite
  }

  // Un choix à deux touches (E / R)
  // Kossi explique le rite : début de l'Acte III — Le guérisseur
  private tellRite(): void {
    setFlag('repaired');
    setFlag('riteTold');
    this.line('kossi_rite_explain', 12);
    this.advance(10);
    this.setObjective('ACT III — The healer. Gather the 3 plants, find the whole truth (5 fragments), then begin the rite at the asen under the station.');
  }

  private ask(a: string, onA: () => void, b: string, onB: () => void): void {
    this.choice = { a, onA, b, onB };
  }

  private gain(item: string, line: LineId, delay = 0): void {
    story.pieces += 1;
    story.inventory.push(item);
    if (delay) setTimeout(() => this.line(line, 5), delay);
    else this.line(line, 5);
    if (story.pieces === 2 && !hasFlag('msgH')) setTimeout(() => this.unknownMessage(), 9000);
    this.advance(15);
    if (hasFlag('act1')) return; // la batterie (Acte II) : la suite vient avec le chef, à minuit
    const left = [!hasFlag('tube') && 'an inner tube (the old moto-taxi, west)', !hasFlag('patch') && 'a patch kit (Mama Dossi’s stall)'].filter(Boolean);
    this.setObjective(left.length ? `Bring Kossi two parts (${story.pieces}/2). Still missing: ${left.join(', ')}.` : 'Look at Mama Dossi in your mirror, then bring the parts back to Kossi.');
  }

  private buildInteractables(): Interactable[] {
    const p = this.world.points;
    const ayaba = this.world.people['ayaba'];
    const ayabaPos = ayaba ? ayaba.root.position : new THREE.Vector3(-1.6, 0, 30.5);
    return [
      {
        pos: p.trunk, range: 2.2,
        label: () => (hasFlag('trunk') ? null : 'Search the trunk'),
        use: () => {
          setFlag('trunk');
          story.inventory.push('Tire iron', 'Car jack', 'Rear-view mirror');
          this.viewmodel.equip('Tire iron');
          this.line('trunk', 7);
          this.advance(15);
          this.setObjective('Walk to the village. Find a vulcanizer.');
        },
      },
      {
        pos: p.car, range: 3.4,
        label: () => (hasFlag('repaired') ? (hasFlag('riteTold') ? 'Your 4×4 is ready' : 'Drive away') : null),
        use: () => {
          if (!hasFlag('riteTold') && !hasFlag('carDoubt')) { setFlag('carDoubt'); this.line('happy_car_doubt', 5); }
          // E = rester (on ne part jamais par erreur en appuyant deux fois), R = partir
          this.ask('Not yet', () => this.line('happy_notyet', 3), 'Drive away and leave Azé-tin behind', () => this.ending());
        },
      },
      {
        pos: p.stele, range: 2.0,
        label: () => 'Read the stone',
        use: () => {
          this.hud.say('“TO OUR DEAD.” Dozens of names, carved by hand. All with the same date. Ten years ago.', 6);
          this.audio.sfx('whispers', { gain: 0.9 });
          if (!hasFlag('ayaba') && !hasFlag('steleScare') && ayaba) {
            setFlag('steleScare');
            setTimeout(() => {
              // elle est là, juste derrière
              const f = this.player.forward(this.v1);
              ayaba.root.position.set(this.player.pos.x - f.x * 1.5, 0, this.player.pos.z - f.z * 1.5);
              ayaba.root.rotation.y = Math.atan2(f.x, f.z);
              this.scare('stinger3', 0.5);
              this.line('ayaba_appear', 5);
            }, 4200);
          }
        },
      },
      {
        pos: ayabaPos, range: 2.4,
        label: () => (ayaba && ayaba.root.visible ? 'Talk to the girl' : null),
        use: () => {
          if (!hasFlag('ayaba')) {
            setFlag('ayaba');
            this.line('ayaba_1', 7);
            this.walk('ayaba', [new THREE.Vector3(-2.3, 0, 22), new THREE.Vector3(-3.4, 0, 14.5), new THREE.Vector3(-12.5, 0, 10.2)]);
            this.setObjective('Follow the girl to the vulcanizer’s workshop.');
          } else if (!hasFlag('sawDossi') && hasFlag('dossi')) {
            this.line('ayaba_mirror', 7);
          } else if (hasFlag('sawDossi') && !hasFlag('sawAyaba')) {
            this.line('ayaba_know', 7);
          } else {
            this.line((['ayaba_owl', 'ayaba_grandpa', 'ayaba_station'] as const)[Math.floor(this.time) % 3], 6);
          }
        },
      },
      {
        pos: p.kossi, range: 2.6,
        label: () => 'Talk to the vulcanizer',
        use: () => {
          if (!hasFlag('kossi')) {
            setFlag('kossi');
            this.line('kossi_1', 8);
            this.advance(20);
            this.setObjective('Bring Kossi two parts: an inner tube (the old moto-taxi, west) and a patch kit (Mama Dossi’s stall).');
          } else if (story.pieces >= 2 && !hasFlag('act1') && !hasFlag('sawDossi')) {
            this.line('kossi_nag', 4);
            this.hud.say('Kossi: Mama Dossi… did you really look at her? Turn your back to her and raise your mirror (right click).', 6);
          } else if (story.pieces >= 2 && !hasFlag('act1')) {
            setFlag('act1');
            story.inventory.push('Machete');
            this.viewmodel.equip('Machete');
            this.line('kossi_act1', 11);
            setTimeout(() => this.endOfAct1(), 11500);
            this.advance(30);
            this.setObjective('Act II — Bring power from the old fuel station (east of the village).');
          } else if (story.pieces >= 3 && !hasFlag('repaired')) {
            if (!hasFlag('act2')) {
              // avant minuit, Kossi garde la batterie : on ne quitte pas Azé-tin sans avoir vu ce que la nuit cache
              setFlag('batteryGiven');
              this.line('kossi_wait', 9);
              this.setObjective('Kossi will fix the car at midnight. Until then, follow the hornbill — learn what happened to Azé-tin.');
            } else {
              // à minuit : la voiture est prête… mais Kossi pose LA question
              if (this.kossiAsking || this.choice) return;
              this.kossiAsking = true;
              this.line('kossi_ask', 8);
              setTimeout(() => (this.kossiAsking = false), 7200);
              // E = la voie normale (le rite), R = partir
              setTimeout(() => this.ask('Tell me how to save Azé-tin.', () => this.tellRite(), 'Just fix my car. I’m leaving.', () => {
                setFlag('repaired');
                this.line('kossi_leave_ok', 5);
                this.advance(20);
                this.setObjective('Your 4×4 is fixed. Drive away before dawn… if you can live with it.');
              }), 7000);
            }
          } else {
            if (hasFlag('repaired') && !hasFlag('riteTold')) {
              // il n'est pas trop tard pour changer d'avis
              this.line('kossi_why', 4);
              setTimeout(() => this.ask('Tell me how to save Azé-tin.', () => this.tellRite(), 'Nothing. Goodbye.', () => {}), 4200);
            } else if (hasFlag('repaired')) this.line('kossi_why', 4);
            else if (story.pieces >= 1 && !hasFlag('kossiStory')) {
              setFlag('kossiStory');
              this.line('kossi_story', 14); // l'histoire du feu, racontée à voix basse
              this.world.flameScale[0] = 0.5;
              setTimeout(() => (this.world.flameScale[0] = 1), 9000);
            } else this.line('kossi_nag', 5);
          }
        },
      },
      {
        pos: p.zem, range: 2.6,
        label: () => (hasFlag('tube') ? null : 'Search the abandoned moto-taxi'),
        use: () => {
          if (!hasFlag('kossi')) {
            this.hud.say('An abandoned moto-taxi. Its plate is melted. Someone left in a hurry… ten years ago.', 6);
            return;
          }
          setFlag('tube');
          this.gain('Inner tube', 'happy_tube');
          this.ambush();
        },
      },
      {
        pos: p.dossi, range: 2.6,
        label: () => 'Talk to the woman at the stall',
        use: () => {
          if (!hasFlag('dossi')) {
            setFlag('dossi');
            this.line('dossi_1', 7);
            // E = refuser (la voie sûre), R = manger : on ne mange jamais chez les morts
            this.ask('Politely refuse', () => {
              this.line('dossi_refuse', 6);
              setFlag('patch');
              this.gain('Patch kit', 'happy_patch', 5500);
            }, 'Eat the akassa', () => this.akassaEnding());
          } else if (!hasFlag('sawDossi')) {
            this.line('dossi_stare', 4);
          } else {
            this.line('dossi_know', 6);
          }
        },
      },
      {
        pos: p.generator, range: 2.4,
        label: () => (!hasFlag('act1') || hasFlag('power') ? (hasFlag('power') ? null : 'Look at the generator')
          : this.stationDone() ? 'Take the generator battery' : 'Look at the generator'),
        use: () => {
          if (!hasFlag('act1') || !this.stationDone()) {
            this.hud.say(hasFlag('act1') ? 'An old generator. Its battery still holds a charge… Search the ruins first: the truth is in the ashes.'
              : 'An old generator, black with soot. Kossi will tell you what he needs.', 5);
            return;
          }
          setFlag('power');
          this.gain('Battery', 'happy_battery');
          this.audio.sfx('generator', { pan: this.panOf(p.generator) });
          // le bruit réveille le village : deux Brûlés rôdent autour de la station
          this.audio.sfx('owl', { pan: this.panOf(p.station) });
          this.enemies.spawn(new THREE.Vector3(30, 0, 6), false, 'stalk');
          this.enemies.spawn(new THREE.Vector3(46, 0, 4), false, 'stalk');
          this.hud.say('[Something stirs among the ruins]', 4);
          setFlag('awake'); // le moteur a réveillé Houngbo
        },
      },
      // ---- Acte II : la souche de Loko, la calebasse, l'asen, les fragments et les plantes
      {
        pos: new THREE.Vector3(0, 0, -17.6), range: 2.8,
        label: () => (hasFlag('act1') && !hasFlag('agossou') ? 'Touch the stump of Loko' : null),
        use: () => this.stumpScene(),
      },
      {
        pos: new THREE.Vector3(-4.6, 0, -29.2), range: 2.4,
        label: () => (hasFlag('calabash') && story.kaolin < 5 ? 'Fill the calabash with kaolin at the asen' : null),
        use: () => { story.kaolin = 5; this.audio.sfx('kaolin', { gain: 0.5 }); this.hud.say('The calabash is full of white earth again. (5/5)', 3); this.save(); },
      },
      // ---- Acte III : le marché de Houngbo, et le rite à l'asen enfoui sous la station
      {
        pos: new THREE.Vector3(-6, 0, -30.4), range: 2.4,
        label: () => (hasFlag('act2') && !hasFlag('ended') && !this.rite ? 'Burn the healer’s house (Houngbo’s deal)' : null),
        use: () => this.burnHouse(),
      },
      {
        pos: new THREE.Vector3(38.6, 0, -5.0), range: 2.6,
        label: () => (!hasFlag('act2') || hasFlag('ended') || this.rite ? null
          : hasFlag('riteTold') && !this.riteMissing() ? 'Begin the rite at the asen' : 'Look at the asen'),
        use: () => {
          if (!hasFlag('riteTold')) { this.hud.say('An altar of the ancestors, buried under the station for ten years. Only Kossi knows what it is for.', 5); return; }
          this.startRite();
        },
      },
      ...this.examinables(),
      ...this.pickups.map((pk): Interactable => ({
        pos: pk.pos.clone().setY(0), range: pk.kind === 'plant' && pk.id === 'flower' ? 3.2 : 2.2,
        label: () => (pk.obj.visible ? (pk.kind === 'fragment' ? `Photograph: ${pk.name}` : pk.kind === 'plant' ? `Pick the ${pk.name.toLowerCase()}` : `Take ${pk.name}`) : null),
        use: () => this.collect(pk),
      })),
    ];
  }

  // ---- Presque tout se regarde : les cases, les objets, les gens de cendre, les villageois (qui répondent)
  private examinables(): Interactable[] {
    const V = THREE.Vector3;
    const look = (x: number, z: number, label: string | (() => string | null), text: string | (() => string), range = 2.4, sfx?: string): Interactable => ({
      pos: new V(x, 0, z), range, low: true,
      label: typeof label === 'string' ? () => label : label,
      use: () => { this.hud.say(typeof text === 'string' ? text : text(), 6); if (sfx) this.audio.sfx(sfx, { gain: 0.5 }); },
    });
    const pick = <T,>(a: readonly T[], seed: number) => a[Math.abs(Math.floor(seed)) % a.length];
    const TXT = {
      burnt: ['A burnt hut. Inside: a mat, a cooking pot, plastic sandals. Nobody took anything.',
        'The door frame is charred black. On the wall, a calendar — ten years old, still on the same month.',
        'A school bag hangs on a nail. The notebooks inside turn to ash when you touch them.',
        'Soot everywhere. A radio on the floor, melted into the shape of a hand.',
        'The roof fell in long ago. In the corner, a small shrine still holds fresh kola nuts.',
        'A row of enamel bowls, laid out for a meal. Each one holds a little grey ash.'],
      thatch: ['A thatched hut, intact. Too intact. The palm leaves smell of smoke all the same.',
        'Through the door: a lamp, a bed, a wedding photo. Every face in the photo is scratched out.',
        'Someone swept this floor today. Footprints lead in — none lead out.'],
      tin: ['A tin-roofed house. The metal still ticks, as if it cooled down a minute ago.',
        'A TV with a cracked screen, a plastic chair facing it. The chair is warm.'],
    };
    const huts: [string, number, number, number, number][] = [
      ['burnt', -8, -7, 0, 3.5], ['burnt', 14, -11, 0.2, 3.5], ['thatch', -23, -6, 0.1, 3.5], ['tin', 20, 14, -0.15, 4], ['burnt', -12, 18, 0.3, 3.5],
      ['thatch', 7, 21, 0, 3.5], ['burnt', 24, -23, -0.4, 3.5], ['chief', -27, -22, 0.25, 5.2], ['burnt', 12, -33, 0, 3.5], ['burnt', -19, -38, 0.5, 3.5],
      ['thatch', 28, 4, -0.6, 3.5], ['tin', 31, 22, 0.4, 4], ['thatch', -33, 6, 0.2, 3.5],
    ];
    const list: Interactable[] = huts.map(([kind, x, z, ry, d], i) => {
      const k = d / 2 + 0.7;
      const text = kind === 'chief' ? 'Chief Houngbo’s house. The biggest in Azé-tin — and the only one with a padlock. On the outside.'
        : pick(TXT[kind as keyof typeof TXT], i * 7 + x);
      return look(x + Math.sin(ry) * k, z + Math.cos(ry) * k, kind === 'chief' ? 'Look at the chief’s house' : 'Look inside the hut', text, 2.6);
    });
    const p = this.world.points;
    list.push(
      look(p.car.x - 1.6, p.car.z - 1.2, () => (hasFlag('repaired') ? null : 'Look at your 4×4'),
        () => (hasFlag('trunk') ? 'The front tyre is shredded down to the rim. No network. Stay close to the car and your phone charges.' : 'Your rental 4×4. Flat tyre, no network. The trunk is at the back.'), 2.4),
      look(3.6, 63.2, 'Read the burnt sign', 'AZÉ-TIN. The paint has bubbled in the heat. Underneath, someone wrote in charcoal: DO NOT EAT.', 2.4),
      look(-19.5, 9.6, 'Look at the tyres', 'Kossi’s tyres, stacked to the roof. Some of them are older than you.'),
      look(-11.8, 7.2, 'Look at the barrel', 'A barrel of kpayo — smuggled petrol. It smells like the station.'),
      look(11.6, 6.6, 'Look at the gas bottle', 'A gas bottle. Mama Dossi cooks with it… but every pot on her stall is cold.'),
      look(0, 11.2, 'Warm your hands', 'The fire burns, but gives no warmth. Nobody adds wood. It never goes out.', 2.2, 'whispers'),
      look(-27, -15.6, 'Look at the lamp', 'A storm lamp at the chief’s door. Its glass is clean — the only clean thing in Azé-tin.'),
      look(0, -17.4, () => (hasFlag('act1') && !hasFlag('agossou') ? null : 'Look at the stump'),
        () => (hasFlag('agossou') ? 'The stump of Loko. Since the hornbill landed on it, the wood feels… warm.' : 'The stump of an enormous tree. The cut is clean — a chainsaw, not lightning.'), 3),
      look(-6, -28.6, () => (hasFlag('act2') && !hasFlag('ended') ? null : 'Look at the healer’s house'),
        'Dah Agossou’s house. The door is open. Herbs hang drying from the beams — still green, ten years later.', 2.6),
      look(-4.6, -28.9, () => (hasFlag('calabash') && story.kaolin < 5 ? null : 'Look at the small asen'),
        'The healer’s asen, a little iron altar. White earth — kaolin — is heaped at its foot.', 2.2),
      look(41.6, -6.4, 'Look at the cashier’s hut', 'The station’s cashier hut, burnt to the frame. Jerrycans, hundreds of them, melted together.', 2.6),
      look(32.5, -6, 'Look at the pumps', 'Two fuel pumps, split open by the heat. The counters stopped at the same number.', 2.6),
      look(0, -44, 'Look at the lagoon', 'The lagoon is perfectly still. In the water, the village is full of lights… and people dancing.', 3.2, 'whispers'),
      look(-30, 13.2, () => (hasFlag('tube') ? 'Look at the moto-taxi' : null), 'The moto-taxi, without its inner tube now. The key is still in the ignition.', 2.4),
    );
    // les gens de cendre (Acte II)
    this.statues.forEach((st, i) => list.push({
      pos: st.p.root.position, range: 2.2, low: true,
      label: () => (st.p.root.visible ? 'Look at the figure of ash' : null),
      use: () => this.hud.say(pick(['A man of ash, caught mid-step. One hand still reaches for the road.',
        'She shields a child that is not there anymore. The ash is warm.',
        'Its face is turned towards the station. Its mouth is open, as if it were still shouting.'], i), 5),
    }));
    // les villageois : ils répondent, d'une voix qui vient de loin
    const SAY = ['Welcome, stranger. Sit by the fire. Nobody is in a hurry here.', 'Have you eaten? Mama Dossi’s akassa is still hot.',
      'The chief says the road is closed. The road is always closed.', 'Don’t go to the station at night. …It is always night.',
      'My children are sleeping. They sleep so well now.', 'The hornbill? It only cries for the living.',
      'Ten years? No… the feast was yesterday.', 'You smell of petrol. Like him.'];
    for (const [id, person] of Object.entries(this.world.people)) {
      if (!/^v\d/.test(id)) continue;
      let n = Number(id.slice(1));
      list.push({
        pos: person.root.position, range: 2.3,
        label: () => (this.world.people[id] === person && person.root.visible && !hasFlag('ended') ? 'Speak to the villager' : null),
        use: () => {
          const r0 = person.root.rotation.y;
          person.root.rotation.y = Math.atan2(this.player.pos.x - person.root.position.x, this.player.pos.z - person.root.position.z);
          const sitting = person.def.pose && person.def.pose !== 'Idle_Loop';
          if (!sitting) person.play('Idle_Talking_Loop', 0.3);
          this.speak(id, hasFlag('act2') ? pick(['Midnight… you should have eaten.', 'He is coming for you. He comes for all of us.', 'Run to your car. Or sing. One or the other.'], n) : SAY[n % SAY.length], 5);
          n += 3;
          setTimeout(() => { if (this.world.people[id] === person) { person.root.rotation.y = r0; if (!sitting) person.play(person.def.pose ?? 'Idle_Loop', 0.6); } }, 6000);
        },
      });
    }
    return list;
  }

  // ---------- Mise en scène et frayeurs ----------

  // Un « jump scare » : son, voile rouge, secousse, la torche se coupe un instant
  private scare(sfx: string, k = 1): void {
    this.audio.sfx(sfx, { gain: k });
    this.scareEl.classList.add('on');
    setTimeout(() => this.scareEl.classList.remove('on'), 160 + 140 * k);
    this.shake = Math.max(this.shake, 0.3 * k);
    this.blackout = 0.12 + 0.2 * k;
  }

  // PROLOGUE — LA ROUTE : radio, appel à maman, le hibou dans le pare-brise, le pneu éclate
  private prologue(): void {
    const car = this.world.car;
    this.mode = 'cine';
    this.viewmodel.equip(null);
    const home = car ? { p: car.position.clone(), r: car.rotation.y } : null;
    const V = THREE.Vector3;
    const eye = new V(1.9, 2.3, -6.8), ahead = new V(0, 1.1, 7); // caméra de poursuite, derrière le 4×4
    // le hibou : un corps sombre, deux ailes, deux yeux qui brillent dans les phares
    const owl = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
    owl.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark));
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.2), dark);
      w.position.x = sx * 0.3;
      w.name = 'wing';
      owl.add(w);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
      e.position.set(sx * 0.05, 0.05, 0.14);
      owl.add(e);
    }
    owl.visible = false;
    car?.add(owl);
    const ev = { radioAt: 1.2, callAt: 13, owlAt: 19, fired: new Set<string>() };
    const once = (k: string, t: number, f: () => void, now: number) => { if (now >= t && !ev.fired.has(k)) { ev.fired.add(k); f(); } };
    let done = false;
    this.director.fadeTo(1, 0);
    this.director.fadeTo(0, 2.5);
    this.director.title('THE ROAD', 'PROLOGUE', 4.5);
    this.world.hazardsOn = false;
    this.audio.loop('car_drive', 0.5);
    this.audio.loop('radio', 0.12);
    const scene = {
      duration: 999,
      update: (t: number) => {
        once('radio', ev.radioAt, () => {
          this.line('radio_news', 14);
          void this.audio.playLine('radio_news', { gain: 0 }).then((d) => { if (d) { ev.callAt = ev.radioAt + d + 0.8; ev.owlAt = ev.callAt + 6; } });
        }, t);
        once('static', ev.callAt - 0.8, () => { this.audio.loop('radio', 0.35); setTimeout(() => this.audio.loop('radio', 0), 700); this.hud.say('[The radio loses the station]', 2); }, t);
        once('call', ev.callAt, () => {
          this.line('prologue_call', 7);
          void this.audio.playLine('prologue_call', { gain: 0 }).then((d) => { if (d) ev.owlAt = ev.callAt + d - 0.9; });
        }, t);
        // le 4×4 avance sur la piste, en cahotant
        if (car && home) {
          const k = Math.min(1, t / ev.owlAt);
          let z = home.p.z + 28 * (1 - k) + 3.3;
          let r = home.r;
          if (t > ev.owlAt) {
            const u = Math.min(1, (t - ev.owlAt) / 1.6);
            z = home.p.z + 3.3 * (1 - u * (2 - u));
            r = home.r + Math.sin(u * Math.PI) * 0.25;
          }
          car.position.set(home.p.x, home.p.y + (t < ev.owlAt ? Math.sin(t * 7.3) * 0.015 + Math.sin(t * 2.1) * 0.02 : 0), z);
          car.rotation.y = r;
          car.updateMatrixWorld();
          this.camera.position.copy(car.localToWorld(this.v1.copy(eye)));
          this.camera.lookAt(car.localToWorld(this.v2.copy(ahead)));
          if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - 1 / 60);
            this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.2;
            this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.2;
          }
          // le hibou surgit des ténèbres, droit sur le pare-brise
          const o = (t - (ev.owlAt - 0.9)) / 0.9;
          owl.visible = o > 0 && o < 1;
          if (owl.visible) {
            owl.position.set(0.3 + Math.sin(o * 9) * 0.2, 1.75 - o * 0.25, 14 - o * 12.2);
            owl.children.forEach((c) => { if (c.name === 'wing') c.rotation.z = Math.sin(t * 30) * 0.6 * Math.sign(c.position.x); });
          }
        }
        once('owl', ev.owlAt, () => { this.scare('owl_impact', 1.2); this.audio.sfx('owl', { gain: 1.2 }); this.hud.say('', 0.1); }, t);
        once('tire', ev.owlAt + 0.45, () => { this.world.hazardsOn = true; this.audio.sfx('tire_burst'); this.shake = 0.5; this.audio.loop('car_drive', 0); }, t);
        once('fade', ev.owlAt + 2.6, () => this.director.fadeTo(1, 1.2), t);
        if (t > ev.owlAt + 4.2) scene.duration = 0;
      },
      end: () => {
        if (done) return;
        done = true;
        car?.remove(owl);
        this.world.hazardsOn = true;
        if (car && home) { car.position.copy(home.p); car.rotation.y = home.r; }
        this.audio.loop('car_drive', 0);
        this.audio.loop('radio', 0);
        this.player.place(this.world.points.spawn.x, this.world.points.spawn.z, 0);
        this.mode = 'playing';
        this.resetDanger();
        this.director.fadeTo(0, 2);
        this.director.title('THE VILLAGE THAT SLEEPS', 'ACT I', 4.5);
        setFlag('intro');
        // noir complet : le joueur découvre son smartphone, d'abord la torche
        this.flashOn = false;
        setTimeout(() => { this.line('prologue_flat', 5); }, 1800);
        setTimeout(() => this.hud.say('[Pitch dark. You can’t see your own hands. Take out your phone — press Tab.]', 6), 6500);
        this.nextOwl = this.time + 40;
        this.save();
      },
    };
    this.director.play(scene);
  }

  // Fin de l'Acte 1 : les feux du village s'éteignent un à un ; les hiboux crient
  private endOfAct1(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'cine';
    this.hud.setPrompt(null);
    const from = this.player.yaw;
    const fire = this.world.fires[0];
    const want = Math.atan2(-(fire.x - this.player.pos.x), -(fire.z - this.player.pos.z));
    let done = false;
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    const out = (i: number) => { const f0 = this.world.flameScale[i]; let k = 0; const id = setInterval(() => { k += 0.1; this.world.flameScale[i] = Math.max(i === 0 ? 0.22 : 0, f0 * (1 - k)); if (k >= 1) clearInterval(id); }, 60); this.audio.sfx('ember', { gain: 0.6 }); };
    this.director.play({
      duration: 13,
      update: (t) => {
        let d = want - from;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const yaw = from + d * Math.min(1, t / 3) ;
        this.camera.position.set(this.player.pos.x, 1.6 + Math.min(1, t / 6) * 0.25, this.player.pos.z);
        this.camera.rotation.set(-0.06, yaw, 0, 'YXZ');
        at('f0', 2, t, () => { out(0); this.audio.sfx('owl', { pan: -0.7 }); });
        at('f1', 4.5, t, () => { out(1); this.audio.sfx('owl', { pan: 0.8, rate: 0.9 }); });
        at('f2', 6.5, t, () => { out(2); this.audio.sfx('laugh', { gain: 0.5, pan: 0.6 }); });
        at('wh', 8, t, () => this.audio.sfx('whispers', { gain: 1 }));
        at('tt', 8.5, t, () => this.director.title('THE STATION', 'ACT II', 4.5));
      },
      end: () => {
        if (done) return;
        done = true;
        this.world.flameScale = [0.22, 0, 0];
        this.mode = 'playing';
        this.player.place(this.player.pos.x, this.player.pos.z, want);
        this.startAct2();
      },
    });
  }

  // Embuscade : à peine la chambre à air prise, des pas courent derrière Happy
  private ambush(): void {
    setTimeout(() => {
      if (this.mode !== 'playing') return;
      this.audio.sfx('footsteps', { gain: 1 });
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        const behind = this.player.forward(this.v2).multiplyScalar(-6).add(this.player.pos);
        this.enemies.spawn(behind, false, 'chase');
        this.scare('stinger2', 0.8);
        this.line('happy_behind', 2);
      }, 1600);
    }, 3200);
  }

  // Un SMS d'un numéro inconnu… signé « H. » (Houngbo, le chef mort)
  private unknownMessage(): void {
    if (hasFlag('msgH')) return;
    setFlag('msgH');
    this.audio.sfx('phone_buzz');
    this.phone.notify('messages', 'Unknown', 'Welcome to Azé-tin… Stay for dinner. — H.', 7);
  }

  // La silhouette au bord de la route : elle regarde le 4×4, puis disparaît quand la torche clignote
  private buildFigure(): void {
    const f = buildPerson(this.models, { id: 'figure', sex: 'm', height: 1.86, skin: '#3a2a20', top: 'bomba', wax: ['#2b1d16', '#3d2a1c', '#160f0b'],
      pants: '#1a1612', azevi: true, pose: 'Idle_Loop', slow: 0.05 });
    if (!f) return;
    f.root.position.set(6.2, 0, 50.5);
    f.root.rotation.y = Math.atan2(1.2 - 6.2, 68 - 50.5);
    this.scene.add(f.root);
    this.figure = f;
  }

  // Les « temps forts » de l'Acte 1, déclenchés par la position de Happy
  private beats(dt: number): void {
    const pos = this.player.pos;
    const w = this.world;
    if (this.fb) { this.updateFlashback(dt); return; }
    this.act2Beats(dt);
    this.act3Beats(dt);
    // 1) La silhouette sur la route
    const fig = this.figure;
    if (fig) {
      fig.update(dt);
      const show = hasFlag('trunk') && !hasFlag('figure');
      fig.root.visible = show;
      if (show) {
        const d = Math.hypot(fig.root.position.x - pos.x, fig.root.position.z - pos.z);
        const f = this.player.forward(this.v1);
        const look = ((fig.root.position.x - pos.x) * f.x + (fig.root.position.z - pos.z) * f.z) / Math.max(d, 0.01);
        if (d < 16 && look > 0.8) this.figureT += dt;
        if (this.figureT > 0.6 && !hasFlag('figCall')) { setFlag('figCall'); this.line('road_call', 4); }
        if (d < 7 || this.figureT > 4.5) {
          setFlag('figure');
          this.scare('stinger3', 0.6);
          setTimeout(() => this.line('road_gone', 4), 1200);
        }
      }
    }
    // 2) La place : tous les Azévi se lèvent et fixent Happy
    if (hasFlag('kossi') && !hasFlag('plaza') && Math.hypot(pos.x - w.fires[0].x, pos.z - w.fires[0].z) < 6.5) {
      setFlag('plaza');
      for (const [id, p] of Object.entries(w.people)) {
        if (!p.def.azevi || id === 'dossi') continue;
        if (Math.hypot(p.root.position.x - pos.x, p.root.position.z - pos.z) < 12) p.play('Idle_Loop', 0.6);
      }
      this.audio.sfx('stinger2', { gain: 0.5 });
      w.flameScale[0] = 0.4;
      setTimeout(() => (w.flameScale[0] = hasFlag('act1') ? 0.22 : 1), 2500);
      setTimeout(() => this.line('happy_plaza', 3), 900);
    }
    // 3) Mama Dossi rit dans ton dos, sa lampe s'étouffe
    const dossi = w.people['dossi'];
    if (dossi && hasFlag('dossi') && !hasFlag('dossiLaugh')) {
      const d = dossi.root.position.distanceTo(pos);
      if (d > 6 && d < 10) {
        this.dossiLaughT += dt;
        if (this.dossiLaughT > 0.5) {
          setFlag('dossiLaugh');
          this.audio.sfx('laugh', { gain: 0.8, pan: this.panOf(dossi.root.position) });
          const keep = w.flameScale[2];
          w.flameScale[2] = 0;
          setTimeout(() => (w.flameScale[2] = keep), 1400);
        }
      }
    }
    // 4) Ambiance : nuit, feu, nappe sourde qui monte, battement de cœur quand ils approchent
    this.audio.loop('night', 0.5);
    const fireD = Math.hypot(pos.x - w.fires[0].x, pos.z - w.fires[0].z);
    this.audio.loop('fire', w.flameScale[0] * Math.max(0, 1 - fireD / 12) * 0.7);
    this.audio.loop('drone', 0.12 + story.pieces * 0.06 + (hasFlag('act1') ? 0.1 : 0));
    // la musique d'Azé-tin tourne pendant tout le jeu (baissée quand quelqu'un parle, coupée pendant le rite et le souvenir)
    const talk = this.time < this.talkUntil ? 0.45 : 1;
    const music = hasFlag('ended') || this.rite || this.fb ? 0 : (hasFlag('act2') ? 0.85 : 0.7) * talk;
    this.audio.loop('ingame', music, 'music/theme.mp3');
    this.audio.loop('nightmusic', 0, 'music/night.mp3');
    let close = 99;
    for (const e of this.enemies.list) close = Math.min(close, e.pos.distanceTo(pos));
    const heart = Math.max(close < 14 ? 1 - close / 14 : 0, story.souffle < 50 ? (50 - story.souffle) / 50 : 0);
    this.audio.loop('heartbeat', heart * 0.9);
    this.audio.loop('tension', close < 14 && !this.fb ? 0.45 : 0, 'music/tension.mp3');
  }

  // ================================================================ ACTE II — LA STATION

  private startAct2(): void {
    // Ayaba part vers la souche de Loko ; un calao crie pour la première fois
    this.walk('ayaba', [new THREE.Vector3(-3.5, 0, 10.5), new THREE.Vector3(0.5, 0, 5), new THREE.Vector3(3.5, 0, -3), new THREE.Vector3(2.4, 0, -15.8)]);
    this.setObjective('Act II — The station. Follow the hornbill: Ayaba went to the stump of the sacred iroko, north of the square.');
    setTimeout(() => {
      if (this.mode !== 'playing') return;
      this.audio.sfx('hornbill', { pan: this.panOf(new THREE.Vector3(0, 0, -20)), gain: 1 });
      setTimeout(() => this.line('happy_hornbill', 5), 2200);
    }, 6000);
    this.nextHornbill = this.time + 50;
  }

  // Le calao guide : il crie depuis la direction de ce qu'il reste à trouver
  private act2Beats(dt: number): void {
    // les objets de l'Acte II n'apparaissent qu'après l'Acte I, et disparaissent une fois ramassés (aussi après un chargement)
    for (const pk of this.pickups) {
      const taken = hasFlag(pk.kind === 'fragment' ? 'frag_' + pk.id : pk.kind === 'plant' ? 'plant_' + pk.id : 'calabash');
      pk.obj.visible = this.pickupOpen(pk) && !taken;
      pk.glow.intensity = pk.obj.visible ? 1.4 : 0;
    }
    if (hasFlag('calabash') && hasFlag('sawDossi') && !hasFlag('traceHint') && this.mode === 'playing' && !this.fb) {
      setFlag('traceHint');
      setTimeout(() => this.hud.say('Through the camera (hold V), white prints glow in the dust. Someone walked to every piece of the truth.', 7), 6000);
    }
    if (hasFlag('agossou') && !this.hornbill.visible && this.mode === 'playing') {
      this.spiritLight();
      this.hornbill.position.set(0.2, 2.1, -20.4);
      this.hornbill.rotation.y = Math.PI * 0.85;
      this.hornbill.visible = true;
    }
    if (!hasFlag('act1')) { for (const st of this.statues) st.p.root.visible = false; return; }
    this.updateStatues(dt);
    if ((!hasFlag('act2') || hasFlag('riteTold')) && this.time > this.nextHornbill) {
      this.nextHornbill = this.time + 40 + Math.random() * 25;
      const t = this.target();
      const left = this.pickups.find((p) => p.obj.visible);
      const at = t ? new THREE.Vector3(t.x, 0, t.z) : left ? left.pos : null;
      if (at) {
        this.audio.sfx(at.distanceTo(this.player.pos) > 25 ? 'hornbill_far' : 'hornbill', { pan: this.panOf(at) });
        if (!hasFlag('hornbillHint')) { setFlag('hornbillHint'); this.hud.say('[The hornbill calls — low, twice. It comes from where you need to go.]', 5); }
      }
    }
    // Fin de l'Acte II : la batterie, la calebasse et 3 fragments du secret
    if (!hasFlag('act2') && !this.act2Pending && hasFlag('power') && hasFlag('calabash') && story.secret >= 3 && !this.grab) {
      this.act2Pending = true;
      setTimeout(() => this.houngboScene(), 4000);
    }
  }

  // ---- Les gens de cendre : figés dans la pose où le feu les a pris
  private buildStatues(): void {
    const spots: [number, number, number, string][] = [[35.2, -11.2, 0.4, 'Crouch_Idle_Loop'], [43.6, -0.6, 2.6, 'Idle_Loop'], [45.2, -7.4, -1.9, 'Death01'], [30.6, -6.8, 1.2, 'Crouch_Idle_Loop'], [39.8, -12.4, 0.1, 'Idle_Loop']];
    spots.forEach(([x, z, ry, pose], i) => {
      const p = buildPerson(this.models, { id: 'ash' + i, sex: i % 2 ? 'f' : 'm', height: 1.62 + (i % 3) * 0.08, skin: '#1a1410', top: i % 2 ? 'robe' : 'bomba',
        wax: ['#1a1410', '#221a14', '#100c0a'], pants: '#100c0a', azevi: true, truth: 'burnt', pose: 'Idle_Loop' });
      if (!p) return;
      // on ne voit que leur vérité : des corps de cendre, partout, pas seulement dans le rétroviseur
      p.root.traverse((o) => {
        if (o.layers.isEnabled(LAYER_SEEN) && !o.layers.isEnabled(LAYER_TRUTH)) o.visible = false;
        else if (o.layers.isEnabled(LAYER_TRUTH)) o.layers.enable(LAYER_SEEN);
      });
      p.root.position.set(x, 0, z);
      p.root.rotation.y = ry;
      p.play(pose, 0, pose === 'Death01');
      p.update(pose === 'Death01' ? 0.35 : 0.6);
      p.mixers.forEach((m) => (m.timeScale = 0));
      p.root.visible = false;
      this.scene.add(p.root);
      const home = new THREE.Vector3(x, 0, z);
      this.statues.push({ p, home, lastSeen: home.clone(), cd: 0, seen: true });
    });
  }

  private updateStatues(dt: number): void {
    const active = !hasFlag('act2') && !this.fb;
    const pos = this.player.pos;
    const near = pos.distanceTo(this.world.points.station) < 32;
    const f = this.player.forward(this.v1);
    this.statueScareT = Math.max(0, this.statueScareT - dt);
    for (const st of this.statues) {
      st.p.root.visible = !this.fb;
      if (!active || !near) continue;
      st.cd = Math.max(0, st.cd - dt);
      const d = this.v2.copy(st.p.root.position).sub(pos);
      d.y = 0;
      const dist = d.length();
      const inView = dist < 34 && d.normalize().dot(f) > Math.cos(THREE.MathUtils.degToRad(42)) && this.mirror.raised < 0.5;
      if (inView) {
        // quand on se retourne et qu'il est plus près qu'avant : le cœur s'arrête
        if (!st.seen && st.p.root.position.distanceTo(st.lastSeen) > 1.5 && this.statueScareT <= 0) {
          this.statueScareT = 9;
          this.audio.sfx('stinger2', { gain: 0.55 });
          this.audio.sfx('whispers', { gain: 0.6, pan: this.panOf(st.p.root.position) });
          this.shake = Math.max(this.shake, 0.12);
        }
        st.seen = true;
        st.lastSeen.copy(st.p.root.position);
        continue;
      }
      st.seen = false;
      if (st.cd > 0) continue;
      // il avance… sans bruit, sauf un craquement de braise
      if (dist > 1.15) {
        const step = Math.min(dist - 1.1, 2.4 * dt);
        st.p.root.position.addScaledVector(this.v2.copy(pos).sub(st.p.root.position).setY(0).normalize(), step);
        st.p.root.rotation.y = Math.atan2(pos.x - st.p.root.position.x, pos.z - st.p.root.position.z);
        if (Math.random() < dt * 0.4) this.audio.sfx('ember', { gain: 0.35, pan: this.panOf(st.p.root.position) });
      } else {
        // il l'a touché : une main de cendre sur la nuque
        st.cd = 10;
        this.scare('stinger1', 1);
        this.audio.sfx('breath', { gain: 1 });
        this.hurt(16, 'default');
        this.world.fx.emitSmoke(st.p.root.position.clone().setY(1), 2, 0.6, 3, 0x1a1612);
        this.world.fx.burstEmbers(st.p.root.position.clone().setY(1), 60, 0.8, 1.5);
        st.p.root.position.copy(st.home);
        st.lastSeen.copy(st.home);
      }
    }
  }

  // On peut les frapper : le coup les fait éclater en cendre ; ils reculent et se reforment plus loin
  private strikeStatues(dir: THREE.Vector3, range: number, power: number): void {
    for (const st of this.statues) {
      if (!st.p.root.visible) continue;
      const d = st.p.root.position.clone().sub(this.player.pos).setY(0);
      const dist = d.length();
      if (dist > range + 0.5 || dist < 0.01 || d.normalize().dot(dir) < 0.35) continue;
      const at = st.p.root.position.clone().setY(1.1);
      this.sparks.burst(at, 40 + 15 * power);
      this.world.fx.burstEmbers(at, 50, 0.6, 1.6);
      this.world.fx.emitSmoke(at, 1.6, 0.5, 3, 0x1a1612);
      this.audio.thud();
      this.audio.sfx('ember', { gain: 0.9, pan: this.panOf(at) });
      this.shake = Math.max(this.shake, 0.15);
      // il recule, figé un moment ; au troisième coup il retombe en poussière et retourne là où le feu l'a pris
      st.hits = (st.hits ?? 0) + power;
      st.cd = 4 + 2 * power;
      if (st.hits >= 3) {
        st.hits = 0;
        st.cd = 14;
        this.world.fx.emitSmoke(at, 2.6, 0.8, 4, 0x1a1612);
        st.p.root.position.copy(st.home);
      } else st.p.root.position.addScaledVector(d, 1.4 * power);
      st.lastSeen.copy(st.p.root.position);
    }
  }

  // Le kaolin les renvoie là où le feu les a pris
  private kaolinStatues(dir: THREE.Vector3): void {
    for (const st of this.statues) {
      const d = st.p.root.position.clone().sub(this.player.pos).setY(0);
      if (d.length() > 6.5 || d.normalize().dot(dir) < 0.3) continue;
      this.world.fx.emitSmoke(st.p.root.position.clone().setY(1), 2.2, 0.6, 3, 0xd8d2c4);
      st.p.root.position.copy(st.home);
      st.lastSeen.copy(st.home);
      st.cd = 12;
    }
  }

  // Une lumière pâle et froide au-dessus de la souche : là où le guérisseur parle
  private spirit: Glow | null = null;
  private spiritLight(): void {
    if (this.spirit) return;
    this.spirit = this.world.fx.addGlow(new THREE.Vector3(0, 3.2, -19.2), 0xc8dcff, 6, 9);
  }

  // Traces de kaolin (mains, pieds nus) visibles seulement à travers l'appareil photo :
  // elles mènent de la place jusqu'à chaque fragment ou plante encore à trouver.
  private buildTraces(): void {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(32, 38, 2, 32, 38, 22);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(32, 40, 12, 18, 0, 0, Math.PI * 2); g.fill(); // plante du pied
    for (const [x, y, r] of [[22, 16, 4], [29, 12, 4.2], [36, 12, 3.8], [42, 15, 3.4], [46, 20, 3]] as const) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd8ecff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.3, 0.4);
    geo.rotateX(-Math.PI / 2);
    for (const pk of this.pickups) {
      if (pk.kind === 'calabash') continue;
      const group = new THREE.Group();
      const to = pk.pos.clone().setY(0);
      const from = new THREE.Vector3(0, 0, 4); // la place du village
      const dir = to.clone().sub(from);
      const len = dir.length();
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const n = Math.min(40, Math.floor(len / 0.75));
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 1);
        const m = new THREE.Mesh(geo, mat);
        const wob = Math.sin(k * 0.7 + to.x) * 0.6;
        m.position.copy(from).addScaledVector(dir, len * t).addScaledVector(side, (k % 2 ? 0.14 : -0.14) + wob);
        m.position.y = 0.06;
        m.rotation.y = Math.atan2(dir.x, dir.z) + (k % 2 ? 0.12 : -0.12);
        if (k % 2) m.scale.x = -1;
        m.layers.set(LAYER_TRUTH);
        group.add(m);
      }
      group.visible = false;
      this.scene.add(group);
      this.traces.push({ pk, group });
    }
  }

  // Le viseur : maintenir V. Après le rétroviseur, Happy comprend que l'objectif voit aussi la vérité.
  private updateLens(dt: number, locked: boolean): void {
    const can = this.mode === 'playing' && locked && !this.phone.open && !this.fb && !this.qte && !this.grab && hasFlag('phoneOpened') && story.battery > 5 && this.mirror.raised < 0.05;
    const want = can && this.input.down('KeyV');
    this.lens += ((want ? 1 : 0) - this.lens) * Math.min(1, dt * 10);
    if (!want && this.lens < 0.01) this.lens = 0;
    const up = this.lens > 0.5;
    const truth = up && hasFlag('sawDossi');
    if (truth !== this.lensTruth) {
      if (truth) { this.lensMask = this.camera.layers.mask; this.camera.layers.enable(LAYER_TRUTH); this.camera.layers.disable(LAYER_SEEN); }
      else if (this.lensMask) this.camera.layers.mask = this.lensMask;
      this.lensTruth = truth;
    }
    const z = 1 + 0.4 * this.lens;
    if (Math.abs(this.camera.zoom - z) > 0.001) { this.camera.zoom = z; this.camera.updateProjectionMatrix(); }
    this.viewmodel.group.visible = this.lens < 0.3;
    this.lensEl.classList.toggle('on', this.lens > 0.05);
    this.lensEl.style.opacity = String(this.lens);
    document.body.classList.toggle('lens-up', up);
    for (const t of this.traces) t.group.visible = t.pk.obj.visible;
    if (this.lens <= 0) { this.lensT = 0; return; }
    this.lensT += dt;
    story.battery = Math.max(0, story.battery - 0.18 * dt);
    const s = Math.floor(this.lensT);
    (this.lensEl.querySelector('.l-time') as HTMLElement).textContent = `00:${String(s % 60).padStart(2, '0')}`;
    (this.lensEl.querySelector('.l-bat') as HTMLElement).textContent = `▮ ${Math.round(story.battery)}%`;
    if (up && !hasFlag('lensUsed')) {
      setFlag('lensUsed');
      if (hasFlag('sawDossi')) this.hud.say('Through the lens, the village is not what it seems…', 5);
    }
    // déclencheur : clic gauche = photo ; un fragment proche se photographie ainsi aussi
    if (up && this.input.leftClicked) {
      this.camFlash();
      story.battery = Math.max(0, story.battery - 0.5);
      const near = this.pickups.find((pk) => pk.kind === 'fragment' && pk.obj.visible && pk.pos.distanceTo(this.camera.position) < 3.2);
      if (near) this.collect(near);
      else if (truth) this.scareNearbyAzevi();
    }
  }

  // Photographier un Azévi tel qu'il est le fait reculer : il déteste être vu
  private scareNearbyAzevi(): void {
    const cam = this.camera.getWorldPosition(this.tmpA), dir = this.camera.getWorldDirection(this.tmpB);
    for (const p of Object.values(this.world.people)) {
      if (!p.root.visible || !p.def.azevi) continue;
      p.root.getWorldPosition(this.tmpC);
      const v = this.tmpC.sub(cam);
      const d = v.length();
      if (d < 12 && v.normalize().dot(dir) > 0.93) { this.audio.voiceMix('no', p.def.sex, { ghost: true, gain: 0.9 }); this.hud.say('[It turns its burnt face away from the flash]', 3); return; }
    }
  }

  private camFlash(): void {
    this.audio.sfx('shutter');
    this.camFlashEl.classList.add('on');
    setTimeout(() => this.camFlashEl.classList.remove('on'), 60);
  }

  private collect(pk: Pickup): void {
    if (pk.kind === 'calabash') {
      setFlag('calabash');
      story.kaolin = 5;
      story.inventory.push('Calabash (kaolin)');
      this.audio.sfx('kaolin', { gain: 0.5 });
      this.hud.say('Dah Agossou’s calabash. Full of white earth. — Press Q (A on AZERTY) to throw kaolin.', 6);
      setTimeout(() => this.line('agossou_calabash', 11), 3500);
      this.advance(20);
      this.setObjective('Search the old fuel station, east. The truth is in the ashes.');
      return;
    }
    if (pk.kind === 'plant') {
      story.plantes++;
      story.inventory.push(pk.name);
      setFlag('plant_' + pk.id);
      this.line('happy_plant', 4);
      if (!hasFlag('agossouPlants')) { setFlag('agossouPlants'); setTimeout(() => this.line('agossou_plants', 9), 4500); }
      this.save();
      return;
    }
    // un fragment du secret : Happy le photographie (galerie du téléphone)
    story.secret++;
    setFlag('frag_' + pk.id);
    this.camFlash();
    this.advance(10);
    if (pk.id === 'tape') {
      this.line('happy_frag_tape', 4);
      setTimeout(() => { this.audio.sfx('tape'); setTimeout(() => this.line('agossou_tape', 8), 1600); }, 3800);
    } else this.line(('happy_frag_' + pk.id) as LineId, 6);
    if (pk.id === 'notebook') {
      // piège : le hibou du chef garde sa case
      setTimeout(() => { if (this.mode === 'playing' && !this.fb) { this.audio.sfx('owl', { gain: 1.3 }); this.owlQte = { t: 3.5, ok: false }; } }, 2500);
    }
    this.phone.notify('photos', 'Photos', `Saved to “The secret” · ${story.secret} of 5`, 4);
    // le téléphone s'ouvre, la photo s'affiche en grand avec son analyse : le jeu est en pause pendant la lecture
    if (story.secret === 3 && !hasFlag('flashback')) this.flashbackPending = true;
    setTimeout(() => {
      if (this.mode !== 'playing' || this.fb) return;
      setFlag('phoneOpened');
      this.phone.showPhoto(pk.id);
      this.phone.openViewer(pk.id, true);
      document.exitPointerLock();
    }, 600);
    this.save();
  }

  // La souche de Loko : le calao s'y pose, Dah Agossou parle pour la première fois
  private stumpScene(): void {
    setFlag('agossou');
    this.mode = 'cine';
    const top = new THREE.Vector3(0, 2.15, -20);
    const ayaba = this.world.people['ayaba'];
    const from = this.camera.position.clone();
    this.hornbill.position.set(-14, 9, -30);
    this.hornbill.visible = true;
    this.spiritLight();
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    let done = false;
    this.director.play({
      duration: 21,
      update: (t) => {
        // le calao arrive en planant et se pose sur la souche
        const u = Math.min(1, t / 4.5);
        const e = 1 - Math.pow(1 - u, 3);
        this.hornbill.position.set(-14 + 14 * e, 9 - (9 - 2.1) * e + Math.sin(u * Math.PI) * 1.5, -30 + 10 * e);
        this.hornbill.rotation.y = Math.atan2(14, 10) * (1 - e) + Math.PI * 0.85 * e;
        this.camera.position.copy(from);
        this.camera.lookAt(top.x, top.y - 0.4 + (1 - e) * 2, top.z);
        at('cry', 4.6, t, () => this.audio.sfx('hornbill', { gain: 1.2 }));
        at('ay', 1, t, () => { if (ayaba && ayaba.root.position.distanceTo(top) < 8) this.line('ayaba_stump', 8); });
        at('ag', 9.5, t, () => { this.line('agossou_stump', 11); this.world.flameScale[0] = Math.max(this.world.flameScale[0], 0.22); });
      },
      end: () => {
        if (done) return;
        done = true;
        this.hornbill.position.set(0.2, 2.1, -20.4);
        this.hornbill.rotation.y = Math.PI * 0.85;
        this.mode = 'playing';
        this.advance(15);
        this.setObjective('Find Dah Agossou’s calabash in his house, north, by the lagoon.');
      },
    });
  }

  // ================================================================ FLASHBACK — LA NUIT DU FEU (un film, puis une fuite jouable)
  // 1) le film : la fête, le chef sur son siège, Dah Agossou qui regarde les fûts, la lampe qui tombe, l'explosion
  // 2) la fuite : par les yeux d'Ayaba, à travers le village en flammes, jusqu'à la lagune
  // 3) la fin : Dah Agossou retourne dans le feu ; Ayaba tombe dans l'eau
  private fest: {
    props: THREE.Object3D[]; fires: FireHandle[]; glows: Glow[]; saved: { p: Person; x: number; z: number; ry: number; vis: boolean }[];
    dancers: Person[]; agossou: Person | null; lamp: THREE.Object3D | null; barrels: THREE.Object3D | null;
    runners: { p: Person; dir: THREE.Vector3; t: number; fire: FireHandle | null }[];
  } | null = null;

  // La photo en grand vient d'être fermée : le téléphone se range, la partie reprend (ou le souvenir commence)
  private flashbackPending = false;
  private afterViewer(): void {
    if (this.phone.open) this.phone.hide();
    if (this.mode === 'playing') this.lock();
    if (this.flashbackPending) {
      this.flashbackPending = false;
      this.hud.say('Happy: The barrels… the festival… Wait. I think I understand now.', 4);
      setTimeout(() => this.startFlashback(), 2600);
    }
  }

  private startFlashback(): void {
    if (this.mode !== 'playing' || this.fb) { if (!hasFlag('flashback')) setTimeout(() => this.startFlashback(), 3000); return; }
    setFlag('flashback');
    this.save();
    this.audio.loop('ingame', 0, 'music/theme.mp3');
    this.audio.loop('tension', 0, 'music/tension.mp3');
    this.director.fadeTo(1, 1.2);
    this.audio.sfx('stinger3', { gain: 0.6 });
    setTimeout(() => {
      const light = this.world.fx.addGlow(new THREE.Vector3(38, 8, -5), 0xffa040, 0, 120);
      this.fb = { t: 0, ran: false, back: [this.player.pos.x, this.player.pos.z, this.player.yaw], weapon: this.viewmodel.current, light, done: false };
      this.viewmodel.equip(null);
      this.flashOn = false;
      this.hud.hideAll();
      this.hud.setKaolin(null);
      for (const e of this.enemies.list) e.person.root.visible = false;
      for (const st of this.statues) st.p.root.visible = false;
      if (this.figure) this.figure.root.visible = false;
      this.renderer.domElement.classList.add('flashback');
      this.setupFestival();
      this.audio.loop('drone', 0);
      this.audio.loop('festival', 0.75);
      this.filmScene();
    }, 1300);
  }

  // La fête d'il y a dix ans : le dépôt de fûts, le siège du chef, les tambours, les fanions, les danseurs
  private setupFestival(): void {
    const w = this.world;
    const props: THREE.Object3D[] = [];
    const fires: FireHandle[] = [];
    const glows: Glow[] = [];
    const add = (name: ModelName, x: number, y: number, z: number, ry = 0, sc = 1) => {
      const o = instance(this.models, name, sc);
      if (!o) return null;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.scene.add(o);
      props.push(o);
      return o;
    };
    const barrels = add('az-barrels', 38, 0, -5, 0);
    const lamp = add('az-lamp', 38.1, 2.79, -5.55, 0, 1.6);
    if (lamp) {
      fires.push(w.fx.add(new THREE.Vector3(38.1, 3.0, -5.55), 0.1, { smoke: false, embers: false, color: 0xffb060 }));
      const ll = w.fx.addGlow(new THREE.Vector3(), 0xffa050, 14, 10);
      ll.follow = lamp;
      ll.offset = new THREE.Vector3(0, 0.4, 0.2);
      glows.push(ll);
    }
    // la lumière chaude de la fête au-dessus de la place
    glows.push(w.fx.addGlow(new THREE.Vector3(0, 5, 9.4), 0xffb070, 60, 30));
    this.renderer.toneMappingExposure = 2.2;
    const throneRy = Math.atan2(6.5, 3.9);
    add('az-throne', -6.5, 0, 5.5, throneRy);
    add('az-drum', 2.6, 0, 12.8, 0.3);
    add('az-drum', 3.4, 0, 12.1, -0.4, 0.85);
    // fanions jaune-vert-rouge et lampes tempête sur des perches autour de la place
    const poles: [number, number][] = [[-5.5, 4], [5.5, 4], [5.5, 15], [-5.5, 15]];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const flagMats = [0x1f7a3a, 0xe0b020, 0xc0201a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.15 }));
    for (const [x, z] of poles) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6), poleMat);
      pole.position.set(x, 1.7, z);
      this.scene.add(pole);
      props.push(pole);
      const l = add('az-lamp', x, 3.15, z, 0, 1.4);
      if (l) fires.push(w.fx.add(new THREE.Vector3(x, 3.33, z), 0.09, { smoke: false, embers: false, color: 0xffb060 }));
    }
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = poles[i], [x1, z1] = poles[(i + 1) % 4];
      const n = 12;
      for (let k = 1; k < n; k++) {
        const u = k / n;
        const f = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.13, 0, 0), new THREE.Vector3(0.13, 0, 0), new THREE.Vector3(0, -0.32, 0)]), flagMats[k % 3]);
        f.geometry.computeVertexNormals();
        f.position.set(x0 + (x1 - x0) * u, 3.25 - Math.sin(u * Math.PI) * 0.6, z0 + (z1 - z0) * u);
        f.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        this.scene.add(f);
        props.push(f);
      }
    }
    // les villageois vivants : danseurs autour du feu, batteurs, invités près du chef
    const saved: { p: Person; x: number; z: number; ry: number; vis: boolean }[] = [];
    const dancers: Person[] = [];
    const villagers = Object.entries(w.people).filter(([id, p]) => p.def.azevi && id !== 'dossi').map(([, p]) => p);
    villagers.forEach((p, i) => {
      saved.push({ p, x: p.root.position.x, z: p.root.position.z, ry: p.root.rotation.y, vis: p.root.visible });
      if (i < 9) {
        const a = (i / 9) * Math.PI * 2;
        p.root.position.set(Math.cos(a) * 3.3, 0, 9.4 + Math.sin(a) * 3.3);
        p.root.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
        p.play('Dance_Loop', 0.2);
        p.mixers.forEach((m) => (m.timeScale = 0.85 + (i % 3) * 0.1));
        dancers.push(p);
      } else if (i < 11) {
        p.root.position.set(i === 9 ? 2.6 : 3.4, 0, i === 9 ? 13.5 : 12.8);
        p.root.rotation.y = Math.PI;
        p.play('Crouch_Idle_Loop', 0.2);
      } else {
        const a = (i - 11) * 0.8 + 0.4;
        p.root.position.set(-6.5 + Math.cos(a) * 2.4, 0, 5.5 + Math.sin(a) * 2.4);
        p.root.rotation.y = Math.atan2(-6.5 - p.root.position.x, 5.5 - p.root.position.z);
        p.play('Idle_Talking_Loop', 0.2);
        p.mixers.forEach((m) => (m.timeScale = 1));
      }
    });
    const ay = w.people['ayaba'];
    if (ay) { saved.push({ p: ay, x: ay.root.position.x, z: ay.root.position.z, ry: ay.root.rotation.y, vis: true }); ay.root.position.set(0, -50, 0); }
    // le chef sur son siège
    const h = this.houngbo;
    if (h) { h.root.position.set(-6.5, 0, 5.5); h.root.rotation.y = throneRy; h.root.visible = true; h.play('Sitting_Talking_Loop', 0.2); }
    // Dah Agossou, en blanc, à l'écart, qui regarde les fûts
    const agossou = buildPerson(this.models, { id: 'agossou', sex: 'm', height: 1.74, skin: '#3a2618', top: 'bomba', wax: ['#efe9dc', '#d8d0c0', '#c8bfae'],
      pants: '#e8e2d4', beard: true, azevi: false, pose: 'Idle_Loop' });
    if (agossou) {
      agossou.root.position.set(13, 0, 7.5);
      agossou.root.rotation.y = Math.atan2(25, -12.5);
      this.scene.add(agossou.root);
      glows.push(w.fx.addGlow(new THREE.Vector3(12, 2.4, 8.8), 0xffb070, 8, 7));
    }
    w.followGaze = false;
    w.flameScale = [1.6, 1, 1];
    this.fest = { props, fires, glows, saved, dancers, agossou, lamp, barrels, runners: [] };
  }

  private filmScene(): void {
    this.mode = 'cine';
    const fest = this.fest!;
    const h = this.houngbo;
    const ag = fest.agossou;
    const w = this.world;
    const cam = this.camera;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    const lerp = (a: THREE.Vector3, b: THREE.Vector3, u: number) => a.clone().lerp(b, THREE.MathUtils.smoothstep(u, 0, 1));
    let shake = 0;
    let lampFall = -1;
    const lampFires: FireHandle[] = [];
    let done = false;
    this.director.fadeTo(0, 2);
    this.director.title('TEN YEARS AGO', 'THE NIGHT OF THE FIRE', 5);
    this.director.play({
      duration: 33,
      update: (t, dt) => {
        h?.update(dt);
        ag?.update(dt);
        // ---- plan 1 : la fête, vue d'en haut, la caméra descend vers les danseurs
        if (t < 7) {
          cam.position.copy(lerp(V(15, 8, 25), V(7, 3.2, 17), t / 7));
          cam.lookAt(0, 1.3, 9.4);
        } else if (t < 12) {
          // ---- plan 2 : le chef Houngbo sur son siège, une calebasse de sodabi à la main
          cam.position.copy(lerp(V(-4.4, 1.25, 7.9), V(-5.0, 1.2, 7.2), (t - 7) / 5));
          cam.lookAt(-6.5, 1.12, 5.5);
        } else if (t < 17) {
          // ---- plan 3 : Dah Agossou, à l'écart, regarde les fûts
          cam.position.copy(lerp(V(11.2, 1.75, 9.8), V(11.7, 1.75, 9.1), (t - 12) / 5));
          cam.lookAt(lerp(V(13, 1.55, 7.5), V(38, 2.5, -5), Math.max(0, (t - 14.5) / 2.5)));
        } else if (t < 25.5) {
          // ---- plan 4 : la lampe tempête accrochée en haut des fûts… le vent… elle tombe
          cam.position.copy(lerp(V(36.0, 3.0, -3.0), V(36.8, 2.75, -3.9), (t - 17) / 8.5));
          const lp = fest.lamp ? fest.lamp.position : V(38.1, 2.8, -5.55);
          cam.lookAt(lp.x, Math.max(0.6, lp.y - 0.2), lp.z);
        } else {
          // ---- plan 5 : depuis la place, l'explosion
          cam.position.copy(lerp(V(5, 1.4, 14.5), V(4.2, 1.3, 15.5), (t - 25.5) / 7.5));
          cam.lookAt(36, 4 + Math.min(6, (t - 26) * 2), -5);
        }
        if (shake > 0) {
          shake = Math.max(0, shake - dt);
          cam.position.x += (Math.random() - 0.5) * shake * 0.5;
          cam.position.y += (Math.random() - 0.5) * shake * 0.5;
        }
        at('party', 1.5, t, () => this.line('flash_party', 6));
        at('chief', 7.6, t, () => { this.line('houngbo_feast', 5); this.audio.voiceMix('ha ha ha ha', 'm', { gain: 0.6, rate: 0.85 }); });
        at('ag', 13, t, () => this.line('agossou_feast', 6));
        // la lampe se balance… puis tombe sur la pile, rebondit et se brise au sol
        if (fest.lamp && t > 17 && lampFall < 0) {
          fest.lamp.rotation.z = Math.sin(t * 2.2) * 0.08 * Math.min(1, (t - 17) / 2);
          if (fest.fires[0]) fest.fires[0].group.position.set(fest.lamp.position.x, fest.lamp.position.y + 0.21, fest.lamp.position.z);
        }
        at('fall', 21, t, () => { lampFall = 0; this.audio.sfx('swing', { gain: 0.4, rate: 0.6 }); });
        if (fest.lamp && lampFall >= 0 && lampFall < 1) {
          lampFall = Math.min(1, lampFall + dt / 0.9);
          const u = lampFall;
          fest.lamp.position.set(38.1 + u * 1.4, 2.79 * (1 - u * u) + 0.05, -5.55 + u * 1.2);
          fest.lamp.rotation.z = u * 1.6;
          if (fest.fires[0]) fest.fires[0].group.position.copy(fest.lamp.position).setY(fest.lamp.position.y + 0.15);
          if (u >= 1) {
            this.audio.sfx('impact', { gain: 0.9 });
            this.audio.sfx('ember');
            // le pétrole se répand : une traînée de feu court vers les fûts
            for (let i = 0; i < 4; i++) setTimeout(() => {
              const f = w.fx.add(new THREE.Vector3(39.4 - i * 0.45, 0.04, -4.3 - i * 0.25), 0.25 + i * 0.12, { smoke: true });
              lampFires.push(f);
              fest.fires.push(f);
            }, 250 + i * 700);
          }
        }
        // ---- l'explosion
        at('boom', 26.2, t, () => {
          w.fx.explode(new THREE.Vector3(38, 1.2, -5), 1.5);
          this.audio.loop('festival', 0);
          this.audio.sfx('explosion', { gain: 1.4 });
          this.scareEl.classList.add('on');
          setTimeout(() => this.scareEl.classList.remove('on'), 400);
          shake = 1.4;
          if (fest.barrels) fest.barrels.visible = false;
          if (fest.lamp) fest.lamp.visible = false;
          for (const f of lampFires) f.power = 0;
          fest.fires.push(w.fx.add(new THREE.Vector3(38, 0, -5), 6, { smoke: true }));
          w.flameScale[0] = 0.6;
          this.audio.voiceMix('noooo help', 'f', { gain: 0.9, pan: 0.3 });
          setTimeout(() => this.audio.voiceMix('fire fire run run', 'm', { gain: 0.9, pan: -0.4 }), 500);
          setTimeout(() => this.audio.voiceMix('my children', 'f', { gain: 0.8, pan: 0.6 }), 1100);
          // la panique : les danseurs s'enfuient
          fest.dancers.forEach((p, i) => setTimeout(() => {
            if (i % 4 === 3) p.play('Death01', 0.1, true);
            else p.play('Sprint_Loop', 0.15);
          }, 300 + i * 120));
          if (h) h.play('Hit_Chest', 0.1, true);
        });
      },
      end: () => {
        if (done) return;
        done = true;
        if (fest.lamp) fest.lamp.visible = false;
        if (fest.barrels) fest.barrels.visible = false;
        if (!fired.has('boom')) { w.fx.explode(new THREE.Vector3(38, 1.2, -5), 1.5); fest.fires.push(w.fx.add(new THREE.Vector3(38, 0, -5), 6, { smoke: true })); }
        this.startEscape();
      },
    });
  }

  // La fuite : on est Ayaba, le village brûle, il faut atteindre la lagune
  private startEscape(): void {
    const fest = this.fest!;
    const w = this.world;
    const fb = this.fb!;
    fb.t = 0;
    fb.ran = true;
    this.mode = 'playing';
    this.player.heightScale = 0.62;
    this.player.place(1.8, 13.5, 0);
    this.audio.loop('festival', 0);
    this.audio.loop('fire', 0.9);
    // le feu prend les cases, l'atelier, la buvette
    for (const [x, z, s] of [[-8, -7, 2.6], [14, -11, 3], [-23, -6, 2.4], [20, 14, 2.8], [-12, 18, 2.4], [7, 21, 2.6], [24, -23, 3.2], [-27, -22, 3], [12, -33, 2.5],
      [28, 4, 2.8], [31, 22, 2.6], [-33, 6, 2.2], [9, 4, 2.2], [-16, 4, 2.4], [17, -2, 1.6], [-3, -3, 1.2], [6, -14, 1.4], [-4.5, -15, 1.5], [5.5, -21, 2], [-9, -26, 1.8], [8, -28, 1.6], [-13, -12, 2.2]] as [number, number, number][]) {
      fest.fires.push(w.fx.add(new THREE.Vector3(x, s > 2 ? 1.2 : 0, z), s, { smoke: true }));
    }
    // ceux qui courent : certains brûlent
    fest.dancers.forEach((p, i) => {
      if (i % 4 === 3) return;
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      p.root.rotation.y = Math.atan2(dir.x, dir.z);
      p.play('Sprint_Loop', 0.1);
      const fire = i % 3 === 0 ? w.fx.add(p.root.position.clone(), 1.1, { smoke: true, light: false }) : null;
      if (fire) { fire.follow = p.root; fest.fires.push(fire); }
      fest.runners.push({ p, dir, t: 3 + Math.random() * 4, fire });
    });
    // Dah Agossou attend sur le chemin du nord et lui crie de courir
    if (fest.agossou) { fest.agossou.root.position.set(1.2, 0, -9); fest.agossou.root.rotation.y = 0; fest.agossou.play('Interact', 0.2); }
    if (this.houngbo) this.houngbo.root.visible = false;
    fb.light.pos.set(38, 8, -5);
    fb.light.intensity = 120;
    this.hud.setTracker('MEMORY — AYABA', 'RUN TO THE LAGOON. North, past the iroko.', 'Shift — run');
    this.director.fadeTo(0, 0.6);
  }

  private updateFlashback(dt: number): void {
    const fb = this.fb!;
    const fest = this.fest;
    if (!fb.ran || !fest) return;
    fb.t += dt;
    const pos = this.player.pos;
    fb.light.intensity = 90 * (0.8 + Math.random() * 0.4);
    // les fuyards courent, puis tombent
    for (const r of fest.runners) {
      if (r.t <= 0) continue;
      r.t -= dt;
      r.p.root.position.addScaledVector(r.dir, 5 * dt);
      if (r.t <= 0) { r.p.play('Death01', 0.1, true); if (r.fire) r.fire.power = 0.6; }
    }
    // braises et fumée autour d'elle ; des morceaux en feu tombent devant
    if (Math.random() < dt * 5) w_embers(this.world, pos);
    if (Math.random() < dt * 0.35) {
      const f = this.player.forward(this.v1);
      const p = pos.clone().addScaledVector(f, 5 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 2));
      const h = this.world.fx.add(p, 0.9, { smoke: true });
      fest.fires.push(h);
      this.world.fx.burstEmbers(p.clone().setY(2.5), 40, 1.5, 2);
      this.audio.sfx('impact', { gain: 0.7, pan: this.panOf(p) });
    }
    this.audio.loop('heartbeat', 1);
    this.player.stamina = Math.max(this.player.stamina, 35); // une enfant qui court pour sa vie
    const tgt = new THREE.Vector3(0, 0.5, -44).project(this.camera);
    this.hud.setMarker(tgt.z < 1 ? (tgt.x * 0.5 + 0.5) * innerWidth : null, (-tgt.y * 0.5 + 0.5) * innerHeight, 'The lagoon');
    // Dah Agossou lui crie de courir quand elle approche
    const ag = fest.agossou;
    if (ag) {
      ag.update(dt);
      if (!fb.done && ag.root.position.distanceTo(pos) < 10 && !hasFlag('fbShout')) {
        setFlag('fbShout');
        this.line('agossou_flash', 4);
        ag.root.rotation.y = Math.atan2(pos.x - ag.root.position.x, pos.z - ag.root.position.z);
      }
    }
    // trop lente : le feu la rattrape, la course recommence
    if (fb.t > 75) {
      fb.t = 0;
      this.director.fadeTo(1, 0.5);
      this.audio.sfx('stinger1');
      setTimeout(() => { this.player.place(1.8, 13.5, 0); this.director.fadeTo(0, 0.8); this.hud.say('The fire was faster. Again — north, to the water.', 4); }, 600);
    }
    if (pos.z < -40.5 && !fb.done) this.waterScene();
  }

  // Sur la rive : elle se retourne. Dah Agossou repart dans le feu chercher les autres enfants. Elle tombe dans l'eau.
  private waterScene(): void {
    const fb = this.fb!;
    const fest = this.fest!;
    fb.done = true;
    this.mode = 'cine';
    this.hud.setMarker(null);
    this.hud.setTracker(null);
    const ag = fest.agossou;
    const eye = new THREE.Vector3(this.player.pos.x, 1.0, this.player.pos.z);
    if (ag) { ag.root.position.set(eye.x + 2.5, 0, eye.z + 7); ag.play('Walk_Loop', 0.2); ag.root.rotation.y = Math.atan2(10, 6); }
    const under = document.createElement('div');
    under.className = 'underwater';
    document.body.appendChild(under);
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    let done = false;
    this.director.play({
      duration: 10,
      update: (t, dt) => {
        if (ag) { ag.update(dt); ag.root.position.x += Math.sin(ag.root.rotation.y) * 1.3 * dt; ag.root.position.z += Math.cos(ag.root.rotation.y) * 1.3 * dt; }
        // elle se retourne vers le village en feu… puis bascule en arrière dans l'eau
        const fall = Math.max(0, (t - 5.5) / 1.2);
        this.camera.position.set(eye.x, eye.y - Math.min(1, fall) * 1.1, eye.z - Math.min(1, fall) * 0.8);
        const look = new THREE.Vector3(eye.x + 2, 2 + Math.min(1, fall) * 9, eye.z + 20);
        this.camera.lookAt(look);
        at('see', 0.5, t, () => this.audio.voiceMix('grandpa', 'c', { gain: 0.7 }));
        at('fall', 5.5, t, () => { this.audio.sfx('impact', { gain: 0.8, rate: 0.5 }); this.audio.muffle(true); under.classList.add('on'); this.audio.loop('heartbeat', 0.5); });
        at('black', 8, t, () => this.director.fadeTo(1, 1.5));
      },
      end: () => {
        if (done) return;
        done = true;
        under.remove();
        this.audio.muffle(false);
        this.director.fadeTo(1, 0);
        this.endFlashback();
      },
    });
  }

  private endFlashback(): void {
    const fb = this.fb!;
    const fest = this.fest;
    const w = this.world;
    this.audio.loop('heartbeat', 0);
    this.audio.loop('fire', 0);
    setTimeout(() => {
      this.world.fx.removeGlow(fb.light);
      if (fest) {
        for (const o of fest.props) this.scene.remove(o);
        for (const f of fest.fires) w.fx.remove(f);
        for (const g of fest.glows) w.fx.removeGlow(g);
        for (const s of fest.saved) {
          s.p.root.position.set(s.x, 0, s.z);
          s.p.root.rotation.y = s.ry;
          s.p.root.visible = s.vis;
          s.p.mixers.forEach((m) => (m.timeScale = 1));
          s.p.play(s.p.def.pose ?? 'Idle_Loop', 0.1);
        }
        if (fest.agossou) this.scene.remove(fest.agossou.root);
      }
      if (this.houngbo) this.houngbo.root.visible = false;
      this.fest = null;
      w.followGaze = true;
      this.renderer.domElement.classList.remove('flashback');
      this.renderer.toneMappingExposure = this.exposure;
      this.player.heightScale = 1;
      this.player.place(fb.back[0], fb.back[1], fb.back[2]);
      this.viewmodel.equip(fb.weapon as Parameters<Viewmodel['equip']>[0]);
      w.flameScale = [0.22, 0, 0];
      for (const e of this.enemies.list) e.person.root.visible = true;
      this.hud.setMarker(null);
      this.fb = null;
      this.mode = 'playing';
      this.director.fadeTo(0, 2.5);
      this.line('ayaba_flash_end', 9);
      this.advance(20);
      this.save();
    }, 900);
  }

  // ---------------------------------------------------------------- Fin de l'Acte II : le chef Houngbo, minuit
  private houngboScene(): void {
    const h = this.houngbo;
    if (this.mode !== 'playing' || this.fb || !h) { setTimeout(() => this.houngboScene(), 2500); return; }
    this.mode = 'cine';
    this.hud.setPrompt(null);
    const f = this.player.forward(this.v1).clone();
    const at = this.player.pos.clone().addScaledVector(f, 4.2);
    h.root.position.set(at.x, 0, at.z);
    h.root.rotation.y = Math.atan2(-f.x, -f.z);
    h.root.visible = true;
    h.play('Idle_Talking_Loop');
    this.audio.sfx('stinger2', { gain: 0.6 });
    // une lueur de braise, basse, qui éclaire son visage par en dessous
    const faceLight = this.world.fx.addGlow(new THREE.Vector3(at.x - f.x * 1.2, 0.6, at.z - f.z * 1.2), 0xff8a3a, 7, 6);
    const eye = this.camera.position.clone().setY(2.25).addScaledVector(f, 0.4); // un peu au-dessus : rien ne cache le chef
    const head = new THREE.Vector3(at.x, 1.72, at.z);
    const fired = new Set<string>();
    const once = (k: string, t: number, now: number, fn: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); fn(); } };
    let done = false;
    const truth = (on: boolean) => { this.camera.layers.set(0); this.camera.layers.enable(on ? LAYER_TRUTH : LAYER_SEEN); };
    this.director.play({
      duration: 24,
      update: (t, dt) => {
        h.update(dt);
        this.camera.position.copy(eye);
        this.camera.lookAt(head.x, head.y - 0.15, head.z);
        once('offer', 1.2, t, () => this.line('houngbo_offer', 10));
        // l'éclair de vérité : une fraction de seconde, on voit le village tel qu'il est
        once('truth', 12, t, () => { truth(true); this.scare('stinger1'); setTimeout(() => truth(false), 380); });
        once('crown', 13.2, t, () => this.line('happy_crown', 4));
        once('gong', 17, t, () => {
          this.audio.sfx('gong', { gain: 1.2 });
          story.minutes = 24 * 60;
          this.line('houngbo_midnight', 4);
          for (const p of Object.values(this.world.people)) if (p.def.azevi && p.def.id !== 'dossi') p.play('Idle_Loop', 0.4);
        });
        once('gone', 20.5, t, () => { this.blackout = 0.5; h.root.visible = false; faceLight.intensity = 0; this.audio.sfx('laugh', { gain: 0.8 }); });
        once('title', 21, t, () => this.director.title('THE NIGHT OF THE AZÉVI', 'ACT III', 5));
      },
      end: () => {
        if (done) return;
        done = true;
        truth(false);
        h.root.visible = false;
        this.world.fx.removeGlow(faceLight);
        setFlag('act2');
        story.minutes = Math.max(story.minutes, 24 * 60);
        this.mode = 'playing';
        this.nextOwl = this.time + 20;
        this.setObjective('Midnight. Bring the battery to Kossi. Then choose: leave before dawn… or finish what the healer began.');
      },
    });
  }

  // ================================================================ ACTE III — LA NUIT DES AZÉVI
  private act3Ready = false;
  private nextRise = 0;
  private hutGlow: Glow[] = [];
  private rite: RiteState | null = null;
  private houngboSeen: THREE.Object3D[] = [];

  private setupAct3(): void {
    if (this.act3Ready) return;
    this.act3Ready = true;
    // les cases s'allument d'une lueur orange : le village est réveillé
    for (const [x, z] of [[-8, -7], [14, -11], [-23, -6], [20, 14], [-12, 18], [7, 21], [24, -23], [-27, -22], [12, -33], [-19, -38], [28, 4], [31, 22], [-33, 6]]) {
      this.hutGlow.push(this.world.fx.addGlow(new THREE.Vector3(x, 1.2, z + 1.6), 0xff6a20, 5, 7));
    }
    // l'asen enfoui sous les ruines de la station, dégagé par l'explosion de minuit
    const a = instance(this.models, 'az-asen', 1.15);
    if (a) { a.position.set(38.6, 0.12, -6.6); this.scene.add(a); }
    // Houngbo : ses parties « vues » (pour la phase de fumée, on ne le voit plus que dans le rétroviseur)
    this.houngboSeen = [];
    this.houngbo?.root.traverse((o) => { if (o.layers.isEnabled(LAYER_SEEN) && !o.layers.isEnabled(LAYER_TRUTH) && (o as THREE.Mesh).isMesh) this.houngboSeen.push(o); });
    this.nextRise = this.time + 25;
  }

  private act3Beats(dt: number): void {
    if (!hasFlag('act2') || hasFlag('ended')) return;
    this.setupAct3();
    if (!this.joy) for (const l of this.hutGlow) l.intensity = 4 + Math.sin(this.time * 6 + l.pos.x) * 1.2 + Math.random() * 0.6;
    if (this.rite) return;
    // l'horloge avance vers l'aube (sauf pendant le rite)
    const before = story.minutes;
    story.minutes += dt * 0.35; // ≈ 14 min de jeu entre minuit et l'aube
    if (before < 28 * 60 + 30 && story.minutes >= 28 * 60 + 30) this.hud.objective('4:30 — Dawn is coming. Half an hour left.');
    if (story.minutes >= 29 * 60 && this.mode === 'playing') { this.line('happy_dawn', 4); this.ending(true); return; }
    // les Brûlés se lèvent un à un et viennent chercher Happy
    const nearCar = this.player.pos.distanceTo(this.world.points.car) < 6;
    if (this.time > this.nextRise && !nearCar && this.enemies.near(this.player.pos, 30) < 3) {
      this.nextRise = this.time + 28 + Math.random() * 20;
      const cand = Object.entries(this.world.people).filter(([id, p]) => p.def.azevi && id !== 'dossi' && p.root.visible
        && p.root.position.distanceTo(this.player.pos) > 9 && p.root.position.distanceTo(this.player.pos) < 26);
      if (cand.length) {
        const [id, p] = cand[Math.floor(Math.random() * cand.length)];
        delete this.world.people[id];
        this.enemies.adopt(p);
        this.audio.sfx('breath', { gain: 0.8, pan: this.panOf(p.root.position) });
        if (!hasFlag('firstRise')) { setFlag('firstRise'); this.hud.say('[One of the villagers stands up. Slowly. And turns towards you.]', 5); }
      }
    }
  }

  // ---- Chaque objet n'apparaît qu'à son étape : on ne saute jamais une partie de l'histoire
  private stationDone(): boolean {
    return ['photo', 'tape', 'register'].every((id) => hasFlag('frag_' + id));
  }

  private pickupOpen(pk: Pickup): boolean {
    if (pk.kind === 'calabash') return hasFlag('agossou');                          // Acte II, après la souche
    if (pk.kind === 'plant') return hasFlag('riteTold');                             // Acte III, après la question de Kossi
    if (pk.id === 'drawing' || pk.id === 'notebook') return hasFlag('riteTold');      // Acte III, toute la vérité
    return hasFlag('calabash');                                                       // Acte II : les fragments de la station
  }

  // ---------------------------------------------------------------- choix I : l'akassa des morts (Fin II)
  private akassaEnding(): void {
    const d = this.world.people['dossi'];
    this.mode = 'cine';
    this.hud.setPrompt(null);
    const eye = this.camera.position.clone();
    const head = d ? d.root.position.clone().setY(1.5) : eye.clone().add(new THREE.Vector3(0, 0, -2));
    const truth = (on: boolean) => { this.camera.layers.set(0); this.camera.layers.enable(on ? LAYER_TRUTH : LAYER_SEEN); };
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    let done = false;
    this.line('dossi_ate', 6);
    this.director.play({
      duration: 15,
      update: (t, dt) => {
        d?.update(dt);
        // Happy s'assoit, la vue tangue et s'affaisse doucement
        this.camera.position.set(eye.x, eye.y - Math.min(0.5, t * 0.06), eye.z);
        this.camera.lookAt(head.x + Math.sin(t * 0.7) * 0.15 * Math.min(1, t / 5), head.y - Math.min(0.6, t * 0.05), head.z);
        at('ate', 5.5, t, () => this.line('happy_ate', 5));
        at('cold', 8, t, () => { this.audio.sfx('whispers', { gain: 1 }); this.director.fadeTo(0.55, 3); });
        // un battement : elle, telle qu'elle est — puis lui, déjà comme elle
        at('truth', 10.5, t, () => { truth(true); this.scare('stinger1'); setTimeout(() => truth(false), 450); });
        at('black', 12, t, () => this.director.fadeTo(1, 2.5));
      },
      end: () => {
        if (done) return;
        done = true;
        truth(false);
        markEnding('azevi');
        void this.finalScreen('Ending II — The Azévi', [
          'The akassa is cold. It was cooked ten years ago, for a feast that never ended.',
          'You do not feel the fire. Only that you belong here now.',
          'You are not a survivor. You are not a healer. You are one of them.',
        ], false, true);
      },
    });
  }

  private riteMissing(): string | null {
    const miss: string[] = [];
    if (story.plantes < 3) miss.push(`the healer’s plants (${story.plantes}/3)`);
    if (story.secret < 5) miss.push(`the whole truth (fragments ${story.secret}/5)`);
    if (!hasFlag('calabash')) miss.push('Dah Agossou’s calabash');
    return miss.length ? `The asen stays silent. Still missing: ${miss.join(', ')}.` : null;
  }

  // ---------------------------------------------------------------- choix III : brûler la maison du guérisseur
  private burnWarned = false;
  private talkUntil = 0;
  private burnHouse(): void {
    if (this.choice || this.burnWarned) return;
    // la voix du guérisseur s'élève de sa maison : un dernier avertissement avant le choix
    this.burnWarned = true;
    this.audio.sfx('whispers', { gain: 1, pan: this.panOf(new THREE.Vector3(-6, 1.5, -33)) });
    this.audio.sfx('stinger3', { gain: 0.5 });
    this.shake = Math.max(this.shake, 0.25);
    this.blackout = 0.25;
    this.line('agossou_warn', 4.5);
    setTimeout(() => {
      this.burnWarned = false;
      if (this.mode !== 'playing') return;
      // E = s'éloigner (la voie sûre), R = mettre le feu
      this.ask('Step away', () => this.hud.say('Not like this.', 2), 'Set the healer’s house on fire', () => this.burnScene());
    }, 3800);
  }

  private burnScene(): void {
    setFlag('ended');
    this.mode = 'cine';
    this.hud.setPrompt(null);
    const w = this.world;
    const h = this.houngbo;
    const eye = new THREE.Vector3(-6, 1.6, -24.5);
    const fires: FireHandle[] = [];
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    let stele: THREE.Mesh | null = null;
    this.line('happy_burn', 4);
    this.director.play({
      duration: 26,
      update: (t, dt) => {
        h?.update(dt);
        if (t < 15) { this.camera.position.copy(eye); this.camera.lookAt(-6, 1.6 + Math.min(1, t / 8) * 1.5, -34); }
        at('fire1', 2.5, t, () => { for (const [x, z, s] of [[-6, -31.8, 1.2], [-8, -33, 2.2], [-4, -34, 2.6], [-6, -35.5, 3.2]] as [number, number, number][]) fires.push(w.fx.add(new THREE.Vector3(x, 0.2, z), s, { smoke: true })); this.audio.loop('fire', 0.9); });
        at('chief', 6, t, () => {
          if (h) { h.root.position.set(-2.4, 0, -27.5); h.root.rotation.y = Math.atan2(-6 + 2.4, -24.5 + 27.5); h.root.visible = true; h.play('Idle_Talking_Loop'); for (const o of this.houngboSeen) o.visible = true; }
          this.line('houngbo_thanks', 7);
          this.audio.sfx('laugh', { gain: 1 });
        });
        // la station saute une seconde fois : écran blanc
        at('boom', 13, t, () => { w.fx.explode(new THREE.Vector3(38, 1, -5), 2); this.audio.sfx('explosion', { gain: 1.5 }); this.whiteOut(true); });
        // le matin : un nom de plus sur la stèle
        at('morning', 16, t, () => {
          this.audio.loop('fire', 0);
          for (const f of fires) w.fx.remove(f);
          if (h) h.root.visible = false;
          story.minutes = 30 * 60 + 30;
          stele = this.steleName('HAPPY');
          this.whiteOut(false);
        });
        if (t >= 16) { this.camera.position.set(-3.2, 1.35, 34.6 - Math.min(1, (t - 16) / 8) * 1.2); this.camera.lookAt(-3.2, 1.05, 32); }
        at('owl', 22, t, () => this.audio.sfx('owl', { gain: 0.5 }));
      },
      end: () => {
        if (stele === null) this.steleName('HAPPY');
        markEnding('ashes');
        void this.finalScreen('Ending III — The Ashes', ['Houngbo laughs: “Thank you, traveller.” A second explosion. White.', 'In the morning, the stone at the entrance carries one more name: HAPPY.', 'Azé-tin keeps its secret. And its chief.']);
      },
    });
  }

  private whiteOut(on: boolean): void {
    let el = document.querySelector<HTMLDivElement>('.whiteout');
    if (!el) { el = document.createElement('div'); el.className = 'whiteout'; document.body.appendChild(el); }
    el.classList.toggle('on', on);
  }

  // Un nom gravé de frais sur la stèle des morts
  private steleName(name: string): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 40px serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(20,14,10,0.92)';
    g.fillText(name, 128, 46);
    g.fillStyle = 'rgba(255,240,220,0.25)';
    g.fillText(name, 129, 47);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.19), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 1 }));
    m.position.set(-3.2, 0.62, 32.17);
    m.layers.enableAll();
    this.scene.add(m);
    return m;
  }

  // Le générique (braises et cendre ; à l'aube pour la vraie fin), puis l'écran de fin
  private async rollCredits(dawn: boolean, last: string): Promise<void> {
    this.mode = 'cine';
    this.hud.hideAll();
    this.hud.setKaolin(null);
    this.audio.loop('nightmusic', 0, 'music/night.mp3');
    this.audio.loop('ingame', 0, 'music/theme.mp3');
    this.audio.loop('credits', 0.85, dawn ? 'music/dawn.mp3' : 'music/theme.mp3');
    this.creditsOn = true; // le village 3D n'est plus dessiné derrière le générique
    await new Credits().play(dawn, last);
    this.creditsOn = false;
    this.audio.loop('credits', 0, dawn ? 'music/dawn.mp3' : 'music/theme.mp3');
  }

  // Bouton « Credits » du menu : le film du générique, puis retour au titre.
  // Version aube si la vraie fin a déjà été vue, sinon braises et cendre.
  private async menuCredits(): Promise<void> {
    if (this.mode !== 'menu') return;
    this.audio.start();
    this.menu.hide();
    const dawn = endingsSeen().includes('healer');
    await this.rollCredits(dawn, dawn ? 'Azé-tin sleeps in peace.' : 'Azé-tin is waiting.');
    this.mode = 'menu';
    this.menu.show(hasSave());
  }

  // Écran de la fin (titre + quelques lignes), puis le générique, puis retour direct à l'accueil
  // L'illustration de chaque fin (rendue dans Blender)
  private endingPic(title: string): string {
    const id = title.includes('IV') ? 'healer' : title.includes('III') ? 'ashes' : title.includes('II') ? 'azevi' : 'survivor';
    return `photos/end-${id}.jpg`;
  }

  private async finalScreen(title: string, lines: string[], dawn = false, restart = false): Promise<void> {
    setFlag('ended');
    clearSave();
    this.audio.loop('nightmusic', 0, 'music/night.mp3');
    this.audio.loop('ingame', 0, 'music/theme.mp3');
    this.audio.loop('tension', 0, 'music/tension.mp3');
    this.mode = 'cine';
    this.hud.hideAll();
    this.hud.setKaolin(null);
    document.exitPointerLock();
    if (restart) {
      // une fin « courte » : pas de générique, on recommence depuis le début
      await this.gameOver.endingCard(title, lines, 40, 'Start again from the beginning', this.endingPic(title));
      try { sessionStorage.setItem('azetin.restart', '1'); } catch { /* navigation privée */ }
      document.body.style.background = '#000';
      location.reload();
      return;
    }
    await this.gameOver.endingCard(title, lines, 22, 'Continue', this.endingPic(title));
    await this.rollCredits(dawn, dawn ? 'Azé-tin sleeps in peace.' : 'Azé-tin is waiting.');
    // l'accueil, avec un village tout neuf (fondu au noir pendant le rechargement)
    document.body.style.background = '#000';
    location.reload();
  }

  // ================================================================ QTE : combinaisons de touches (le rite, les prises des Brûlés)
  private qte: { keys: string[]; idx: number; keyT: number; per: number; title: string; sub: string; ok: () => void; fail: () => void } | null = null;
  private qteEl: HTMLDivElement | null = null;
  private kaolinKey = 'Q';

  private startQte(n: number, title: string, sub: string, ok: () => void, fail: () => void, opts: { per?: number; kaolinAt?: number } = {}): void {
    const dirs = ['up', 'down', 'left', 'right'];
    const keys = Array.from({ length: Math.max(1, n) }, () => dirs[Math.floor(Math.random() * 4)]);
    if (opts.kaolinAt !== undefined) keys.splice(Math.min(opts.kaolinAt, keys.length), 0, 'kaolin');
    const per = opts.per ?? 1.5;
    this.qte = { keys, idx: 0, keyT: per + 0.4, per, title, sub, ok, fail };
    if (!this.qteEl) { this.qteEl = document.createElement('div'); this.qteEl.className = 'chant qte'; document.body.appendChild(this.qteEl); }
    this.drawQte();
  }

  private stopQte(): void {
    this.qte = null;
    this.qteEl?.classList.remove('on');
  }

  private drawQte(): void {
    const q = this.qte, el = this.qteEl;
    if (!q || !el) return;
    const rot: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };
    const glyph = (k: string) => (k === 'kaolin' ? `<i>${this.kaolinKey}</i>` : `<img src="${import.meta.env.BASE_URL}ui/icon-arrow.png" style="transform:rotate(${rot[k]}deg)" alt="">`);
    const now = q.keys[q.idx];
    el.innerHTML = `<small>${tr(q.title)}</small><div>${q.keys.map((k, i) => `<b class="${i < q.idx ? 'ok' : i === q.idx ? 'now' : ''}${k === 'kaolin' ? ' kao' : ''}">${glyph(k)}</b>`).join('')}</div>
      <span class="qbar"><span style="width:${Math.max(0, Math.min(1, q.keyT / q.per)) * 100}%"></span></span>
      <span class="qlife"><b>${tr('BREATH')}</b><span><span style="width:${Math.max(0, story.souffle)}%"></span></span></span>
      ${now === 'kaolin' ? `<strong>${tr('HE STRIKES — THROW KAOLIN')} (${this.kaolinKey})!</strong>` : `<em>${tr(q.sub)}</em>`}`;
    el.classList.add('on');
  }

  private updateQte(dt: number): void {
    const q = this.qte;
    if (!q) return;
    const map: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyQ: 'kaolin' };
    let pressed: string | null = null;
    for (const [code, k] of Object.entries(map)) if (this.input.wasPressed(code)) pressed = k;
    q.keyT -= dt;
    if (pressed) {
      if (pressed !== q.keys[q.idx]) { this.stopQte(); q.fail(); return; }
      q.idx++;
      q.keyT = q.per;
      this.audio.ui('click');
      if (pressed === 'kaolin') { this.audio.sfx('kaolin', { gain: 0.6 }); this.kaolinFx.burst(this.camera.position.clone().add(this.camera.getWorldDirection(this.v1).multiplyScalar(0.7)), 50, this.camera.getWorldDirection(this.v2).clone()); }
      if (q.idx >= q.keys.length) { this.stopQte(); q.ok(); return; }
    } else if (q.keyT <= 0) { this.stopQte(); q.fail(); return; }
    this.drawQte();
  }

  // ---------------------------------------------------------------- choix IV : le rite — une vraie scène, jusqu'à la délivrance
  private startRite(): void {
    const miss = this.riteMissing();
    if (miss) { this.hud.say(miss, 6); return; }
    this.save();
    for (const e of this.enemies.list) this.scene.remove(e.person.root);
    this.enemies.list = [];
    this.mode = 'cine';
    this.choice = null;
    this.hud.setPrompt(null);
    this.hud.setTracker(null);
    this.mirror.raised = 0;
    this.viewmodel.equip(null);
    const V = THREE.Vector3;
    const A = new V(38.6, 0, -6.6);          // l'asen
    const E = new V(34.3, 1.62, -6.1);       // les yeux de Happy, à l'ouest de l'asen (hors du auvent effondré)
    const H0 = new V(42.2, 0, -4.4);         // la place de Houngbo, derrière l'asen
    const h = this.houngbo;
    const fx = this.world.fx;
    const r = {
      beat: -1, bt: 0, cleared: false, clearT: 0, retryT: 0, won: false, aborted: false, shake: 0,
      foes: [] as Person[], fleeing: [] as { p: Person; dir: THREE.Vector3; t: number }[], foe: null as Person | null, foeDir: new V(), foeD: 7,
      plants: [] as THREE.Object3D[], pillar: null as THREE.Mesh | null, verse: 0, tries: 0,
      glows: [fx.addGlow(A.clone().setY(1.3), 0xfff2d8, 8, 12), fx.addGlow(H0.clone().setY(1.3), 0xff5a20, 0, 9), fx.addGlow(E.clone().setY(1.1), 0xffd9a8, 2.5, 6)],
      look: A.clone().setY(1), hLook: 0, hArrived: false,
    };
    this.rite = r as never;
    const truth = (on: boolean) => { this.camera.layers.set(0); this.camera.layers.enable(on ? LAYER_TRUTH : LAYER_SEEN); };
    const extra = Math.min(2, story.marque); // la Marque rend le chant plus long
    // ---- caméras
    const shake = () => { if (r.shake > 0) { r.shake = Math.max(0, r.shake - 1 / 60); this.camera.position.x += (Math.random() - 0.5) * r.shake * 0.3; this.camera.position.y += (Math.random() - 0.5) * r.shake * 0.3; } };
    const eyes = (target: THREE.Vector3, k = 0.12) => {
      this.camera.position.copy(E);
      r.look.lerp(target, k);
      this.camera.lookAt(r.look);
      shake();
    };
    const orbit = (t: number) => {
      const a = 2.55 + t * 0.11; // un arc à l'ouest de l'asen, là où rien ne bouche la vue
      this.camera.position.set(A.x + Math.cos(a) * 5.6, 2.3 + Math.sin(t * 0.3) * 0.3, A.z + Math.sin(a) * 5.6);
      this.camera.lookAt(A.x, 0.9, A.z);
    };
    const hide = (p: Person) => { p.root.visible = false; };
    const face = (p: Person | THREE.Object3D, to: THREE.Vector3) => { const o = 'root' in p ? p.root : p; o.rotation.y = Math.atan2(to.x - o.position.x, to.z - o.position.z); };
    // ---- les coups reçus
    const hit = (dmg: number, msg: string) => {
      story.souffle -= dmg;
      this.lastHurt = this.time;
      this.hud.setDanger(Math.max(0, 1 - story.souffle / 100));
      r.shake = 0.55;
      this.scare('stinger2', 0.7);
      this.audio.thud();
      this.audio.grunt('m', false, 0.7, 0);
      this.hud.say(msg, 2.5);
      if (story.souffle <= 0) { this.riteDeath(); return false; }
      return true;
    };
    const retry = (s = 1.3) => { r.retryT = s; r.tries++; };
    // les longueurs s'adoucissent après plusieurs échecs (on finit toujours par y arriver)
    const len = (n: number) => Math.max(2, n + extra - Math.min(2, Math.floor(r.tries / 3)));
    const sprout = (o: THREE.Object3D, i: number) => {
      const c = o.clone();
      const a = i * 2.1;
      c.position.set(A.x + Math.cos(a) * 0.45, 0.62, A.z + Math.sin(a) * 0.45);
      c.visible = true;
      c.layers.enableAll();
      c.traverse((x) => x.layers.enableAll());
      this.scene.add(c);
      r.plants.push(c);
    };
    // ---- un Brûlé se jette sur Happy : kaolin au bon moment
    const foeBeat = (i: number, ang: number): Beat => ({
      qte: () => {
        const p = r.foes[i];
        if (!p) { r.cleared = true; return; }
        r.foe = p;
        r.foeDir.set(Math.cos(ang), 0, Math.sin(ang)); // ils viennent de l'est, de derrière l'asen
        r.foeD = 6;
        p.root.visible = true;
        p.play('Sprint_Loop', 0.15);
        this.audio.grunt(p.def.sex, true, 1, Math.sin(ang));
        const n = len(2);
        this.startQte(n, `THEY COME FOR YOU — ${i + 1}/3`, 'Arrows or ZQSD / WASD — then the kaolin', () => {
          p.play('Walk_Loop', 0.2);
          r.fleeing.push({ p, dir: r.foeDir.clone(), t: 0 });
          r.foe = null;
          this.audio.voiceMix('aaah', p.def.sex, { ghost: true, gain: 0.9, rate: 0.7 });
          r.clearT = 1.1;
        }, () => {
          p.play('Interact', 0.05, true);
          if (hit(13, 'Its burnt hands close on your throat.')) { r.foeD = 4.5; retry(); }
        }, { per: 1.45, kaolinAt: n });
      },
      cam: (t) => {
        const p = r.foe;
        if (p) {
          // il court vers Happy pendant la combinaison
          const q = this.qte;
          const left = q ? (q.keys.length - q.idx - 1) * q.per + q.keyT : 0;
          const target = 1.25 + Math.min(r.foeD - 1.25, left * 1.7);
          r.foeD += (target - r.foeD) * Math.min(1, t * 3);
          p.root.position.set(E.x + r.foeDir.x * r.foeD, 0, E.z + r.foeDir.z * r.foeD);
          face(p, E);
          eyes(p.root.position.clone().setY(1.45), 0.16);
        } else eyes(A.clone().setY(1), 0.05);
      },
    });
    // ---- Houngbo sort de la fumée : esquiver, puis frapper
    const chiefBeat = (i: number): Beat => ({
      qte: () => {
        if (!h) { r.cleared = true; return; }
        const ang = (i % 2 ? 1 : -1) * (0.35 + Math.random() * 0.4);
        r.foeDir.set(Math.cos(ang), 0, Math.sin(ang));
        r.foeD = 5.5;
        h.root.visible = true;
        h.play('Walk_Loop', 0.2);
        this.audio.sfx('breath', { gain: 1, pan: Math.sin(ang) });
        r.glows[1].intensity = 6;
        this.startQte(len(4), `HOUNGBO — ${i + 1}/3`, 'Dodge… and strike with the machete', () => {
          // le coup de machette : des braises jaillissent de sa poitrine
          this.audio.swoosh();
          setTimeout(() => {
            this.audio.thud();
            this.sparks.burst(h.root.position.clone().setY(1.4), 70);
            this.audio.voiceMix('argh', 'm', { ghost: true, gain: 1, rate: 0.55 });
            h.play('Hit_Chest', 0.05, true);
            r.shake = 0.25;
            r.foeD = 9;
          }, 180);
          r.clearT = 1.6;
        }, () => {
          h.play('Interact', 0.05, true);
          if (hit(16, 'His hand of ash strikes your chest.')) { r.foeD = 4.5; retry(1.5); }
        }, { per: 1.3 });
      },
      cam: (t) => {
        if (!h) return;
        r.foeD += ((this.qte ? 1.5 : r.foeD) - r.foeD) * Math.min(1, dtStep * 1.2);
        h.root.position.set(E.x + r.foeDir.x * r.foeD, 0, E.z + r.foeDir.z * r.foeD);
        face(h, E);
        if (Math.random() < dtStep * 6) fx.emitSmoke(h.root.position.clone().setY(1.1), 1.4, 0.4, 3, 0x1a1612);
        eyes(h.root.position.clone().setY(1.75), 0.14 + Math.min(0.2, t * 0.05));
      },
    });
    // ---- une strophe du chant (au milieu, il frappe : kaolin)
    const verseBeat = (v: number): Beat => ({
      qte: () => {
        const names = ['Moon liana', 'Ash grass', 'Hornbill flower'];
        const n = len(5 + v);
        if (h) { h.root.position.copy(H0); face(h, E); h.root.visible = true; h.play('Idle_Talking_Loop', 0.3); }
        this.startQte(n, `VERSE ${v + 1}/3 — ${names[v]}`, 'Sing with Dah Agossou: arrows or ZQSD / WASD', () => {
          this.line((['chant_1', 'chant_2', 'chant_3'] as const)[v], 6);
          this.audio.sfx('souls', { gain: 0.7 });
          r.verse = v + 1;
          r.glows[0].intensity = 5 + r.verse * 4;
          r.clearT = 5.5;
        }, () => {
          if (h) h.play('Interact', 0.05, true);
          if (hit(11, 'A wrong word. The verse breaks — sing it again.')) retry(1.6);
        }, { per: 1.55, kaolinAt: Math.floor(n / 2) + 1 });
      },
      cam: (t) => {
        // à genoux devant l'asen ; quand il frappe, on se tourne vers lui
        const striking = this.qte && this.qte.keys[this.qte.idx] === 'kaolin';
        if (h && striking && r.hLook === 0) { r.hLook = 1; h.play('Interact', 0.1, true); this.audio.sfx('stinger2', { gain: 0.5 }); }
        if (!striking) r.hLook = 0;
        this.camera.position.set(E.x + 1.4, 1.05, E.z + Math.sin(t * 0.2) * 0.2);
        r.look.lerp(striking && h ? h.root.position.clone().setY(1.7) : A.clone().setY(0.75 + r.verse * 0.4), 0.1);
        this.camera.lookAt(r.look);
        shake();
        if (r.pillar) { const want = r.verse * 7 + 0.01; r.pillar.scale.y += (want - r.pillar.scale.y) * 0.03; r.pillar.position.y = r.pillar.scale.y / 2; }
      },
    });
    let dtStep = 1 / 60;
    // ---- le déroulé
    const beats: Beat[] = [
      { d: 9.5, enter: () => {
        this.director.title('THE RITE', 'ACT III — THE LAST HEALER', 4.5);
        this.audio.loop('rite_drums', 0.3);
        this.audio.loop('rite', 0.8, 'music/rite.mp3');
        this.audio.loop('nightmusic', 0, 'music/night.mp3');
        this.audio.loop('ingame', 0, 'music/theme.mp3');
        this.audio.loop('tension', 0, 'music/tension.mp3');
        this.audio.loop('drone', 0);
        this.line('agossou_rite', 9);
        for (const [i, id] of ['liana', 'ash', 'flower'].entries()) { const pk = this.pickups.find((x) => x.id === id); if (pk) sprout(pk.obj, i); }
      }, cam: (t) => orbit(t) },
      { d: 7.5, enter: () => {
        truth(true); // désormais, on le voit tel qu'il est
        if (h) { h.root.position.set(47, 0, -11); h.root.visible = true; h.play('Walk_Loop', 0.2); for (const o of this.houngboSeen) o.visible = true; }
        r.glows[1].intensity = 6;
        this.audio.sfx('stinger3', { gain: 0.7 });
        setTimeout(() => { this.line('houngbo_rite1', 6); this.audio.sfx('laugh', { gain: 0.9 }); }, 700);
        // ses gens se lèvent dans les cendres
        for (let i = 0; i < 3; i++) {
          const e = this.enemies.spawn(new V(A.x + 7, 0, A.z + (i - 1) * 5), false, 'stalk');
          if (!e) continue;
          this.enemies.list = this.enemies.list.filter((x) => x !== e);
          e.person.play('Idle_Loop');
          face(e.person, E);
          r.foes.push(e.person);
        }
      }, cam: (t) => {
        if (h) {
          const k = Math.min(1, t / 5);
          h.root.position.set(47 + (H0.x - 47) * k, 0, -11 + (H0.z + 11) * k);
          face(h, E);
          if (k >= 1 && !r.hArrived) { r.hArrived = true; h.play('Idle_Talking_Loop', 0.3); }
        }
        eyes(h ? h.root.position.clone().setY(1.8) : A, 0.08);
      } },
      foeBeat(0, -0.55), foeBeat(1, 0.5), foeBeat(2, 0.05),
      { d: 6, enter: () => {
        this.line('houngbo_rite2', 6);
        for (const p of r.foes) if (!r.fleeing.some((f) => f.p === p)) hide(p);
        if (h) h.play('Walk_Loop', 0.3);
      }, cam: (t) => {
        this.world.sky.smoke = Math.min(1, this.world.sky.smoke + dtStep * 0.35);
        if (h) { h.root.position.x += dtStep * 1.3; h.root.position.z -= dtStep * 0.6; face(h, new V(60, 0, -14)); if (t > 4.5) h.root.visible = false; }
        this.camera.position.set(32.6, 2.2, -1.2);
        this.camera.lookAt(h ? h.root.position.clone().setY(1.4) : A);
      } },
      chiefBeat(0), chiefBeat(1), chiefBeat(2),
      { d: 5.5, enter: () => {
        this.line('houngbo_rite3', 5);
        this.world.sky.smoke = 0.35;
        if (h) { h.root.position.copy(H0); face(h, E); h.root.visible = true; h.play('Idle_Talking_Loop', 0.3); }
        r.glows[1].intensity = 4;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
        pillar.position.set(A.x, 0.5, A.z);
        pillar.scale.y = 0.01;
        pillar.layers.enableAll();
        this.scene.add(pillar);
        r.pillar = pillar;
      }, cam: (t) => {
        this.camera.position.set(E.x + Math.min(1.4, t * 0.5), 1.62 - Math.min(0.57, t * 0.25), E.z);
        r.look.lerp(A.clone().setY(0.75), 0.06);
        this.camera.lookAt(r.look);
      } },
      verseBeat(0), verseBeat(1), verseBeat(2),
      { d: 3.5, enter: () => { this.audio.sfx('souls', { gain: 1 }); r.glows[0].intensity = 22; }, cam: (t) => {
        this.camera.position.set(A.x - 5.5, 1.2 + t * 0.6, A.z + 2.5);
        this.camera.lookAt(A.x, 2 + t * 2, A.z);
        if (r.pillar) r.pillar.scale.y = Math.max(r.pillar.scale.y, 21 + t * 8);
      } },
    ];
    const next = () => {
      r.beat++;
      r.bt = 0;
      r.cleared = false;
      r.clearT = 0;
      r.retryT = 0;
      r.tries = 0;
      if (r.beat >= beats.length) { r.won = true; this.director.skip(); return; }
      const b = beats[r.beat];
      b.enter?.();
      b.qte?.();
    };
    this.director.play({
      duration: 1e9,
      update: (_t, dt) => {
        if (!this.rite || r.aborted) return;
        dtStep = dt;
        r.bt += dt;
        h?.update(dt);
        for (const p of r.foes) if (p.root.visible) p.update(dt);
        for (const f of r.fleeing) {
          f.t += dt;
          f.p.root.position.addScaledVector(f.dir, dt * 3);
          face(f.p, f.p.root.position.clone().add(f.dir));
          if (f.t > 1.8) hide(f.p);
        }
        this.kaolinFx.update(dt);
        this.sparks.update(dt);
        this.updateQte(dt);
        if (r.beat < 0) return next();
        const b = beats[r.beat];
        b.cam?.(r.bt);
        if (r.retryT > 0 && (r.retryT -= dt) <= 0) b.qte?.();
        if (r.clearT > 0 && (r.clearT -= dt) <= 0) r.cleared = true;
        if (b.qte ? r.cleared : r.bt >= (b.d ?? 0)) next();
      },
      end: () => {
        if (r.aborted) return;
        truth(false);
        if (r.won) { this.healerEnding(); return; }
        // ne devrait pas arriver (le rite ne se passe pas) : on rend la main
        this.resetRite();
        this.mode = 'playing';
      },
    }, false);
  }

  // Le souffle de Happy lâche pendant le rite : on se réveille avant l'asen (sauvegarde)
  private riteDeath(): void {
    const r = this.rite as { aborted: boolean } | null;
    if (r) r.aborted = true;
    this.stopQte();
    this.camera.layers.set(0);
    this.camera.layers.enable(LAYER_SEEN);
    this.director.skip();
    this.die('chant');
  }

  private resetRite(): void {
    const r = this.rite as RiteState | null;
    this.stopQte();
    if (!r) return;
    this.rite = null;
    if (r.pillar) this.scene.remove(r.pillar);
    for (const o of r.plants) this.scene.remove(o);
    for (const p of r.foes) this.scene.remove(p.root);
    for (const g of r.glows) this.world.fx.removeGlow(g);
    this.world.sky.smoke = 0;
    if (this.houngbo) this.houngbo.root.visible = false;
    for (const o of this.houngboSeen) o.visible = true;
    this.camera.layers.set(0);
    this.camera.layers.enable(LAYER_SEEN);
    this.audio.loop('rite_drums', 0);
    this.audio.loop('rite', 0, 'music/rite.mp3');
    this.hud.setTracker(null);
    this.viewmodel.equip(story.inventory.includes('Machete') ? 'Machete' : story.inventory.includes('Tire iron') ? 'Tire iron' : null);
  }

  // ---------------------------------------------------------------- Fin IV : le dernier guérisseur
  private healerEnding(): void {
    const r = this.rite;
    setFlag('ended');
    this.mode = 'cine';
    this.stopQte();
    if (r) { for (const g of r.glows) this.world.fx.removeGlow(g); for (const p of r.foes) p.root.visible = false; }
    this.rite = null;
    this.world.sky.smoke = 0;
    this.hud.setTracker(null);
    this.hud.setKaolin(null);
    this.audio.loop('rite_drums', 0);
    this.audio.loop('rite', 0, 'music/rite.mp3');
    for (const e of this.enemies.list) e.person.root.visible = false;
    const w = this.world;
    const h = this.houngbo;
    const souls: THREE.Object3D[] = [...Object.entries(w.people).filter(([id, p]) => p.def.azevi && id !== 'ayaba').map(([, p]) => p.root), ...this.statues.map((s) => s.p.root)];
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.85 });
    const sprout = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a20 }));
    trunk.position.y = 0.35;
    sprout.add(trunk);
    const leafM = new THREE.MeshStandardMaterial({ color: 0x5aa83a, emissive: 0x2a5a1a, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), leafM); l.position.set(Math.cos(i) * 0.12, 0.55 + i * 0.03, Math.sin(i) * 0.12); l.rotation.set(-1, i, 0); sprout.add(l); }
    sprout.position.set(0.2, 2.15, -19.8);
    sprout.scale.setScalar(0.01);
    this.scene.add(sprout);
    const ay = w.people['ayaba'];
    const fired = new Set<string>();
    const at = (k: string, t: number, now: number, f: () => void) => { if (now >= t && !fired.has(k)) { fired.add(k); f(); } };
    let done = false;
    // sous le flash blanc : on compile tout de suite les âmes en lumière (personnages animés + glow)
    const swap: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    for (const so of souls) so.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { swap.push([m, m.material]); m.material = glow; } });
    void this.warmup(this.scene, true);
    for (const [m, mat] of swap) m.material = mat;
    this.director.play({
      duration: 64,
      update: (t, dt) => {
        h?.update(dt);
        // l'aube se lève, puis le plein jour revient sur Azé-tin
        story.minutes = t < 24 ? 28 * 60 + 30 + t * 3 : t < 32 ? 29 * 60 + 42 + (t - 24) * 10 : 32 * 60 + 30;
        if (t < 14) {
          // les âmes s'élèvent en lumière au-dessus de la station
          this.camera.position.set(31, 2 + t * 0.15, 4);
          this.camera.lookAt(38.6, 2 + t * 0.6, -6.6);
          for (const s of souls) {
            if (t > 2 && !s.userData.freed) { s.userData.freed = true; s.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.userData.orig ??= (o as THREE.Mesh).material; (o as THREE.Mesh).material = glow; o.layers.enableAll(); } }); }
            if (s.userData.freed) s.position.y += dt * (0.6 + (s.id % 5) * 0.15);
          }
        }
        at('souls', 2, t, () => { this.audio.sfx('souls', { gain: 1 }); this.audio.loop('dawn', 0.6, 'music/dawn.mp3'); });
        // Houngbo est jugé : la terre le reprend, dans le feu
        at('judge', 6, t, () => { this.line('houngbo_judged', 5); this.audio.sfx('judged', { gain: 1 }); if (h) { for (const o of this.houngboSeen) o.visible = true; h.root.visible = true; h.root.position.set(36, 0, -2); h.play('Hit_Chest', 0.1, true); } });
        if (h && t > 7 && t < 14) { h.root.position.y -= dt * 0.5; if (Math.random() < dt * 8) w.fx.burstEmbers(h.root.position.clone().setY(0.3), 20, 1, 2); }
        // Ayaba dit au revoir au bord de l'eau
        at('ayaba', 14, t, () => { if (ay) { ay.root.position.set(1, 0, -40); ay.root.rotation.y = 0; ay.root.visible = true; ay.play('Idle_Talking_Loop'); } this.line('ayaba_goodbye', 9); });
        if (t >= 14 && t < 26) { this.camera.position.set(1.2, 1.3, -36.2); this.camera.lookAt(1, 1.0, -40); }
        if (ay && t > 22 && t < 26) { ay.root.position.z -= dt * 1; ay.root.scale.setScalar(Math.max(0.01, 1 - (t - 22) / 4)); }
        // une pousse d'iroko perce la souche de Loko
        if (t >= 26 && t < 32) { this.camera.position.set(1.8, 2.7, -17.4); this.camera.lookAt(0.2, 2.35, -19.8); sprout.scale.setScalar(Math.min(1, (t - 26) / 5)); }
        at('hornbill', 28, t, () => this.audio.sfx('hornbill', { gain: 1 }));
        // ---- le village tel qu'il aurait dû être : au grand jour, tout le monde danse et rit
        at('joyIn', 31.6, t, () => this.whiteOut(true));
        at('joy', 32.2, t, () => { this.setupJoy(souls); this.whiteOut(false); });
        if (t >= 32 && t < 50 && this.joy) {
          for (const p of this.joy.people) p.update(dt);
          const a = 0.6 + (t - 32) * 0.07;
          this.camera.position.set(Math.sin(a) * 13, 3.2 + Math.sin((t - 32) * 0.3) * 1.2, 9.4 + Math.cos(a) * 13);
          this.camera.lookAt(0, 1.2, 9.4);
          if (Math.random() < dt * 0.8) this.audio.voiceMix('ha ha ha', Math.random() < 0.5 ? 'f' : 'm', { gain: 0.5, pan: Math.random() * 2 - 1, rate: 1.1 });
        }
        at('joyOut', 49.4, t, () => { this.audio.sfx('souls', { gain: 1 }); this.whiteOut(true); });
        at('joyEnd', 50.2, t, () => { this.clearJoy(); this.whiteOut(false); });
        // Happy appelle sa mère : le réseau revient avec le jour
        at('call', 52, t, () => { this.phone.notify('phone', 'Mum', 'Calling…', 5); this.line('happy_mom', 8); });
        if (t >= 50.2) { this.camera.position.set(2, 1.65, -10 + (t - 50) * 0.4); this.camera.lookAt(0, 6 + (t - 50) * 0.5, -60); }
      },
      end: () => {
        if (done) return;
        done = true;
        markEnding('healer');
        this.postCredits();
      },
    });
  }

  // ---- Le village guéri : chacun reprend son vrai visage, au soleil, et la fête recommence — joyeuse cette fois
  private joy: { people: Person[]; props: THREE.Object3D[]; fires: FireHandle[] } | null = null;
  private setupJoy(souls: THREE.Object3D[]): void {
    const w = this.world;
    const props: THREE.Object3D[] = [];
    const people: Person[] = [];
    for (const s of souls) s.traverse((o) => { if (o.userData.orig) (o as THREE.Mesh).material = o.userData.orig; });
    for (const st of this.statues) st.p.root.visible = false;
    for (const e of this.enemies.list) e.person.root.visible = false;
    if (this.houngbo) this.houngbo.root.visible = false;
    w.followGaze = false;
    // les villageois, Mama Dossi et Ayaba dansent autour du feu de la place
    const all = Object.entries(w.people).filter(([id]) => id !== 'kossi').map(([, p]) => p).concat(this.enemies.list.map((e) => e.person));
    all.forEach((p, i) => {
      p.root.visible = true;
      p.root.scale.setScalar(1);
      p.root.position.y = 0;
      const ring = i < 10 ? 3.3 : 5.4;
      const a = (i / Math.min(10, all.length)) * Math.PI * 2 + (i >= 10 ? 0.3 : 0);
      p.root.position.set(Math.cos(a) * ring, 0, 9.4 + Math.sin(a) * ring);
      p.root.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      p.play(i % 4 === 3 ? 'Idle_Talking_Loop' : 'Dance_Loop', 0.1);
      p.mixers.forEach((m) => (m.timeScale = 0.9 + (i % 3) * 0.1));
      people.push(p);
    });
    // Kossi, enfin, sourit : il regarde danser les autres
    const k = w.people['kossi'];
    if (k) { k.root.position.set(-6.5, 0, 12.5); k.root.rotation.y = Math.atan2(6.5, -3.1); k.play('Idle_Talking_Loop'); people.push(k); }
    // Dah Agossou, en blanc, bénit la fête près des tambours
    const ag = buildPerson(this.models, { id: 'agossou-joy', sex: 'm', height: 1.74, skin: '#3a2618', top: 'bomba', wax: ['#efe9dc', '#d8d0c0', '#c8bfae'], pants: '#e8e2d4', beard: true, azevi: false, pose: 'Idle_Loop' });
    if (ag) { ag.root.position.set(4.5, 0, 14.5); ag.root.rotation.y = Math.atan2(-4.5, -5.1); ag.play('Interact'); this.scene.add(ag.root); props.push(ag.root); people.push(ag); }
    // les tambours et les fanions jaune-vert-rouge
    for (const [x, z, sc] of [[2.6, 12.8, 1], [3.4, 12.1, 0.85]]) {
      const d = instance(this.models, 'az-drum', sc);
      if (d) { d.position.set(x, 0, z); this.scene.add(d); props.push(d); }
    }
    const flagMats = [0x1f7a3a, 0xe0b020, 0xc0201a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
    const poles: [number, number][] = [[-5.5, 4], [5.5, 4], [5.5, 15], [-5.5, 15]];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = poles[i], [x1, z1] = poles[(i + 1) % 4];
      for (let n = 1; n < 12; n++) {
        const u = n / 12;
        const f = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.13, 0, 0), new THREE.Vector3(0.13, 0, 0), new THREE.Vector3(0, -0.32, 0)]), flagMats[n % 3]);
        f.geometry.computeVertexNormals();
        f.position.set(x0 + (x1 - x0) * u, 3.25 - Math.sin(u * Math.PI) * 0.6, z0 + (z1 - z0) * u);
        f.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        this.scene.add(f);
        props.push(f);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
      pole.position.set(x0, 1.7, z0);
      this.scene.add(pole);
      props.push(pole);
    }
    // plus de cendre : les feux des ruines s'éteignent, le feu de la place est un feu de fête
    w.flameScale = [1.2, 0, 0];
    for (const l of this.hutGlow) l.intensity = 0;
    this.audio.loop('festival', 0.7);
    this.audio.loop('fire', 0);
    this.joy = { people, props, fires: [] };
  }

  private clearJoy(): void {
    if (!this.joy) return;
    for (const p of this.joy.people) p.root.visible = false;
    for (const o of this.joy.props) this.scene.remove(o);
    this.audio.loop('festival', 0);
    this.joy = null;
  }

  // Scène après le générique : un an plus tard, quelqu'un tombe en panne devant le panneau…
  private postCredits(): void {
    this.director.fadeTo(1, 1.2);
    setTimeout(() => {
      story.minutes = 19 * 60 + 40;
      this.world.hazardsOn = true;
      const happy = buildPerson(this.models, { id: 'healer-happy', sex: 'm', height: 1.8, skin: '#5a3a26', top: 'chemise', wax: ['#efe9dc', '#d8c8a8', '#c8a86a'], pants: '#2a241e', azevi: false, pose: 'Idle_Loop' });
      happy?.play('Walk_Loop');
      if (happy) { happy.root.position.set(1.5, 0, 52); happy.root.rotation.y = 0; this.scene.add(happy.root); }
      const lamp = instance(this.models, 'az-lamp', 1.4);
      if (lamp && happy) { lamp.position.set(0.32, 0.75, 0.1); happy.root.add(lamp); }
      this.director.fadeTo(0, 1.5);
      this.director.title('ONE YEAR LATER', '', 4);
      let done = false;
      const fired = new Set<string>();
      this.director.play({
        duration: 16,
        update: (t, dt) => {
          happy?.update(dt);
          if (happy && t < 9) happy.root.position.z += dt * 1.2;
          this.camera.position.set(2.4, 1.6, 67);
          this.camera.lookAt(1.5, 1.4, happy ? happy.root.position.z : 60);
          if (t > 9 && !fired.has('l')) { fired.add('l'); happy?.play('Idle_Talking_Loop'); this.line('happy_postcredit', 6); }
        },
        end: () => {
          if (done) return;
          done = true;
          void this.finalScreen('Ending IV — The Last Healer', ['The rite frees the souls. Mama Dossi and the villagers rise into the light. Houngbo is judged by the ancestors.',
            'Ayaba says goodbye. A shoot of iroko breaks through the stump of Loko.', 'Happy calls his mother: “I’m going to stay a little while.”', 'One year later, a car breaks down in front of the sign — repainted. A man with a calabash walks up, a lamp in his hand.'], true);
        },
      });
    }, 1300);
  }

  // Un personnage marche le long d'un chemin, puis s'arrête
  private walkers: { id: string; path: THREE.Vector3[] }[] = [];
  private walk(id: string, path: THREE.Vector3[]): void {
    this.walkers = this.walkers.filter((w) => w.id !== id);
    this.walkers.push({ id, path: [...path] });
    this.world.people[id]?.play('Walk_Loop');
  }
  private updateWalkers(dt: number): void {
    for (const w of this.walkers) {
      const p = this.world.people[w.id];
      if (!p || !w.path.length) continue;
      const target = w.path[0];
      const d = this.v2.copy(target).sub(p.root.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.15) {
        w.path.shift();
        if (!w.path.length) p.play('Idle_Loop');
        continue;
      }
      p.root.rotation.y = Math.atan2(d.x, d.z);
      p.root.position.addScaledVector(d.normalize(), Math.min(dist, 1.35 * dt));
    }
    this.walkers = this.walkers.filter((w) => w.path.length);
  }

  // Fin I (The Survivor) — ou fin II si la Marque est à 3, ou si l'aube trouve Happy encore au village
  private ending(dawn = false): void {
    if (story.marque >= 3 || dawn) {
      markEnding('azevi');
      void this.finalScreen('Ending II — The Azévi', dawn
        ? ['Dawn finds you still in Azé-tin. You sit down in front of a hut, and you cannot remember why you wanted to leave.', 'Later, headlights on the road. You stand up. You walk towards them, smiling.']
        : ['The engine coughs, then nothing. In the rear-view mirror, your own face is ash.', 'Later, headlights on the road. You stand up. You walk towards them, smiling.']);
    } else {
      markEnding('survivor');
      void this.finalScreen('Ending I — The Survivor', ['You drive towards the dawn. The radio comes back. You call your mother, and you laugh, and you cannot stop.',
        'In the rear-view mirror, on the back seat, an owl is watching you.', 'Azé-tin is waiting for the next one.']);
    }
  }

  private nearestInteractable(): Interactable | null {
    const fwd = this.player.forward(this.v1);
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (best && !best.low && it.low) continue;
      if (!it.label()) continue;
      const dx = it.pos.x - this.player.pos.x;
      const dz = it.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.range || (d >= bestD && !(best?.low && !it.low))) continue;
      const facing = d < 0.8 ? 1 : (dx * fwd.x + dz * fwd.z) / d;
      if (facing < 0.55) continue;
      best = it;
      bestD = d;
    }
    return best;
  }

  // ---------- Boucle ----------

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.world.update(dt, this.time, this.camera.position);
    this.adaptQuality(dt);
    // au menu : le coucher du soleil ; en jeu : l'heure de l'histoire
    this.world.sky.update(this.mode === 'menu' ? 19 * 60 + 6 : story.minutes, this.camera);

    this.audio.loop('theme', this.mode === 'menu' ? 0.75 : 0, 'music/theme.mp3');
    if (this.mode === 'menu') this.updateMenuCamera();
    else if (this.mode === 'playing') {
      if (this.phone.viewerOpen) this.hud.setPrompt(null); // lecture d'une preuve : tout est figé
      else this.updatePlaying(dt);
    }
    else if (this.mode === 'cine') {
      if (this.input.wasPressed('Space')) this.director.userSkip();
      this.lightsOff();
      this.mirror.raised = 0;
      this.hud.setPrompt(null);
    }
    this.director.update(dt);

    this.hud.update(dt);
    this.phone.tick(dt);
    this.audio.update();

    if (this.creditsOn) return;
    if (this.rawLook) { this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.render(this.scene, this.camera); this.renderer.toneMapping = THREE.NoToneMapping; }
    else this.look.render(dt);
    if (this.mode === 'playing' && this.mirror.raised >= 0.02) {
      // le cadre du rétroviseur est dessiné directement à l'écran : il garde son propre rendu de tons
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.mirror.render(this.renderer, this.scene);
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
    if (this.mode === 'dead') this.camera.position.y = Math.max(0.35, this.camera.position.y - dt * 1.2); // Happy s'effondre
    this.input.endFrame();
  }

  // Qualité automatique : si l'ordinateur peine (moins de ~28 images/s), on baisse la résolution de rendu ;
  // s'il est à l'aise, on la remonte. Les ombres sautent en dernier recours.
  private perfAcc = 0;
  private perfN = 0;
  private pixelRatio = Math.min(devicePixelRatio, 1.5);
  private setQuality(q: Quality): void {
    this.look.setQuality(q);
    const size = q === 'high' ? 2048 : q === 'medium' ? 1024 : 512;
    const m = this.world?.sky.moon;
    if (m && m.shadow.mapSize.x !== size) { m.shadow.mapSize.set(size, size); m.shadow.map?.dispose(); m.shadow.map = null; }
  }

  private adaptQuality(dt: number): void {
    if (this.mode !== 'playing' && this.mode !== 'cine') return;
    this.perfAcc += dt;
    this.perfN++;
    if (this.perfAcc < 2.5) return;
    const mean = this.perfAcc / this.perfN;
    this.perfAcc = 0;
    this.perfN = 0;
    const max = Math.min(devicePixelRatio, 1.5);
    let pr = this.pixelRatio;
    if (mean > 1 / 28 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
    else if (mean < 1 / 55 && pr < max) pr = Math.min(max, pr + 0.1);
    if (mean > 1 / 22 && pr <= 0.6 && this.flash.shadow.mapSize.x > 256) {
      // dernier recours : ombre du flash plus petite (couper les ombres recompilerait tous les shaders)
      this.flash.shadow.mapSize.set(256, 256);
      this.flash.shadow.map?.dispose();
      this.flash.shadow.map = null;
    }
    // l'ordinateur peine encore à la plus petite résolution : on retire un cran d'effets (sans l'enregistrer)
    if (mean > 1 / 24 && pr <= 0.75 && this.look.quality !== 'low') {
      this.look.setQuality(this.look.quality === 'high' ? 'medium' : 'low', false);
      pr = Math.min(max, pr + 0.15);
    }
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(innerWidth, innerHeight);
      this.look.setSize(innerWidth, innerHeight);
    }
  }

  private updateMenuCamera(): void {
    // Lente dérive autour du 4×4 en panne devant le panneau
    const f = this.world.menuFocus;
    const a = 0.55 + Math.sin(this.time * 0.05) * 0.35;
    this.camera.position.set(f.x + Math.sin(a) * 8.5, 1.5 + Math.sin(this.time * 0.13) * 0.15, f.z + Math.cos(a) * 8.5);
    this.camera.lookAt(f);
    this.lightsOff();
    this.mirror.raised = 0;
  }

  // Toutes les variantes de matériaux créées en cours de jeu (rite, fin IV, fête) : compilées d'avance
  private materialZoo(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(0, -80, 0);
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    const mats: THREE.Material[] = [];
    for (const side of [THREE.FrontSide, THREE.DoubleSide]) {
      for (const map of [null, tex]) {
        mats.push(new THREE.MeshBasicMaterial({ side, map, transparent: true }));
        mats.push(new THREE.MeshStandardMaterial({ side, map, emissive: 0x111111 }));
        mats.push(new THREE.MeshStandardMaterial({ side, map, flatShading: true }));
        mats.push(new THREE.MeshLambertMaterial({ side, map }));
      }
    }
    for (const m of mats) g.add(new THREE.Mesh(geo, m));
    const pg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.1, transparent: true })));
    g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.1, map: tex, transparent: true, vertexColors: true })));
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true })));
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true })));
    return g;
  }

  // Préchauffage des shaders : tout est rendu une fois, caché derrière l'écran de chargement ou un fondu,
  // dans toutes les variantes (écran, ombres, rétroviseur). Plus aucune compilation en pleine partie.
  private warmRT = new THREE.WebGLRenderTarget(64, 64);
  private async warmup(root: THREE.Object3D, sync = false): Promise<void> {
    const shown: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (!o.visible) { o.visible = true; shown.push(o); }
      if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
    });
    const mask = this.camera.layers.mask;
    this.camera.layers.enableAll();
    const fi = this.flash.intensity, fa = this.flash.shadow.autoUpdate;
    this.flash.intensity = 1;
    this.flash.shadow.autoUpdate = true;
    try {
      // en cours de partie : tout en une fois (rien ne doit s'afficher entre-temps)
      if (sync) this.renderer.compile(root, this.camera, this.scene);
      else await this.renderer.compileAsync(root, this.camera, this.scene);
      this.renderer.setRenderTarget(this.warmRT);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.look.render(0);
      // le rétroviseur : sa propre cible de rendu et son cadre par-dessus l'écran
      const r = this.mirror.raised;
      this.mirror.raised = 1;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.mirror.render(this.renderer, this.scene);
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.mirror.raised = r;
    } catch { /* pas grave */ }
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    this.camera.layers.mask = mask;
    this.flash.intensity = fi;
    this.flash.shadow.autoUpdate = fa;
  }

  // Ne JAMAIS cacher une lumière (visible=false) : three.js recompilerait tous les shaders du jeu
  // (gel de plusieurs secondes sous Windows). On coupe l'intensité, et l'ombre du flash ne se recalcule plus.
  private lightsOff(): void {
    this.flash.intensity = 0;
    this.fill.intensity = 0;
    this.flash.shadow.autoUpdate = false;
  }

  private updatePlaying(dt: number): void {
    const locked = document.pointerLockElement === this.renderer.domElement;

    if (this.input.wasPressed('Tab') && !this.fb) this.togglePhone();
    if (this.input.wasPressed('KeyM')) this.openMap();
    if (this.input.wasPressed('KeyF')) {
      this.toggleTorch(false);
    }

    this.player.update(dt, this.input, locked && !this.phone.open && !this.grab);

    // Batterie : le flash et l'écran du téléphone la vident, le 4×4 la recharge
    const nearCar = this.player.pos.distanceTo(this.world.points.car) < 3.4;
    if (nearCar && hasFlag('trunk')) story.battery = Math.min(100, story.battery + 2.5 * dt);
    if (this.flashOn && !this.fb) story.battery -= 0.12 * dt;
    if (this.phone.open) story.battery -= 0.06 * dt;
    story.battery = Math.max(0, story.battery);
    // à 5 %, le flash s'éteint (le téléphone garde de quoi afficher la carte) : retour au 4×4
    if (story.battery <= 5 && this.flashOn) {
      this.flashOn = false;
      this.line('happy_flash_dead', 7);
    }
    // Le flash du téléphone baisse avec la batterie : plein jusqu'à 60 %, puis il faiblit, jaunit et vacille sous 15 %
    this.flash.shadow.autoUpdate = this.flashOn;
    const charge = THREE.MathUtils.clamp(story.battery / 60, 0, 1);
    const k = 0.18 + 0.82 * Math.pow(charge, 0.8);
    const low = story.battery < 15;
    if (this.blackout > 0) this.blackout -= dt;
    const flicker = !this.flashOn || this.blackout > 0 ? 0 : low && Math.random() < 0.07 ? 0.15 : 1;
    // De près, une vraie torche « brûle » le sujet : on mesure la distance à ce qui est devant
    // (murs du village + personnages) et on adoucit le faisceau, comme l'exposition auto d'un téléphone
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.12;
      const o = this.camera.getWorldPosition(this.tmpA), dir = this.camera.getWorldDirection(this.tmpB);
      const ray = this.nearRay; ray.set(o, dir);
      let d = 8;
      for (const b of this.world.colliders) { const h = ray.intersectBox(b, this.tmpC); if (h) d = Math.min(d, h.distanceTo(o)); }
      for (const p of Object.values(this.world.people)) {
        if (!p.root.visible) continue;
        p.root.getWorldPosition(this.tmpC); this.tmpC.y = o.y - 0.2;
        const v = this.tmpC.sub(o), along = v.dot(dir);
        if (along > 0 && v.lengthSq() - along * along < 0.25) d = Math.min(d, along);
      }
      this.nearD = d;
    }
    this.nearK += (THREE.MathUtils.clamp(Math.pow(this.nearD / 3.2, 1.4), 0.16, 1) - this.nearK) * Math.min(1, dt * 6);
    this.flash.intensity = 55 * k * flicker * this.nearK;
    this.flash.distance = 14 + 18 * k;
    this.fill.intensity = 6 * k * flicker * (0.4 + 0.6 * this.nearK);
    this.flash.color.setHSL(0.1, 0.25 + (1 - k) * 0.5, 0.92 - (1 - k) * 0.2);

    // Rétroviseur (clic droit maintenu)
    const wantMirror = this.lens < 0.3 && this.input.rightDown && locked && !this.phone.open && !this.fb && story.inventory.includes('Rear-view mirror');
    this.mirror.update(dt, wantMirror, this.camera.position, this.player.yaw, this.player.pitch);
    this.updateLens(dt, locked);
    if (this.mirror.raised > 0.8 && !hasFlag('sawDossi')) this.checkDossiInMirror();

    // Interaction (priorité : prise d'un Brûlé > choix > hibou > objet)
    const it = this.phone.open || this.grab || this.fb ? null : this.nearestInteractable();
    const charging = nearCar && hasFlag('trunk') && story.battery < 100;
    if (this.grab) {
      // le regard est tiré vers le visage du Brûlé
      const g = this.grab;
      const want = Math.atan2(-(g.e.pos.x - this.player.pos.x), -(g.e.pos.z - this.player.pos.z));
      let dy = want - this.player.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.player.yaw += dy * Math.min(1, dt * 8);
      this.player.pitch += (0.05 - this.player.pitch) * Math.min(1, dt * 6);
      this.hud.setPrompt(null);
      this.updateQte(dt);
    } else if (this.choice) {
      const c = this.choice;
      this.hud.setPrompt(`E — ${tr(c.a)}      R — ${tr(c.b)}`);
      if (this.input.wasPressed('KeyE')) { this.choice = null; c.onA(); }
      else if (this.input.wasPressed('KeyR')) { this.choice = null; c.onB(); }
    } else {
      if (!this.owlQte) this.hud.setPrompt(it ? `E — ${tr(it.label() ?? '')}` : charging ? tr(`Phone charging… ${Math.round(story.battery)}%`) : null);
      if (it && this.input.wasPressed('KeyE')) it.use();
    }
    this.updateWalkers(dt);
    this.murmurs();
    if (this.mirror.raised > 0.8 && !hasFlag('sawAyaba') && hasFlag('ayaba')) this.checkAyabaInMirror();

    // ---- Combat : clé démonte-roue (1), cric (2), clic gauche pour frapper ----
    if (this.input.wasPressed('Digit1') && story.inventory.includes('Tire iron')) this.viewmodel.equip('Tire iron');
    if (this.input.wasPressed('Digit2') && story.inventory.includes('Car jack')) this.viewmodel.equip('Car jack');
    if (this.input.wasPressed('Digit3') && story.inventory.includes('Machete')) this.viewmodel.equip('Machete');
    this.attackCd = Math.max(0, this.attackCd - dt);
    const weapon: WeaponDef | null = this.viewmodel.current ? WEAPONS[this.viewmodel.current] : null;
    if (weapon && this.input.leftClicked && locked && !this.phone.open && this.mirror.raised < 0.3 && this.lens < 0.3 && this.attackCd <= 0 && this.player.stamina > weapon.stamina * 0.5) {
      this.attackCd = weapon.cooldown;
      this.player.stamina = Math.max(0, this.player.stamina - weapon.stamina);
      this.viewmodel.attack();
      this.audio.swoosh();
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        const dir = this.player.forward(this.v1).clone();
        this.strikeStatues(dir, weapon.range, weapon.power);
        this.strikePeople(dir, weapon.range);
        const hits = this.enemies.strike(this.player.pos, dir, weapon.range, weapon.power);
        if (hits.length) {
          this.shake = Math.max(this.shake, 0.18);
          this.audio.thud();
          for (const h of hits) { this.sparks.burst(h, 30 + 15 * weapon.power); this.audio.grunt('m', true, 0.8, this.panOf(h)); }
        }
      }, 160);
    }
    this.viewmodel.update(dt, this.mirror.raised > 0.3 || this.phone.open, 0);
    this.sparks.update(dt);

    // ---- Kaolin (touche A en AZERTY / Q en QWERTY) : un nuage blanc qui disperse les Brûlés ----
    this.kaolinCd = Math.max(0, this.kaolinCd - dt);
    if (this.input.wasPressed('KeyQ') && hasFlag('calabash') && !this.fb && !this.grab && !this.qte && locked && !this.phone.open && this.kaolinCd <= 0) {
      if (story.kaolin <= 0) this.hud.say('The calabash is empty. Refill it at the healer’s asen.', 3);
      else {
        story.kaolin--;
        this.kaolinCd = 0.9;
        const dir = this.player.forward(this.v1).clone();
        this.audio.sfx('kaolin');
        this.kaolinFx.burst(this.camera.position.clone().addScaledVector(dir, 0.6).setY(1.3), 70, dir);
        const n = this.enemies.repel(this.player.pos, dir, 6, 40);
        this.kaolinStatues(dir);
        if (this.grab && n) { this.grab = null; this.stopQte(); this.hud.setGrabbed(false); }
        if (n) this.audio.voiceMix('aaah', 'm', { ghost: true, gain: 0.7, rate: 0.7 });
      }
    }
    this.kaolinFx.update(dt);
    this.hud.setKaolin(hasFlag('calabash') && !this.fb ? story.kaolin : null);

    // ---- Les Brûlés ; le 4×4 reste un refuge (ils n'osent pas approcher) ----
    if (!this.fb) this.enemies.update(dt, this.player.pos, nearCar);

    // ---- Le hibou et son QTE : se cacher (C) ou regarder dans le rétroviseur ----
    if (this.time > this.nextOwl && !this.owlQte && !this.fb && !this.rite && !hasFlag('ended')) {
      this.audio.sfx('owl', { pan: Math.random() * 2 - 1 });
      if (!hasFlag('firstOwl')) {
        setFlag('firstOwl');
        this.hud.say('[An owl screeches somewhere in the dark]', 4);
      } else if (hasFlag('trunk') && this.player.pos.distanceTo(this.world.points.car) > 15) {
        this.owlQte = { t: 3.5, ok: false };
      }
      this.nextOwl = this.time + (hasFlag("act2") ? 28 + Math.random() * 20 : 50 + Math.random() * 40);
    }
    if (this.owlQte) {
      const q = this.owlQte;
      q.t -= dt;
      const hiding = (this.input.down('KeyC') || this.input.down('ControlLeft')) && !this.input.down('KeyW') && !this.input.down('KeyS');
      if (hiding || this.mirror.raised > 0.8) q.ok = true;
      this.hud.setPrompt(`The owl screams — something is coming. Hide: hold C  ·  or raise the mirror (right click)   ${Math.ceil(q.t)}`);
      if (q.t <= 0) {
        this.owlQte = null;
        if (q.ok) this.hud.say(this.mirror.raised > 0.5 ? 'Happy: In the mirror… someone walked past behind me. Burning.' : 'Happy: …It passed. Whatever it was.', 5);
        else {
          const behind = this.player.forward(this.v2).multiplyScalar(-13).add(this.player.pos);
          this.enemies.spawn(behind, true, 'chase');
          this.hud.say('Footsteps. Running. Behind you.', 4);
        }
      }
    }

    if (!this.fb && !this.rite) this.guide();
    else this.hud.setDealMarker(null);
    this.beats(dt);

    // ---- Souffle : remonte lentement si rien ne frappe, vite au 4×4 ----
    if (this.time - this.lastHurt > 8) story.souffle = Math.min(100, story.souffle + (nearCar ? 6 : 1.2) * dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.hud.setDanger(Math.max(1 - story.souffle / 100, (1 - this.player.stamina / 100) * 0.45));
    story.minutes += dt / 6; // l'horloge avance aussi lentement en jouant
  }

  private openMap(): void {
    if (this.mode !== 'playing') return;
    this.phone.show('map');
    document.exitPointerLock();
  }

  // Happy frappe un habitant : les Azévi se réveillent (Brûlés), Kossi et Ayaba ne l'oublieront pas
  private strikePeople(dir: THREE.Vector3, range: number): void {
    for (const [id, p] of Object.entries(this.world.people)) {
      if (!p.root.visible) continue;
      const d = this.v2.copy(p.root.position).sub(this.player.pos);
      d.y = 0;
      const dist = d.length();
      if (dist > range || dist < 0.01 || (d.x * dir.x + d.z * dir.z) / dist < 0.5) continue;
      if (id === 'dossi') { this.hud.say('Your arm stops in mid-air. You cannot bring yourself to strike her.', 4); continue; }
      story.marque += id === 'kossi' || id === 'ayaba' ? 1 : 0;
      if (id === 'kossi') {
        story.kossiTrust = false;
        this.line('kossi_mad', 6);
        p.play('Hit_Chest', 0.1, true);
        setTimeout(() => p.play('Idle_Loop'), 900);
      } else if (id === 'ayaba') {
        this.audio.voiceMix('no', 'c', { ghost: true, gain: 1 });
        p.root.visible = false;
        this.hud.say('The girl is gone. Where she stood, the ground is wet.', 5);
      } else {
        // un villageois immobile se réveille : c'est un Brûlé
        delete this.world.people[id];
        this.enemies.adopt(p);
        this.sparks.burst(p.root.position.clone().setY(1.3), 35);
        this.audio.grunt(p.def.sex, true, 1, this.panOf(p.root.position));
      }
      this.save();
    }
  }

  // Les trois actes, bien séparés : Acte I (la panne), Acte II (la vérité), Acte III (le guérisseur… ou la fuite)
  private actLabel(index: number): string {
    const a2 = STEPS.findIndex((x) => x.id === 'stump');
    const a3 = STEPS.findIndex((x) => x.id === 'repair');
    if (index < a2) return `ACT I — The breakdown · ${index + 1}/${a2}`;
    if (index < a3) return `ACT II — The truth · ${index - a2 + 1}/${a3 - a2}`;
    if (hasFlag('repaired') && !hasFlag('riteTold')) return 'ACT III — The road';
    return `ACT III — The healer · ${index - a3 + 1}/4`;
  }

  // Repères : étape en cours (haut gauche), marqueur à l'écran, nom des lieux, découvertes pour la carte
  private guide(): void {
    const { step, index } = currentStep();
    if (index !== this.lastStep) {
      if (this.lastStep >= 0) this.hud.objective(step.text);
      this.lastStep = index;
    }
    const dead = story.battery <= 5 && hasFlag('trunk');
    this.hud.setTracker(dead ? 'Phone almost dead' : this.actLabel(index), dead ? 'Go back to your 4\u00d74 to charge your phone (follow the orange hazard lights).' : step.text,
      hasFlag('phoneOpened') ? 'Tab phone \u00b7 M map \u00b7 F torch \u00b7 V camera \u00b7 Right click mirror' : 'Tab phone \u00b7 M map \u00b7 F torch \u00b7 Right click mirror');

    // lieux : nom à l'arrivée, découverte pour la carte
    let here = '';
    for (const p of PLACES) {
      if (Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z) < p.r) { here = p.id; break; }
    }
    if (here && here !== this.hereId) {
      const p = PLACES.find((x) => x.id === here)!;
      const fresh = !story.discovered.includes(here);
      if (fresh) { story.discovered.push(here); this.save(); }
      this.hud.showPlace(p.name, fresh);
    }
    this.hereId = here;

    // marqueur d'objectif projeté à l'écran (collé au bord s'il est hors champ)
    const W = innerWidth, H = innerHeight;
    const project = (t: { x: number; z: number }): [number, number, boolean, number] | null => {
      const dist = Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z);
      if (dist < 3) return null;
      this.proj.set(t.x, 1.6, t.z).project(this.camera);
      let x = (this.proj.x * 0.5 + 0.5) * W, y = (-this.proj.y * 0.5 + 0.5) * H;
      const behind = this.proj.z > 1;
      let edge = behind || x < 40 || x > W - 40 || y < 60 || y > H - 60;
      if (behind) { x = W - x; y = H - 70; }
      x = Math.min(W - 40, Math.max(40, x));
      y = Math.min(H - 70, Math.max(70, y));
      if (behind) edge = true;
      return [x, y, edge, dist];
    };
    const off = !this.markerOn || this.phone.open;
    // l'autre direction de l'Acte III, en rouge : le marché de Houngbo
    const deal = !off && hasFlag('act2') && !hasFlag('ended') && !this.rite ? project({ x: -6, z: -30.4 }) : null;
    if (deal) this.hud.setDealMarker(deal[0], deal[1], `${tr('Burn')} · ${Math.round(deal[3])} m`, deal[2]);
    else this.hud.setDealMarker(null);
    const t = this.target();
    const m = t && !off ? project(t) : null;
    if (!m) { this.hud.setMarker(null); return; }
    this.hud.setMarker(m[0], m[1], `${Math.round(m[3])} m`, m[2]);
  }

  // Murmures : les Azévi proches chuchotent quand Happy passe (et parfois, de loin, des voix sans corps)
  private murmurs(): void {
    if (this.time < this.nextMurmur) return;
    this.nextMurmur = this.time + 5 + Math.random() * 9;
    let best: { p: THREE.Vector3; d: number; voice: { pitch: number; rate: number } } | null = null;
    for (const [id, p] of Object.entries(this.world.people)) {
      if (!p.def.azevi || id === 'dossi') continue;
      const d = p.root.position.distanceTo(this.player.pos);
      if (d < 12 && (!best || d < best.d)) best = { p: p.root.position, d, voice: p.voice };
    }
    if (best) this.audio.voiceMix('azé tin… ɖo… wa…', best.voice.pitch > 1.2 ? 'f' : 'm', { gain: 1 - best.d / 13, pan: this.panOf(best.p), ghost: true, whisper: true });
    else if (Math.random() < 0.4) this.audio.voiceMix('voices far away in the night', Math.random() < 0.5 ? 'm' : 'f', { gain: 0.3, pan: Math.random() * 2 - 1, ghost: true });
  }

  // Ayaba dans le reflet : mouillée, pas brûlée
  private checkAyabaInMirror(): void {
    const a = this.world.people['ayaba'];
    if (!a) return;
    const d = this.v2.copy(a.root.position).sub(this.player.pos);
    d.y = 0;
    const dist = d.length();
    if (dist > 9) return;
    const fwd = this.player.forward(this.v1);
    if ((d.x * fwd.x + d.z * fwd.z) / dist < -0.85) {
      setFlag('sawAyaba');
      this.line('happy_mirror_ayaba', 7);
      this.save();
    }
  }

  // Mama Dossi est-elle dans le reflet ? (derrière Happy, à moins de 10 m)
  private checkDossiInMirror(): void {
    const d = this.v2.copy(this.world.points.dossi).sub(this.player.pos);
    d.y = 0;
    const dist = d.length();
    if (dist > 10) return;
    const fwd = this.player.forward(this.v1);
    if ((d.x * fwd.x + d.z * fwd.z) / dist < -0.85) {
      setFlag('sawDossi');
      this.line('happy_mirror_dossi', 6);
      this.scare('stinger1');
      // l'idée : si le miroir montre la vérité, l'objectif du téléphone aussi
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        this.phone.notify('camera', 'Camera', 'Hold V to raise the camera', 6);
        this.hud.say('If the mirror shows the truth… maybe my phone’s camera does too. — Hold V to look through it.', 7);
      }, 7500);
      this.save();
    }
  }

  private resize(): void {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.look.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.mirror.resize(w / h);
  }
}
