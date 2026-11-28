import { tr, lang, setLang } from '../story/i18n';
import { story, clockText, hasFlag } from '../story/State';
import { PLACES, PATHS, STEPS, currentStep } from '../story/Places';
import { endingsSeen, ENDINGS } from './Endings';
import { DEAD, DEAD_GOAL } from '../story/Dead';
import { JOURNAL, DIALOG_LOG, knownCount } from '../story/Journal';

// =============================================================
//  Le smartphone de Happy (touche Tab). Un vrai téléphone : barre d'état, îlot,
//  écran d'accueil avec widgets, dock, apps, notifications en bannière.
//  Le jeu continue pendant qu'il est ouvert, sauf en pause (Échap).
// =============================================================
export interface PhoneActions {
  onResume(): void;
  onQuit(): void;
  onClose(): void;
  onSensitivity(v: number): void;
  onVolume(v: number): void;
  onBrightness(v: number): void;
  onMarker(on: boolean): void;
  onQuality(q: 'high' | 'medium' | 'low'): void;
  quality(): 'high' | 'medium' | 'low';
  onPlay(sound: string): void;
  onTorch(): void;
  torch(): { on: boolean; hint: boolean };
  where(): { x: number; z: number; yaw: number; target: { x: number; z: number } | null };
}

type Screen = 'home' | 'map' | 'story' | 'notes' | 'photos' | 'photo' | 'messages' | 'thread' | 'memos' | 'bag' | 'endings' | 'settings' | 'pause' | 'phone' | 'camera';

// Icônes (SVG en ligne, blanc sur dégradé) — dessinées pour le jeu
const ICON: Record<string, string> = {
  story: '<path d="M5 4.5h6.2c.5 0 .8.4.8.8v14.2c-.6-.6-1.4-.9-2.3-.9H5zM19 4.5h-6.2c-.5 0-.8.4-.8.8v14.2c.6-.6 1.4-.9 2.3-.9H19z" fill="#fff"/><path d="M7 8h3M7 10.5h3M14 8h3M14 10.5h3" stroke="#c2410c" stroke-width="1.2" stroke-linecap="round"/>',
  map: '<path d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.4 0 4.6 6.5 12.6 6.5 12.6s6.5-8 6.5-12.6c0-3.6-2.9-6.4-6.5-6.4z" fill="#fff"/><circle cx="12" cy="9" r="2.4" fill="#2f9e5a"/>',
  notes: '<rect x="5" y="4" width="14" height="16" rx="2" fill="#fff"/><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#e8b62c" stroke-width="1.6" stroke-linecap="round"/>',
  photos: '<g transform="translate(12 12)">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => `<ellipse rx="2.6" ry="5.6" transform="rotate(${a}) translate(0 -4.6)" fill="${['#f4a52a', '#f06a3a', '#e0457a', '#a356d8', '#4d7ef0', '#3cb4e6', '#46c27a', '#c6d83a'][i]}" opacity="0.92"/>`).join('') + '</g>',
  messages: '<path d="M12 4.5c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.1 3.1 5.4-.2 1.3-.9 2.5-1.9 3.3 1.9 0 3.6-.7 4.8-1.6.8.2 1.6.3 2.5.3 4.7 0 8.5-3.1 8.5-7s-3.8-7.4-8.5-7.4z" fill="#fff"/>',
  memos: '<path d="M4 12h1.5M7 8.5v7M10 6v12M13 9v6M16 7v10M19 10.5v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  bag: '<path d="M6.5 8.5h11l-1 11h-9z" fill="#fff"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" stroke="#fff" stroke-width="1.6" fill="none"/>',
  endings: '<path d="M12 3l1.8 6.2H20l-5 3.8 1.9 6.2L12 15.4l-4.9 3.8L9 13 4 9.2h6.2z" fill="#f3d27a"/>',
  settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  phone: '<path d="M7.2 3.8c.6-.4 1.4-.3 1.8.3l1.7 2.6c.3.5.3 1.2-.1 1.6l-1.2 1.2c.9 1.9 2.4 3.4 4.3 4.3l1.2-1.2c.4-.4 1.1-.5 1.6-.1l2.6 1.7c.6.4.7 1.2.3 1.8l-1 1.5c-.6.9-1.7 1.3-2.7 1-5.3-1.4-9.4-5.5-10.8-10.8-.3-1 .1-2.1 1-2.7z" fill="#fff"/>',
  camera: '<rect x="3.5" y="7" width="17" height="12" rx="2.5" fill="#fff"/><path d="M9 7l1.3-2h3.4L15 7" fill="#fff"/><circle cx="12" cy="13" r="3.4" fill="#4a4f58"/><circle cx="12" cy="13" r="2" fill="#9aa3af"/>',
};
const GRAD: Record<string, string> = {
  story: 'linear-gradient(160deg,#ff8a3d,#b4320c)',
  map: 'linear-gradient(160deg,#58d083,#2f9e5a)', notes: 'linear-gradient(160deg,#ffd75a,#e8b62c)', photos: 'linear-gradient(160deg,#ffffff,#e9eaee)',
  messages: 'linear-gradient(160deg,#6ef08a,#2fbf4f)', memos: 'linear-gradient(160deg,#ff6a5c,#d93a2e)', bag: 'linear-gradient(160deg,#b98a5a,#7a5230)',
  endings: 'linear-gradient(160deg,#3a2a4a,#150d1e)', settings: 'linear-gradient(160deg,#9aa0a8,#5c636c)', phone: 'linear-gradient(160deg,#6ef08a,#2fbf4f)',
  camera: 'linear-gradient(160deg,#cfd3d9,#8f959e)',
};
const UI = `${import.meta.env.BASE_URL}ui/`;
const APPS: [Screen, string, string][] = [
  ['story', 'What I know', 'story'], ['map', 'Maps', 'map'], ['notes', 'Notes', 'notes'], ['photos', 'Photos', 'photos'], ['memos', 'Voice Memos', 'memos'],
  ['bag', 'Bag', 'bag'], ['endings', 'Azé-tin', 'endings'], ['settings', 'Settings', 'settings'],
];
const DOCK: [Screen, string][] = [['phone', 'phone'], ['messages', 'messages'], ['camera', 'camera'], ['map', 'map']];

