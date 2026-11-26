import * as THREE from 'three';

// Village d'Azé-tin en "blockout" (blocs simples), à remplacer peu à peu par les modèles Blender (.glb).
// Repère : le sud (+Z) est la piste et le 4×4, le nord (−Z) la lagune, l'est (+X) la station.

// Calques : 0 = décor, 1 = ce que voient les yeux, 2 = ce que montre le rétroviseur (la vérité)
export const LAYER_SEEN = 1;
export const LAYER_TRUTH = 2;

export interface World {
  colliders: THREE.Box3[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  points: Record<'spawn' | 'trunk' | 'car' | 'kossi' | 'dossi' | 'stele' | 'stump' | 'station', THREE.Vector3>;
  menuFocus: THREE.Vector3;
  update(dt: number, t: number): void;
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
  wallBurnt: new THREE.MeshStandardMaterial({ color: 0x2b211b, roughness: 1 }),
  straw: new THREE.MeshStandardMaterial({ color: 0x7a6a42, roughness: 1 }),
  tin: new THREE.MeshStandardMaterial({ color: 0x5c5f62, roughness: 0.6, metalness: 0.5 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.9 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.9 }),
  ash: new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 1 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.7, metalness: 0.4 }),
  water: new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.15, metalness: 0.7 }),
  car: new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.4, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.1, metalness: 0.9 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x1f2a16, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x3a3127, roughness: 1 }),
  // Personnages : visage "vu" et visage "vrai"
  skin: new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.7 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 1, emissive: 0x6a1c00, emissiveIntensity: 0.55 }),
};

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function textTexture(lines: string[], w: number, h: number, bg: string, fg: string, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildVillage(scene: THREE.Scene): World {
  const colliders: THREE.Box3[] = [];
  const addBox = (minX: number, minZ: number, maxX: number, maxZ: number) =>
    colliders.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 3, maxZ)));

  // Ambiance de nuit : brouillard bleu-noir, lune faible
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.FogExp2(0x05070c, 0.042);
  scene.add(new THREE.HemisphereLight(0x2c3d5c, 0x120c08, 1.1));
  const moon = new THREE.DirectionalLight(0x9fb4e0, 0.6);
  moon.position.set(-30, 60, -40);
  scene.add(moon);

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

  const lagoon = new THREE.Mesh(new THREE.PlaneGeometry(200, 90), mat.water);
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(0, 0.03, -93);
  scene.add(lagoon);

  // --- Le 4×4 de location (calé, warnings allumés) ---
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 4.6), mat.car);
  body.position.y = 0.95;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.8, 2.6), mat.glass);
  cabin.position.set(0, 1.85, 0.3);
  car.add(body, cabin);
  for (const [x, z] of [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16), mat.tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    car.add(w);
  }
  // Roue de secours sur la porte arrière
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 16), mat.tyre);
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 1.1, 2.42);
  car.add(spare);
  car.position.set(1.2, 0, 68);
  scene.add(shadowed(car));
  addBox(0.15, 65.6, 2.25, 70.4);

  // Warnings orange (clignotent) et phares restés allumés vers le village
  const hazards = [-0.8, 0.8].map((x) => {
    const l = new THREE.PointLight(0xff7a1a, 0, 6, 2);
    l.position.set(1.2 + x, 1.0, 70.45);
    scene.add(l);
    return l;
  });
  for (const x of [-0.65, 0.65]) {
    const head = new THREE.SpotLight(0xdfe6ff, 60, 38, 0.38, 0.6, 1.2);
    head.position.set(1.2 + x, 0.95, 65.6);
    head.target.position.set(1.2 + x * 3, 0, 40);
    scene.add(head, head.target);
  }

  // --- Panneau calciné "AZÉ-TIN" ---
  const signTex = textTexture(['AZÉ-TIN'], 512, 192, '#2a211b', '#9c8a76', 'bold 96px Georgia, serif');
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), mat.wood);
  post.position.y = 1.1;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.68, 0.06), [mat.wood, mat.wood, mat.wood, mat.wood, new THREE.MeshStandardMaterial({ map: signTex, roughness: 1 }), mat.wood]);
  board.position.y = 2.0;
  board.rotation.z = -0.08;
  sign.add(post, board);
  sign.position.set(3.6, 0, 62); // la face +Z regarde la piste (sud)
  scene.add(shadowed(sign));

  // --- Stèle des morts à l'entrée ---
  const steleTex = textTexture(
    ['AGOSSOU · DOSSI · HOUNGBO', 'AYABA · TOSSOU · KPÈ', 'SÈNAMI · HOUÉNOU · DAGBO', 'ADJOVI · GBÈNOU · ...'],
    512, 640, '#3d3c39', '#16120f', '28px Georgia, serif',
  );
  const stele = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.3), [mat.stone, mat.stone, mat.stone, mat.stone, new THREE.MeshStandardMaterial({ map: steleTex, roughness: 0.95 }), mat.stone]);
  stele.position.set(-3.2, 0.9, 32);
  scene.add(shadowed(stele));
  addBox(-3.8, 31.85, -2.6, 32.15);

  // --- Cases (x, z, largeur, profondeur, brûlée ?) ---
  const huts: [number, number, number, number, boolean][] = [
    [-16, 4, 5, 4, false],   // atelier de Kossi
    [9, 4, 4, 3, false],     // buvette de Mama Dossi
    [-8, -7, 4, 4, true],
    [14, -11, 4, 4, true],
    [-23, -6, 4, 3.5, true],
    [20, 14, 4, 4, false],
    [-12, 18, 3.5, 3.5, true],
    [7, 21, 4, 3.5, false],
    [24, -23, 4, 4, true],
    [-27, -22, 6, 5, false], // case du chef Houngbo
    [-6, -34, 5, 4, false],  // maison de Dah Agossou
    [12, -33, 4, 3.5, true],
    [-19, -38, 4, 3.5, true],
    [28, 4, 3.5, 3.5, true],
  ];
  for (const [x, z, w, d, burnt] of huts) {
    const hut = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), burnt ? mat.wallBurnt : mat.wall);
    walls.position.y = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 1.7, 4), burnt ? mat.ash : mat.straw);
    roof.position.y = 2.4 + 0.85;
    roof.rotation.y = Math.PI / 4;
    if (burnt) roof.scale.y = 0.55; // toit effondré
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ color: 0x020202 }));
    door.position.set(0, 0.9, d / 2 + 0.01);
    hut.add(walls, roof, door);
    hut.position.set(x, 0, z);
    scene.add(shadowed(hut));
    addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  // Pneus empilés devant l'atelier de Kossi
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 8, 16), mat.tyre);
    t.rotation.x = Math.PI / 2;
    t.position.set(-13.2, 0.13 + i * 0.26, 7.2);
    scene.add(shadowed(t));
  }
  addBox(-13.7, 6.7, -12.7, 7.7);

  // Table de la buvette
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), mat.wood);
  table.position.set(9, 0.8, 6.6);
  scene.add(shadowed(table));
  addBox(8.2, 6.15, 9.8, 7.05);

  // --- Souche de l'iroko Loko ---
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 2.2, 14), mat.trunk);
  stump.position.set(0, 1.1, -20);
  scene.add(shadowed(stump));
  addBox(-1.8, -21.8, 1.8, -18.2);

  // --- Station de kpayo en ruine (est) ---
  const slab = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 10), mat.ash);
  slab.position.set(38, 0.1, -6);
  scene.add(shadowed(slab));
  for (const [x, z, h] of [[32, -10, 3.2], [44, -10, 1.6], [32, -2, 2.4], [44, -2, 3.4]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.4), mat.stone);
    p.position.set(x, h / 2, z);
    scene.add(shadowed(p));
    addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(13, 0.15, 9), mat.tin);
  canopy.position.set(38, 2.2, -6);
  canopy.rotation.z = 0.22;
  canopy.rotation.x = -0.08;
  scene.add(shadowed(canopy));
  const r = rng(7);
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), mat.barrel);
    const bx = 35 + r() * 7, bz = -9 + r() * 6;
    const fallen = r() > 0.6;
    b.position.set(bx, fallen ? 0.5 : 0.65, bz);
    if (fallen) b.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    scene.add(shadowed(b));
  }
  addBox(34.6, -9.4, 42.4, -2.6);
  const ember = new THREE.PointLight(0xff5a14, 14, 26, 1.4);
  ember.position.set(38, 1.2, -6);
  scene.add(ember);

  // --- Pirogues sur la rive ---
  for (const [x, z, ry] of [[-10, -47, 0.3], [-4, -48, -0.2], [6, -47.5, 0.1]]) {
    const pir = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 5), mat.wood);
    pir.position.set(x, 0.2, z);
    pir.rotation.y = ry;
    scene.add(shadowed(pir));
  }

  // --- Palmiers (déterministes) ---
  const pr = rng(42);
  for (let i = 0; i < 46; i++) {
    const x = (pr() - 0.5) * 110, z = -44 + pr() * 120;
    if (Math.abs(x) < 4 && z > 20) continue; // pas sur la piste
    const near = colliders.some((b) => x > b.min.x - 2 && x < b.max.x + 2 && z > b.min.z - 2 && z < b.max.z + 2);
    if (near) continue;
    const h = 5 + pr() * 4;
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), mat.trunk);
    trunk.position.y = h / 2;
    trunk.rotation.z = (pr() - 0.5) * 0.25;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 7), mat.palm);
    crown.position.y = h;
    crown.rotation.x = Math.PI;
    palm.add(trunk, crown);
    palm.position.set(x, 0, z);
    scene.add(shadowed(palm));
    addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  }

  // --- Personnages de test : apparence "vue" (calque 1) et "vraie" (calque 2) ---
  const villager = (x: number, z: number, ry: number, cloth: number, azevi: boolean) => {
    const make = (truth: boolean) => {
      const g = new THREE.Group();
      const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
      const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.95, 4, 10), truth && azevi ? mat.burnt : clothMat);
      bodyM.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), truth && azevi ? mat.burnt : mat.skin);
      head.position.y = 1.58;
      g.add(bodyM, head);
      g.traverse((c) => c.layers.set(truth ? LAYER_TRUTH : LAYER_SEEN));
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      return shadowed(g);
    };
    scene.add(make(false), make(true));
    addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  };
  villager(-16, 7.0, 0, 0x2d3a4a, false); // Kossi, vivant
  villager(9, 6.0, 0, 0x7a2a3a, true);    // Mama Dossi, Azévi
  // Villageois immobiles devant les cases (Azévi)
  villager(-8, -4.3, 0, 0x4a3a2a, true);
  villager(20, 16.6, 0.4, 0x3a4a3a, true);
  villager(7, 23.4, -0.3, 0x5a4a2a, true);

  let hazardT = 0;
  return {
    colliders,
    bounds: { minX: -70, maxX: 70, minZ: -46, maxZ: 92 },
    points: {
      spawn: new THREE.Vector3(-0.6, 0, 67),
      car: new THREE.Vector3(1.2, 0, 68),
      trunk: new THREE.Vector3(1.2, 0, 71),
      kossi: new THREE.Vector3(-16, 0, 7.0),
      dossi: new THREE.Vector3(9, 0, 6.0),
      stele: new THREE.Vector3(-3.2, 0, 32.6),
      stump: new THREE.Vector3(0, 0, -20),
      station: new THREE.Vector3(38, 0, -6),
    },
    menuFocus: new THREE.Vector3(2.2, 1.2, 65),
    update(dt, t) {
      hazardT += dt;
      const on = Math.floor(hazardT * 1.6) % 2 === 0;
      for (const h of hazards) h.intensity = on ? 9 : 0;
      ember.intensity = 13 + Math.sin(t * 7.3) * 3 + Math.sin(t * 13.1) * 2;
    },
  };
}
