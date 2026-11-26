// Pas de HUD permanent : seulement l'invite d'interaction, les sous-titres,
// l'annonce d'objectif et un voile qui rougit quand le souffle baisse.
export class Hud {
  private prompt: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private toast: HTMLDivElement;
  private veil: HTMLDivElement;
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
  }

  setPrompt(text: string | null): void {
    this.prompt.textContent = text ?? '';
    this.prompt.classList.toggle('on', !!text);
  }

  say(text: string, seconds = 5): void {
    this.subtitle.textContent = text;
    this.subtitle.classList.add('on');
    this.subTimer = seconds;
  }

  objective(text: string): void {
    this.toast.innerHTML = `<span>New objective</span>${text}`;
    this.toast.classList.add('on');
    this.toastTimer = 4.5;
  }

  // danger : 0 (calme) à 1 (souffle presque épuisé)
  setDanger(v: number): void {
    this.veil.style.opacity = String(0.35 + v * 0.65);
    this.veil.style.setProperty('--red', String(v));
  }

  hideAll(): void {
    this.setPrompt(null);
    this.subtitle.classList.remove('on');
    this.toast.classList.remove('on');
  }

  update(dt: number): void {
    if (this.subTimer > 0 && (this.subTimer -= dt) <= 0) this.subtitle.classList.remove('on');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toast.classList.remove('on');
  }
}