// Les fragments du secret, dans l'ordre de l'histoire
const FRAGS: { id: string; title: string; text: string }[] = [
  { id: 'photo', title: 'Before — the felled iroko', text: 'Men with chainsaws around the sacred tree. In the middle, the chief, smiling. On the back: “Loko — the last day”.' },
  { id: 'notebook', title: 'The chief’s debts', text: 'Every page in red ink. The last line: “Paid in full — by the barrels.”' },
  { id: 'tape', title: 'The healer’s warning', text: '“Without Loko, there will be no funerals in Azé-tin! Houngbo, you are selling our ancestors…”' },
  { id: 'register', title: 'Three hundred barrels', text: '300 barrels of 200 L, delivered the week of the festival. Signed: H.' },
  { id: 'drawing', title: 'The owl on the roof', text: 'A child’s drawing: the tree, the houses, and a big black owl sitting on the chief’s roof.' },
];

// L'analyse du téléphone (Visual Look Up) : des repères sur la photo, puis ce qu'ils révèlent
const ANALYSIS: Record<string, { tags: [number, number, string][]; found: [string, string][] }> = {
  photo: {
    tags: [[64, 38, 'Iroko'], [49, 47, 'Chief'], [20, 50, 'Chainsaw'], [79, 55, 'Chainsaw']],
    found: [['Tree', 'Iroko — “Loko”, a sacred tree. Cutting it is forbidden.'], ['Face', 'The man in the middle: Chief Houngbo, ten years younger.'],
      ['Text', 'Back of the photo: “Loko — the last day.”'], ['Date', 'Printed on the corner: the week of the festival.']],
  },
  notebook: {
    tags: [[40, 42, 'Barrel list'], [63, 36, 'Red ink'], [62, 62, 'Last line'], [85, 62, 'Signature']],
    found: [['Text', 'A ledger of debts: timber dealers, a fuel trader, the prefecture.'], ['Last line', '“Paid in full — by the barrels.”'],
      ['Signature', 'One letter, the same everywhere: H.']],
  },
  tape: {
    tags: [[78, 34, 'Label'], [80, 55, 'Cassette'], [91, 70, 'Tape']],
    found: [['Label', '“Dah A. — village”: Dah Agossou, the healer.'], ['Audio', 'Transcript: “Without Loko, there will be no funerals in Azé-tin!”'],
      ['Voice', 'An old man, angry. Then shouting. Then silence.']],
  },
  register: {
    tags: [[52, 45, 'Table'], [47, 59, 'Total'], [61, 60, 'Stamp']],
    found: [['Count', '300 barrels × 200 L = 60,000 litres of kpayo.'], ['Place', 'Stored at the fuel station, next to the festival square.'],
      ['Signed', 'H. — Houngbo knew. He stored the fire himself.']],
  },
  drawing: {
    tags: [[49, 42, 'Tree'], [66, 54, 'Owl'], [35, 63, 'House'], [28, 70, 'Signature']],
    found: [['Drawing', 'A child’s drawing. Signed in the corner: AYABA.'], ['Bird', 'An owl on the chief’s roof — here, the bird of the sorcerers.'],
      ['Meaning', 'She knew who brought the death. She drew it before the fire.']],
  },
};

