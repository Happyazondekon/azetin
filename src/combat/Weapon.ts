import * as THREE from 'three';

// Arme tenue en main (vue à la première personne) : clé démonte-roue ou cric du 4×4.
export interface WeaponDef {
  id: 'Tire iron' | 'Car jack' | 'Machete';
  range: number;
  power: number;     // 1 = recul, 2 = gros recul (3 au total font fuir un Brûlé)
  cooldown: number;  // s
  stamina: number;
}

export const WEAPONS: Record<WeaponDef['id'], WeaponDef> = {
  'Tire iron': { id: 'Tire iron', range: 2.1, power: 1, cooldown: 0.55, stamina: 9 },
  'Car jack': { id: 'Car jack', range: 1.9, power: 2, cooldown: 1.15, stamina: 22 },
  'Machete': { id: 'Machete', range: 2.3, power: 1, cooldown: 0.4, stamina: 7 },
};

const steel = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8, metalness: 0.35 });
const red = new THREE.MeshStandardMaterial({ color: 0x4a0f0a, roughness: 0.75, metalness: 0.25 });

function tireIron(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 8), steel);
  shaft.position.y = 0.2;
  const bend = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), steel);
  bend.rotation.z = Math.PI / 2;
  bend.position.set(0.05, 0.47, 0);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.05, 6), steel);
  sock.position.set(0.11, 0.47, 0);
  sock.rotation.z = Math.PI / 2;
  g.add(shaft, bend, sock);
  return g;
}

function carJack(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), red);
  const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.05), red);
  a1.position.set(-0.04, 0.09, 0); a1.rotation.z = 0.5;
  const a2 = a1.clone(); a2.position.x = 0.04; a2.rotation.z = -0.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.07), red);
  top.position.y = 0.18;
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), steel);
  screw.rotation.z = Math.PI / 2; screw.position.y = 0.09;
  g.add(base, a1, a2, top, screw);
  g.scale.setScalar(1.6);
  return g;
}

function machete(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0x24160c, roughness: 0.9 }));
  handle.position.y = 0.07;
  const shape = new THREE.Shape();
  shape.moveTo(-0.018, 0); shape.lineTo(0.03, 0); shape.lineTo(0.05, 0.36); shape.quadraticCurveTo(0.03, 0.44, -0.012, 0.42); shape.lineTo(-0.018, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.45, metalness: 0.7 }));
  blade.position.set(0, 0.14, -0.002);
  g.add(handle, blade);
  return g;
}

export class Viewmodel {
  readonly group = new THREE.Group();
  private models: Record<string, THREE.Group> = { 'Tire iron': tireIron(), 'Car jack': carJack(), Machete: machete() };
  private swing = 0;
  current: WeaponDef['id'] | null = null;

  constructor(camera: THREE.Camera) {
    this.group.position.set(0.3, -0.36, -0.55);
    this.group.scale.setScalar(0.55);
    for (const m of Object.values(this.models)) {
      m.visible = false;
      m.rotation.set(-0.35, 0.25, 0.25);
      this.group.add(m);
    }
    camera.add(this.group);
  }

  equip(id: WeaponDef['id'] | null): void {
    this.current = id;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
  }

  attack(): void {
    this.swing = 1;
  }

  update(dt: number, hidden: boolean, bob: number): void {
    this.group.visible = !hidden && !!this.current;
    this.swing = Math.max(0, this.swing - dt * 3.2);
    // grand arc de haut en bas, puis retour
    const s = Math.sin(this.swing * Math.PI);
    this.group.rotation.set(-s * 1.3, s * 0.5, -s * 0.35);
    this.group.position.set(0.3 - s * 0.18, -0.36 + bob + s * 0.12, -0.55 - s * 0.12);
  }
}
