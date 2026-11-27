import * as THREE from 'three';

// Ciel, soleil, lune et étoiles selon l'heure du jeu (19h : coucher du soleil → nuit → 5h : aube).
// Les couleurs du brouillard et des lumières suivent le même horaire.

interface Key {
  m: number;          // minutes depuis 0h (au-delà de 1440 = lendemain)
  top: number;        // haut du ciel
  hor: number;        // horizon
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;       // intensité de la lumière d'ambiance
  sun: number;        // intensité du soleil couchant
  moon: number;       // intensité de la lune
  stars: number;      // 0 à 1
  fogD: number;       // densité du brouillard
}

// Horaire : le soleil se couche vers 19h10, la nuit est pleine vers 20h15, l'aube vient vers 5h
const KEYS: Key[] = [
  { m: 18 * 60 + 30, top: 0x2e4670, hor: 0xd08a5a, fog: 0x4a3a3a, hemiSky: 0xc09a8a, hemiGround: 0x2a1c14, hemi: 1.1, sun: 1.3, moon: 0.0, stars: 0, fogD: 0.02 },
  { m: 19 * 60, top: 0x1e2a4e, hor: 0xb0583a, fog: 0x2e2228, hemiSky: 0x9a7480, hemiGround: 0x1c130e, hemi: 0.9, sun: 0.8, moon: 0.08, stars: 0.08, fogD: 0.028 },
  { m: 19 * 60 + 25, top: 0x141c3a, hor: 0x6a2e34, fog: 0x1a1620, hemiSky: 0x5a5a7a, hemiGround: 0x150e0a, hemi: 0.95, sun: 0.25, moon: 0.25, stars: 0.35, fogD: 0.034 },
  { m: 19 * 60 + 55, top: 0x0e1430, hor: 0x2a2038, fog: 0x0c0c16, hemiSky: 0x3e4e70, hemiGround: 0x140e0a, hemi: 1.25, sun: 0, moon: 0.6, stars: 0.75, fogD: 0.036 },
  { m: 20 * 60 + 30, top: 0x060a1a, hor: 0x0e1426, fog: 0x070a12, hemiSky: 0x3a4e74, hemiGround: 0x16100a, hemi: 1.4, sun: 0, moon: 0.95, stars: 1, fogD: 0.038 },
  { m: 24 * 60, top: 0x04081a, hor: 0x0c1222, fog: 0x060810, hemiSky: 0x34466a, hemiGround: 0x120c08, hemi: 1.3, sun: 0, moon: 1.0, stars: 1, fogD: 0.04 },
  { m: 24 * 60 + 4 * 60 + 30, top: 0x0a1028, hor: 0x1a1a30, fog: 0x0a0a14, hemiSky: 0x3a4a6a, hemiGround: 0x120c08, hemi: 1.0, sun: 0, moon: 0.5, stars: 0.8, fogD: 0.04 },
  { m: 24 * 60 + 5 * 60 + 30, top: 0x4a6a9a, hor: 0xf0b080, fog: 0x8a7a70, hemiSky: 0xffd8b0, hemiGround: 0x3a2a1a, hemi: 1.7, sun: 1.8, moon: 0.1, stars: 0, fogD: 0.02 },
  // le jour (seulement après la vraie fin : le village guéri, au soleil)
  { m: 24 * 60 + 7 * 60, top: 0x4a86c8, hor: 0xcfe0f0, fog: 0xb8c8d0, hemiSky: 0xfff0d8, hemiGround: 0x5a4028, hemi: 2.2, sun: 3.0, moon: 0, stars: 0, fogD: 0.008 },
  { m: 24 * 60 + 9 * 60, top: 0x3a7ac8, hor: 0xd8e8f4, fog: 0xc0d0d8, hemiSky: 0xffffff, hemiGround: 0x6a4a30, hemi: 2.4, sun: 3.4, moon: 0, stars: 0, fogD: 0.006 },
];

const c1 = new THREE.Color(), c2 = new THREE.Color();
function mix(a: number, b: number, t: number, out: THREE.Color): THREE.Color {
  return out.copy(c1.setHex(a)).lerp(c2.setHex(b), t);
}

