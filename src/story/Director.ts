// Mise en scène : cinématiques (bandes noires, fondus, cartons de titre). Espace pour passer.
export interface Scene {
  duration: number;
  update(t: number, dt: number): void; // t = temps écoulé dans la scène (s)
  end(): void;                         // appelée une fois, à la fin ou si on passe la scène
}

export class Director {
  active = false;
  private scene: Scene | null = null;
  private t = 0;
  private bars: HTMLDivElement;
  private fade: HTMLDivElement;
  private card: HTMLDivElement;
  private skipHint: HTMLDivElement;
  private cardTimer = 0;

  constructor(root: HTMLElement) {
    const el = (cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      root.appendChild(d);
      return d;
    };
    this.bars = el('letterbox');
    this.fade = el('fadeblack');
    this.card = el('titlecard');
    this.skipHint = el('skiphint');
    this.skipHint.textContent = 'Space — skip';
  }

  play(scene: Scene): void {
    this.scene = scene;
    this.t = 0;
    this.active = true;
    this.bars.classList.add('on');
    this.skipHint.classList.add('on');
    document.body.classList.add('cine');
  }

  skip(): void {
    if (this.scene) this.finish();
  }

  private finish(): void {
    const s = this.scene;
    this.scene = null;
    this.active = false;
    this.bars.classList.remove('on');
    this.skipHint.classList.remove('on');
    document.body.classList.remove('cine');
    s?.end();
  }

  // Fondu au noir (alpha 0 à 1) en `seconds` secondes
  fadeTo(alpha: number, seconds = 1): void {
    this.fade.style.transition = `opacity ${seconds}s ease`;
    this.fade.style.opacity = String(alpha);
  }

  // Carton de titre (« PROLOGUE — THE ROAD »)
  title(text: string, sub = '', seconds = 4): void {
    this.card.innerHTML = `${sub ? `<small>${sub}</small>` : ''}${text}`;
    this.card.classList.add('on');
    this.cardTimer = seconds;
  }

  update(dt: number): void {
    if (this.cardTimer > 0 && (this.cardTimer -= dt) <= 0) this.card.classList.remove('on');
    if (!this.scene) return;
    this.t += dt;
    this.scene.update(this.t, dt);
    if (this.t >= this.scene.duration) this.finish();
  }
}
