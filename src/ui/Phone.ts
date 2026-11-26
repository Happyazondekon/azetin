import { story, clockText, hasFlag } from '../story/State';
import { PLACES, PATHS, STEPS, currentStep } from '../story/Places';
const GALLERY: [string, string][] = [['photo', 'Before — the felled iroko'], ['notebook', 'The chief’s debts'], ['tape', 'The healer’s warning'], ['register', 'Three hundred barrels'], ['drawing', 'The owl on the roof']];

// Le smartphone de Happy (touche Tab). Le jeu continue pendant qu'il est ouvert,
// sauf en pause (Échap), où il s'ouvre sur l'écran de pause.
export interface PhoneActions {
  onResume(): void;
  onQuit(): void;
  onClose(): void;
  onSensitivity(v: number): void;
  onVolume(v: number): void;
  onBrightness(v: number): void;
  onMarker(on: boolean): void;
  where(): { x: number; z: number; yaw: number; target: { x: number; z: number } | null };
}

type Screen = 'home' | 'map' | 'notes' | 'gallery' | 'messages' | 'recorder' | 'bag' | 'endings' | 'settings' | 'pause';

const APPS: { id: Screen; name: string; glyph: string }[] = [
  { id: 'map', name: 'Map', glyph: '⌖' },
  { id: 'notes', name: 'Notes', glyph: '✎' },
  { id: 'gallery', name: 'Gallery', glyph: '▣' },
  { id: 'messages', name: 'Messages', glyph: '✉' },
  { id: 'recorder', name: 'Recorder', glyph: '◉' },
  { id: 'bag', name: 'Bag', glyph: '◫' },
  { id: 'endings', name: 'Endings', glyph: '✦' },
  { id: 'settings', name: 'Settings', glyph: '⚙' },
];

export class Phone {
  open = false;
  private screen: Screen = 'home';
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private time: HTMLSpanElement;
  private bat: HTMLSpanElement;
  sensitivity = 1;
  volume = 0.8;
  brightness = 1.6;
  marker = true;

