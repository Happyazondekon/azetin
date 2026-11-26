import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clips, type Models, type ModelName } from './Assets';
import { LAYER_SEEN, LAYER_TRUTH } from './Village';

// Habitants d'Azé-tin : corps Quaternius aux traits africains (repris de Dantokpa Dash),
// vêtements cousus dans Blender rattachés au même squelette, animations d'anims.glb.
// Chaque personnage existe deux fois :
//  - « vu » (calque 1) : ce que voient les yeux de Happy ;
//  - « vérité » (calque 2) : ce que montre le rétroviseur. Pour un Azévi, tout est calciné.

// Coiffures, chaussures : reprises de Dantokpa Dash (même corps, même squelette)
export type HairId = 'short04' | 'short02' | 'afro01' | 'braid01' | 'bob02' | 'long01' | 'ponytail01';
export type ShoeId = 'sandale' | 'babouche' | 'tapette' | 'derby' | 'basket' | 'none';
const HAIR_OK: Record<'m' | 'f', HairId[]> = {
  m: ['short04', 'short02', 'afro01', 'braid01'],
  f: ['braid01', 'afro01', 'bob02', 'long01', 'ponytail01', 'short04'],
};
const SHOE_COL: Record<Exclude<ShoeId, 'none'>, [string, string][]> = {
  sandale: [['#7a4e2d', '#3b2416'], ['#5a3a22', '#2a1a10'], ['#2a2420', '#141210']],
  babouche: [['#e0a526', '#7b2cbf'], ['#d8cfb8', '#6a4a2a'], ['#8a1c1c', '#2a1410']],
  tapette: [['#2f6fb3', '#1c2440'], ['#c8322a', '#2a1a1a'], ['#2a2a2a', '#141414'], ['#2f8a4a', '#1a2a1a']],
  derby: [['#6b3d23', '#2b1a10'], ['#141414', '#0a0a0a']],
  basket: [['#f2f0ea', '#e8112d'], ['#2f5fa7', '#f2f0ea'], ['#5b6b3a', '#e9e4d4']],
};

// Un habitant différent à chaque graine : peau, taille, tenue, coiffure, chaussures, tissu, âge
const SKINS = ['#3e281b', '#4a2e1e', '#5b3a26', '#4e3020', '#38241a', '#6a4430', '#2e1e14', '#57382a'];
const WAXES: [string, string, string][] = [
  ['#4a3a2a', '#8a6a3a', '#d8c8a0'], ['#2a6f5f', '#e9c46a', '#f4a261'], ['#5a4a2a', '#2a1d16', '#c9a23a'], ['#3a2a4a', '#c97b2a', '#e8e0cc'],
  ['#6a2a2a', '#e0b050', '#2a2a2a'], ['#1d3557', '#a8dadc', '#e63946'], ['#3a4a2a', '#c0a060', '#e8e0cc'], ['#5a2a4a', '#f0c0a0', '#2a1a2a'],
  ['#0f5a3a', '#f2c14e', '#e8e0cc'], ['#7a1f2b', '#2a6f9f', '#f4e3c0'], ['#c25a1c', '#2a1d16', '#f2d27a'], ['#e8e0cc', '#1d3557', '#c9a23a'],
  ['#2a2a2a', '#e8e0cc', '#c8322a'], ['#4b2c6a', '#e9c46a', '#2a9d8f'],
];
export type Look = Omit<PersonDef, 'id' | 'azevi' | 'pose' | 'slow' | 'truth' | 'child'> & { elder: boolean };
export function randomLook(seed: string, sex: 'm' | 'f'): Look {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h >>> 8) / 16777216);
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const weighted = <T,>(a: [T, number][]): T => { let r = rnd() * a.reduce((t, [, w]) => t + w, 0); for (const [v, w] of a) if ((r -= w) <= 0) return v; return a[0][0]; };
  const elder = rnd() < 0.18;
  const top = weighted<PersonDef['top']>(sex === 'm' ? [['bomba', 3], ['chemise', 3], ['robe', 1.5], ['haut', 2.5]] : [['robe', 3], ['haut', 2.5], ['bomba', 2], ['chemise', 2.5]]);
  const gele = sex === 'f' && rnd() < (elder ? 0.6 : 0.3);
  const bald = sex === 'm' && rnd() < (elder ? 0.35 : 0.1);
  const hair = gele || bald ? undefined : pick(HAIR_OK[sex]);
  const shoe = weighted<ShoeId>([['sandale', 3], ['tapette', 3], ['babouche', 1.5], ['derby', 1.5], ['basket', 1], ['none', elder ? 1 : 0.3]]);
  return {
    sex, elder, top, gele, hair, shoe,
    height: sex === 'm' ? 1.62 + rnd() * 0.28 : 1.52 + rnd() * 0.24,
    skin: pick(SKINS),
    wax: pick(WAXES),
    pattern: Math.floor(rnd() * 6),
    hairColor: elder ? pick(['#8d8d8d', '#b8b4ac', '#6e6a64']) : undefined,
    beard: sex === 'm' && rnd() < (elder ? 0.7 : 0.35),
    pants: pick(['#2a241e', '#1f1c18', '#3a3226', '#2e3440', '#4a3b2a', '#d8cfb8']),
    shoeColor: shoe === 'none' ? undefined : pick(SHOE_COL[shoe]),
  };
}

