import * as THREE from 'three';

// Gerbes de braises et de cendre quand un coup touche un Brûlé
export class Sparks {
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private points: THREE.Points;
  private next = 0;
  private readonly N = 240;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.35, 'rgba(255,140,40,0.9)');
    grd.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.layers.enableAll();
    scene.add(this.points);
    for (let i = 0; i < this.N; i++) this.pos[i * 3 + 1] = -99;
  }

  burst(at: THREE.Vector3, n = 40): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.N;
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([(Math.random() - 0.5) * 4, Math.random() * 3.5, (Math.random() - 0.5) * 4], i * 3);
      this.life[i] = 0.4 + Math.random() * 0.6;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 6 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -99;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