  constructor(parent: HTMLElement, private actions: PhoneActions) {
    this.root = document.createElement('div');
    this.root.id = 'phone';
    this.root.innerHTML = `
      <div class="ph-shell">
        <div class="ph-screen">
          <div class="ph-status">
            <span class="ph-time">19:00</span>
            <span class="ph-net">No service</span>
            <span class="ph-bat">64%</span>
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
  tick(): void {
    if (!this.open) return;
    this.time.textContent = clockText();
    this.bat.textContent = `${Math.round(story.battery)}%`;
    this.root.classList.toggle('low', story.battery < 15);
    if (this.screen === 'map') this.drawMap();
  }

  // ---------------------------------------------------------------- carte : se remplit au fil des découvertes
  private drawMap(): void {
    const cv = this.body.querySelector<HTMLCanvasElement>('canvas.ph-map');
    if (!cv) return;
    const g = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    // monde : x de −42 à 50, z de −50 (nord, en haut) à 75 (sud, en bas)
    const x0 = -42, x1 = 50, z0 = -50, z1 = 75;
    const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
    const sz = (z: number) => ((z - z0) / (z1 - z0)) * H;
    g.fillStyle = '#16120f';
    g.fillRect(0, 0, W, H);
    // lagune au nord
    g.fillStyle = '#10202c';
    g.fillRect(0, 0, W, sz(-46));
    g.fillStyle = '#3a5a70';
    g.font = '600 10px system-ui';
    g.fillText('LAGOON', 8, sz(-46) - 6);
    const known = new Set(story.discovered);
    // chemins découverts
    g.strokeStyle = '#7a4a30';
    g.lineWidth = 4;
    g.lineCap = g.lineJoin = 'round';
    for (const [a, b, pts] of PATHS) {
      if (!known.has(a) && !known.has(b)) continue;
      g.globalAlpha = known.has(a) && known.has(b) ? 1 : 0.35;
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))));
      g.stroke();
    }
    g.globalAlpha = 1;
    // lieux
    for (const p of PLACES) {
      if (!known.has(p.id)) continue;
      g.fillStyle = p.id === 'car' ? '#ffb27a' : '#e8e0cc';
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#cfc6b8';
      g.font = '11px system-ui';
      const label = p.name.split(' — ')[0];
      const tw = g.measureText(label).width;
      g.fillText(label, Math.min(W - tw - 4, Math.max(4, sx(p.x) - tw / 2)), sz(p.z) - 8);
    }
    const w = this.actions.where();
    // objectif : un anneau orange qui pulse
    if (w.target) {
      const k = 6 + 3 * Math.sin(performance.now() / 250);
      g.strokeStyle = '#ff6a1f';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(sx(w.target.x), sz(w.target.z), k, 0, Math.PI * 2);
      g.stroke();
    }
    // Happy : une flèche dans la direction du regard
    g.save();
    g.translate(sx(w.x), sz(w.z));
    g.rotate(-w.yaw);
    g.fillStyle = '#7fb0ff';
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
  }

  go(screen: Screen): void {
    this.screen = screen;
    const back = `<button class="ph-back" data-go="home">‹ Back</button>`;
    let html = '';
    switch (screen) {
      case 'home':
        html = `<div class="ph-lock"><div class="ph-clock">${clockText()}</div><div class="ph-date">Thursday · No service</div></div>
          <div class="ph-grid">${APPS.map((a) => `<button class="ph-app" data-go="${a.id}"><i>${a.glyph}</i>${a.name}</button>`).join('')}</div>`;
        break;
      case 'map':
        html = `${back}<h4>Map</h4><canvas class="ph-map" width="264" height="380"></canvas>
          <p class="ph-empty">Places appear as you discover them. Orange ring: your objective.</p>`;
        break;
      case 'notes': {
        const cur = currentStep().index;
        const act = hasFlag('act2') ? 'Act III — The night of the Azévi' : hasFlag('act1') ? 'Act II — The station' : 'Act I — The village';
        html = `${back}<h4>${act}</h4><ol class="ph-steps">${STEPS.map((st, i) =>
          i < cur || (st.done() && i !== cur) ? `<li class="done">${st.text}</li>`
            : i === cur ? `<li class="now">${st.text}<small>${st.hint}</small></li>`
              : `<li class="later">…</li>`).join('')}</ol>
          <ul class="ph-list"><li>Parts for Kossi <b>${story.pieces}/3</b></li>${hasFlag('act1') ? `<li>Fragments of the secret <b>${story.secret}/5</b></li><li>Healer’s plants <b>${story.plantes}/3</b></li>` : ''}${hasFlag('calabash') ? `<li>Kaolin <b>${story.kaolin}/5</b> — refill at the healer’s asen</li>` : ''}</ul>`;
        break;
      }
      case 'gallery':
        // les fragments se rangent dans l'ordre de l'histoire, pas dans l'ordre où on les trouve
        html = `${back}<h4>Gallery — the secret</h4><div class="ph-photos">${GALLERY.map(([id, name]) =>
          `<div class="ph-photo ${hasFlag('frag_' + id) ? '' : 'empty'}">${hasFlag('frag_' + id) ? name : '?'}</div>`).join('')}</div>
          <p class="ph-empty">${story.secret}/5 — ${story.secret >= 5 ? 'You know everything now.' : 'The rest is hidden in the village and at the station.'}</p>`;
        break;
      case 'messages':
        html = `${back}<h4>Mom</h4><div class="ph-thread">
          <div class="msg in">Call me when you reach your father's village. Be careful on those roads.</div>
          <div class="msg out">Almost there mum! GPS is dead lol</div>
          <div class="msg out fail">The car broke down. Some village called Azé-tin. Don't worry.<em>Not delivered</em></div>
          ${hasFlag('kossi') ? `<div class="msg out fail">Found a mechanic. Weird place. Everyone is so quiet.<em>Not delivered</em></div>` : ''}
        </div>${hasFlag('msgH') ? `<h4>Unknown number</h4><div class="ph-thread"><div class="msg in">Welcome to Azé-tin… Stay for dinner. — H.</div></div>` : ''}`;
        break;
      case 'recorder':
        html = `${back}<h4>Recorder</h4><p class="ph-empty">Bird calls you hear will be saved here, so you can learn them.</p>`;
        break;
      case 'bag':
        html = `${back}<h4>Bag</h4>${story.inventory.length
          ? `<ul class="ph-list">${story.inventory.map((i) => `<li>${i}</li>`).join('')}</ul>`
          : `<p class="ph-empty">Nothing yet.</p>`}`;
        break;
      case 'endings':
        html = `${back}<h4>Endings</h4><ul class="ph-list"><li>I · ???</li><li>II · ???</li><li>III · ???</li><li>IV · ???</li></ul>`;
        break;
      case 'settings':
      case 'pause':
        html = `${screen === 'pause'
          ? `<h4>Paused</h4><button class="ph-btn" data-act="resume">Resume</button>`
          : `${back}<h4>Settings</h4>`}
          <label class="ph-range">Mouse sensitivity<input type="range" min="0.3" max="2.5" step="0.05" value="${this.sensitivity}" data-set="sens"></label>
          <label class="ph-range">Volume<input type="range" min="0" max="1" step="0.05" value="${this.volume}" data-set="vol"></label>
          <label class="ph-range">Brightness<input type="range" min="0.9" max="2.6" step="0.05" value="${this.brightness}" data-set="bright"></label>
          <label class="ph-check"><input type="checkbox" ${this.marker ? 'checked' : ''} data-set="marker"> Show the objective marker</label>
          <p class="ph-empty">Keys use your keyboard layout: ZQSD (AZERTY) or WASD (QWERTY).</p>
          ${screen === 'pause' ? `<button class="ph-btn ghost" data-act="quit">Save and quit to title</button>` : ''}`;
        break;
    }
    this.body.innerHTML = html;
    this.body.querySelectorAll<HTMLElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => this.go(b.dataset.go as Screen)));
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