// Traits du visage (déformations face_* du corps, comme Dantokpa Dash)
function faceMorphs(face: string | undefined, id: string): Record<string, number> {
  let f = face;
  if (!f || !/^[012]{3}$/.test(f)) {
    let h = 7;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    f = [h % 3, (h >> 3) % 3, (h >> 6) % 3].join('');
  }
  const lv = (d: string, lo: number) => (d === '0' ? lo : d === '2' ? 1 : 0);
  return { face_nose: lv(f[0], -0.7), face_lips: lv(f[1], -0.7), face_jaw: lv(f[2], -0.6) };
}

export interface PersonDef {
  id: string;
  sex: 'm' | 'f';
  height: number;     // m
  skin: string;
  top: 'bomba' | 'chemise' | 'robe' | 'haut'; // coupes cousues pour les deux sexes (robe homme = boubou long)
  wax: [string, string, string]; // couleurs du pagne
  pattern?: number;   // motif du tissu (0-5), sinon tiré des couleurs
  pants?: string;     // couleur du pantalon (hommes)
  hair?: HairId;
  hairColor?: string; // gris pour les anciens
  shoe?: ShoeId;
  shoeColor?: [string, string]; // dessus, semelle
  face?: string;      // traits du visage « nez, lèvres, mâchoire » (0-2 chacun), sinon tirés de l'id
  beard?: boolean;
  gele?: boolean;
  azevi: boolean;     // mort lié à la malédiction
  truth?: 'same' | 'burnt' | 'wet'; // reflet dans le rétroviseur (par défaut : brûlé si Azévi, sinon le même)
  child?: boolean;    // enfant : tête plus grosse par rapport au corps
  pose?: 'Idle_Loop' | 'Idle_Talking_Loop' | 'Sitting_Idle_Loop' | 'Crouch_Idle_Loop';
  slow?: number;      // vitesse de l'animation (les Azévi immobiles bougent à peine)
}

export interface Person {
  def: PersonDef;
  root: THREE.Group;                 // à placer dans la scène (regarde vers +Z)
  mixers: THREE.AnimationMixer[];    // vu + vérité, toujours synchronisés
  play(name: string, fade?: number, once?: boolean): void;
  update(dt: number): void;
  voice: { pitch: number; rate: number }; // voix (bruits de paroles)
}

