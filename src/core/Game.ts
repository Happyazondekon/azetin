import * as THREE from 'three';
import { Input } from './Input';
import { Audio } from './Audio';
import { Player } from '../player/Player';
import { buildVillage, type World } from '../world/Village';
import { Mirror } from '../mirror/Mirror';
import { Menu } from '../ui/Menu';
import { Phone } from '../ui/Phone';
import { Hud } from '../ui/Hud';
import { story, resetStory, loadGame, saveGame, hasSave, hasFlag, setFlag } from '../story/State';

type Mode = 'menu' | 'playing' | 'paused';

interface Interactable {
  label: () => string | null; // null = rien à faire ici pour l'instant
  pos: THREE.Vector3;
  range: number;
  use: () => void;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 220);
  private last = performance.now();
  private input: Input;
  private audio = new Audio();
  private world: World;
  private player: Player;
  private mirror = new Mirror();
  private flash: THREE.SpotLight;
  private flashOn = true;
  private hud: Hud;
  private phone: Phone;
  private menu: Menu;
  private mode: Mode = 'menu';
  private time = 0;
  private nextOwl = 0;
  private interactables: Interactable[];
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(this.renderer.domElement);

    // La caméra principale voit le décor (0) et l'apparence "vue" des personnages (1)
    this.camera.layers.enable(1);
    this.scene.add(this.camera);

    this.world = buildVillage(this.scene);
    this.player = new Player(this.camera, this.world.colliders, this.world.bounds);
    this.input = new Input(this.renderer.domElement);

    // Le flash du smartphone : la seule lumière dynamique avec ombres
    this.flash = new THREE.SpotLight(0xfff1dc, 90, 30, 0.45, 0.5, 1.2);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.bias = -0.0006;
    this.flash.position.set(0.18, -0.12, 0);
    this.flash.target.position.set(0.05, -0.15, -1);
    this.camera.add(this.flash, this.flash.target);

    this.hud = new Hud(root);
    this.phone = new Phone(root, {
      onResume: () => this.resume(),
      onQuit: () => this.quitToTitle(),
      onClose: () => this.togglePhone(),
      onSensitivity: (v) => (this.player.sensitivity = v),
      onVolume: (v) => this.audio.setVolume(v),
    });
    this.menu = new Menu(root, { onNew: () => this.start(false), onContinue: () => this.start(true) }, hasSave());

    this.interactables = this.buildInteractables();

    addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.phone.open) this.lock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.pause();
    });

    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- États ----------

  private start(fromSave: boolean): void {
    if (!(fromSave && loadGame())) resetStory();
    const p = story.pos;
    if (p) this.player.place(p[0], p[1], p[2]);
    else this.player.place(this.world.points.spawn.x, this.world.points.spawn.z, 0);
    this.menu.hide();
    this.mode = 'playing';
    this.audio.start();
    this.lock();
    this.nextOwl = this.time + (hasFlag('trunk') ? 40 : 7);
    if (!fromSave || !hasFlag('intro')) {
      setFlag('intro');
      this.hud.say('Happy: No signal… and now a flat. Perfect.', 5);
      setTimeout(() => this.hud.objective(story.objective), 1200);
    }
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
    this.audio.suspend();
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
    if (!locked && this.mode === 'playing' && !this.phone.open) this.pause();
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
    this.hud.objective(text);
    this.save();
  }

  // ---------- Interactions (prologue et début de l'Acte 1) ----------

  private buildInteractables(): Interactable[] {
    const p = this.world.points;
    return [
      {
        pos: p.trunk, range: 2.2,
        label: () => (hasFlag('trunk') ? null : 'Search the trunk'),
        use: () => {
          setFlag('trunk');
          story.inventory.push('Tire iron', 'Car jack', 'Rear-view mirror');
          this.hud.say('Happy: The spare is flat too… There are lights up the road. Maybe someone can fix a tyre.', 6);
          this.advance(15);
          this.setObjective('Walk to the village. Find a vulcanizer.');
        },
      },
      {
        pos: p.stele, range: 2.0,
        label: () => 'Read the stone',
        use: () => this.hud.say('Dozens of names, carved by hand. All with the same date. Ten years ago.', 6),
      },
      {
        pos: p.kossi, range: 2.4,
        label: () => 'Talk to the man by the tyres',
        use: () => {
          if (!hasFlag('kossi')) {
            setFlag('kossi');
            this.hud.say('Kossi: A tyre? I can fix it. But I need an inner tube, a patch kit, and power for my compressor. Go. And don’t stay out after midnight.', 8);
            this.advance(20);
            this.setObjective('Bring Kossi three parts: an inner tube, a patch kit, and power for the compressor.');
          } else {
            this.hud.say('Kossi: Here we don’t count the dead anymore. We count the living.', 5);
          }
        },
      },
      {
        pos: p.dossi, range: 2.4,
        label: () => 'Talk to the woman at the stall',
        use: () => {
          if (!hasFlag('dossi')) {
            setFlag('dossi');
            this.hud.say('Mama Dossi: Sit, my child. Eat some akassa. You must be so hungry…', 6);
          } else if (!hasFlag('sawDossi')) {
            this.hud.say('She never blinks. Turn your back to her and look in the mirror (right click).', 6);
          } else {
            this.hud.say('Mama Dossi: Why do you look at me like that? Eat.', 5);
          }
        },
      },
    ];
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
    this.world.update(dt, this.time);

    if (this.mode === 'menu') this.updateMenuCamera();
    else if (this.mode === 'playing') this.updatePlaying(dt);

    this.hud.update(dt);
    this.phone.tick();
    this.audio.update();

    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'playing') this.mirror.render(this.renderer, this.scene);
    this.input.endFrame();
  }

  private updateMenuCamera(): void {
    // Lente dérive autour du 4×4 en panne devant le panneau
    const f = this.world.menuFocus;
    const a = 0.55 + Math.sin(this.time * 0.05) * 0.35;
    this.camera.position.set(f.x + Math.sin(a) * 8.5, 1.5 + Math.sin(this.time * 0.13) * 0.15, f.z + Math.cos(a) * 8.5);
    this.camera.lookAt(f);
    this.flash.visible = false;
    this.mirror.raised = 0;
  }

  private updatePlaying(dt: number): void {
    const locked = document.pointerLockElement === this.renderer.domElement;

    if (this.input.wasPressed('Tab')) this.togglePhone();
    if (this.input.wasPressed('KeyF') && story.battery > 0) this.flashOn = !this.flashOn;

    this.player.update(dt, this.input, locked && !this.phone.open);

    // Batterie : le flash et l'écran du téléphone la vident, le 4×4 la recharge
    const nearCar = this.player.pos.distanceTo(this.world.points.car) < 3.4;
    if (nearCar && hasFlag('trunk')) story.battery = Math.min(100, story.battery + 2.5 * dt);
    if (this.flashOn) story.battery -= 0.16 * dt;
    if (this.phone.open) story.battery -= 0.08 * dt;
    story.battery = Math.max(0, story.battery);
    if (story.battery <= 0) this.flashOn = false;
    this.flash.visible = this.flashOn;
    const low = story.battery < 15;
    this.flash.intensity = low && Math.random() < 0.08 ? 8 : 90;

    // Rétroviseur (clic droit maintenu)
    const wantMirror = this.input.rightDown && locked && !this.phone.open && story.inventory.includes('Rear-view mirror');
    this.mirror.update(dt, wantMirror, this.camera.position, this.player.yaw, this.player.pitch);
    if (this.mirror.raised > 0.8 && !hasFlag('sawDossi')) this.checkDossiInMirror();

    // Interaction
    const it = this.phone.open ? null : this.nearestInteractable();
    const charging = nearCar && hasFlag('trunk') && story.battery < 100;
    this.hud.setPrompt(it ? `E — ${it.label()}` : charging ? `Phone charging… ${Math.round(story.battery)}%` : null);
    if (it && this.input.wasPressed('KeyE')) it.use();

    // Le hibou : premier cri au début, puis de temps en temps (QTE à venir en semaine 2)
    if (this.time > this.nextOwl) {
      this.audio.owl(Math.random() * 2 - 1);
      if (!hasFlag('firstOwl')) {
        setFlag('firstOwl');
        this.hud.say('[An owl screeches somewhere in the dark]', 4);
      }
      this.nextOwl = this.time + 50 + Math.random() * 40;
    }

    // Voile : rougit quand l'endurance est vide (le souffle viendra en semaine 2)
    this.hud.setDanger(1 - this.player.stamina / 100);
    story.minutes += dt / 6; // l'horloge avance aussi lentement en jouant
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
      this.hud.say('Happy: Her face… In the mirror her face is burned.', 6);
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
