import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clips, type Models, type ModelName } from './Assets';
import { LAYER_SEEN, LAYER_TRUTH } from './Village';

// Habitants d'Azé-tin : corps Quaternius aux traits africains (repris de Dantokpa Dash),
// vêtements cousus dans Blender rattachés au même squelette, animations d'anims.glb.
// Chaque personnage existe deux fois :
//  - « vu » (calque 1) : ce que voient les yeux de Happy ;
//  - « vérité » (calque 2) : ce que montre le rétroviseur. Pour un Azévi, tout est calciné.

export interface PersonDef {
  id: string;
  sex: 'm' | 'f';
  height: number;     // m
  skin: string;
  top: 'bomba' | 'chemise' | 'robe' | 'haut';
  wax: [string, string, string]; // couleurs du pagne
  pants?: string;     // couleur du pantalon (hommes)
  hair?: 'short04' | 'braid01';
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
function waxTexture(c: [string, string, string]): THREE.Texture {
  const key = c.join();
  const hit = waxCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = c[0];
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = c[1];
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
    g.beginPath();
    g.arc(x + 16, y + 16, 11, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = c[2];
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
    g.beginPath();
    g.moveTo(x, y + 16); g.lineTo(x + 6, y + 10); g.lineTo(x + 12, y + 16); g.lineTo(x + 6, y + 22);
    g.fill();
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
    else if (/brow/i.test(m.name)) mat.color.set('#1d1410');
    m.material = mat;
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
  const cloth = () => new THREE.MeshStandardMaterial({ map: waxTexture(def.wax), roughness: 0.85, side: THREE.DoubleSide });
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
  if (def.hair) attach(`hair-${def.hair}-${def.sex}`, (m) => { const c = m.clone(); c.color.set('#1d1410'); return c; });
  if (def.beard) attach('hair-beard', (m) => { const c = m.clone(); c.color.set('#1d1410'); return c; });
  attach(`shoe-sandale-${def.sex}`, (m) => { const c = m.clone(); c.color.set(/Sole/.test(m.name) ? '#2a1d16' : '#6b4a2e'); return c; });

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