// ---------------------------------------------------------------- textures
const waxCache = new Map<string, THREE.Texture>();
// Six motifs de tissu : ronds-losanges (wax), rayures, kente, feuilles, cercles concentriques, damier bogolan
function waxTexture(c: [string, string, string], pattern?: number): THREE.Texture {
  const pat = pattern ?? (c.join('').length + c[0].charCodeAt(1) + c[1].charCodeAt(2)) % 6;
  const key = c.join() + pat;
  const hit = waxCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = c[0];
  g.fillRect(0, 0, 128, 128);
  const cells = (f: (x: number, y: number, i: number) => void) => { let i = 0; for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) f(x, y, i++); };
  if (pat === 0) {
    g.fillStyle = c[1];
    cells((x, y) => { g.beginPath(); g.arc(x + 16, y + 16, 11, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = c[2];
    cells((x, y) => { g.beginPath(); g.moveTo(x, y + 16); g.lineTo(x + 6, y + 10); g.lineTo(x + 12, y + 16); g.lineTo(x + 6, y + 22); g.fill(); });
  } else if (pat === 1) {
    for (let x = 0; x < 128; x += 16) { g.fillStyle = c[1]; g.fillRect(x, 0, 7, 128); g.fillStyle = c[2]; g.fillRect(x + 9, 0, 2, 128); }
  } else if (pat === 2) {
    cells((x, y, i) => {
      g.fillStyle = i % 2 ? c[1] : c[2];
      g.fillRect(x + 2, y + 2, 28, 12);
      g.fillStyle = i % 3 ? c[2] : c[1];
      g.fillRect(x + 2, y + 18, 12, 12); g.fillRect(x + 18, y + 18, 12, 12);
    });
  } else if (pat === 3) {
    cells((x, y, i) => {
      g.fillStyle = i % 2 ? c[1] : c[2];
      g.beginPath(); g.ellipse(x + 16, y + 16, 13, 6, (i % 4) * 0.8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = c[0]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 6, y + 16); g.lineTo(x + 26, y + 16); g.stroke();
    });
  } else if (pat === 4) {
    cells((x, y) => {
      for (const [r, col] of [[14, c[1]], [9, c[2]], [4, c[1]]] as [number, string][]) { g.fillStyle = col; g.beginPath(); g.arc(x + 16, y + 16, r, 0, Math.PI * 2); g.fill(); }
    });
  } else {
    cells((x, y, i) => {
      g.fillStyle = (i + Math.floor(i / 4)) % 2 ? c[1] : c[0];
      g.fillRect(x, y, 32, 32);
      g.fillStyle = c[2];
      for (let k = 0; k < 3; k++) g.fillRect(x + 6 + k * 9, y + 6, 3, 20);
    });
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.2, 3.2);
  waxCache.set(key, t);
  return t;
}

// Chair et tissu calcinés : croûte noire, fissures de braise (émissives)
let burntMat: THREE.MeshStandardMaterial | null = null;
function burnt(): THREE.MeshStandardMaterial {
  if (burntMat) return burntMat;
  const S = 256;
  const base = document.createElement('canvas');
  const glow = document.createElement('canvas');
  base.width = base.height = glow.width = glow.height = S;
  const b = base.getContext('2d')!;
  const e = glow.getContext('2d')!;
  b.fillStyle = '#17110e';
  b.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { // plaques de croûte
    b.fillStyle = `rgba(${40 + rnd() * 30},${28 + rnd() * 16},${22 + rnd() * 10},0.5)`;
    b.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 10, 3 + rnd() * 10);
  }
  e.strokeStyle = '#ff5a10';
  b.strokeStyle = '#3a0e02';
  for (let i = 0; i < 70; i++) { // fissures
    let x = rnd() * S, y = rnd() * S;
    e.lineWidth = b.lineWidth = 1.4 + rnd() * 2.2;
    e.beginPath(); b.beginPath();
    e.moveTo(x, y); b.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rnd() - 0.5) * 26; y += (rnd() - 0.5) * 26;
      e.lineTo(x, y); b.lineTo(x, y);
    }
    e.stroke(); b.stroke();
  }
  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  const em = new THREE.CanvasTexture(glow);
  em.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); }
  burntMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 3.2, roughness: 1 });
  return burntMat;
}

