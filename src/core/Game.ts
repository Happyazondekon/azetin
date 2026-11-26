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
import type { FireHandle } from '../world/Fire';
import { instance, type ModelName, type Models } from '../world/Assets';
import { LAYER_SEEN, LAYER_TRUTH } from '../world/Village';
import LINES from '../story/lines.json';
import { buildPerson, type Person } from '../world/People';
import { story, resetStory, loadGame, saveGame, hasSave, hasFlag, setFlag } from '../story/State';

type Mode = 'menu' | 'playing' | 'paused' | 'dead' | 'cine';
type LineId = Exclude<keyof typeof LINES, '_voices'>;

interface Interactable {
  label: () => string | null; // null = rien à faire ici pour l'instant
  pos: THREE.Vector3;
  range: number;
  use: () => void;
}

// braises et fumée autour d'Ayaba pendant la fuite
function w_embers(world: World, pos: THREE.Vector3): void {
  world.fx.burstEmbers(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6)), 6, 2, 1.5);
  if (Math.random() < 0.3) world.fx.emitSmoke(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.5, 2 + Math.random() * 4)), 2.5, 0.8, 5, 0x1c1612);
}

export class Game {
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
  // ---- Acte II
  private pickups: Pickup[] = [];
  private hornbill!: THREE.Object3D;
  private houngbo: Person | null = null;
  private kaolinFx!: Sparks;
  private kaolinCd = 0;
  private nextHornbill = 0;
  private act2Pending = false;
  private fb: { t: number; ran: boolean; back: [number, number, number]; weapon: string | null; light: THREE.PointLight; done: boolean } | null = null;
  private camFlashEl!: HTMLDivElement;
  // les gens de cendre de la station : ils avancent quand on ne les regarde pas
  private statues: { p: Person; home: THREE.Vector3; lastSeen: THREE.Vector3; cd: number; seen: boolean }[] = [];
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
      onSensitivity: (v) => (this.player.sensitivity = v),
      onVolume: (v) => this.audio.setVolume(v),
      onBrightness: (v) => (this.renderer.toneMappingExposure = this.exposure = v),
      onMarker: (on) => (this.markerOn = on),
      where: () => ({ x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw, target: this.target() }),
    });
    this.menu = new Menu(root, { onNew: () => this.start(false), onContinue: () => this.start(true) }, hasSave());
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
    this.buildFigure();
    const a2 = buildAct2Props(this.scene);
    this.pickups = a2.pickups;
    this.hornbill = a2.hornbill;
    this.kaolinFx = new Sparks(this.scene, 'kaolin');
    this.houngbo = buildPerson(models, { id: 'houngbo', sex: 'm', height: 1.93, skin: '#4a3224', top: 'bomba', wax: ['#6a1a5a', '#c8a030', '#2a0e24'],
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
      },
    });
    const ay = this.world.people['ayaba'];
    if (ay) setAyabaPos(() => ({ x: ay.root.position.x, z: ay.root.position.z }));
    this.interactables = this.buildInteractables();
    this.ready = true;
    this.menu.setLoading(null);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- États ----------

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
    this.grab = null;
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

  private togglePhone(): void {
    if (this.mode !== 'playing') return;
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
    const p = this.world.people[who];
    const name = who === 'happy' ? 'Happy' : who === 'kossi' ? 'Kossi' : who === 'dossi' ? 'Mama Dossi' : who === 'ayaba' ? 'Ayaba' : who === 'radio' ? 'Radio' : '';
    this.subtitles(name, text, seconds);
    const d = p ? p.root.position.distanceTo(this.player.pos) : 0;
    const gain = who === 'happy' ? 0.9 : who === 'radio' ? 0.7 : Math.max(0.3, 1 - d / 18);
    const pan = p ? this.panOf(p.root.position) : 0;
    const fallback = () => {
      if (who === 'happy') this.audio.voiceMix(text, 'm', { gain: 0.55, rate: 1.04 });
      else if (who === 'radio') this.audio.voiceMix(text, 'm', { gain: 0.35, rate: 1.1 });
      else if (p) this.audio.voiceMix(text, p.def.child ? 'c' : p.def.sex, { gain, pan, ghost: p.def.azevi, rate: p.def.child ? 1.05 : 1 });
    };
    if (!id) return fallback();
    void this.audio.playLine(id, { gain, pan, ghost: !!p?.def.azevi, radio: who === 'radio' }).then((dur) => {
      if (!dur) fallback();
      else if (dur + 0.6 > seconds) this.subtitles(name, text, dur + 0.6); // le sous-titre suit la durée de la voix
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
      this.subTimers.push(window.setTimeout(() => this.hud.say(name ? `${name}: ${c.trim()}` : c.trim(), len + 0.3), t * 1000));
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
    const left = [!hasFlag('tube') && 'an inner tube (the old moto-taxi, west)', !hasFlag('patch') && 'a patch kit (Mama Dossi’s stall)',
      !hasFlag('power') && 'power for the compressor (the old station, east)'].filter(Boolean);
    this.setObjective(left.length ? `Bring Kossi three parts (${story.pieces}/3). Still missing: ${left.join(', ')}.` : 'Bring the parts back to Kossi.');
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
        label: () => (hasFlag('repaired') ? 'Drive away' : null),
        use: () => this.ask('Drive away before dawn', () => this.ending(), 'Not yet', () => this.line('happy_notyet', 3)),
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
            this.setObjective('Bring Kossi three parts: an inner tube (the old moto-taxi, west), a patch kit (Mama Dossi’s stall), power for the compressor.');
          } else if (story.pieces >= 2 && !hasFlag('act1')) {
            setFlag('act1');
            story.inventory.push('Machete');
            this.viewmodel.equip('Machete');
            this.line('kossi_act1', 11);
            setTimeout(() => this.endOfAct1(), 11500);
            this.advance(30);
            this.setObjective('Act II — Bring power from the old fuel station (east of the village).');
          } else if (story.pieces >= 3 && !hasFlag('repaired')) {
            setFlag('repaired');
            this.line(hasFlag('act2') ? 'kossi_after' : 'kossi_repaired', 8);
            this.advance(40);
            this.setObjective('Your 4×4 is fixed. Leave before dawn — or find out what happened to Azé-tin.');
          } else {
            if (hasFlag('repaired')) this.line('kossi_why', 4);
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
            this.ask('Eat the akassa', () => {
              story.marque += 1;
              setFlag('ate');
              story.souffle = Math.min(100, story.souffle + 30);
              this.line('dossi_ate', 6);
              setFlag('patch');
              this.gain('Patch kit', 'happy_ate', 5500);
            }, 'Politely refuse', () => {
              this.line('dossi_refuse', 6);
              setFlag('patch');
              this.gain('Patch kit', 'happy_patch', 5500);
            });
          } else if (!hasFlag('sawDossi')) {
            this.line('dossi_stare', 4);
          } else {
            this.line('dossi_know', 6);
          }
        },
      },
      {
        pos: p.generator, range: 2.4,
        label: () => (hasFlag('kossi') && !hasFlag('power') ? 'Take the generator battery' : null),
        use: () => {
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
      ...this.pickups.map((pk): Interactable => ({
        pos: pk.pos.clone().setY(0), range: pk.kind === 'plant' && pk.id === 'flower' ? 3.2 : 2.2,
        label: () => (pk.obj.visible && hasFlag('act1') ? (pk.kind === 'fragment' ? `Photograph: ${pk.name}` : pk.kind === 'plant' ? `Pick the ${pk.name.toLowerCase()}` : `Take ${pk.name}`) : null),
        use: () => this.collect(pk),
      })),
    ];
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
        setTimeout(() => { this.line('prologue_flat', 5); }, 1800);
        setTimeout(() => this.hud.objective(story.objective), 6500);
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
    this.hud.say('📱 Unknown number — “Welcome to Azé-tin… Stay for dinner. — H.”', 7);
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
    let close = 99;
    for (const e of this.enemies.list) close = Math.min(close, e.pos.distanceTo(pos));
    const heart = Math.max(close < 14 ? 1 - close / 14 : 0, story.souffle < 50 ? (50 - story.souffle) / 50 : 0);
    this.audio.loop('heartbeat', heart * 0.9);
    this.audio.loop('tension', close < 10 ? 0.35 : 0, 'music/tension.mp3');
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
      pk.obj.visible = pk.glow.visible = hasFlag('act1') && !taken;
    }
    if (hasFlag('agossou') && !this.hornbill.visible && this.mode === 'playing') {
      this.spiritLight();
      this.hornbill.position.set(0.2, 2.1, -20.4);
      this.hornbill.rotation.y = Math.PI * 0.85;
      this.hornbill.visible = true;
    }
    if (!hasFlag('act1')) { for (const st of this.statues) st.p.root.visible = false; return; }
    this.updateStatues(dt);
    if (!hasFlag('act2') && this.time > this.nextHornbill) {
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
  private spirit: THREE.PointLight | null = null;
  private spiritLight(): void {
    if (this.spirit) return;
    this.spirit = new THREE.PointLight(0xc8dcff, 6, 9, 1.4);
    this.spirit.position.set(0, 3.2, -19.2);
    this.scene.add(this.spirit);
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
    this.hud.objective(`Fragment of the secret ${story.secret}/5 — saved in your Gallery.`);
    this.save();
    if (story.secret === 3 && !hasFlag('flashback')) setTimeout(() => this.startFlashback(), pk.id === 'tape' ? 14000 : 6500);
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
    props: THREE.Object3D[]; fires: FireHandle[]; saved: { p: Person; x: number; z: number; ry: number; vis: boolean }[];
    dancers: Person[]; agossou: Person | null; lamp: THREE.Object3D | null; barrels: THREE.Object3D | null;
    runners: { p: Person; dir: THREE.Vector3; t: number; fire: FireHandle | null }[];
  } | null = null;

  private startFlashback(): void {
    if (this.mode !== 'playing' || this.fb) { if (!hasFlag('flashback')) setTimeout(() => this.startFlashback(), 3000); return; }
    setFlag('flashback');
    this.save();
    this.director.fadeTo(1, 1.2);
    this.audio.sfx('stinger3', { gain: 0.6 });
    setTimeout(() => {
      const light = new THREE.PointLight(0xffa040, 0, 120, 1.2);
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
      const ll = new THREE.PointLight(0xffa050, 14, 10, 1.5);
      ll.position.set(0, 0.25, 0.15);
      lamp.add(ll);
    }
    // la lumière chaude de la fête au-dessus de la place
    const festLight = new THREE.PointLight(0xffb070, 60, 30, 1.4);
    festLight.position.set(0, 5, 9.4);
    this.scene.add(festLight);
    props.push(festLight);
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
      const al = new THREE.PointLight(0xffb070, 8, 7, 1.5);
      al.position.set(12, 2.4, 8.8);
      this.scene.add(al);
      props.push(al);
    }
    w.followGaze = false;
    w.flameScale = [1.6, 1, 1];
    this.fest = { props, fires, saved, dancers, agossou, lamp, barrels, runners: [] };
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
    fb.light.position.set(38, 8, -5);
    this.scene.add(fb.light);
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
      this.scene.remove(fb.light);
      if (fest) {
        for (const o of fest.props) this.scene.remove(o);
        for (const f of fest.fires) w.fx.remove(f);
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
    const faceLight = new THREE.PointLight(0xff8a3a, 7, 6, 1.6);
    faceLight.position.set(at.x - f.x * 1.2, 0.6, at.z - f.z * 1.2);
    this.scene.add(faceLight);
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
        this.scene.remove(faceLight);
        setFlag('act2');
        story.minutes = Math.max(story.minutes, 24 * 60);
        this.mode = 'playing';
        this.nextOwl = this.time + 20;
        this.setObjective('Midnight. Bring the battery to Kossi. Then choose: leave before dawn… or finish what the healer began.');
      },
    });
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

  // Fin I (The Survivor) — ou fin II si la Marque est à 3 (la voiture ne démarre pas)
  private ending(): void {
    this.mode = 'dead';
    this.hud.hideAll();
    document.exitPointerLock();
    if (story.marque >= 3) {
      this.gameOver.showEnding('Ending II — The Azévi', ['The engine coughs, then nothing. In the rear-view mirror, your own face is ash.', 'Later, headlights on the road. You stand up. You walk towards them, smiling.']);
    } else {
      this.gameOver.showEnding('Ending I — The Survivor', ['You drive towards the dawn. The radio comes back. You call your mother, and you laugh, and you cannot stop.',
        'In the rear-view mirror, on the back seat, an owl is watching you.', 'Azé-tin is waiting for the next one.']);
    }
  }

  private nearestInteractable(): Interactable | null {
    const fwd = this.player.forward(this.v1);
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (!it.label()) continue;
      const dx = it.pos.x - this.player.pos.x;
      const dz = it.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.range || d >= bestD) continue;
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
    // au menu : le coucher du soleil ; en jeu : l'heure de l'histoire
    this.world.sky.update(this.mode === 'menu' ? 19 * 60 + 6 : story.minutes, this.camera);

    this.audio.loop('theme', this.mode === 'menu' ? 0.55 : 0, 'music/theme.mp3');
    if (this.mode === 'menu') this.updateMenuCamera();
    else if (this.mode === 'playing') this.updatePlaying(dt);
    else if (this.mode === 'cine') {
      if (this.input.wasPressed('Space')) this.director.skip();
      this.flash.visible = false;
      this.fill.visible = false;
      this.mirror.raised = 0;
      this.hud.setPrompt(null);
    }
    this.director.update(dt);

    this.hud.update(dt);
    this.phone.tick();
    this.audio.update();

    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'playing') this.mirror.render(this.renderer, this.scene);
    if (this.mode === 'dead') this.camera.position.y = Math.max(0.35, this.camera.position.y - dt * 1.2); // Happy s'effondre
    this.input.endFrame();
  }

  private updateMenuCamera(): void {
    // Lente dérive autour du 4×4 en panne devant le panneau
    const f = this.world.menuFocus;
    const a = 0.55 + Math.sin(this.time * 0.05) * 0.35;
    this.camera.position.set(f.x + Math.sin(a) * 8.5, 1.5 + Math.sin(this.time * 0.13) * 0.15, f.z + Math.cos(a) * 8.5);
    this.camera.lookAt(f);
    this.flash.visible = false;
    this.fill.visible = false;
    this.mirror.raised = 0;
  }

  private updatePlaying(dt: number): void {
    const locked = document.pointerLockElement === this.renderer.domElement;

    if (this.input.wasPressed('Tab') && !this.fb) this.togglePhone();
    if (this.input.wasPressed('KeyM')) this.openMap();
    if (this.input.wasPressed('KeyF')) {
      if (story.battery > 5) this.flashOn = !this.flashOn;
      else this.line('happy_flash_low', 4);
    }

    this.player.update(dt, this.input, locked && !this.phone.open);

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
    this.flash.visible = this.fill.visible = this.flashOn;
    const charge = THREE.MathUtils.clamp(story.battery / 60, 0, 1);
    const k = 0.18 + 0.82 * Math.pow(charge, 0.8);
    const low = story.battery < 15;
    if (this.blackout > 0) this.blackout -= dt;
    const flicker = this.blackout > 0 ? 0 : low && Math.random() < 0.07 ? 0.15 : 1;
    this.flash.intensity = 55 * k * flicker;
    this.flash.distance = 14 + 18 * k;
    this.fill.intensity = 6 * k * flicker;
    this.flash.color.setHSL(0.1, 0.25 + (1 - k) * 0.5, 0.92 - (1 - k) * 0.2);

    // Rétroviseur (clic droit maintenu)
    const wantMirror = this.input.rightDown && locked && !this.phone.open && !this.fb && story.inventory.includes('Rear-view mirror');
    this.mirror.update(dt, wantMirror, this.camera.position, this.player.yaw, this.player.pitch);
    if (this.mirror.raised > 0.8 && !hasFlag('sawDossi')) this.checkDossiInMirror();

    // Interaction (priorité : prise d'un Brûlé > choix > hibou > objet)
    const it = this.phone.open || this.grab || this.fb ? null : this.nearestInteractable();
    const charging = nearCar && hasFlag('trunk') && story.battery < 100;
    if (this.grab) {
      const g = this.grab;
      g.t -= dt;
      if (this.input.wasPressed('KeyE')) { g.presses++; this.shake = Math.max(this.shake, 0.12); }
      this.hud.setPrompt(`GRABBED! Mash E to break free  ${'\u25A0'.repeat(g.presses)}${'\u25A1'.repeat(Math.max(0, 6 - g.presses))}`);
      if (g.presses >= 6 || g.t <= 0) {
        const freed = g.presses >= 6;
        this.grab = null;
        this.hud.setGrabbed(false);
        this.enemies.releaseGrab(g.e, freed);
        if (freed) { this.line('happy_free', 2); this.sparks.burst(g.e.pos.clone().setY(1.3), 25); }
      }
    } else if (this.choice) {
      const c = this.choice;
      this.hud.setPrompt(`E — ${c.a}      R — ${c.b}`);
      if (this.input.wasPressed('KeyE')) { this.choice = null; c.onA(); }
      else if (this.input.wasPressed('KeyR')) { this.choice = null; c.onB(); }
    } else {
      if (!this.owlQte) this.hud.setPrompt(it ? `E — ${it.label()}` : charging ? `Phone charging… ${Math.round(story.battery)}%` : null);
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
    if (weapon && this.input.leftClicked && locked && !this.phone.open && this.mirror.raised < 0.3 && this.attackCd <= 0 && this.player.stamina > weapon.stamina * 0.5) {
      this.attackCd = weapon.cooldown;
      this.player.stamina = Math.max(0, this.player.stamina - weapon.stamina);
      this.viewmodel.attack();
      this.audio.swoosh();
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        const dir = this.player.forward(this.v1).clone();
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
    if (this.input.wasPressed('KeyQ') && hasFlag('calabash') && !this.fb && locked && !this.phone.open && this.kaolinCd <= 0) {
      if (story.kaolin <= 0) this.hud.say('The calabash is empty. Refill it at the healer’s asen.', 3);
      else {
        story.kaolin--;
        this.kaolinCd = 0.9;
        const dir = this.player.forward(this.v1).clone();
        this.audio.sfx('kaolin');
        this.kaolinFx.burst(this.camera.position.clone().addScaledVector(dir, 0.6).setY(1.3), 70, dir);
        const n = this.enemies.repel(this.player.pos, dir, 6, 40);
        this.kaolinStatues(dir);
        if (this.grab && n) { this.grab = null; this.hud.setGrabbed(false); }
        if (n) this.audio.voiceMix('aaah', 'm', { ghost: true, gain: 0.7, rate: 0.7 });
      }
    }
    this.kaolinFx.update(dt);
    this.hud.setKaolin(hasFlag('calabash') && !this.fb ? story.kaolin : null);

    // ---- Les Brûlés ; le 4×4 reste un refuge (ils n'osent pas approcher) ----
    if (!this.fb) this.enemies.update(dt, this.player.pos, nearCar);

    // ---- Le hibou et son QTE : se cacher (C) ou regarder dans le rétroviseur ----
    if (this.time > this.nextOwl && !this.owlQte && !this.fb) {
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

    if (!this.fb) this.guide();
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

  // Repères : étape en cours (haut gauche), marqueur à l'écran, nom des lieux, découvertes pour la carte
  private guide(): void {
    const { step, index } = currentStep();
    if (index !== this.lastStep) {
      if (this.lastStep >= 0) this.hud.objective(step.text);
      this.lastStep = index;
    }
    const dead = story.battery <= 5 && hasFlag('trunk');
    this.hud.setTracker(dead ? 'Phone almost dead' : `Step ${index + 1} / ${STEPS.length}`, dead ? 'Go back to your 4\u00d74 to charge your phone (follow the orange hazard lights).' : step.text,
      'Tab phone \u00b7 M map \u00b7 F torch \u00b7 Right click mirror');

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
    const t = this.target();
    if (!t || !this.markerOn || this.phone.open) { this.hud.setMarker(null); return; }
    const dist = Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z);
    if (dist < 3) { this.hud.setMarker(null); return; }
    this.proj.set(t.x, 1.6, t.z).project(this.camera);
    const W = innerWidth, H = innerHeight;
    let x = (this.proj.x * 0.5 + 0.5) * W, y = (-this.proj.y * 0.5 + 0.5) * H;
    const behind = this.proj.z > 1;
    let edge = behind || x < 40 || x > W - 40 || y < 60 || y > H - 60;
    if (behind) { x = W - x; y = H - 70; }
    x = Math.min(W - 40, Math.max(40, x));
    y = Math.min(H - 70, Math.max(70, y));
    if (behind) edge = true;
    this.hud.setMarker(x, y, `${Math.round(dist)} m`, edge);
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
      this.save();
    }
  }

  private resize(): void {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.mirror.resize(w / h);
  }
}
