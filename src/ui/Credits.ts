// =============================================================
//  Le générique de fin, en « motion horror » : chaque nom naît des braises
//  qui montent du bas de l'écran, se fige, tressaille (glitch, décalage rouge),
//  puis retombe en cendre. Des yeux de hibou s'ouvrent parfois dans le noir.
//  Après la vraie fin (IV), le même générique se joue en blanc kaolin et or, à l'aube.
// =============================================================
type Card = { small?: string; big: string; size?: number; below?: string };

const CARDS: Card[] = [
  { big: 'AZETIN', small: 'THE LAST HEALER', size: 1.6 },
  { small: 'A game by', big: 'HAPPY AZONDEKON' },
  { small: 'Studio', big: 'HEYHAPPY STUDIO' },
  { small: 'Voices · sound · music', big: 'ElevenLabs', size: 0.9 },
  { small: '3D models (CC BY)', big: 'KolosStudios · hoxsvl · Alex Martire', size: 0.6 },
  { small: 'Made for', big: 'OpenGame Game Jam #1', size: 0.75 },
  { small: 'Azé-tin and its people are fictional.', big: 'To those who were never buried.', size: 0.62 },
];

interface P { x: number; y: number; tx: number; ty: number; vx: number; vy: number; s: number; d: number }

export class Credits {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private done: (() => void) | null = null;
  private raf = 0;
  private guard = 0;
  private skipHandler = (e: KeyboardEvent | MouseEvent) => {
    if (e instanceof KeyboardEvent && e.code !== 'Space' && e.code !== 'Escape') return;
    this.finish();
  };

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.className = 'credits';
    this.g = this.cv.getContext('2d')!;
  }

  /** dawn = générique de la vraie fin (lumière), sinon braises et cendre */
  play(dawn: boolean, lastLine: string): Promise<void> {
    document.body.appendChild(this.cv);
    const W = (this.cv.width = innerWidth), H = (this.cv.height = innerHeight);
    const g = this.g;
    const cards: Card[] = [...CARDS, { big: lastLine, size: 0.85 }, { small: 'Thank you for playing', big: 'AZETIN', size: 1.3, below: 'The Last Healer' }];
    const N = 4200;
    const parts: P[] = Array.from({ length: N }, () => ({ x: Math.random() * W, y: H + Math.random() * H, tx: 0, ty: 0, vx: 0, vy: 0, s: 1 + Math.random() * 1.8, d: Math.random() }));
    // les pixels d'un carton deviennent des cibles pour les particules
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const og = off.getContext('2d')!;
    const targetsOf = (c: Card): [number, number][] => {
      og.clearRect(0, 0, W, H);
      og.fillStyle = dawn ? '#f4ead2' : '#ff7a2a';
      og.shadowColor = dawn ? 'rgba(255,230,180,0.8)' : 'rgba(255,60,0,0.9)';
      og.shadowBlur = 18;
      og.textAlign = 'center';
      const k = c.size ?? 1;
      const big = Math.min(W / (c.big.length * 0.62), H * 0.13) * k;
      og.font = `600 ${big}px Georgia, 'Times New Roman', serif`;
      og.fillText(c.big, W / 2, H / 2 + big * 0.3);
      if (c.below) {
        og.font = `600 ${Math.max(20, big * 0.36)}px Georgia, 'Times New Roman', serif`;
        og.fillText(c.below.toUpperCase().split('').join(' '), W / 2, H / 2 + big * 0.3 + big * 0.62);
      }
      if (c.small) {
        og.font = `500 ${Math.max(14, big * 0.26)}px system-ui, sans-serif`;
        og.fillText(c.small.toUpperCase().split('').join(' '), W / 2, H / 2 - big * 0.75);
      }
      const data = og.getImageData(0, 0, W, H).data;
      const pts: [number, number][] = [];
      const step = Math.max(2, Math.round(Math.sqrt((W * H) / 160000)));
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
      for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
      return pts;
    };
    const CARD = 4.6; // secondes par carton
    let card = -1, last = performance.now(), T = 0;
    let eyes = 0, eyesX = W * 0.8, eyesY = H * 0.25;
    return new Promise((resolve) => {
      this.done = resolve;
      // filet de sécurité : le générique finit toujours, quoi qu'il arrive
      this.guard = window.setTimeout(() => this.finish(), (cards.length * CARD + 4) * 1000);
      addEventListener('keydown', this.skipHandler);
      this.cv.addEventListener('click', this.skipHandler);
      const frame = (now: number) => {
        const dt = Math.min(0.25, (now - last) / 1000); // en temps réel, même si l'ordinateur rame
        last = now;
        T += dt; // le temps du film avance avec les images : rien ne se désynchronise si l'ordinateur rame
        const ci = Math.floor(T / CARD);
        const u = (T % CARD) / CARD; // 0 → 1 dans le carton
        if (ci >= cards.length) return this.finish();
        if (ci !== card) {
          card = ci;
          const tg = targetsOf(cards[ci]);
          parts.forEach((p, i) => {
            const t = tg[i % Math.max(1, tg.length)];
            p.tx = t ? t[0] : Math.random() * W;
            p.ty = t ? t[1] : Math.random() * H;
            if (!tg.length || i >= tg.length) { p.tx = Math.random() * W; p.ty = H + 50; }
          });
          if (!dawn && Math.random() < 0.6) { eyes = 1.4; eyesX = W * (0.15 + Math.random() * 0.7); eyesY = H * (0.15 + Math.random() * 0.2); }
        }
        // traînée : le noir efface lentement, ça laisse des sillages de braise
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = dawn ? 'rgba(14,10,6,0.28)' : 'rgba(4,2,2,0.3)';
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        const gather = u < 0.3, hold = u >= 0.3 && u < 0.72;
        for (const p of parts) {
          if (gather || hold) {
            // attirées vers la lettre, avec une turbulence qui baisse
            const k = gather ? 4 + u * 10 : 14;
            p.vx += (p.tx - p.x) * k * dt - p.vx * 5 * dt + (Math.random() - 0.5) * (gather ? 160 : 24) * dt;
            p.vy += (p.ty - p.y) * k * dt - p.vy * 5 * dt + (Math.random() - 0.5) * (gather ? 160 : 24) * dt;
          } else {
            // la lettre retombe en cendre : elle s'envole vers le haut, dérive avec le vent
            p.vy -= (dawn ? 60 : 90) * dt * (0.5 + p.d);
            p.vx += (Math.sin(p.y * 0.01 + T * 2) * 40 + 25) * dt;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < -20) { p.y = H + Math.random() * 60; p.x = Math.random() * W; p.vy = 0; }
          const flick = hold ? 0.75 + Math.random() * 0.25 : 0.5 + Math.random() * 0.5;
          const heat = gather ? u / 0.3 : hold ? 1 : 1 - (u - 0.72) / 0.28;
          g.fillStyle = dawn
            ? `rgba(${240 + p.d * 15},${225 + p.d * 20},${190 + heat * 40},${0.55 * flick})`
            : `rgba(255,${80 + heat * 120 * p.d},${20 + heat * 40},${0.6 * flick})`;
          g.fillRect(p.x, p.y, p.s, p.s);
        }
        // sous les braises, la lettre elle-même rougeoie (et reste lisible)
        const ta = gather ? Math.pow(u / 0.3, 2) * 0.5 : hold ? 0.55 + Math.random() * 0.08 : Math.max(0, 0.55 * (1 - (u - 0.72) / 0.14));
        if (ta > 0.01) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = ta;
          g.drawImage(off, hold && !dawn && Math.random() < 0.05 ? (Math.random() - 0.5) * 8 : 0, 0);
          g.globalAlpha = 1;
        }
        // glitch : des bandes du texte glissent, décalage rouge, un instant
        if (!dawn && hold && Math.random() < 0.08) {
          g.globalCompositeOperation = 'source-over';
          for (let k = 0; k < 4; k++) {
            const y = H * 0.35 + Math.random() * H * 0.3, h = 2 + Math.random() * 14, dx = (Math.random() - 0.5) * 60;
            g.drawImage(this.cv, 0, y, W, h, dx, y, W, h);
          }
          g.fillStyle = 'rgba(255,20,0,0.06)';
          g.fillRect(0, 0, W, H);
        }
        // les yeux du hibou s'ouvrent dans le noir, puis se ferment
        if (eyes > 0) {
          eyes -= dt;
          const open = Math.max(0, Math.sin(Math.min(1, Math.max(0, eyes) / 1.4) * Math.PI)); // jamais négatif : sinon le dessin plante et le générique se fige
          g.globalCompositeOperation = 'lighter';
          for (const sx of [-1, 1]) {
            const rg = g.createRadialGradient(eyesX + sx * 22, eyesY, 0, eyesX + sx * 22, eyesY, 14);
            rg.addColorStop(0, `rgba(255,200,60,${0.9 * open})`);
            rg.addColorStop(1, 'rgba(255,120,0,0)');
            g.fillStyle = rg;
            g.beginPath();
            g.ellipse(eyesX + sx * 22, eyesY, 14, 14 * open + 0.5, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        this.raf = requestAnimationFrame(frame);
      };
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      this.raf = requestAnimationFrame(frame);
    });
  }

  private finish(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.guard);
    removeEventListener('keydown', this.skipHandler);
    this.cv.removeEventListener('click', this.skipHandler);
    this.cv.classList.add('out');
    setTimeout(() => { this.cv.remove(); this.cv.classList.remove('out'); }, 900);
    const d = this.done;
    this.done = null;
    d?.();
  }
}