export class Sky {
  private dome: THREE.Mesh;
  private uniforms = {
    uTop: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uSunCol: { value: new THREE.Color(0xff7a30) },
    uSun: { value: 0 },
    uStars: { value: 0 },
    uMoonDir: { value: new THREE.Vector3() },
  };
  private moonMesh: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private fog: THREE.FogExp2;

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.FogExp2(0x05070c, 0.04);
    scene.fog = this.fog;
    scene.background = null;

    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTop, uHor, uSunCol, uSunDir, uMoonDir;
        uniform float uSun, uStars;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHor, uTop, pow(clamp(h*1.6+0.05,0.0,1.0), 0.6));
          // lueur du soleil couchant près de l'horizon
          float s = max(dot(vDir, uSunDir), 0.0);
          col += uSunCol * (pow(s, 8.0) * 0.45 + pow(s, 160.0) * 2.0) * uSun;
          // halo de la lune
          float m = max(dot(vDir, uMoonDir), 0.0);
          col += vec3(0.55,0.62,0.8) * pow(m, 40.0) * 0.35 * uStars;
          // étoiles (scintillantes, pas sous l'horizon)
          vec3 q = floor(vDir * 420.0);
          float st = step(0.9978, hash(q)) * smoothstep(0.02, 0.25, vDir.y);
          col += vec3(st) * uStars * (0.35 + 0.45*hash(q+3.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(190, 32, 16), mat);
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // La lune : disque clair avec mers sombres, toujours face à la caméra
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    grd.addColorStop(0, 'rgba(235,236,225,1)');
    grd.addColorStop(0.62, 'rgba(225,228,215,1)');
    grd.addColorStop(0.66, 'rgba(200,210,230,0.35)');
    grd.addColorStop(1, 'rgba(160,180,220,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(150,150,140,0.35)';
    for (const [x, y, r] of [[52, 50, 10], [74, 58, 7], [60, 76, 9], [80, 76, 5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    scene.add(this.moonMesh);

    this.hemi = new THREE.HemisphereLight(0x2c3d5c, 0x120c08, 1.1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xff8a4a, 0);
    scene.add(this.sun);
    this.moon = new THREE.DirectionalLight(0x8fa8e8, 0.6);
    // la lune projette des ombres froides (une zone qui suit Happy)
    this.moon.castShadow = true;
    const sc = this.moon.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 160;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.05;
    this.moon.shadow.mapSize.set(2048, 2048);
    scene.add(this.moon);
    scene.add(this.moon.target);
  }

  // minutes = heure du jeu (19h = 1140) ; camera = pour garder le ciel centré sur Happy
  smoke = 0; // 0 à 1
  private smokeColor = new THREE.Color(0x2a2420);

  update(minutes: number, camera: THREE.Camera): void {
    let m = minutes;
    if (m < 12 * 60) m += 24 * 60; // après minuit
    let i = 0;
    while (i < KEYS.length - 2 && m > KEYS[i + 1].m) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((m - a.m) / (b.m - a.m), 0, 1);
    const lerp = (x: number, y: number) => x + (y - x) * t;

    mix(a.top, b.top, t, this.uniforms.uTop.value);
    mix(a.hor, b.hor, t, this.uniforms.uHor.value);
    mix(a.fog, b.fog, t, this.fog.color);
    this.fog.density = lerp(a.fogD, b.fogD) + this.smoke * 0.09; // la fumée de Houngbo (combat final)
    if (this.smoke > 0) this.fog.color.lerp(this.smokeColor, this.smoke * 0.8);
    mix(a.hemiSky, b.hemiSky, t, this.hemi.color);
    mix(a.hemiGround, b.hemiGround, t, this.hemi.groundColor);
    this.hemi.intensity = lerp(a.hemi, b.hemi);
    this.uniforms.uStars.value = lerp(a.stars, b.stars);

    // Soleil : se couche à l'ouest (−X) vers 19h15, se lève à l'est vers 5h30
    const dusk = (m - (19 * 60 + 15)) / 60;               // 0 = sous l'horizon
    const dawn = (m - (24 * 60 + 5 * 60 + 40)) / 60;
    const sunUp = m < 22 * 60 ? -dusk * 0.35 : dawn * 0.35;
    const sunX = m < 22 * 60 ? -1 : 1;
    const sd = this.uniforms.uSunDir.value.set(sunX, sunUp, -0.25).normalize();
    this.uniforms.uSun.value = lerp(a.sun, b.sun) * 0.6;
    this.sun.intensity = Math.max(0, lerp(a.sun, b.sun) * (sunUp > -0.05 ? 1 : 0.3));
    this.sun.position.copy(sd).multiplyScalar(80);

    // Lune : se lève à l'est à 19h, haute vers 1h
    const k = THREE.MathUtils.clamp((m - 19 * 60) / (7 * 60), 0, 1);
    const ang = 0.15 + k * Math.PI * 0.55;
    const md = this.uniforms.uMoonDir.value.set(Math.cos(ang) * 0.8, Math.sin(ang), -0.45).normalize();
    this.moon.intensity = lerp(a.moon, b.moon) * 2.4;
    // la zone d'ombre suit la caméra, alignée sur les texels (pas de scintillement en marchant)
    const fx = Math.round(camera.position.x / 2) * 2, fz = Math.round(camera.position.z / 2) * 2;
    this.moon.target.position.set(fx, 0, fz);
    this.moon.position.set(fx, 0, fz).addScaledVector(md, 80);

    // le ciel suit la caméra (il paraît infiniment loin)
    this.dome.position.copy(camera.position);
    this.moonMesh.position.copy(camera.position).addScaledVector(md, 170);
    this.moonMesh.lookAt(camera.position);
    (this.moonMesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(this.uniforms.uStars.value * 1.4, 0, 1);
  }
}
