import * as THREE from 'three';
import type { FireSystem, Glow } from './Fire';

// Objets de l'Acte 2 : les 5 fragments du secret, la calebasse du guérisseur, les 3 plantes, le calao.
// Petits objets faits dans le code (pas de Blender) : ils sont vus de près, à la lampe.

export interface Pickup {
  id: string;
  kind: 'fragment' | 'plant' | 'calabash';
  name: string;
  pos: THREE.Vector3;
  obj: THREE.Object3D;
  glow: Glow;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const paper = (ink: (g: CanvasRenderingContext2D) => void) =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#cbb894';
    g.fillRect(0, 0, 256, 256);
    // brûlures sur les bords
    const r = g.createRadialGradient(128, 128, 60, 128, 128, 190);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(30,15,5,0.95)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
    ink(g);
  });

function fragmentMesh(id: string): THREE.Object3D {
  const g = new THREE.Group();
  const flat = (tex: THREE.Texture, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), [
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x2a1d12 }),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }),
    ]);
    return m;
  };
  switch (id) {
    case 'photo': {
      const tex = canvasTex(256, 200, (c) => {
        c.fillStyle = '#e8e0d0'; c.fillRect(0, 0, 256, 200);
        c.fillStyle = '#4a4036'; c.fillRect(12, 12, 232, 150);
        c.fillStyle = '#2a241e'; c.fillRect(110, 30, 36, 132); // le tronc
        c.beginPath(); c.arc(128, 40, 70, Math.PI, 0); c.fill();
        c.fillStyle = '#16120e'; for (const x of [40, 70, 180, 205]) c.fillRect(x, 110, 14, 52); // les hommes
        c.fillStyle = '#5a4a3a'; c.font = 'italic 18px serif'; c.fillText('Loko — 10 ans', 70, 188);
      });
      g.add(flat(tex, 0.22, 0.17));
      break;
    }
    case 'notebook': {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x5a1a12, roughness: 0.8 }));
      book.position.y = 0.02;
      g.add(book);
      const tex = paper((c) => { c.strokeStyle = '#8a1a10'; c.lineWidth = 3; for (let y = 50; y < 220; y += 22) { c.beginPath(); c.moveTo(30, y); c.lineTo(220, y); c.stroke(); } });
      const page = flat(tex, 0.18, 0.24);
      page.position.y = 0.045;
      g.add(page);
      break;
    }
    case 'tape': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.064), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
      body.position.y = 0.01;
      g.add(body);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8cfa8 }));
      lab.rotation.x = -Math.PI / 2;
      lab.position.y = 0.019;
      g.add(lab);
      break;
    }
    case 'register': {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.9 }));
      book.position.y = 0.03;
      g.add(book);
      const tex = paper((c) => { c.fillStyle = '#222'; c.font = '14px monospace'; for (let i = 0; i < 9; i++) c.fillText(`FÛT ${120 + i * 20}  —  200 L`, 30, 50 + i * 20); });
      const page = flat(tex, 0.26, 0.34);
      page.position.y = 0.065;
      g.add(page);
      break;
    }
    case 'drawing': {
      const tex = paper((c) => {
        c.lineWidth = 5; c.strokeStyle = '#2a6a2a'; c.beginPath(); c.moveTo(128, 220); c.lineTo(128, 120); c.stroke();
        c.fillStyle = '#3a8a3a'; c.beginPath(); c.arc(128, 100, 50, 0, 7); c.fill(); // l'arbre
        c.fillStyle = '#8a5a2a'; for (const x of [40, 190]) c.fillRect(x, 170, 36, 40); // les cases
        c.fillStyle = '#111'; c.beginPath(); c.ellipse(205, 60, 34, 22, 0, 0, 7); c.fill(); // le gros hibou
        c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(195, 56, 5, 0, 7); c.arc(215, 56, 5, 0, 7); c.fill();
      });
      g.add(flat(tex, 0.24, 0.24));
      break;
    }
  }
  return g;
}

function calabash(): THREE.Object3D {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x9a6a2a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), shell);
  body.scale.y = 0.85;
  body.position.y = 0.14;
  const neck = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), shell);
  neck.position.y = 0.3;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 1 }));
  cap.position.y = 0.38;
  // cauris cousus autour
  const cowrie = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), cowrie);
    const a = (i / 10) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.155, 0.16, Math.sin(a) * 0.155);
    g.add(c);
  }
  g.add(body, neck, cap);
  return g;
}

