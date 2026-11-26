// Ambiance sonore provisoire, synthétisée (vent, grillons, cri de hibou).
// Elle sera remplacée par les sons ElevenLabs ; l'API de ce module restera la même.
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextCricket = 0;
  // Voix réelles (enregistrements ElevenLabs de Dantokpa Dash) découpées en fragments et mélangées
  private pools: Record<'m' | 'f' | 'c', AudioBuffer[]> = { m: [], f: [], c: [] };
  private reversed = new Map<AudioBuffer, AudioBuffer>();
  private voicesLoading = false;
  // Fichiers ElevenLabs (générés par tools/voices/generate.mjs) : répliques, bruitages, musique
  private files = new Map<string, AudioBuffer | null>();
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private synthLoops = new Map<string, { gain: GainNode }>();
  private heartT = 0;
  private muffler: BiquadFilterNode | null = null;

  /** Sous l'eau : tout devient sourd */
  muffle(on: boolean): void {
    if (this.muffler && this.ctx) this.muffler.frequency.setTargetAtTime(on ? 380 : 20000, this.ctx.currentTime, on ? 0.15 : 0.6);
  }

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
    this.muffler = ctx.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = 20000;
    this.master.connect(this.muffler).connect(ctx.destination);

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
    this.loadVoices();
    this.preload(['sfx/owl.mp3', 'sfx/hornbill.mp3', 'sfx/stinger1.mp3', 'sfx/stinger2.mp3', 'sfx/stinger3.mp3', 'sfx/heartbeat.mp3',
      'sfx/night.mp3', 'sfx/drone.mp3', 'sfx/fire.mp3', 'sfx/whispers.mp3', 'sfx/ember.mp3', 'sfx/swing.mp3', 'sfx/impact.mp3',
      'sfx/tire_burst.mp3', 'sfx/owl_impact.mp3', 'sfx/car_drive.mp3', 'sfx/radio.mp3', 'sfx/phone_buzz.mp3', 'sfx/generator.mp3',
      'sfx/laugh.mp3', 'sfx/breath.mp3', 'sfx/footsteps.mp3', 'sfx/ui_click.mp3', 'sfx/ui_hover.mp3', 'sfx/ui_back.mp3', 'sfx/gong.mp3', 'sfx/kaolin.mp3', 'sfx/shutter.mp3', 'sfx/explosion.mp3', 'sfx/festival.mp3', 'sfx/tape.mp3', 'sfx/hornbill_far.mp3', 'music/theme.mp3', 'music/tension.mp3']);
  }

  /** Son d'interface (clic, survol, retour) : un coup sec et un souffle — l'horreur jusque dans les menus */
  ui(kind: 'click' | 'hover' | 'back'): void {
    if (!this.ctx) this.start();
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    if (this.files.get(`sfx/ui_${kind}.mp3`)) { this.sfx(`ui_${kind}`, { gain: kind === 'hover' ? 0.35 : 0.8 }); return; }
    const t = ctx.currentTime;
    if (kind !== 'hover') {
      // coup de bois sec, grave
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(kind === 'back' ? 90 : 140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.14);
    }
    // souffle filtré (le chuchotement qui suit)
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = kind === 'hover' ? 700 : 1800; bp.Q.value = 1.4;
    const ng = ctx.createGain();
    const a = kind === 'hover' ? 0.05 : 0.12;
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(a, t + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'hover' ? 0.25 : 0.4));
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.45);
  }

  // Les grillons/vent synthétisés s'effacent quand l'ambiance ElevenLabs est là
  hasFile(path: string): boolean {
    return !!this.files.get(path);
  }

  private loadVoices(): void {
    if (this.voicesLoading || !this.ctx) return;
    this.voicesLoading = true;
    const base = import.meta.env.BASE_URL;
    const files: [keyof Audio['pools'], number][] = [['m', 11], ['f', 10], ['c', 3]];
    for (const [k, n] of files)
      for (let i = 1; i <= n; i++)
        fetch(`${base}voices/${k}${i}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((b) => this.ctx!.decodeAudioData(b))
          .then((buf) => {
            this.pools[k].push(buf);
            // copie à l'envers : la parole des morts
            const rev = this.ctx!.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
            for (let ch = 0; ch < buf.numberOfChannels; ch++) rev.copyToChannel(buf.getChannelData(ch).slice().reverse(), ch);
            this.reversed.set(buf, rev);
          })
          .catch(() => { /* fichier absent : la voix synthétique prend le relais */ });
  }

  /**
   * Une réplique « parlée » : fragments de vraies voix béninoises (accent, souffle, intonation),
   * découpés et recousus. On entend une voix vivante sans comprendre les mots : le sous-titre dit le texte.
   * kind : m (homme), f (femme), c (enfant). ghost : voix d'Azévi (plus grave, voilée, en partie à l'envers, écho).
   * Retourne la durée (s).
   */
  voiceMix(text: string, kind: 'm' | 'f' | 'c', opts: { gain?: number; pan?: number; ghost?: boolean; rate?: number; whisper?: boolean } = {}): number {
    const ctx = this.ctx;
    const pool = this.pools[kind].length ? this.pools[kind] : this.pools[kind === 'c' ? 'f' : kind];
    if (!ctx || !this.master || !pool.length) return this.babble(text, { pitch: kind === 'm' ? 1 : kind === 'f' ? 1.45 : 1.9, rate: 1 }, opts.gain ?? 1, opts.pan ?? 0, !!opts.whisper);
    const gain = opts.gain ?? 1;
    if (gain <= 0.01) return 0;
    const total = Math.min(7, Math.max(1.1, 0.45 + text.length * 0.052)) * (opts.whisper ? 0.6 : 1);
    const out = ctx.createGain();
    out.gain.value = gain * (opts.whisper ? 0.35 : 0.9);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    let tail: AudioNode = out;
    if (opts.ghost || opts.whisper) {
      // voix voilée : passe-bas + écho court
      const lp = ctx.createBiquadFilter();
      lp.type = opts.whisper ? 'highpass' : 'lowpass';
      lp.frequency.value = opts.whisper ? 1400 : 2200;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.19;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      out.connect(lp);
      lp.connect(delay).connect(fb).connect(delay);
      const mix = ctx.createGain();
      lp.connect(mix);
      delay.connect(mix);
      tail = mix;
    }
    tail.connect(pan).connect(this.master);
    let t = ctx.currentTime + 0.03;
    const end = t + total;
    const baseRate = (opts.rate ?? 1) * (opts.ghost ? 0.86 : 1);
    while (t < end) {
      const buf0 = pool[Math.floor(Math.random() * pool.length)];
      const buf = opts.ghost && Math.random() < 0.35 ? this.reversed.get(buf0) ?? buf0 : buf0;
      const len = Math.min(end - t, 0.28 + Math.random() * 0.5);
      const off = buf.duration * (0.1 + Math.random() * 0.7);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = baseRate * (0.94 + Math.random() * 0.12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.035);
      env.gain.setValueAtTime(1, t + Math.max(0.04, len - 0.05));
      env.gain.linearRampToValueAtTime(0, t + len);
      src.connect(env).connect(out);
      src.start(t, Math.min(off, Math.max(0, buf.duration - len - 0.05)));
      src.stop(t + len + 0.02);
      t += len - 0.03; // léger chevauchement : pas de trou entre les fragments
      if (Math.random() < 0.12) t += 0.15; // une respiration
    }
    return total;
  }

  // Grognement d'un Brûlé qui frappe, ou de Happy blessé
  grunt(kind: 'm' | 'f', ghost: boolean, gain = 1, pan = 0): void {
    this.voiceMix('ah', kind, { ghost, gain, pan, rate: ghost ? 0.75 : 1.1 });
  }

  // Sifflement d'un coup dans le vide
  swoosh(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.12);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.06);
    g.gain.linearRampToValueAtTime(0, t + 0.26);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  // ---------------------------------------------------------------- fichiers (ElevenLabs)
  private async file(path: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.files.has(path)) return this.files.get(path)!;
    this.files.set(path, null);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}${path}`);
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('audio') && !path.endsWith('.mp3')) throw 0;
      const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.files.set(path, buf);
      return buf;
    } catch {
      return null;
    }
  }

  // Précharge les bruitages et la musique (s'ils ont été générés)
  preload(names: string[]): void {
    for (const n of names) void this.file(n);
  }

  // Chaîne d'effet : voix d'Azévi (voilée + écho) ou radio (bande étroite + souffle)
  private chain(kind: 'dry' | 'ghost' | 'radio', gain: number, pan: number): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master!);
    if (kind === 'dry') return g;
    const f = ctx.createBiquadFilter();
    if (kind === 'radio') {
      f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9;
      f.connect(g);
      return f;
    }
    f.type = 'lowpass'; f.frequency.value = 2600;
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    f.connect(g);
    f.connect(d).connect(fb).connect(d);
    fb.connect(g);
    return f;
  }

  /** Réplique enregistrée (public/voices/lines/<id>.mp3). Retourne sa durée, ou 0 si le fichier manque. */
  async playLine(id: string, opts: { gain?: number; pan?: number; ghost?: boolean; radio?: boolean } = {}): Promise<number> {
    const buf = await this.file(`voices/lines/${id}.mp3`);
    if (!buf || !this.ctx) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.ghost) src.playbackRate.value = 0.94;
    src.connect(this.chain(opts.radio ? 'radio' : opts.ghost ? 'ghost' : 'dry', opts.gain ?? 1, opts.pan ?? 0));
    src.start();
    return buf.duration;
  }

  /** Bruitage ponctuel (public/sfx/<nom>.mp3) ; sinon un son de secours synthétisé. */
  sfx(name: string, opts: { gain?: number; pan?: number; rate?: number } = {}): void {
    const buf = this.files.get(`sfx/${name}.mp3`);
    if (buf && this.ctx && this.master) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      src.connect(this.chain('dry', opts.gain ?? 1, opts.pan ?? 0));
      src.start();
      return;
    }
    // secours
    if (name === 'owl') this.owl(opts.pan ?? 0);
    else if (name === 'hornbill' || name === 'hornbill_far') this.hornbillSynth(opts.pan ?? 0, opts.gain ?? 1);
    else if (name === 'explosion') { this.stinger(1.4); this.thud(); }
    else if (name === 'gong') this.gongSynth();
    else if (name === 'kaolin') this.swoosh();
    else if (name === 'shutter' || name === 'tape') this.buzz();
    else if (name.startsWith('stinger') || name === 'owl_impact' || name === 'tire_burst') this.stinger(name === 'stinger2' ? 0.6 : 1);
    else if (name === 'impact' || name === 'ember') this.thud();
    else if (name === 'swing') this.swoosh();
    else if (name === 'whispers' || name === 'breath') this.voiceMix('whispers in the dark around you', Math.random() < 0.5 ? 'm' : 'f', { ghost: true, whisper: name === 'whispers', gain: opts.gain ?? 0.8, pan: opts.pan });
    else if (name === 'laugh') this.voiceMix('ha ha ha', 'f', { ghost: true, gain: 0.7, rate: 0.8 });
    else if (name === 'phone_buzz') this.buzz();
  }

  /** Boucle (ambiance, feu, battement de cœur, musique) ; gain 0 = coupée. */
  loop(name: string, gain: number, path = `sfx/${name}.mp3`): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const buf = this.files.get(path);
    let l = this.loops.get(name);
    if (!l && buf && gain > 0.001) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.master);
      src.start();
      l = { src, gain: g };
      this.loops.set(name, l);
    }
    if (l) l.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
    else if (name === 'heartbeat') this.heartSynth(gain);
    else if (name === 'drone') this.droneSynth(gain);
  }

  // ---------------------------------------------------------------- sons de secours (avant la génération ElevenLabs)
  stinger(k = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6 * k, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    o.connect(lp).connect(og).connect(this.master);
    o.start(t); o.stop(t + 1.7);
    // coup de cordes dissonant : bruit filtré très court + deux notes en seconde mineure
    for (const f of [740, 784, 1046]) {
      const s = ctx.createOscillator();
      s.type = 'sawtooth';
      s.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09 * k, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      s.connect(g).connect(this.master);
      s.start(t); s.stop(t + 1);
    }
  }

  // Calao : deux notes graves, comme un tambour qui souffle (« hou-hou… hou »)
  private hornbillSynth(pan: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    for (const [d, f] of [[0, 118], [0.42, 96]] as const) {
      const t = ctx.currentTime + d;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 1.08, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.45 * gain, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g).connect(p);
      o.start(t); o.stop(t + 0.4);
    }
  }

  private gongSynth(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 1.6;
      for (const f of [68, 102, 171]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 2.3);
      }
    }
  }

  private buzz(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (const d of [0, 0.25]) {
      const o = ctx.createOscillator();
      o.frequency.value = 170;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.3, t + d + 0.02);
      g.gain.linearRampToValueAtTime(0, t + d + 0.18);
      o.connect(g).connect(this.master);
      o.start(t + d); o.stop(t + d + 0.2);
    }
  }

  private heartSynth(gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || gain < 0.05) return;
    if (ctx.currentTime < this.heartT) return;
    const bpm = 60 + gain * 70;
    this.heartT = ctx.currentTime + 60 / bpm;
    for (const [d, a] of [[0, 1], [0.16, 0.7]]) {
      const t = ctx.currentTime + d;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(60, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9 * gain * a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }
  }

  private droneSynth(gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    let d = this.synthLoops.get('drone');
    if (!d) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 220;
      for (const f of [41.2, 43.65, 61.7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      }
      lp.connect(g).connect(this.master);
      d = { gain: g };
      this.synthLoops.set('drone', d);
    }
    d.gain.gain.setTargetAtTime(gain * 0.25, ctx.currentTime, 0.8);
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

  // ---------------------------------------------------------------- voix
  // Bruits de paroles (en attendant les voix ElevenLabs) : syllabes synthétisées avec des formants
  // de voyelles, à la hauteur de la voix du personnage. gain : 0 à 1 (distance), pan : −1 à 1.
  babble(text: string, voice: { pitch: number; rate: number }, gain = 1, pan = 0, whisper = false): number {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || gain <= 0.01) return 0;
    const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1720]];
    const n = Math.min(34, Math.max(3, Math.round(text.replace(/[^a-zA-ZÀ-ÿ]/g, '').length / 3)));
    const syl = 0.13 / voice.rate;
    let t = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.value = gain * (whisper ? 0.5 : 0.22);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p).connect(this.master);
    const f0 = 118 * voice.pitch;
    for (let i = 0; i < n; i++) {
      const [F1, F2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      const d = syl * (0.7 + Math.random() * 0.6);
      const src: AudioScheduledSourceNode = whisper ? ctx.createBufferSource() : ctx.createOscillator();
      if (whisper) {
        (src as AudioBufferSourceNode).buffer = this.noise;
      } else {
        const o = src as OscillatorNode;
        o.type = 'sawtooth';
        // intonation : la phrase monte puis retombe
        const contour = 1 + 0.12 * Math.sin((i / n) * Math.PI) - 0.1 * (i / n);
        o.frequency.setValueAtTime(f0 * contour * (0.95 + Math.random() * 0.1), t);
      }
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + d * 0.25);
      env.gain.linearRampToValueAtTime(0, t + d);
      for (const [F, q, k] of [[F1 * (0.9 + voice.pitch * 0.1), 8, 1], [F2 * (0.9 + voice.pitch * 0.1), 12, 0.6]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = F;
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = k * (whisper ? 3 : 1);
        src.connect(bp).connect(g).connect(env);
      }
      env.connect(out);
      src.start(t);
      src.stop(t + d + 0.02);
      t += d + (Math.random() < 0.15 ? 0.12 : 0.015); // petites pauses entre les mots
    }
    return t - ctx.currentTime;
  }

  // Coup sourd (une arme touche un Brûlé)
  thud(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
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