// Les photos du secret : rendues dans Blender (public/photos)
function thumb(id: string): string {
  return `${import.meta.env.BASE_URL}photos/${id}.jpg`;
}

// Fond d'écran : la lagune de nuit, des palmiers (dessiné une fois)
let wallpaper = '';
function makeWallpaper(): string {
  if (wallpaper) return wallpaper;
  const c = document.createElement('canvas');
  c.width = 300; c.height = 640;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#0b1020'); sky.addColorStop(0.55, '#2a1a2c'); sky.addColorStop(0.75, '#6a2e22'); sky.addColorStop(1, '#120c0a');
  g.fillStyle = sky; g.fillRect(0, 0, 300, 640);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`; g.fillRect(Math.random() * 300, Math.random() * 330, 1, 1); }
  g.fillStyle = '#f3e6c8'; g.beginPath(); g.arc(210, 150, 26, 0, 7); g.fill();
  g.fillStyle = 'rgba(243,230,200,0.15)'; g.beginPath(); g.arc(210, 150, 46, 0, 7); g.fill();
  g.fillStyle = '#0a0706';
  g.fillRect(0, 520, 300, 120);
  const palm = (x: number, h: number, lean: number) => {
    g.strokeStyle = '#0a0706'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, 525); g.quadraticCurveTo(x + lean, 525 - h / 2, x + lean * 1.4, 525 - h); g.stroke();
    for (let k = 0; k < 7; k++) { const a = -Math.PI + (k / 6) * Math.PI; g.lineWidth = 3; g.beginPath(); g.moveTo(x + lean * 1.4, 525 - h); g.quadraticCurveTo(x + lean * 1.4 + Math.cos(a) * 30, 525 - h + Math.sin(a) * 14 - 10, x + lean * 1.4 + Math.cos(a) * 55, 525 - h + 26); g.stroke(); }
  };
  palm(60, 230, -14); palm(250, 190, 16); palm(140, 150, 6);
  return (wallpaper = c.toDataURL('image/jpeg', 0.85));
}

const BAT_SVG = (pct: number, low: boolean) =>
  `<svg viewBox="0 0 28 13" width="25" height="12"><rect x="0.5" y="0.5" width="24" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.45"/><rect x="2" y="2" width="${Math.max(1, 21 * pct / 100)}" height="9" rx="2" fill="${low ? '#ff453a' : 'currentColor'}"/><path d="M26 4.5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/></svg>`;
const SIGNAL_SVG = '<svg viewBox="0 0 18 12" width="17" height="11">' + [0, 1, 2, 3].map((i) => `<rect x="${i * 4.6}" y="${9 - i * 3}" width="3.2" height="${3 + i * 3}" rx="1" fill="currentColor" opacity="0.25"/>`).join('') + '</svg>';
const CHEV = '<svg viewBox="0 0 12 20" width="11" height="18"><path d="M10 2 2 10l8 8" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export class Phone {
  open = false;
  private screen: Screen = 'home';
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private time: HTMLSpanElement;
  private bat: HTMLSpanElement;
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private sel = '';   // photo ou conversation ouverte
  sensitivity = 1;
  volume = 0.8;
  brightness = 1.6;
  marker = true;

  constructor(parent: HTMLElement, private actions: PhoneActions) {
    this.root = document.createElement('div');
    this.root.id = 'phone';
    this.root.innerHTML = `
      <div class="ph-shell">
        <i class="ph-btn-side ph-vol1"></i><i class="ph-btn-side ph-vol2"></i><i class="ph-btn-side ph-power"></i>
        <div class="ph-screen" style="background-image:url(${makeWallpaper()})">
          <div class="ph-island"><i></i></div>
          <div class="ph-status">
            <span class="ph-time">19:00</span>
            <span class="ph-right">${SIGNAL_SVG}<span class="ph-bat"></span></span>
          </div>
          <div class="ph-body"></div>
          <div class="ph-crack"></div>
          <button class="ph-home" aria-label="Home"></button>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.ph-body')!;
    this.time = this.root.querySelector('.ph-time')!;
    this.bat = this.root.querySelector('.ph-bat')!;
    this.root.querySelector('.ph-home')!.addEventListener('click', () => {
      if (this.screen === 'pause') return;
      if (this.screen === 'home') this.actions.onClose();
      else this.go('home');
    });
    // bannière de notification (visible même téléphone rangé)
    this.banner = document.createElement('div');
    this.banner.className = 'ph-banner';
    parent.appendChild(this.banner);
  }

  /** Une notification, comme sur un vrai téléphone (SMS, photo enregistrée, mémo vocal…) */
  notify(app: string, title: string, text: string, seconds = 5): void {
    this.banner.innerHTML = `<i style="background:${GRAD[app] ?? '#222'}"><svg viewBox="0 0 24 24">${ICON[app] ?? ''}</svg></i><div><b>${tr(title)}</b><span>${tr(text)}</span></div><em>now</em>`;
    this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  // ---- Aperçu en grand, sur tout l'écran : la photo, ses repères et l'analyse
  private viewer: HTMLDivElement | null = null;
  get viewerOpen(): boolean { return !!this.viewer?.classList.contains('on'); }

  private autoView = false;

  openViewer(id: string, auto = false): void {
    this.autoView = auto;
    const f = FRAGS.find((x) => x.id === id);
    if (!f) return;
    const an = ANALYSIS[id];
    if (!this.viewer) {
      this.viewer = document.createElement('div');
      this.viewer.className = 'photo-view';
      document.body.appendChild(this.viewer);
      this.viewer.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.pv-close') || e.target === this.viewer) this.closeViewer(); });
      addEventListener('keydown', (e) => { if (this.viewerOpen && (e.code === 'Escape' || e.code === 'Space')) { e.preventDefault(); this.closeViewer(); } });
    }
    const n = FRAGS.findIndex((x) => x.id === id) + 1;
    this.viewer.innerHTML = `<div class="pv-box">
        <div class="pv-img"><img src="${thumb(id)}" alt="">
          ${an ? an.tags.map(([x, y, t], i) => `<span class="ph-tag pv-tag" style="left:${x}%;top:${y}%;animation-delay:${1.1 + i * 0.25}s"><i>${i + 1}</i>${tr(t)}</span>`).join('') : ''}<b class="ph-scanline"></b></div>
        <aside class="pv-side"><small>${tr(`THE SECRET · FRAGMENT ${n} OF 5`)}</small><h3>${tr(f.title)}</h3>
          ${an ? `<div class="ph-look pv-look"><small>✦ ${tr('Look Up')} — ${tr(`${an.found.length} results`)}</small>${an.found.map(([k, v], i) => `<p style="animation-delay:${1.4 + i * 0.35}s"><b>${tr(k)}</b>${tr(v)}</p>`).join('')}</div>` : `<p>${f.text}</p>`}
          <button class="pv-close">${tr('Continue · Space')}</button></aside></div>`;
    this.viewer.classList.add('on');
  }

  onViewerClose: () => void = () => {};

  closeViewer(): void {
    if (!this.viewerOpen) return;
    this.viewer!.classList.remove('on');
    if (this.autoView) { this.autoView = false; this.onViewerClose(); }
  }

  // Ouvre directement une photo du secret, avec son analyse
  showPhoto(id: string): void {
    this.sel = id;
    this.show('photo');
  }

  show(screen: Screen = 'home'): void {
    this.open = true;
    this.root.classList.add('on');
    this.go(screen);
  }

  hide(): void {
    this.closeViewer();
    this.open = false;
    this.root.classList.remove('on');
  }

  get paused(): boolean {
    return this.open && this.screen === 'pause';
  }

  // Appelé à chaque image : heure, batterie, écran qui s'assombrit sous 15 %
  tick(dt = 1 / 60): void {
    if (this.bannerTimer > 0 && (this.bannerTimer -= dt) <= 0) this.banner.classList.remove('on');
    if (!this.open) return;
    this.time.textContent = clockText();
    this.bat.innerHTML = `<small>${Math.round(story.battery)}</small>${BAT_SVG(story.battery, story.battery < 15)}`;
    this.root.classList.toggle('low', story.battery < 15);
    if (this.screen === 'map') this.drawMap();
    if (this.screen === 'home') { const c = this.body.querySelector('.ph-w-clock b'); if (c) c.textContent = clockText(); }
  }

  // ---------------------------------------------------------------- carte : se remplit au fil des découvertes
  private drawMap(): void {
    const cv = this.body.querySelector<HTMLCanvasElement>('canvas.ph-map');
    if (!cv) return;
    const g = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const x0 = -42, x1 = 50, z0 = -50, z1 = 75;
    const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
    const sz = (z: number) => ((z - z0) / (z1 - z0)) * H;
    // fond façon « plan » sombre
    g.fillStyle = '#1b1d21';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.03)';
    g.lineWidth = 1;
    for (let i = 0; i < W; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (let i = 0; i < H; i += 22) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    g.fillStyle = '#16324a';
    g.fillRect(0, 0, W, sz(-46));
    g.fillStyle = '#5a8ab0';
    g.font = 'italic 600 10px system-ui';
    g.fillText('Lagoon', 10, sz(-46) - 7);
    const known = new Set(story.discovered);
    g.lineCap = g.lineJoin = 'round';
    for (const [a, b, pts] of PATHS) {
      if (!known.has(a) && !known.has(b)) continue;
      g.globalAlpha = known.has(a) && known.has(b) ? 1 : 0.35;
      for (const [w, c] of [[7, '#3a3226'], [4, '#9a7a52']] as const) {
        g.strokeStyle = c; g.lineWidth = w;
        g.beginPath();
        pts.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))));
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    for (const p of PLACES) {
      if (!known.has(p.id)) continue;
      // épingle
      const x = sx(p.x), y = sz(p.z);
      g.fillStyle = p.id === 'car' ? '#ff9f0a' : p.id === 'station' ? '#ff453a' : '#e5e5ea';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1b1d21'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#d1d1d6';
      g.font = '600 10.5px system-ui';
      const label = p.name.split(' — ')[0];
      const tw = g.measureText(label).width;
      g.fillText(label, Math.min(W - tw - 4, Math.max(4, x - tw / 2)), y - 9);
    }
    const w = this.actions.where();
    if (w.target) {
      const k = 7 + 3 * Math.sin(performance.now() / 250);
      g.strokeStyle = '#ff6a1f'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(sx(w.target.x), sz(w.target.z), k, 0, Math.PI * 2); g.stroke();
    }
    // Happy : le point bleu, avec son cône de regard
    g.save();
    g.translate(sx(w.x), sz(w.z));
    g.rotate(-w.yaw);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 34);
    cone.addColorStop(0, 'rgba(10,132,255,0.45)'); cone.addColorStop(1, 'rgba(10,132,255,0)');
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
    g.fillStyle = '#0a84ff'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
    g.restore();
  }

  // Commande rapide de la torche (comme sur l'écran de verrouillage d'un vrai smartphone)
  private torchRow(): string {
    const t = this.actions.torch();
    return `<div class="ph-quick"><button class="ph-torch${t.on ? ' on' : ''}${t.hint ? ' hint' : ''}" data-act="torch" aria-label="Torch">
      <svg viewBox="0 0 24 24"><path d="M8 2.8h8v3.4l-2 3.2v11a1.6 1.6 0 0 1-1.6 1.6h-.8A1.6 1.6 0 0 1 10 20.4v-11L8 6.2z" fill="currentColor"/><rect x="11.2" y="11.6" width="1.6" height="3.2" rx=".8" fill="${t.on ? '#ffd23a' : 'rgba(0,0,0,.45)'}"/></svg></button>
      <span><b>Torch</b>${t.on ? 'On' : 'Off'}${t.hint ? ' · tap to light the way' : ''}</span></div>`;
  }

  private nav(title: string, back: Screen = 'home', backLabel = 'Back'): string {
    return `<div class="ph-nav"><button class="ph-back" data-go="${back}">${CHEV}<span>${tr(backLabel)}</span></button></div><h4>${tr(title)}</h4>`;
  }

  go(screen: Screen): void {
    this.screen = screen;
    this.root.classList.toggle('in-app', screen !== 'home' && screen !== 'pause');
    let html = '';
    const icon = (id: string) => id === 'endings'
      ? `<i class="ph-ico ph-logo"><img src="${UI}icon-azetin.png" alt=""></i>`
      : `<i class="ph-ico" style="background:${GRAD[id]}"><svg viewBox="0 0 24 24">${ICON[id]}</svg></i>`;
    switch (screen) {
      case 'home': {
        const step = currentStep().step;
        const unread = (hasFlag('msgH') ? 1 : 0) + 3;
        html = `<div class="ph-widgets">
            <div class="ph-w ph-w-clock"><small>Azé-tin</small><b>${clockText()}</b><span>Thursday · Waning moon</span></div>
            <div class="ph-w ph-w-note" data-go="notes"><small>${icon('notes')} Notes</small><b>${step.text}</b></div>
          </div>
          ${this.torchRow()}
          <div class="ph-grid">${APPS.map(([id, name, ic]) => `<button class="ph-app" data-go="${id}">${icon(ic)}<span>${tr(name)}</span>${id === 'photos' && story.secret ? `<em>${story.secret}</em>` : ''}</button>`).join('')}</div>
          <div class="ph-dots"><i class="on"></i><i></i></div>
          <div class="ph-dock">${DOCK.map(([id, ic]) => `<button class="ph-app" data-go="${id}">${icon(ic)}${id === 'messages' ? `<em>${unread}</em>` : id === 'phone' ? '<em>3</em>' : ''}</button>`).join('')}</div>`;
        break;
      }
      case 'map':
        html = `${this.nav('Maps')}<canvas class="ph-map" width="272" height="400"></canvas>
          <p class="ph-empty">Offline map. Places appear as you discover them. Orange ring: your objective.</p>`;
        break;
      case 'story': {
        const n = knownCount();
        html = `${this.nav('What I know')}<p class="ph-sub">${tr('The story of Azé-tin')} · ${n}/${JOURNAL.length}</p>
          <div class="ph-progress"><i style="width:${Math.round((n / JOURNAL.length) * 100)}%"></i></div>
          <ul class="ph-jr">${JOURNAL.map((st, i) => {
          const on = st.known();
          const q = i === JOURNAL.length - 1 ? ' q' : '';
          return on
            ? `<li class="on${q}"><i>${q ? '?' : i + 1}</i><b>${tr(st.title)}</b><span>${tr(st.text)}</span>${st.photo ? `<em class="jr-img" style="background-image:url(${thumb(st.photo)})"></em>` : ''}</li>`
            : `<li class="off${q}"><i>${q ? '?' : i + 1}</i><b>? ? ?</b><span>· · · · · ·</span></li>`;
        }).join('')}</ul>
          <p class="ph-empty">${n >= JOURNAL.length ? tr('You know the whole story now.') : tr('Talk to the villagers, look in the mirror, search the ashes. Each clue fills a page.')}</p>
          ${DIALOG_LOG.length ? `<h5 class="ph-dead-h">${tr('What they told me')}</h5><ul class="ph-log">${DIALOG_LOG.map((l) => `<li>${l.name ? `<b>${tr(l.name)}</b>` : ''}${l.text}</li>`).join('')}</ul>` : ''}`;
        break;
      }
      case 'notes': {
        const cur = currentStep().index;
        const act = hasFlag('act2') ? 'Act III — The night of the Azévi' : hasFlag('act1') ? 'Act II — The station' : 'Act I — The village';
        html = `${this.nav('Notes', 'home', 'Folders')}<div class="ph-note"><small>${tr('Today, ')}${clockText()}</small><h5>${tr(act)}</h5>
          <ul class="ph-steps">${STEPS.map((st, i) =>
          i < cur || (st.done() && i !== cur) ? `<li class="done">${tr(st.text)}</li>`
            : i === cur ? `<li class="now">${tr(st.text)}<small>${tr(st.hint)}</small></li>`
              : '').join('')}</ul>
          ${hasFlag('act2') && !hasFlag('ended') ? `<p class="ph-deal">${tr('Houngbo’s deal: burn the healer’s house (north, by the lagoon)… and he lets you leave.')}</p>` : ''}
          <div class="ph-counts"><span>${tr('Parts for Kossi')} <b>${story.pieces}/3</b></span>${hasFlag('act1') ? `<span>${tr('Fragments')} <b>${story.secret}/5</b></span><span>${tr('Plants')} <b>${story.plantes}/3</b></span>` : ''}${hasFlag('calabash') ? `<span>Kaolin <b>${story.kaolin}/5</b></span>` : ''}${hasFlag('sawDossi') ? `<span>${tr('The dead')} <b>${Object.keys(DEAD).filter((id) => hasFlag('dead_' + id)).length}/${DEAD_GOAL}</b></span>` : ''}</div>
          ${hasFlag('sawDossi') ? `<h5 class="ph-dead-h">${tr('The dead of Azé-tin')}</h5><p class="ph-sub">${tr('Hold the mirror on them (right click) to learn who they were.')}</p><ul class="ph-dead">${Object.entries(DEAD).map(([id, d]) => hasFlag('dead_' + id) ? `<li><b>${d.name}</b> ${tr(d.text)}</li>` : '<li class="unk">· · ·</li>').join('')}</ul>` : ''}</div>`;
        break;
      }
      case 'photos':
      case 'camera':
        html = `${this.nav(screen === 'camera' ? 'Recents' : 'Photos')}<p class="ph-sub">${tr(`The secret · ${story.secret} of 5`)}</p>
          <div class="ph-photos">${FRAGS.map((f) => hasFlag('frag_' + f.id)
          ? `<button class="ph-photo" data-photo="${f.id}" style="background-image:url(${thumb(f.id)})"></button>`
          : '<div class="ph-photo empty"></div>').join('')}</div>
          <p class="ph-empty">${story.secret >= 5 ? 'You know everything now.' : 'The rest is hidden in the village and at the station.'}</p>`;
        break;
      case 'photo': {
        const f = FRAGS.find((x) => x.id === this.sel)!;
        const an = ANALYSIS[f.id];
        html = `${this.nav('', 'photos', 'Photos')}<div class="ph-full ph-scan" data-big="${f.id}" style="background-image:url(${thumb(f.id)})">
            ${an ? an.tags.map(([x, y, t], i) => `<span class="ph-tag" style="left:${x}%;top:${y}%;animation-delay:${1.3 + i * 0.25}s"><i>${i + 1}</i>${tr(t)}</span>`).join('') : ''}<b class="ph-scanline"></b></div>
          <p class="ph-tap">${tr('Tap the photo to view it full screen')}</p><h5 class="ph-cap">${tr(f.title)}</h5>
          ${an ? `<div class="ph-look"><small>✦ ${tr('Look Up')} — ${tr(`${an.found.length} results`)}</small>${an.found.map(([k, v], i) => `<p style="animation-delay:${1.6 + i * 0.35}s"><b>${tr(k)}</b>${tr(v)}</p>`).join('')}</div>` : `<p class="ph-empty">${f.text}</p>`}`;
        break;
      }
      case 'messages':
        html = `${this.nav('Messages', 'home', 'Edit')}<div class="ph-threads">
          ${hasFlag('msgH') ? `<button class="ph-thr" data-thread="h"><i class="ph-av dark">?</i><div><b>Unknown</b><span>Welcome to Azé-tin… Stay for dinner. — H.</span></div><em>${clockText()}</em></button>` : ''}
          <button class="ph-thr" data-thread="mum"><i class="ph-av">M</i><div><b>Mum</b><span>Call me when you reach your father's village.</span></div><em>18:42</em></button></div>`;
        break;
      case 'thread':
        html = this.sel === 'h'
          ? `${this.nav('Unknown', 'messages', 'Messages')}<div class="ph-thread"><div class="msg in">Welcome to Azé-tin… Stay for dinner. — H.</div>${hasFlag('act2') ? '<div class="msg in">Midnight. Now everyone is awake.</div>' : ''}</div>`
          : `${this.nav('Mum', 'messages', 'Messages')}<div class="ph-thread">
            <div class="msg in">Call me when you reach your father's village. Be careful on those roads.</div>
            <div class="msg out">Almost there mum! GPS is dead lol</div>
            <div class="msg out fail">The car broke down. Some village called Azé-tin. Don't worry.<em>Not Delivered</em></div>
            ${hasFlag('kossi') ? '<div class="msg out fail">Found a mechanic. Weird place. Everyone is so quiet.<em>Not Delivered</em></div>' : ''}
            ${hasFlag('act2') ? '<div class="msg out fail">Mum I love you<em>Not Delivered</em></div>' : ''}</div>`;
        break;
      case 'phone':
        html = `${this.nav('Recents')}<div class="ph-threads">
          <div class="ph-thr"><i class="ph-av">M</i><div><b class="red">Mum (3)</b><span>Missed · mobile</span></div><em>18:51</em></div>
          <div class="ph-thr"><i class="ph-av">M</i><div><b>Mum</b><span>Outgoing · No service</span></div><em>19:02</em></div></div>
          <p class="ph-empty">Call failed. No service.</p>`;
        break;
      case 'memos': {
        const memos = [['owl', 'Owl — high, shrill', 'firstOwl'], ['hornbill', 'Hornbill — low, two notes', 'hornbillHint']].filter(([, , f]) => hasFlag(f));
        html = `${this.nav('All Recordings')}<div class="ph-threads">${memos.length ? memos.map(([s, name], i) =>
          `<button class="ph-thr ph-memo" data-sound="${s}"><div><b>${name}</b><span>Recording ${i + 1} · 0:0${3 + i}</span></div><i class="ph-play"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></i></button>`).join('')
          : '<p class="ph-empty">Bird calls you hear are saved here, so you can learn them.</p>'}</div>
          ${memos.length ? '<p class="ph-empty">The hornbill guides. The owl hunts. Learn the difference.</p>' : ''}`;
        break;
      }
      case 'bag':
        html = `${this.nav('Bag')}${story.inventory.length
          ? `<div class="ph-group">${story.inventory.map((i) => `<div class="ph-row">${i}</div>`).join('')}</div>`
          : '<p class="ph-empty">Nothing yet.</p>'}`;
        break;
      case 'endings': {
        const seen = endingsSeen();
        html = `${this.nav('Azé-tin')}<p class="ph-sub">Endings · ${seen.length} of 4</p><div class="ph-ends">${ENDINGS.map((e) =>
          seen.includes(e.id) ? `<div class="ph-end on"><small>${e.num}</small><b>${e.title}</b></div>` : `<div class="ph-end"><small>${e.num}</small><b>???</b><span>${e.hint}</span></div>`).join('')}</div>`;
        break;
      }
      case 'settings':
      case 'pause':
        html = `${screen === 'pause'
          ? `<div class="ph-pausehead"><b>${tr('Paused')}</b><span>${tr('The village is waiting.')}</span></div><button class="ph-btnx" data-act="resume">${tr('Resume')}</button>`
          : this.nav('Settings')}
          <div class="ph-group">
            <label class="ph-row ph-range"><span>${tr('Mouse sensitivity')}</span><input type="range" min="0.3" max="2.5" step="0.05" value="${this.sensitivity}" data-set="sens"></label>
            <label class="ph-row ph-range"><span>${tr('Volume')}</span><input type="range" min="0" max="1" step="0.05" value="${this.volume}" data-set="vol"></label>
            <label class="ph-row ph-range"><span>${tr('Brightness')}</span><input type="range" min="0.9" max="2.6" step="0.05" value="${this.brightness}" data-set="bright"></label>
            <label class="ph-row ph-toggle"><span>${tr('Objective marker')}</span><input type="checkbox" ${this.marker ? 'checked' : ''} data-set="marker"><i></i></label>
            <div class="ph-row ph-lang"><span>${tr('Graphics')}</span><span class="ph-seg">${(['low', 'medium', 'high'] as const).map((q) => `<button data-q="${q}" class="${this.actions.quality() === q ? 'on' : ''}">${tr(q === 'high' ? 'High' : q === 'medium' ? 'Medium' : 'Low')}</button>`).join('')}</span></div>
            <div class="ph-row ph-lang"><span>${tr('Language')}</span><span class="ph-seg"><button data-lang="en" class="${lang() === 'en' ? 'on' : ''}">EN</button><button data-lang="fr" class="${lang() === 'fr' ? 'on' : ''}">FR</button></span></div>
          </div>
          <p class="ph-empty">${tr('Voices stay in English.')} ${tr('Keys follow your keyboard: ZQSD (AZERTY) or WASD (QWERTY). Kaolin: A (AZERTY) / Q (QWERTY).')}</p>
          ${screen === 'pause' ? `<button class="ph-btnx ghost" data-act="quit">${tr('Save and quit to title')}</button>` : ''}`;
        break;
    }
    this.body.innerHTML = html;
    this.body.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => this.go(b.dataset.go as Screen)));
    this.body.querySelectorAll<HTMLElement>('[data-big]').forEach((b) => b.addEventListener('click', () => this.openViewer(b.dataset.big!)));
    this.body.querySelectorAll<HTMLElement>('[data-photo]').forEach((b) => b.addEventListener('click', () => { this.sel = b.dataset.photo!; this.go('photo'); }));
    this.body.querySelectorAll<HTMLElement>('[data-thread]').forEach((b) => b.addEventListener('click', () => { this.sel = b.dataset.thread!; this.go('thread'); }));
    this.body.querySelectorAll<HTMLElement>('[data-sound]').forEach((b) => b.addEventListener('click', () => this.actions.onPlay(b.dataset.sound!)));
    this.body.querySelector('[data-act="torch"]')?.addEventListener('click', () => { this.actions.onTorch(); if (this.screen === 'home') this.go('home'); });
    this.body.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => b.addEventListener('click', () => { this.actions.onQuality(b.dataset.q as 'high' | 'medium' | 'low'); this.go(this.screen); }));
    this.body.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang as 'en' | 'fr'); this.go(this.screen); }));
    this.body.querySelector('[data-act="resume"]')?.addEventListener('click', () => this.actions.onResume());
    this.body.querySelector('[data-act="quit"]')?.addEventListener('click', () => this.actions.onQuit());
    this.body.querySelectorAll<HTMLInputElement>('input[data-set]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const v = Number(inp.value);
        if (inp.dataset.set === 'sens') { this.sensitivity = v; this.actions.onSensitivity(v); }
        else if (inp.dataset.set === 'bright') { this.brightness = v; this.actions.onBrightness(v); }
        else if (inp.dataset.set === 'marker') { this.marker = inp.checked; this.actions.onMarker(inp.checked); }
        else { this.volume = v; this.actions.onVolume(v); }
      }));
  }
}
