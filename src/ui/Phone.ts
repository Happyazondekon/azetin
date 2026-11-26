import { story, clockText, hasFlag } from '../story/State';

// Le smartphone de Happy (touche Tab). Le jeu continue pendant qu'il est ouvert,
// sauf en pause (Échap), où il s'ouvre sur l'écran de pause.
export interface PhoneActions {
  onResume(): void;
  onQuit(): void;
  onClose(): void;
  onSensitivity(v: number): void;
  onVolume(v: number): void;
}

type Screen = 'home' | 'notes' | 'gallery' | 'messages' | 'recorder' | 'bag' | 'endings' | 'settings' | 'pause';

const APPS: { id: Screen; name: string; glyph: string }[] = [
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
      case 'notes':
        html = `${back}<h4>Notes</h4><p class="ph-obj">${story.objective}</p>
          <ul class="ph-list">
            <li>Parts for Kossi <b>${story.pieces}/3</b></li>
            <li>Plants <b>${story.plantes}/3</b></li>
            <li>Fragments <b>${story.secret}/5</b></li>
          </ul>`;
        break;
      case 'gallery':
        html = `${back}<h4>Gallery</h4><div class="ph-photos">${Array.from({ length: 5 }, (_, i) =>
          `<div class="ph-photo ${i < story.secret ? '' : 'empty'}">${i < story.secret ? `Fragment ${i + 1}` : '?'}</div>`).join('')}</div>`;
        break;
      case 'messages':
        html = `${back}<h4>Mom</h4><div class="ph-thread">
          <div class="msg in">Call me when you reach your father's village. Be careful on those roads.</div>
          <div class="msg out">Almost there mum! GPS is dead lol</div>
          <div class="msg out fail">The car broke down. Some village called Azé-tin. Don't worry.<em>Not delivered</em></div>
          ${hasFlag('kossi') ? `<div class="msg out fail">Found a mechanic. Weird place. Everyone is so quiet.<em>Not delivered</em></div>` : ''}
        </div>`;
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
        else { this.volume = v; this.actions.onVolume(v); }
      }));
  }
}
