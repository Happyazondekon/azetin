import * as THREE from 'three';
import { instance, type Models, type ModelName } from './Assets';
import { buildPerson, type Person, type PersonDef } from './People';
import { Sky } from './Sky';
import { PATHS } from '../story/Places';

// Village d'Azé-tin. Chaque élément utilise son modèle Blender (.glb) ; s'il manque,
// un bloc simple prend sa place (le jeu reste jouable).
// Repère : le sud (+Z) est la piste et le 4×4, le nord (−Z) la lagune, l'est (+X) la station.

// Calques : 0 = décor, 1 = ce que voient les yeux, 2 = ce que montre le rétroviseur (la vérité)
export const LAYER_SEEN = 1;
export const LAYER_TRUTH = 2;

export interface World {
  colliders: THREE.Box3[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  points: Record<'spawn' | 'trunk' | 'car' | 'kossi' | 'dossi' | 'stele' | 'stump' | 'station' | 'zem' | 'generator', THREE.Vector3>;
  menuFocus: THREE.Vector3;
  people: Record<string, Person>;
  sky: Sky;
  fires: THREE.Vector3[];
  car: THREE.Object3D | null;
  flameScale: number[];
  hazardsOn: boolean;      // les warnings du 4×4 (éteints tant qu'il roule)   // intensité de chaque feu (0 = éteint) : feu de la place, lampe du chef, lampe de Mama Dossi
  update(dt: number, t: number, cam: THREE.Vector3): void;
}

// Générateur pseudo-aléatoire déterministe : le village est identique à chaque chargement
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ color: 0x5a2f1c, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x6e4630, roughness: 0.95 }),
  ash: new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.12, metalness: 0.75 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.7 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 1, emissive: 0x6a1c00, emissiveIntensity: 0.55 }),
};