function plant(id: string): THREE.Object3D {
  const g = new THREE.Group();
  const color = id === 'flower' ? 0xd8b84a : id === 'ash' ? 0x9aa0a0 : 0x8ab8d8;
  const stemMat = new THREE.MeshStandardMaterial({ color: id === 'ash' ? 0x4a4a46 : 0x2a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.35, 5), stemMat);
    stem.position.set(Math.cos(a) * 0.05, 0.17, Math.sin(a) * 0.05);
    stem.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
    g.add(stem);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(id === 'flower' ? 0.05 : 0.07, 6), leafMat);
    leaf.position.set(Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.12);
    leaf.rotation.set(-Math.PI / 2 + 0.5, a, 0);
    g.add(leaf);
  }
  return g;
}

// Le calao : corps sombre, grand bec clair surmonté d'un casque
export function buildHornbill(): THREE.Object3D {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const bill = new THREE.MeshStandardMaterial({ color: 0xd8c890, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), dark);
  body.scale.set(1, 0.9, 1.5);
  body.position.y = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark);
  head.position.set(0, 0.42, 0.18);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 8), bill);
  beak.rotation.x = Math.PI / 2 + 0.25;
  beak.position.set(0, 0.39, 0.36);
  const casque = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8), bill);
  casque.rotation.x = Math.PI / 2;
  casque.position.set(0, 0.46, 0.3);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.3), dark);
  tail.position.set(0, 0.22, -0.3);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
  eye.position.set(0.06, 0.45, 0.22);
  g.add(body, head, beak, casque, tail, eye);
  return g;
}

export const FRAGMENTS: { id: string; name: string; x: number; z: number; y?: number }[] = [
  { id: 'drawing', name: 'A child’s drawing', x: -2.4, z: 33.3 },          // au pied de la stèle
  { id: 'notebook', name: 'The chief’s debt book', x: -26.2, z: -18.4 },    // devant la case du chef
  { id: 'photo', name: 'Photo of the felled iroko', x: 39.5, z: -2.8 },     // station
  { id: 'tape', name: 'An old cassette tape', x: 40.4, z: -6.6 },           // devant la cabane calcinée
  { id: 'register', name: 'The barrel register', x: 33.4, z: -9.6 },        // près des jerricans
];

export const PLANTS: { id: string; name: string; x: number; z: number; y?: number }[] = [
  { id: 'flower', name: 'Hornbill flower', x: 0.3, z: -19.0, y: 2.12 },      // en haut de la souche de Loko
  { id: 'ash', name: 'Ash grass', x: 36.2, z: -11.6 },                      // dans les cendres de la station
  { id: 'liana', name: 'Moon liana', x: -16.8, z: -41.2 },                  // sur la case au bord de l'eau
];

export function buildAct2Props(scene: THREE.Scene, fx: FireSystem): { pickups: Pickup[]; hornbill: THREE.Object3D } {
  const pickups: Pickup[] = [];
  const add = (kind: Pickup['kind'], id: string, name: string, x: number, z: number, y: number, obj: THREE.Object3D, color: number) => {
    obj.position.set(x, y, z);
    obj.rotation.y = (x * 7 + z * 3) % 6;
    scene.add(obj);
    const glow = fx.addGlow(new THREE.Vector3(x, y + 0.35, z), color, 1.4, 2.4);
    pickups.push({ id, kind, name, pos: new THREE.Vector3(x, y, z), obj, glow });
  };
  for (const f of FRAGMENTS) add('fragment', f.id, f.name, f.x, f.z, f.y ?? 0.02, fragmentMesh(f.id), 0xffb070);
  for (const p of PLANTS) add('plant', p.id, p.name, p.x, p.z, p.y ?? 0, plant(p.id), p.id === 'liana' ? 0x9ac8ff : 0xffe0a0);
  add('calabash', 'calabash', 'Dah Agossou’s calabash', -7.4, -30.9, 0, calabash(), 0xfff2d0);
  const hornbill = buildHornbill();
  hornbill.visible = false;
  scene.add(hornbill);
  return { pickups, hornbill };
}
