import * as THREE from 'three';
import { buildPerson, type Person, type PersonDef } from '../world/People';
import type { Models } from '../world/Assets';

// Les Brûlés : des Azévi qui ont l'air de villageois ordinaires (dans le rétroviseur, ils brûlent).
// Ils ne meurent pas : un coup les fait reculer, trois coups les font fuir (le kaolin les dispersera).

export type EnemyState = 'stalk' | 'chase' | 'windup' | 'grab' | 'stagger' | 'flee' | 'gone';

const LOOKS: Omit<PersonDef, 'id'>[] = [
  { sex: 'm', height: 1.78, skin: '#3e281b', top: 'bomba', wax: ['#3a2a1e', '#6a4a2a', '#b8a080'], hair: 'short04', azevi: true, pants: '#2a241e' },
  { sex: 'f', height: 1.64, skin: '#4a2e1e', top: 'robe', wax: ['#4a2a2a', '#8a3a2a', '#d8b890'], gele: true, azevi: true },
  { sex: 'm', height: 1.72, skin: '#5b3a26', top: 'chemise', wax: ['#2a3a3a', '#5a6a5a', '#c8c0a0'], hair: 'short04', beard: true, azevi: true, pants: '#1f1c18' },
  { sex: 'f', height: 1.6, skin: '#3e281b', top: 'haut', wax: ['#2a2a3a', '#6a5a8a', '#e0d0b0'], hair: 'braid01', azevi: true },
];

export interface Enemy {
  person: Person;
  pos: THREE.Vector3;
  state: EnemyState;
  hits: number;
  timer: number;
  cooldown: number;
  fromOwl: boolean;
}

export interface EnemyEvents {
  onWindup(e: Enemy): void;              // il prend son élan (grognement, voile rouge)
  onHitPlayer(damage: number, e: Enemy): void;
  onGrab(e: Enemy): void;                // il attrape Happy : QTE (marteler E)
}

