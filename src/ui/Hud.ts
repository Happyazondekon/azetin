import { tr } from '../story/i18n';
// Pas de HUD permanent : seulement l'invite d'interaction, les sous-titres,
// l'annonce d'objectif et un voile qui rougit quand le souffle baisse.
export class Hud {
  private prompt: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private toast: HTMLDivElement;
  private veil: HTMLDivElement;
  private tracker: HTMLDivElement;
  private marker: HTMLDivElement;
  private marker2: HTMLDivElement;
  private placename: HTMLDivElement;
  private grab: HTMLDivElement;
  private kaolin: HTMLDivElement;
  private placeTimer = 0;
  private subTimer = 0;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    const el = (cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      root.appendChild(d);
      return d;
    };
    this.veil = el('veil');
    el('grain');
    this.prompt = el('prompt');
    this.subtitle = el('subtitle');
    this.toast = el('toast');
    this.tracker = el('tracker');
    this.marker = el('marker');
    this.marker2 = el('marker deal');
    this.placename = el('placename');
    this.grab = el('grabbed');
    this.kaolin = el('kaolin');
  }

  // Objectif en cours, toujours visible en haut à gauche
  setTracker(step: string | null, text = '', keys = ''): void {
    this.tracker.style.opacity = step ? '1' : '0';
    if (step) this.tracker.innerHTML = `<div class="t-step">${tr(step)}</div><div class="t-text">${tr(text)}</div><div class="t-keys">${tr(keys)}</div>`;
  }

  // Repère d'objectif à l'écran (x, y en pixels ; edge = hors champ, collé au bord)
  setMarker(x: number | null, y = 0, label = '', edge = false): void {
    if (x === null) { this.marker.classList.remove('on'); return; }
    this.marker.classList.add('on');
    this.marker.classList.toggle('edge', edge);
    this.marker.style.left = `${x}px`;
    this.marker.style.top = `${y}px`;
    this.marker.innerHTML = `<img src="${import.meta.env.BASE_URL}ui/icon-ember.png" alt="">${tr(label)}`;
  }

  // Second repère, rouge : la direction de Houngbo (brûler la maison du guérisseur)
  setDealMarker(x: number | null, y = 0, label = '', edge = false): void {
    if (x === null) { this.marker2.classList.remove('on'); return; }
    this.marker2.classList.add('on');
    this.marker2.classList.toggle('edge', edge);
    this.marker2.style.left = `${x}px`;
    this.marker2.style.top = `${y}px`;
    this.marker2.innerHTML = `<img src="${import.meta.env.BASE_URL}ui/icon-ember.png" alt="">${tr(label)}`;
  }

  // Nom du lieu quand Happy y arrive
  showPlace(name: string, discovered: boolean): void {
    this.placename.innerHTML = `${discovered ? `<small>${tr('Discovered')}</small>` : ''}${tr(name)}`;
    this.placename.classList.add('on');
    this.placeTimer = 3.2;
  }

  // Charges de kaolin (seulement quand Happy a la calebasse)
  setKaolin(n: number | null): void {
    this.kaolin.style.opacity = n === null ? '0' : '1';
    if (n !== null) this.kaolin.innerHTML = `<span>Kaolin</span>${Array.from({ length: 5 }, (_, i) => `<img class="${i < n ? '' : 'off'}" src="${import.meta.env.BASE_URL}ui/icon-kaolin.png" alt="">`).join('')}<small>Q</small>`;
  }

  setGrabbed(on: boolean): void {
    this.grab.classList.toggle('on', on);
  }

  setPrompt(text: string | null): void {
    this.prompt.textContent = text ? tr(text) : '';
    this.prompt.classList.toggle('on', !!text);
  }

  say(text: string, seconds = 5): void {
    this.subtitle.textContent = tr(text);
    this.subtitle.classList.add('on');
    this.subTimer = seconds;
  }

  objective(text: string): void {
    this.toast.innerHTML = `<span>${tr('New objective')}</span>${tr(text)}`;
    this.toast.classList.add('on');
    this.toastTimer = 4.5;
  }

  // danger : 0 (calme) à 1 (souffle presque épuisé)
  setDanger(v: number): void {
    this.veil.style.opacity = String(0.35 + v * 0.65);
    this.veil.style.setProperty('--red', String(v));
  }

  hideAll(): void {
    this.setDealMarker(null);
    this.setPrompt(null);
    this.setTracker(null);
    this.setMarker(null);
    this.subtitle.classList.remove('on');
    this.toast.classList.remove('on');
  }

  update(dt: number): void {
    if (this.placeTimer > 0 && (this.placeTimer -= dt) <= 0) this.placename.classList.remove('on');
    if (this.subTimer > 0 && (this.subTimer -= dt) <= 0) this.subtitle.classList.remove('on');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toast.classList.remove('on');
  }
}
