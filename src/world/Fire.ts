import * as THREE from 'three';

// =============================================================
//  Le feu d'Azé-tin : flammes animées (shader), braises qui montent, fumée,
//  et l'explosion du dépôt (boule de feu, onde de choc, débris, champignon de fumée).
//  Tout est calculé dans le jeu : pas de texture à charger.
// =============================================================

const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){float f=0.0,a=0.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.03;a*=0.5;}return f;}
`;

// ---------------------------------------------------------------- flamme (plan qui fait face à la caméra)
const flameMat = (seed: number) =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uPower: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSeed, uPower;
      varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 uv = vUv;
        float t = uTime * 1.6 + uSeed * 17.0;
        // la flamme monte : le bruit défile vers le haut, et se tord davantage en haut
        float n = fbm(vec3(uv.x * 3.0, uv.y * 2.2 - t * 1.4, t * 0.35));
        float x = (uv.x - 0.5) * 2.0 + n * 0.35 * uv.y;
        // silhouette en goutte : large en bas, effilée en haut
        float width = mix(0.85, 0.08, pow(uv.y, 0.85));
        float body = 1.0 - smoothstep(width * 0.55, width, abs(x));
        float top = 1.0 - smoothstep(0.55, 1.0, uv.y + n * 0.25);
        float bottom = smoothstep(0.0, 0.08, uv.y);
        float a = body * top * bottom * uPower;
        // cœur blanc-jaune, puis orange, puis rouge sombre sur les bords
        float heat = a * (1.15 - uv.y * 0.7);
        vec3 col = mix(vec3(0.55, 0.06, 0.0), vec3(1.0, 0.45, 0.06), smoothstep(0.15, 0.55, heat));
        col = mix(col, vec3(1.0, 0.92, 0.65), smoothstep(0.7, 1.05, heat));
        gl_FragColor = vec4(col * a * 1.05, a);
      }`,
  });

// ---------------------------------------------------------------- textures de particules (dessinées une fois)
function dotTexture(inner: string, mid: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner);
  r.addColorStop(0.4, mid);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function smokeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, rr = 18 + Math.random() * 30;
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,0.22)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

interface Particle { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number; spin: number }

export interface FireHandle {
  group: THREE.Group;
  light: THREE.PointLight | null;
  power: number;          // 0 à 1 (on peut l'allumer, l'éteindre, le faire grandir)
  size: number;
  smoke: boolean;
  embers: boolean;
  follow?: THREE.Object3D; // une flamme qui suit quelqu'un (un homme qui brûle)
}

export class FireSystem {
  private fires: FireHandle[] = [];
  private mats: THREE.ShaderMaterial[] = [];
  private t = 0;
  // braises : un seul nuage de points pour tout le village
  private emberGeo = new THREE.BufferGeometry();
  private emberPos: Float32Array;
  private emberVel: Float32Array;
  private emberLife: Float32Array;
  private emberNext = 0;
  private readonly EN = 700;
  // fumée : des sprites recyclés
  private smoke: { s: THREE.Sprite; p: Particle }[] = [];
  private smokeNext = 0;
  private smokeTex = smokeTexture();
  private explosions: Explosion[] = [];