export function buildVillage(scene: THREE.Scene, models: Models): World {
  const colliders: THREE.Box3[] = [];
  const addBox = (minX: number, minZ: number, maxX: number, maxZ: number) =>
    colliders.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 3, maxZ)));
  const addRect = (x: number, z: number, w: number, d: number) => addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2);

  // Pose un modèle ; sinon un bloc gris de la taille donnée
  const put = (name: ModelName, x: number, z: number, ry = 0, scale = 1, recenter = false, fallback?: [number, number, number]) => {
    const o = instance(models, name, scale, recenter);
    if (o) {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      scene.add(o);
      return o;
    }
    if (fallback) {
      const [w, h, d] = fallback;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.wall);
      b.position.set(x, h / 2, z);
      b.rotation.y = ry;
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
      return b;
    }
    return null;
  };

  // Ciel, soleil couchant, lune, étoiles et brouillard selon l'heure (voir Sky.ts)
  const sky = new Sky(scene);

  // Sol, piste de latérite, lagune
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(5, 75), mat.road);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, 58);
  road.receiveShadow = true;
  scene.add(road);
  // Chemins de terre battue entre les lieux : plus clairs que le sol, on les suit à la lune et à la torche
  const pathTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    const t = new THREE.CanvasTexture(cv);
    t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x7a4428, roughness: 1, alphaMap: pathTex, transparent: true, depthWrite: false });
  for (const [, , pts] of PATHS) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let run = 0;
    pts.forEach(([x, z], i) => {
      const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const w = 0.9;
      pos.push(x - dz * w, 0.02, z + dx * w, x + dz * w, 0.02, z - dx * w);
      uv.push(0, run / 3, 1, run / 3);
      if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, pathMat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    scene.add(m);
  }

  const lagoon = new THREE.Mesh(new THREE.PlaneGeometry(200, 90), mat.water);
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(0, 0.03, -93);
  scene.add(lagoon);

  // --- Le 4×4 de location, calé, avant tourné vers le village (nord) ---
  const car = put('az-4x4', 1.2, 68, Math.PI, 1, false, [2, 2, 4.6]);
  // phares attachés au 4×4 (ils le suivent pendant la cinématique d'ouverture)
  addBox(0.15, 65.6, 2.25, 70.4);
  const hazards = [-0.8, 0.8].map((x) => {
    const l = new THREE.PointLight(0xff7a1a, 0, 18, 1.6); // les warnings se voient de loin : on retrouve le 4×4
    if (car) { l.position.set(-x, 1.0, -2.5); car.add(l); } else { l.position.set(1.2 + x, 1.0, 70.5); scene.add(l); }
    return l;
  });
  for (const x of [-0.65, 0.65]) {
    const head = new THREE.SpotLight(0xdfe6ff, 60, 38, 0.38, 0.6, 1.2);
    if (car) {
      // repère du modèle : l'avant est vers +Z (le 4×4 est tourné vers le nord)
      head.position.set(x, 1.05, 2.4);
      head.target.position.set(x * 3, -1, 28);
      car.add(head, head.target);
    } else {
      head.position.set(1.2 + x, 1.05, 65.3);
      head.target.position.set(1.2 + x * 3, 0, 40);
      scene.add(head, head.target);
    }
  }

  // --- Panneau calciné et stèle des morts ---
  put('az-sign', 3.6, 62, 0, 1, false, [2, 2.4, 0.1]);
  addRect(2.75, 62, 0.2, 0.2);
  addRect(4.45, 62, 0.2, 0.2);
  put('az-stele', -3.2, 32, 0, 1, false, [1.2, 2.1, 0.3]);
  addRect(-3.2, 32, 1.6, 0.8);

  // --- Cases : [modèle, x, z, rotation, échelle, largeur, profondeur] (porte vers le sud) ---
  type Hut = [ModelName, number, number, number, number, number, number];
  const huts: Hut[] = [
    ['az-hut-burnt', -8, -7, 0, 1, 4, 3.5],
    ['az-hut-burnt', 14, -11, 0.2, 1, 4, 3.5],
    ['az-hut-thatch', -23, -6, 0.1, 1, 4, 3.5],
    ['az-hut-tin', 20, 14, -0.15, 1, 4.5, 4],
    ['az-hut-burnt', -12, 18, 0.3, 1, 4, 3.5],
    ['az-hut-thatch', 7, 21, 0, 1, 4, 3.5],
    ['az-hut-burnt', 24, -23, -0.4, 1, 4, 3.5],
    ['az-hut-tin', -27, -22, 0.25, 1.3, 5.9, 5.2], // case du chef Houngbo
    ['az-hut-burnt', 12, -33, 0, 1, 4, 3.5],
    ['az-hut-burnt', -19, -38, 0.5, 1, 4, 3.5],
    ['az-hut-thatch', 28, 4, -0.6, 1, 4, 3.5],
    ['az-hut-tin', 31, 22, 0.4, 1, 4.5, 4],
    ['az-hut-thatch', -33, 6, 0.2, 1, 4, 3.5],
  ];
  for (const [name, x, z, ry, s, w, d] of huts) {
    put(name, x, z, ry, s, false, [w, 2.6, d]);
    // collision : les murs (rotation ignorée, les angles sont faibles)
    addRect(x, z, w, d);
  }

  // --- Atelier de Kossi (ouvert au sud) et buvette de Mama Dossi ---
  put('az-atelier', -16, 4, 0, 1, false, [5, 2.7, 4]);
  addBox(-18.6, 1.8, -13.4, 2.2);   // mur du fond
  addBox(-18.6, 2.0, -18.3, 6.0);   // muret de côté
  addBox(-13.6, 4.6, -12.6, 5.6);   // pneus empilés
  put('az-buvette', 9, 4, 0, 1, false, [4, 2.3, 3]);
  addRect(9, 4, 4, 3);
  addBox(8.0, 6.3, 10.0, 7.1);      // comptoir

  // --- Maison du guérisseur et asen dans sa cour ---
  put('az-healer', -6, -34, 0, 1, false, [5.2, 2.6, 4.2]);
  addRect(-6, -34, 5.2, 4.2);
  addBox(-10.2, -29.0, -7.6, -28.8);  // palissade gauche
  addBox(-4.4, -29.0, -1.8, -28.8);   // palissade droite
  put('az-asen', -4.6, -30.6, 0, 1, false, [1, 1.4, 1]);

  // --- Souche de l'iroko Loko ---
  put('az-stump', 0, -20, 0.4, 1, false, [3.4, 2.2, 3.4]);
  addRect(0, -20, 3.6, 3.6);

  // --- Station de kpayo en ruine (est) ---
  put('az-station', 38, -6, 0, 1, false, [14, 0.4, 10]);
  for (const [x, z] of [[32, -10], [44, -10], [32, -2], [44, -2]]) addRect(x, z, 0.5, 0.5);
  addRect(41.6, -8.4, 3.0, 2.5); // cabane calcinée
  put('generator', 34.5, -0.6, -0.6, 1, true, [1.2, 1, 0.8]);
  addRect(34.5, -0.6, 1.4, 1.1);
  const station = new THREE.Vector3(38, 0, -6);
  const ember = new THREE.PointLight(0xff5a14, 14, 26, 1.4);
  ember.position.set(37, 1.2, -6);
  scene.add(ember);
  const r = rng(7);
  for (let i = 0; i < 6; i++) put('jerrycan', 31 + r() * 3, -9 + r() * 6, r() * 6, 1);

  // --- Petits objets du village ---
  put('ob-zem', -30, 15, 1.1, 1, false, [0.7, 1.2, 2]);       // taxi-moto abandonné (chambre à air)
  addRect(-30, 15, 1.6, 1.6);
  put('ob-tires', -19.5, 8.5, 0.3, 1, false);
  put('barrel', -11.8, 6.2, 0, 0.7, false);
  put('gas-bottle', 11.6, 5.6, 0, 0.45, false);
  for (const [x, z, ry] of [[-10, -47, 0.3], [-4, -48, -0.2], [6, -47.5, 0.1]]) put('pirogue', x, z, ry + Math.PI / 2, 0.36, true, [0.8, 0.4, 5]);

  // --- Arbres : cocotiers, manguiers, neems, buissons, herbes (déterministes) ---
  const trees: ModelName[] = ['tr-coco', 'tr-coco', 'tr-coco', 'tr-mango', 'tr-neem'];
  const pr = rng(42);
  // zones à garder dégagées : devant l'atelier, la buvette, la maison du guérisseur, la souche, la station
  const clear: [number, number, number, number][] = [[-19, 1, -12, 11], [6, 2, 12, 10], [-11, -36, -1, -26], [-5, -25, 5, -15], [30, -12, 46, 1], [-5, 5, 5, 14], [-31, -21, -19, -14], [-36, 4, -30, 11], [-4, 28, 1, 33], [-9, -47, 7, -41]];
  const free = (x: number, z: number, m: number) =>
    !colliders.some((b) => x > b.min.x - m && x < b.max.x + m && z > b.min.z - m && z < b.max.z + m) && !(Math.abs(x) < 4 && z > 20)
    && !clear.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  for (let i = 0; i < 70; i++) {
    const x = (pr() - 0.5) * 120, z = -44 + pr() * 128;
    if (Math.abs(x - 38) < 9 && Math.abs(z + 6) < 7) continue; // pas sur la station
    if (!free(x, z, 3)) continue;
    const name = trees[Math.floor(pr() * trees.length)];
    put(name, x, z, pr() * 6.28, 0.8 + pr() * 0.4, false, [0.4, 6, 0.4]);
    addRect(x, z, 0.6, 0.6);
  }
  for (let i = 0; i < 90; i++) {
    const x = (pr() - 0.5) * 100, z = -44 + pr() * 120;
    if (!free(x, z, 0.8)) continue;
    put(pr() < 0.4 ? 'tr-bush' : 'tr-grass', x, z, pr() * 6.28, 0.7 + pr() * 0.6, false);
  }

  // --- Habitants : apparence « vue » (calque 1) et « vérité » (calque 2, dans le rétroviseur) ---
  const people: Record<string, Person> = {};
  const capsule = (x: number, z: number, ry: number, azevi: boolean) => {
    // repli si les corps ne sont pas chargés
    for (const truth of [false, true]) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.95, 4, 10), truth && azevi ? mat.burnt : mat.skin);
      m.position.set(x, 0.75, z);
      m.rotation.y = ry;
      m.layers.set(truth ? LAYER_TRUTH : LAYER_SEEN);
      scene.add(m);
    }
  };
  const place = (def: PersonDef, x: number, z: number, ry: number) => {
    const p = buildPerson(models, def);
    if (p) {
      p.root.position.set(x, 0, z);
      p.root.rotation.y = ry;
      scene.add(p.root);
      people[def.id] = p;
    } else capsule(x, z, ry, def.azevi);
    if (def.id !== 'ayaba') addRect(x, z, 0.6, 0.6); // Ayaba se déplace : pas d'obstacle fixe
  };
  // Kossi, vivant, dans son atelier
  place({ id: 'kossi', sex: 'm', height: 1.8, skin: '#4e3020', top: 'chemise', wax: ['#2b3f63', '#c9a23a', '#e8e0cc'], hair: 'short04', beard: true, azevi: false, pose: 'Idle_Loop', pants: '#3a3226' }, -16, 5.2, 0);
  // Mama Dossi, Azévi, derrière son comptoir
  place({ id: 'dossi', sex: 'f', height: 1.66, skin: '#5b3a26', top: 'robe', wax: ['#a8261c', '#f2c14e', '#1d3557'], gele: true, azevi: true, pose: 'Idle_Talking_Loop', slow: 0.7 }, 9, 6.0, 0);
  // Ayaba, 10 ans : morte noyée, pas brûlée (elle n'est pas Azévi). Elle attend Happy près de la stèle.
  place({ id: 'ayaba', sex: 'f', height: 1.3, skin: '#4a2e1e', top: 'haut', wax: ['#e8e0cc', '#2a6f9f', '#f2c14e'], hair: 'braid01', azevi: false, truth: 'wet', child: true, pose: 'Idle_Loop' }, -1.6, 30.5, 0.3);

  // Les villageois d'Azé-tin (tous Azévi) : immobiles devant leurs cases, assis, accroupis autour d'un feu
  const SK = ['#3e281b', '#4a2e1e', '#5b3a26', '#4e3020', '#38241a'];
  const WX: [string, string, string][] = [
    ['#4a3a2a', '#8a6a3a', '#d8c8a0'], ['#2a6f5f', '#e9c46a', '#f4a261'], ['#5a4a2a', '#2a1d16', '#c9a23a'], ['#3a2a4a', '#c97b2a', '#e8e0cc'],
    ['#6a2a2a', '#e0b050', '#2a2a2a'], ['#1d3557', '#a8dadc', '#e63946'], ['#3a4a2a', '#c0a060', '#e8e0cc'], ['#5a2a4a', '#f0c0a0', '#2a1a2a'],
  ];
  type V = [number, number, number, 'm' | 'f', PersonDef['pose'], number?];
  const villagers: V[] = [
    [-8, -4.4, 0, 'm', 'Idle_Loop'], [20, 16.6, 0.4, 'f', 'Idle_Loop'], [7, 23.4, -0.3, 'm', 'Idle_Loop'], [-23, -3.6, 0.2, 'f', 'Idle_Loop'],
    [-21.6, -3.9, -0.5, 'm', 'Sitting_Idle_Loop'], [28.5, 6.6, -0.7, 'f', 'Idle_Loop'], [31, 24.8, 0.4, 'm', 'Idle_Loop'],
    [-33, 8.6, 0.2, 'f', 'Sitting_Idle_Loop'], [-27, -18.6, 0.25, 'm', 'Idle_Loop'], [-25.4, -18.9, 0.1, 'f', 'Idle_Loop'],
    // autour du feu de la place (ils regardent les flammes, personne ne mange)
    [-2.2, 9.2, 1.6, 'm', 'Crouch_Idle_Loop'], [1.9, 9.6, -1.5, 'f', 'Crouch_Idle_Loop'], [-0.2, 11.6, 3.1, 'm', 'Crouch_Idle_Loop'], [0.3, 7.2, 0.1, 'f', 'Sitting_Idle_Loop'],
    // près de la lagune
    [-6, -44, 3.1, 'm', 'Idle_Loop'], [4, -44.5, 2.9, 'f', 'Idle_Loop'],
  ];
  villagers.forEach(([x, z, ry, sex, pose, slow], i) => {
    place({
      id: `v${i}`, sex, height: sex === 'm' ? 1.68 + (i % 3) * 0.05 : 1.58 + (i % 3) * 0.04, skin: SK[i % SK.length],
      top: sex === 'm' ? (i % 2 ? 'chemise' : 'bomba') : (i % 2 ? 'robe' : 'haut'), wax: WX[i % WX.length],
      hair: sex === 'm' ? 'short04' : i % 3 ? 'braid01' : undefined, gele: sex === 'f' && i % 3 === 0, beard: sex === 'm' && i % 2 === 0,
      pants: ['#2a241e', '#1f1c18', '#3a3226'][i % 3], azevi: true, pose, slow: slow ?? 0.12,
    }, x, z, ry);
  });

  // --- Feux et lampes : des flammes qui brûlent pour personne ---
  const fires: THREE.Vector3[] = [];
  const flames: THREE.PointLight[] = [];
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
  const logMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 });
  const fire = (x: number, z: number, big: boolean) => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), logMat);
      log.rotation.set(Math.PI / 2 - 0.25, k * Math.PI / 2, 0);
      log.position.y = 0.12;
      g.add(log);
    }
    const coal = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.28 : 0.16, big ? 0.5 : 0.3, 7), emberMat);
    coal.position.y = big ? 0.3 : 0.2;
    g.add(coal);
    g.position.set(x, 0, z);
    scene.add(g);
    const l = new THREE.PointLight(0xff7a2a, big ? 9 : 4, big ? 14 : 8, 1.6);
    l.position.set(x, big ? 0.9 : 1.6, z);
    scene.add(l);
    flames.push(l);
    fires.push(new THREE.Vector3(x, 0, z));
    addRect(x, z, 0.9, 0.9);
  };
  fire(0, 9.4, true);       // feu de la place
  fire(-27, -16.8, false);  // devant la case du chef (lampe)
  fire(9.9, 6.5, false);    // lampe à pétrole sur le comptoir de Mama Dossi

  let hazardT = 0;
  return {
    colliders,
    bounds: { minX: -70, maxX: 70, minZ: -46, maxZ: 92 },
    points: {
      spawn: new THREE.Vector3(-0.7, 0, 67),
      car: new THREE.Vector3(1.2, 0, 68),
      trunk: new THREE.Vector3(1.2, 0, 71.2),
      kossi: new THREE.Vector3(-16, 0, 5.2),
      dossi: new THREE.Vector3(9, 0, 6.0),
      stele: new THREE.Vector3(-3.2, 0, 32.8),
      stump: new THREE.Vector3(0, 0, -20),
      station,
      zem: new THREE.Vector3(-30, 0, 15),
      generator: new THREE.Vector3(34.5, 0, -0.6),
    },
    menuFocus: new THREE.Vector3(2.2, 1.2, 65),
    people,
    sky,
    fires,
    car,
    flameScale: [1, 1, 1],
    hazardsOn: true,
    update(dt, t, cam) {
      // seuls les habitants proches s'animent ; au-delà du brouillard, ils sont cachés
      for (const p of Object.values(people)) {
        const far = p.root.position.distanceToSquared(cam) > 42 * 42;
        p.root.visible = !far;
        if (!far) p.update(dt);
      }
      flames.forEach((l, i) => (l.intensity = this.flameScale[i] * (i === 0 ? 9 : 4) * (0.85 + 0.15 * Math.sin(t * (9 + i) + i) + 0.08 * Math.sin(t * 23.7 + i))));
      // Les Azévi proches tournent la tête (tout le corps) pour suivre Happy, puis reprennent leur pose
      for (const [id, p] of Object.entries(people)) {
        if (!p.def.azevi || id === 'dossi' || !p.root.visible) continue;
        const base = (p.root.userData.baseRy ??= p.root.rotation.y) as number;
        const dx = cam.x - p.root.position.x, dz = cam.z - p.root.position.z;
        const near = dx * dx + dz * dz < 10 * 10;
        const target = near ? Math.atan2(dx, dz) : base;
        let d = target - p.root.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.root.rotation.y += d * Math.min(1, dt * (near ? 0.9 : 0.4));
      }
      hazardT += dt;
      const on = Math.floor(hazardT * 1.6) % 2 === 0;
      for (const h of hazards) h.intensity = on && this.hazardsOn ? 16 : 0;
      ember.intensity = 13 + Math.sin(t * 7.3) * 3 + Math.sin(t * 13.1) * 2;
    },
  };
}
