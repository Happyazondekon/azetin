// Ambiance sonore provisoire, synthétisée (vent, grillons, cri de hibou).
// Elle sera remplacée par les sons ElevenLabs ; l'API de ce module restera la même.
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextCricket = 0;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Bruit blanc réutilisable
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Vent : bruit filtré, volume qui ondule lentement
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    if (ctx.currentTime > this.nextCricket) {
      this.cricket(ctx.currentTime);
      this.nextCricket = ctx.currentTime + 0.4 + Math.random() * 1.6;
    }
  }

  private cricket(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.value = 4300 + Math.random() * 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    osc.connect(g).connect(pan).connect(this.master!);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.07;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.012, s + 0.01);
      g.gain.linearRampToValueAtTime(0, s + 0.045);
    }
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Cri strident du hibou (provisoire). pan : −1 gauche, +1 droite
  owl(pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(1300, t);
    bp.frequency.linearRampToValueAtTime(2100, t + 0.25);
    bp.frequency.linearRampToValueAtTime(1100, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.08);
    g.gain.linearRampToValueAtTime(0.5, t + 0.6);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(bp).connect(g).connect(p).connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
  }
}
