import * as THREE from 'three';
import type { Input } from '../core/Input';

// Contrôleur à la première personne : déplacement, course, accroupi,
// endurance et collisions simples (cercle contre boîtes, sur le plan XZ).
export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  stamina = 100;
  readonly radius = 0.35;

  private eye = 1.65;
  heightScale = 1; // 0.65 pendant le flashback : on voit par les yeux d'Ayaba
  private bobT = 0;
  private moving = false;
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private colliders: THREE.Box3[],
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ) {
    camera.rotation.order = 'YXZ';
  }

  place(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.syncCamera(0);
  }

  update(dt: number, input: Input, canLook: boolean): void {
    if (canLook) {
      const k = 0.0022 * this.sensitivity;
      this.yaw -= input.mouseDX * k;
      this.pitch -= input.mouseDY * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }

    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const side = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const crouch = input.down('KeyC') || input.down('ControlLeft');
    const wantsRun = (input.down('ShiftLeft') || input.down('ShiftRight')) && fwd > 0 && !crouch;
    const running = wantsRun && this.stamina > 5;

    const speed = crouch ? 1.3 : running ? 4.6 : 2.4;
    this.moving = fwd !== 0 || side !== 0;

    if (this.moving) {
      this.tmp.set(side, 0, -fwd).normalize().applyAxisAngle(this.up, this.yaw).multiplyScalar(speed * dt);
      this.pos.x += this.tmp.x;
      this.resolve();
      this.pos.z += this.tmp.z;
      this.resolve();
    }

    // Endurance : baisse en courant, remonte au repos
    if (running && this.moving) this.stamina = Math.max(0, this.stamina - 18 * dt);
    else this.stamina = Math.min(100, this.stamina + (this.moving ? 8 : 14) * dt);

    const targetEye = (crouch ? 1.05 : 1.65) * this.heightScale;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    if (this.moving) this.bobT += dt * (running ? 11 : 7);
    this.syncCamera(this.moving ? Math.sin(this.bobT) * (running ? 0.045 : 0.025) : 0);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyAxisAngle(this.up, this.yaw);
  }

  private syncCamera(bob: number): void {
    this.camera.position.set(this.pos.x, this.eye + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // Repousse le joueur hors des boîtes de collision et le garde dans les limites du monde
  private resolve(): void {
    const r = this.radius;
    for (const b of this.colliders) {
      const cx = THREE.MathUtils.clamp(this.pos.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.min.z, b.max.z);
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.pos.x = cx + (dx / d) * r;
        this.pos.z = cz + (dz / d) * r;
      } else {
        // Centre à l'intérieur de la boîte : sortie par le côté le plus proche
        const left = this.pos.x - b.min.x, right = b.max.x - this.pos.x;
        const back = this.pos.z - b.min.z, front = b.max.z - this.pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) this.pos.x = b.min.x - r;
        else if (m === right) this.pos.x = b.max.x + r;
        else if (m === back) this.pos.z = b.min.z - r;
        else this.pos.z = b.max.z + r;
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
  }
}