  constructor(private scene: THREE.Scene) {
    this.emberPos = new Float32Array(this.EN * 3).fill(-99);
    this.emberVel = new Float32Array(this.EN * 3);
    this.emberLife = new Float32Array(this.EN);
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    const pts = new THREE.Points(this.emberGeo, new THREE.PointsMaterial({
      map: dotTexture('rgba(255,240,180,1)', 'rgba(255,120,20,0.8)'), size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    pts.layers.enableAll();
    scene.add(pts);
    for (let i = 0; i < 120; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x2a2420, transparent: true, depthWrite: false, opacity: 0 }));
      s.layers.enableAll();
      s.visible = false;
      scene.add(s);
      this.smoke.push({ s, p: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1, spin: 0 } });
    }
  }

  /** Un feu : `size` = hauteur des flammes (m). */
  add(at: THREE.Vector3, size = 1, opts: { light?: boolean; smoke?: boolean; embers?: boolean; power?: number; color?: number } = {}): FireHandle {
    const group = new THREE.Group();
    group.position.copy(at);
    const n = size > 1.5 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const m = flameMat(Math.random());
      this.mats.push(m);
      const w = size * (0.55 + Math.random() * 0.35), h = size * (0.85 + Math.random() * 0.4);
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      q.position.set((Math.random() - 0.5) * size * 0.35, h / 2 - 0.02, (Math.random() - 0.5) * size * 0.35);
      q.userData.billboard = true;
      q.renderOrder = 5;
      q.layers.enableAll();
      group.add(q);
    }
    this.scene.add(group);
    let light: THREE.PointLight | null = null;
    if (opts.light !== false) {
      light = new THREE.PointLight(opts.color ?? 0xff7a2a, 0, Math.max(6, size * 8), 1.6);
      light.position.set(0, size * 0.6, 0);
      group.add(light);
    }
    const f: FireHandle = { group, light, power: opts.power ?? 1, size, smoke: opts.smoke ?? size > 0.8, embers: opts.embers ?? true };
    this.fires.push(f);
    return f;
  }

  remove(f: FireHandle): void {
    this.scene.remove(f.group);
    this.fires = this.fires.filter((x) => x !== f);
  }

  private emitEmber(at: THREE.Vector3, spread: number, up: number): void {
    const i = this.emberNext;
    this.emberNext = (this.emberNext + 1) % this.EN;
    this.emberPos.set([at.x + (Math.random() - 0.5) * spread, at.y, at.z + (Math.random() - 0.5) * spread], i * 3);
    this.emberVel.set([(Math.random() - 0.5) * 0.8, up * (0.6 + Math.random()), (Math.random() - 0.5) * 0.8], i * 3);
    this.emberLife[i] = 1.2 + Math.random() * 2.2;
  }

  emitSmoke(at: THREE.Vector3, size: number, rise = 1, life = 6, dark = 0x2a2420, vel?: THREE.Vector3): void {
    const sm = this.smoke[this.smokeNext];
    this.smokeNext = (this.smokeNext + 1) % this.smoke.length;
    sm.p.pos.copy(at);
    sm.p.vel.set((Math.random() - 0.5) * 0.4, rise * (0.6 + Math.random() * 0.5), (Math.random() - 0.5) * 0.4);
    if (vel) sm.p.vel.add(vel);
    sm.p.life = sm.p.max = life * (0.7 + Math.random() * 0.6);
    sm.p.size = size;
    sm.p.spin = (Math.random() - 0.5) * 0.4;
    (sm.s.material as THREE.SpriteMaterial).color.setHex(dark);
    (sm.s.material as THREE.SpriteMaterial).rotation = Math.random() * 6.28;
    sm.s.visible = true;
  }

  /** L'explosion du dépôt : boule de feu, éclair, onde de choc, débris, champignon. */
  explode(at: THREE.Vector3, scale = 1): void {
    this.explosions.push(new Explosion(this.scene, at, scale, this));
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.t += dt;
    for (const m of this.mats) m.uniforms.uTime.value = this.t;
    for (const f of this.fires) {
      if (f.follow) f.group.position.copy(f.follow.position).setY(f.follow.position.y + 0.2);
      const vis = f.power > 0.01;
      f.group.visible = vis;
      if (!vis) { if (f.light) f.light.intensity = 0; continue; }
      // les plans regardent la caméra (autour de l'axe vertical)
      const yaw = Math.atan2(camPos.x - f.group.position.x, camPos.z - f.group.position.z);
      for (const c of f.group.children) {
        if (!c.userData.billboard) continue;
        c.rotation.y = yaw;
        ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uPower.value = f.power;
        c.scale.setScalar(0.6 + 0.4 * f.power);
      }
      if (f.light) f.light.intensity = f.power * (3 + f.size * 6) * (0.78 + 0.22 * Math.sin(this.t * 13 + f.size) + 0.12 * Math.sin(this.t * 31.7));
      const d2 = f.group.position.distanceToSquared(camPos);
      if (d2 > 60 * 60) continue;
      if (f.embers && Math.random() < dt * 6 * f.size * f.power) this.emitEmber(f.group.position.clone().setY(f.group.position.y + f.size * 0.5), f.size * 0.6, 1 + f.size * 0.6);
      if (f.smoke && Math.random() < dt * 2.2 * f.power) this.emitSmoke(f.group.position.clone().setY(f.group.position.y + f.size * 0.9), f.size * 1.4, 0.8 + f.size * 0.3);
    }
    // braises
    for (let i = 0; i < this.EN; i++) {
      if (this.emberLife[i] <= 0) continue;
      this.emberLife[i] -= dt;
      const k = i * 3;
      this.emberVel[k] += Math.sin(this.t * 3 + i) * dt * 0.8;
      this.emberVel[k + 2] += Math.cos(this.t * 2.3 + i) * dt * 0.8;
      this.emberVel[k + 1] -= 0.15 * dt;
      this.emberPos[k] += this.emberVel[k] * dt;
      this.emberPos[k + 1] += this.emberVel[k + 1] * dt;
      this.emberPos[k + 2] += this.emberVel[k + 2] * dt;
      if (this.emberLife[i] <= 0) this.emberPos[k + 1] = -99;
    }
    this.emberGeo.attributes.position.needsUpdate = true;
    // fumée
    for (const { s, p } of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.15);
      const u = 1 - p.life / p.max;
      s.position.copy(p.pos);
      s.scale.setScalar(p.size * (0.6 + u * 2.2));
      const m = s.material as THREE.SpriteMaterial;
      m.opacity = Math.sin(Math.min(1, u * 1.2) * Math.PI) * 0.55;
      m.rotation += p.spin * dt;
      if (p.life <= 0) s.visible = false;
    }
    for (const e of this.explosions) e.update(dt);
    this.explosions = this.explosions.filter((e) => !e.done);
  }

  burstEmbers(at: THREE.Vector3, n: number, spread: number, up: number): void {
    for (let i = 0; i < n; i++) this.emitEmber(at, spread, up);
  }
}