// Noyée (Ayaba) : peau et tissu gris-bleu, luisants comme l'eau de la lagune sous la lune
let wetMat: THREE.MeshStandardMaterial | null = null;
function wet(): THREE.MeshStandardMaterial {
  return (wetMat ??= new THREE.MeshStandardMaterial({ color: 0x34444f, roughness: 0.1, metalness: 0.25, emissive: 0x1a3a52, emissiveIntensity: 0.55 }));
}

// ---------------------------------------------------------------- pantalon (coque découpée dans le corps, comme Dantokpa Dash)
const LEG_BONES = new Set(['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r']);
const shellCache = new Map<string, THREE.BufferGeometry>();
function legShell(body: THREE.SkinnedMesh, inflate: number, key: string): THREE.BufferGeometry {
  const hit = shellCache.get(key);
  if (hit) return hit;
  const src = body.geometry;
  const bones = body.skeleton.bones;
  const pos = src.attributes.position as THREE.BufferAttribute;
  const nor = src.attributes.normal as THREE.BufferAttribute;
  const si = src.attributes.skinIndex as THREE.BufferAttribute;
  const sw = src.attributes.skinWeight as THREE.BufferAttribute;
  const n = pos.count;
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > best) { best = w; bi = si.getComponent(i, k); }
    }
    keep[i] = LEG_BONES.has(bones[bi]?.name) ? 1 : 0;
  }
  const geo = src.clone();
  const p = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3);
  for (let i = 0; i < n; i++)
    p.setXYZ(i, pos.getX(i) + nor.getX(i) * inflate, pos.getY(i) + nor.getY(i) * inflate, pos.getZ(i) + nor.getZ(i) * inflate);
  geo.setAttribute('position', p);
  geo.morphAttributes = {};
  const idx = src.index;
  const out: number[] = [];
  const count = idx ? idx.count : n;
  for (let t = 0; t < count; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    if (keep[a] && keep[b] && keep[c]) out.push(a, b, c);
  }
  geo.setIndex(out);
  shellCache.set(key, geo);
  return geo;
}

// Calotte sous les cheveux : le crâne Quaternius est couleur peau et les mèches sont en partie transparentes
const capCache = new Map<string, THREE.BufferGeometry>();
function capShell(body: THREE.SkinnedMesh, inflate: number, key: string): THREE.BufferGeometry {
  const hit = capCache.get(key);
  if (hit) return hit;
  const src = body.geometry;
  const bones = body.skeleton.bones;
  const pos = src.attributes.position as THREE.BufferAttribute;
  const nor = src.attributes.normal as THREE.BufferAttribute;
  const si = src.attributes.skinIndex as THREE.BufferAttribute;
  const sw = src.attributes.skinWeight as THREE.BufferAttribute;
  const n = pos.count;
  const head = new Uint8Array(n);
  let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    let best = 0, bi = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
    if (bones[bi]?.name === 'Head') {
      head[i] = 1;
      y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i));
      z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i));
    }
  }
  const zc = (z0 + z1) / 2, hy = y1 - y0, dz = z1 - z0;
  // le dessus du crâne, et l'arrière de la tête (jamais le visage, tourné vers +Z)
  const keep = (i: number) => head[i] && (pos.getY(i) > y0 + hy * 0.8 || (pos.getY(i) > y0 + hy * 0.42 && pos.getZ(i) < zc - dz * 0.12));
  const geo = src.clone();
  const p = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3);
  for (let i = 0; i < n; i++)
    p.setXYZ(i, pos.getX(i) + nor.getX(i) * inflate, pos.getY(i) + nor.getY(i) * inflate, pos.getZ(i) + nor.getZ(i) * inflate);
  geo.setAttribute('position', p);
  geo.morphAttributes = {};
  const idx = src.index;
  const out: number[] = [];
  const count = idx ? idx.count : n;
  for (let t = 0; t < count; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    if (keep(a) && keep(b) && keep(c)) out.push(a, b, c);
  }
  geo.setIndex(out);
  capCache.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------- assemblage