export class Enemies {
  list: Enemy[] = [];
  private n = 0;
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private models: Models,
    private colliders: THREE.Box3[],
    private events: EnemyEvents,
  ) {}

  spawn(at: THREE.Vector3, fromOwl: boolean, state: EnemyState = 'chase'): Enemy | null {
    const look = LOOKS[this.n % LOOKS.length];
    const person = buildPerson(this.models, { ...look, id: `burnt${this.n++}` });
    if (!person) return null;
    const pos = at.clone();
    pos.y = 0;
    this.pushOut(pos, 0.35);
    person.root.position.copy(pos);
    this.scene.add(person.root);
    const e: Enemy = { person, pos, state, hits: 0, timer: 0, cooldown: 0, fromOwl };
    person.play(state === 'chase' ? 'Sprint_Loop' : 'Walk_Loop');
    this.list.push(e);
    return e;
  }

  // Un villageois immobile frappé se réveille : il devient un Brûlé
  adopt(person: Person, fromOwl = false): Enemy {
    const pos = person.root.position.clone();
    const e: Enemy = { person, pos, state: 'stagger', hits: 0, timer: 0.8, cooldown: 0.5, fromOwl };
    person.def.slow = 1;
    person.play('Hit_Chest', 0.1, true);
    this.list.push(e);
    return e;
  }

  // Fin de la prise : dégagé (recul) ou pas (il frappe fort)
  releaseGrab(e: Enemy, freed: boolean): void {
    if (freed) {
      e.state = 'stagger';
      e.timer = 1.2;
      e.hits += 1;
      e.person.play('Hit_Chest', 0.1, true);
    } else {
      this.events.onHitPlayer(34, e);
      e.state = 'stagger';
      e.timer = 0.6;
    }
    e.cooldown = 1.6;
  }

  // Coup de Happy : touche les Brûlés devant lui, à portée ; renvoie les points touchés (pour les braises)
  strike(from: THREE.Vector3, dir: THREE.Vector3, range: number, power: number): THREE.Vector3[] {
    const touched: THREE.Vector3[] = [];
    for (const e of this.list) {
      if (e.state === 'gone' || e.state === 'flee') continue;
      const d = this.tmp.copy(e.pos).sub(from);
      d.y = 0;
      const dist = d.length();
      if (dist > range || dist < 0.01) continue;
      if ((d.x * dir.x + d.z * dir.z) / dist < 0.5) continue;
      if (e.state === 'grab') continue;
      touched.push(e.pos.clone().setY(1.3));
      e.hits += power;
      // recul
      e.pos.addScaledVector(d.normalize(), 0.9 * power);
      this.pushOut(e.pos, 0.35);
      if (e.hits >= 3) {
        e.state = 'flee';
        e.timer = 7;
        e.person.play('Walk_Loop');
      } else {
        e.state = 'stagger';
        e.timer = 0.7 + 0.3 * power;
        e.person.play('Hit_Chest', 0.1, true);
      }
    }
    return touched;
  }

  // Tous repartent (le 4×4 est un refuge, ou l'aube se lève)
  scatter(): void {
    for (const e of this.list) if (e.state !== 'gone') { e.state = 'flee'; e.timer = 6; e.person.play('Walk_Loop'); }
  }

  near(p: THREE.Vector3, r: number): number {
    return this.list.filter((e) => e.state !== 'gone' && e.state !== 'flee' && e.pos.distanceTo(p) < r).length;
  }

  grabbing(): Enemy | null {
    return this.list.find((e) => e.state === 'grab') ?? null;
  }

  update(dt: number, player: THREE.Vector3, refuge: boolean): void {
    this.dt = dt;
    for (const e of this.list) {
      e.person.update(dt);
      e.cooldown = Math.max(0, e.cooldown - dt);
      const to = this.tmp.copy(player).sub(e.pos);
      to.y = 0;
      const dist = to.length();
      if (refuge && e.state !== 'flee' && e.state !== 'gone' && e.state !== 'grab') {
        e.state = 'flee';
        e.timer = 5;
        e.person.play('Walk_Loop');
      }
      switch (e.state) {
        case 'stalk':
          this.move(e, to, dist, 1.25);
          if (dist < 9) { e.state = 'chase'; e.person.play('Sprint_Loop'); }
          break;
        case 'chase':
          this.move(e, to, dist, 4.0);
          if (dist < 1.7 && e.cooldown <= 0) {
            // élan : il lève les bras, on l'entend
            e.state = 'windup';
            e.timer = 0.5;
            e.person.play('Interact', 0.08, true);
            this.events.onWindup(e);
          }
          break;
        case 'windup':
          this.face(e, to);
          if (dist > 1.0) this.move(e, to, dist, 2.2); // il se jette sur Happy
          e.timer -= dt;
          if (e.timer <= 0) {
            e.cooldown = 1.2;
            if (dist < 1.9) {
              if (Math.random() < 0.3) { e.state = 'grab'; e.timer = 2.2; this.events.onGrab(e); break; }
              this.events.onHitPlayer(20, e);
            }
            e.state = 'chase';
            e.person.play('Sprint_Loop');
          }
          break;
        case 'grab':
          // collé à Happy pendant la prise (le jeu décide de la fin)
          this.face(e, to);
          if (dist > 0.9) this.move(e, to, dist, 3);
          break;
        case 'stagger':
          e.timer -= dt;
          if (e.timer <= 0) {
            if (e.hits >= 3) { e.state = 'flee'; e.timer = 7; e.person.play('Walk_Loop'); }
            else { e.state = 'chase'; e.person.play('Sprint_Loop'); }
          }
          break;
        case 'flee':
          this.move(e, to.negate(), dist, 1.6);
          e.timer -= dt;
          if (e.timer <= 0) e.state = 'gone';
          break;
      }
      e.person.root.position.copy(e.pos);
    }
    // les disparus quittent la scène
    for (const e of this.list.filter((x) => x.state === 'gone')) this.scene.remove(e.person.root);
    this.list = this.list.filter((x) => x.state !== 'gone');
  }

  private face(e: Enemy, dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    const target = Math.atan2(dir.x, dir.z);
    let d = target - e.person.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.person.root.rotation.y += d * 0.25;
  }

  private move(e: Enemy, dir: THREE.Vector3, _dist: number, speed: number): void {
    if (dir.lengthSq() < 1e-6) return;
    this.face(e, dir);
    e.pos.addScaledVector(dir.clone().normalize(), speed * this.dt);
    this.pushOut(e.pos, 0.35);
  }

  private dt = 0.016;

  private pushOut(p: THREE.Vector3, r: number): void {
    for (const b of this.colliders) {
      const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        p.x = b.max.x + r;
      }
    }
  }
}