// ---------------------------------------------------------------- l'explosion
class Explosion {
  done = false;
  private t = 0;
  private ball: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private light: THREE.PointLight;
  private debris: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];

  constructor(private scene: THREE.Scene, private at: THREE.Vector3, private s: number, private fx: FireSystem) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAge: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uAge;
        varying float vN; varying vec3 vNormal; varying vec3 vView;
        ${NOISE}
        void main(){
          float n = fbm(normal * 1.6 + vec3(0.0, -uTime * 1.2, uTime * 0.4));
          vN = n;
          vec3 p = position + normal * n * (0.35 + uAge * 0.25);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAge;
        varying float vN; varying vec3 vNormal; varying vec3 vView;
        void main(){
          // chaleur : très chaude au début, puis la boule noircit en fumée
          float rim = pow(1.0 - abs(dot(vNormal, vView)), 1.5);
          float heat = clamp(0.92 - uAge * 0.55 + vN * 1.15 - rim * 0.85, 0.0, 1.25);
          vec3 smoke = vec3(0.05, 0.035, 0.03);
          vec3 col = mix(smoke, vec3(0.75, 0.12, 0.0), smoothstep(0.1, 0.45, heat));
          col = mix(col, vec3(1.0, 0.55, 0.1), smoothstep(0.45, 0.85, heat));
          col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.9, 1.25, heat));
          float emissive = smoothstep(0.1, 0.6, heat);
          float a = clamp(1.6 - uAge * 0.28, 0.0, 1.0) * (0.75 + 0.25 * (1.0 - rim));
          gl_FragColor = vec4(col * (0.3 + emissive * 0.9), a);
        }`,
    });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 7), this.mat);
    this.ball.position.copy(at);
    this.ball.layers.enableAll();
    scene.add(this.ball);
    // onde de choc au sol
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(at.x, 0.15, at.z);
    this.ring.layers.enableAll();
    scene.add(this.ring);
    this.light = new THREE.PointLight(0xff9a40, 380 * s, 90, 1.5);
    this.light.position.set(at.x, at.y + 4, at.z);
    scene.add(this.light);
    // débris : planches, tôles et fûts projetés
    const dmat = new THREE.MeshStandardMaterial({ color: 0x1a120c, emissive: 0xff5a10, emissiveIntensity: 0.6, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(i % 4 === 0 ? new THREE.CylinderGeometry(0.25, 0.25, 0.8, 10) : new THREE.BoxGeometry(0.15 + Math.random() * 0.6, 0.04, 0.2 + Math.random() * 0.8), dmat);
      m.position.copy(at).setY(at.y + 1);
      m.layers.enableAll();
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = (8 + Math.random() * 16) * s;
      this.debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, (10 + Math.random() * 14) * s, Math.sin(a) * sp), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
    }
    fx.burstEmbers(at.clone().setY(2), 260, 6 * s, 9 * s);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t, s = this.s;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAge.value = t;
    // la boule grossit très vite, puis monte en champignon
    const r = s * (2 + 11 * (1 - Math.exp(-t * 2.6)));
    this.ball.scale.set(r, r * (1 + Math.min(1, t * 0.25) * 0.3), r);
    this.ball.position.y = this.at.y + r * 0.45 + Math.max(0, t - 0.8) * 3.2 * s;
    const rr = s * (2 + t * 38);
    this.ring.scale.setScalar(rr);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - t * 0.7);
    this.light.intensity = 380 * s * Math.exp(-t * 2.0) + 25 * s * Math.exp(-t * 0.15);
    this.light.position.y = this.ball.position.y;
    for (const d of this.debris) {
      if (d.m.position.y <= 0.05 && d.v.y < 0) { d.v.set(0, 0, 0); continue; }
      d.v.y -= 18 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.r.x * dt; d.m.rotation.y += d.r.y * dt;
      if (d.m.position.y < 0.05) d.m.position.y = 0.05;
    }
    // le champignon : fumée noire épaisse qui monte
    if (t > 0.5 && t < 9 && Math.random() < dt * 14) {
      const p = this.ball.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * r, (Math.random() - 0.2) * r * 0.6, (Math.random() - 0.5) * r));
      this.fx.emitSmoke(p, 3 * s + Math.random() * 3 * s, 2.5 * s, 9, t < 3 ? 0x4a2a18 : 0x1c1410);
    }
    if (t > 12) {
      this.scene.remove(this.ball, this.ring, this.light);
      this.done = true;
    }
  }
}
