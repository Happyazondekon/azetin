import { story, clockText, hasFlag } from '../story/State';
import { PLACES, PATHS, STEPS, currentStep } from '../story/Places';
import { endingsSeen, ENDINGS } from './Endings';

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
  onPlay(sound: string): void;
  where(): { x: number; z: number; yaw: number; target: { x: number; z: number } | null };
}

type Screen = 'home' | 'map' | 'notes' | 'photos' | 'photo' | 'messages' | 'thread' | 'memos' | 'bag' | 'endings' | 'settings' | 'pause' | 'phone' | 'camera';

// Icônes (SVG en ligne, blanc sur dégradé) — dessinées pour le jeu
const ICON: Record<string, string> = {
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
  map: 'linear-gradient(160deg,#58d083,#2f9e5a)', notes: 'linear-gradient(160deg,#ffd75a,#e8b62c)', photos: 'linear-gradient(160deg,#ffffff,#e9eaee)',
  messages: 'linear-gradient(160deg,#6ef08a,#2fbf4f)', memos: 'linear-gradient(160deg,#ff6a5c,#d93a2e)', bag: 'linear-gradient(160deg,#b98a5a,#7a5230)',
  endings: 'linear-gradient(160deg,#3a2a4a,#150d1e)', settings: 'linear-gradient(160deg,#9aa0a8,#5c636c)', phone: 'linear-gradient(160deg,#6ef08a,#2fbf4f)',
  camera: 'linear-gradient(160deg,#cfd3d9,#8f959e)',
};
const UI = `${import.meta.env.BASE_URL}ui/`;
const APPS: [Screen, string, string][] = [
  ['map', 'Maps', 'map'], ['notes', 'Notes', 'notes'], ['photos', 'Photos', 'photos'], ['memos', 'Voice Memos', 'memos'],
  ['bag', 'Bag', 'bag'], ['endings', 'Azé-tin', 'endings'], ['settings', 'Settings', 'settings'],
];
const DOCK: [Screen, string][] = [['phone', 'phone'], ['messages', 'messages'], ['camera', 'camera'], ['map', 'map']];

// Les fragments du secret, dans l'ordre de l'histoire
const FRAGS: { id: string; title: string; text: string }[] = [
  { id: 'photo', title: 'Before — the felled iroko', text: 'Men with chainsaws around the sacred tree. In the middle, the chief, smiling. On the back: “Loko — the last day”.' },
  { id: 'notebook', title: 'The chief’s debts', text: 'Every page in red ink. The last line: “Paid in full — by the barrels.”' },
  { id: 'tape', title: 'The healer’s warning', text: '“Without Loko, the fire will have no roof! Houngbo, you are selling our ancestors…”' },
  { id: 'register', title: 'Three hundred barrels', text: '300 barrels of 200 L, delivered the week of the festival. Signed: H.' },
  { id: 'drawing', title: 'The owl on the roof', text: 'A child’s drawing: the tree, the houses, and a big black owl sitting on the chief’s roof.' },
];