function skinnedIn(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh); });
  return out;
}

function buildBody(models: Models, def: PersonDef, truth: boolean): { holder: THREE.Group; model: THREE.Object3D } | null {
  const src = models[`body-${def.sex}` as ModelName];
  if (!src) return null;
  const model = cloneSkinned(src);
  const holder = new THREE.Group();
  holder.add(model);
  // à la bonne taille, pieds au sol, centré
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  model.scale.multiplyScalar(def.height / h);
  const b2 = new THREE.Box3().setFromObject(model);
  const c = b2.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -b2.min.y, -c.z);
  if (def.sex === 'f') model.position.y -= 0.0173 * model.scale.y; // bassin féminin plus bas (comme Dantokpa Dash)

  const bones: Record<string, THREE.Bone> = {};
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
  const body = skinnedIn(model).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  const look = truth ? (def.truth ?? (def.azevi ? 'burnt' : 'same')) : 'same';
  const dead = look === 'burnt';
  const drowned = look === 'wet';
  const over = (): THREE.Material | null => (dead ? burnt() : drowned ? wet() : null);

  // peau, yeux, sourcils
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const o2 = over();
    if (o2) { m.material = o2; return; }
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (m === body) mat.color.set(def.skin);
    else if (/brow/i.test(m.name)) mat.color.set(def.hairColor ?? '#1d1410');
    m.material = mat;
  });
  // chaque visage est différent : nez, lèvres, mâchoire
  const fm = faceMorphs(def.face, def.id);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return;
    for (const [name, i] of Object.entries(m.morphTargetDictionary)) if (name in fm) m.morphTargetInfluences[i] = fm[name];
  });

  // vêtements, coiffure, barbe, sandales : maillages liés au squelette du corps (mêmes noms d'os)
  const attach = (name: string, material: (m: THREE.MeshStandardMaterial) => THREE.Material) => {
    const part = models[name as ModelName];
    if (!part || !body) return;
    const clone = cloneSkinned(part);
    for (const sm of skinnedIn(clone)) {
      sm.bind(new THREE.Skeleton(sm.skeleton.bones.map((bn) => bones[bn.name] ?? bn), sm.skeleton.boneInverses), sm.bindMatrix);
      sm.material = over() ?? material(sm.material as THREE.MeshStandardMaterial);
      sm.frustumCulled = false;
      body.parent!.add(sm);
    }
  };
  const cloth = () => new THREE.MeshStandardMaterial({ map: waxTexture(def.wax, def.pattern), roughness: 0.85, side: THREE.DoubleSide });
  if (def.sex === 'f' && def.top !== 'robe') attach('bot-pagne-f', cloth);
  if (def.sex === 'm' && body) {
    // pantalon de toile (les hommes ne portent pas le pagne au quotidien)
    const sc = new THREE.Vector3();
    body.getWorldScale(sc);
    const pants = new THREE.SkinnedMesh(legShell(body, 0.014 / (sc.y || 1), def.id), over() ?? new THREE.MeshStandardMaterial({ color: def.pants ?? '#2f2a24', roughness: 0.9 }));
    pants.bind(body.skeleton, body.bindMatrix);
    pants.frustumCulled = false;
    body.parent!.add(pants);
  }
  attach(`top-${def.top}-${def.sex}`, (m) => (/Bouton/.test(m.name) ? new THREE.MeshStandardMaterial({ color: '#ece6d4' }) : cloth()));
  const hc = def.hairColor ?? '#1d1410';
  const hair = def.hair && (HAIR_OK[def.sex].includes(def.hair) ? def.hair : HAIR_OK[def.sex][0]);
  // cheveux mats (sous la torche, des cheveux brillants paraissent gris)
  const hairMat = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.color.set(hc).multiplyScalar(def.hairColor ? 0.8 : 0.35); c.roughness = 1; c.alphaTest = 0.35; c.transparent = false; return c; };
  if (hair) attach(`hair-${hair}-${def.sex}`, hairMat);
  if (hair && body) {
    const sc = new THREE.Vector3();
    body.getWorldScale(sc);
    const cap = new THREE.SkinnedMesh(capShell(body, 0.0015 / (sc.y || 1), def.sex), over() ?? new THREE.MeshStandardMaterial({ color: def.hairColor ? new THREE.Color('#24180f') : new THREE.Color(hc).multiplyScalar(0.35), roughness: 1 }));
    cap.bind(body.skeleton, body.bindMatrix);
    cap.frustumCulled = false;
    body.parent!.add(cap);
  }
  if (def.beard) attach('hair-beard', hairMat);
  const shoe = def.shoe ?? 'sandale';
  if (shoe !== 'none') {
    const [up, sole] = def.shoeColor ?? SHOE_COL[shoe][0];
    attach(`shoe-${shoe}-${def.sex}`, (m) => { const c = m.clone(); c.color.set(/Sole/.test(m.name) ? sole : up); return c; });
  }

  // foulard (gélé) : objet rigide posé sur l'os de la tête
  const head = bones['Head'];
  if (def.gele && head && models['hat-gele']) {
    const hat = models['hat-gele'].clone(true);
    hat.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = over() ?? cloth(); });
    model.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    head.getWorldScale(s);
    hat.scale.setScalar(1 / (s.y || 1));
    head.add(hat);
  }

  // enfant : la tête grossit par rapport au corps (appliqué dans updateMatrix, les animations ne l'annulent pas)
  if (def.child && head) {
    const k = new THREE.Vector3(1.3, 1.3, 1.3), tmp = new THREE.Vector3();
    head.updateMatrix = function (this: THREE.Bone) {
      this.matrix.compose(this.position, this.quaternion, tmp.copy(this.scale).multiply(k));
      this.matrixWorldNeedsUpdate = true;
    };
  }

  model.traverse((o) => {
    o.layers.set(truth ? LAYER_TRUTH : LAYER_SEEN);
    if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; }
  });
  return { holder, model };
}