// Miniatures dessinées une fois (comme de vraies photos prises au flash)
const thumbs: Record<string, string> = {};
function thumb(id: string): string {
  if (thumbs[id]) return thumbs[id];
  const c = document.createElement('canvas');
  c.width = c.height = 240;
  const g = c.getContext('2d')!;
  const flash = (base: string) => {
    g.fillStyle = base; g.fillRect(0, 0, 240, 240);
    const r = g.createRadialGradient(120, 110, 10, 120, 120, 170);
    r.addColorStop(0, 'rgba(255,250,235,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = r; g.fillRect(0, 0, 240, 240);
  };
  switch (id) {
    case 'photo':
      flash('#2a2118');
      g.fillStyle = '#e6dcc8'; g.fillRect(40, 45, 160, 140);
      g.fillStyle = '#5a4c3c'; g.fillRect(50, 55, 140, 100);
      g.fillStyle = '#2a221a'; g.fillRect(110, 70, 22, 85); g.beginPath(); g.arc(121, 75, 42, Math.PI, 0); g.fill();
      g.fillStyle = '#17120e'; for (const x of [62, 82, 150, 170]) g.fillRect(x, 120, 9, 35);
      break;
    case 'notebook':
      flash('#3a1410');
      g.fillStyle = '#d8c8a4'; g.save(); g.translate(120, 120); g.rotate(-0.15); g.fillRect(-70, -90, 140, 180);
      g.strokeStyle = '#a8241a'; g.lineWidth = 3; for (let y = -70; y < 80; y += 16) { g.beginPath(); g.moveTo(-58, y); g.lineTo(58, y); g.stroke(); }
      g.restore();
      break;
    case 'tape':
      flash('#1e1c1a');
      g.fillStyle = '#111'; g.fillRect(50, 75, 140, 90);
      g.fillStyle = '#d8cfa8'; g.fillRect(62, 85, 116, 34);
      g.fillStyle = '#333'; g.beginPath(); g.arc(90, 140, 14, 0, 7); g.arc(150, 140, 14, 0, 7); g.fill();
      g.fillStyle = '#5a3a1a'; g.font = 'italic 14px serif'; g.fillText('Dah A. — village', 74, 107);
      break;
    case 'register':
      flash('#1c2430');
      g.fillStyle = '#ddd2b8'; g.fillRect(45, 40, 150, 170);
      g.fillStyle = '#222'; g.font = '11px monospace'; for (let i = 0; i < 10; i++) g.fillText(`FÛT ${120 + i * 20}  200 L`, 58, 62 + i * 15);
      break;
    case 'drawing':
      flash('#2a2418');
      g.fillStyle = '#d4c6a0'; g.fillRect(30, 30, 180, 180);
      g.strokeStyle = '#2a6a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(110, 190); g.lineTo(110, 115); g.stroke();
      g.fillStyle = '#3a8a3a'; g.beginPath(); g.arc(110, 95, 38, 0, 7); g.fill();
      g.fillStyle = '#8a5a2a'; g.fillRect(48, 160, 30, 30); g.fillRect(150, 160, 30, 30);
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(165, 140, 22, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(158, 137, 3.5, 0, 7); g.arc(172, 137, 3.5, 0, 7); g.fill();
      break;
  }
  return (thumbs[id] = c.toDataURL('image/jpeg', 0.8));
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
    this.banner.innerHTML = `<i style="background:${GRAD[app] ?? '#222'}"><svg viewBox="0 0 24 24">${ICON[app] ?? ''}</svg></i><div><b>${title}</b><span>${text}</span></div><em>now</em>`;
    this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  show(screen: Screen = 'home'): void {
    this.open = true;
    this.root.classList.add('on');
    this.go(screen);
  }

  hide(): void {
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

  private nav(title: string, back: Screen = 'home', backLabel = 'Back'): string {
    return `<div class="ph-nav"><button class="ph-back" data-go="${back}">${CHEV}<span>${backLabel}</span></button></div><h4>${title}</h4>`;
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
          <div class="ph-grid">${APPS.map(([id, name, ic]) => `<button class="ph-app" data-go="${id}">${icon(ic)}<span>${name}</span>${id === 'photos' && story.secret ? `<em>${story.secret}</em>` : ''}</button>`).join('')}</div>
          <div class="ph-dots"><i class="on"></i><i></i></div>
          <div class="ph-dock">${DOCK.map(([id, ic]) => `<button class="ph-app" data-go="${id}">${icon(ic)}${id === 'messages' ? `<em>${unread}</em>` : id === 'phone' ? '<em>3</em>' : ''}</button>`).join('')}</div>`;
        break;
      }
      case 'map':
        html = `${this.nav('Maps')}<canvas class="ph-map" width="272" height="400"></canvas>
          <p class="ph-empty">Offline map. Places appear as you discover them. Orange ring: your objective.</p>`;
        break;
      case 'notes': {
        const cur = currentStep().index;
        const act = hasFlag('act2') ? 'Act III — The night of the Azévi' : hasFlag('act1') ? 'Act II — The station' : 'Act I — The village';
        html = `${this.nav('Notes', 'home', 'Folders')}<div class="ph-note"><small>Today, ${clockText()}</small><h5>${act}</h5>
          <ul class="ph-steps">${STEPS.map((st, i) =>
          i < cur || (st.done() && i !== cur) ? `<li class="done">${st.text}</li>`
            : i === cur ? `<li class="now">${st.text}<small>${st.hint}</small></li>`
              : '').join('')}</ul>
          <div class="ph-counts"><span>Parts for Kossi <b>${story.pieces}/3</b></span>${hasFlag('act1') ? `<span>Fragments <b>${story.secret}/5</b></span><span>Plants <b>${story.plantes}/3</b></span>` : ''}${hasFlag('calabash') ? `<span>Kaolin <b>${story.kaolin}/5</b></span>` : ''}</div></div>`;
        break;
      }
      case 'photos':
      case 'camera':
        html = `${this.nav(screen === 'camera' ? 'Recents' : 'Photos')}<p class="ph-sub">The secret · ${story.secret} of 5</p>
          <div class="ph-photos">${FRAGS.map((f) => hasFlag('frag_' + f.id)
          ? `<button class="ph-photo" data-photo="${f.id}" style="background-image:url(${thumb(f.id)})"></button>`
          : '<div class="ph-photo empty"></div>').join('')}</div>
          <p class="ph-empty">${story.secret >= 5 ? 'You know everything now.' : 'The rest is hidden in the village and at the station.'}</p>`;
        break;
      case 'photo': {
        const f = FRAGS.find((x) => x.id === this.sel)!;
        html = `${this.nav('', 'photos', 'Photos')}<div class="ph-full" style="background-image:url(${thumb(f.id)})"></div><h5 class="ph-cap">${f.title}</h5><p class="ph-empty">${f.text}</p>`;
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
          ? '<div class="ph-pausehead"><b>Paused</b><span>The village is waiting.</span></div><button class="ph-btnx" data-act="resume">Resume</button>'
          : this.nav('Settings')}
          <div class="ph-group">
            <label class="ph-row ph-range"><span>Mouse sensitivity</span><input type="range" min="0.3" max="2.5" step="0.05" value="${this.sensitivity}" data-set="sens"></label>
            <label class="ph-row ph-range"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${this.volume}" data-set="vol"></label>
            <label class="ph-row ph-range"><span>Brightness</span><input type="range" min="0.9" max="2.6" step="0.05" value="${this.brightness}" data-set="bright"></label>
            <label class="ph-row ph-toggle"><span>Objective marker</span><input type="checkbox" ${this.marker ? 'checked' : ''} data-set="marker"><i></i></label>
          </div>
          <p class="ph-empty">Keys follow your keyboard: ZQSD (AZERTY) or WASD (QWERTY). Kaolin: A (AZERTY) / Q (QWERTY).</p>
          ${screen === 'pause' ? '<button class="ph-btnx ghost" data-act="quit">Save and quit to title</button>' : ''}`;
        break;
    }
    this.body.innerHTML = html;
    this.body.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => this.go(b.dataset.go as Screen)));
    this.body.querySelectorAll<HTMLElement>('[data-photo]').forEach((b) => b.addEventListener('click', () => { this.sel = b.dataset.photo!; this.go('photo'); }));
    this.body.querySelectorAll<HTMLElement>('[data-thread]').forEach((b) => b.addEventListener('click', () => { this.sel = b.dataset.thread!; this.go('thread'); }));
    this.body.querySelectorAll<HTMLElement>('[data-sound]').forEach((b) => b.addEventListener('click', () => this.actions.onPlay(b.dataset.sound!)));
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