export function buildPerson(models: Models, def: PersonDef): Person | null {
  const seen = buildBody(models, def, false);
  const truth = buildBody(models, def, true);
  if (!seen || !truth) return null;
  const root = new THREE.Group();
  root.add(seen.holder, truth.holder);
  const mixers = [new THREE.AnimationMixer(seen.model), new THREE.AnimationMixer(truth.model)];
  let current = '';
  const person: Person = {
    def,
    root,
    voice: { pitch: def.child ? 1.9 : def.sex === 'f' ? 1.45 : 1, rate: def.child ? 1.25 : 1 },
    mixers,
    play(name, fade = 0.3, once = false) {
      if (name === current && !once) return;
      const clip = clips.find((c) => c.name === name);
      if (!clip) return;
      for (const mx of mixers) {
        const next = mx.clipAction(clip);
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        const prev = current ? mx.clipAction(clips.find((c) => c.name === current)!) : null;
        next.play();
        if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
      }
      current = name;
    },
    update(dt) {
      for (const mx of mixers) mx.update(dt * (def.slow ?? 1));
    },
  };
  person.play(def.pose ?? 'Idle_Loop');
  // départ décalé : les villageois ne respirent pas tous au même rythme
  const off = (def.id.length * 0.37) % 2;
  for (const mx of mixers) mx.update(off);
  return person;
}
