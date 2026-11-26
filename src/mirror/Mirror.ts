import * as THREE from 'three';
import { LAYER_TRUTH } from '../world/Village';

// Le rétroviseur arraché du 4×4 : une seconde caméra tournée vers l'arrière,
// qui voit le calque "vérité" (visages brûlés des Azévi) au lieu du calque "vu".
export class Mirror {
  readonly cam = new THREE.PerspectiveCamera(55, 2.4, 0.05, 90);
  raised = 0; // 0 = baissé, 1 = levé (animation)

  private rt = new THREE.WebGLRenderTarget(720, 300);
  private overlay = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private group = new THREE.Group();

  constructor() {
    this.cam.layers.set(0);
    this.cam.layers.enable(LAYER_TRUTH);

    const w = 1.15, h = w / 2.4;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.07, h + 0.07), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.rt.texture, side: THREE.DoubleSide }),
    );
    glass.scale.x = -1; // un miroir inverse gauche et droite
    glass.position.z = 0.01;
    // Légère teinte froide du verre
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.06 }),
    );
    tint.position.z = 0.02;
    this.group.add(frame, glass, tint);
    this.overlay.add(this.group);
    this.overlayCam.position.z = 1;
  }

  update(dt: number, wantRaised: boolean, eye: THREE.Vector3, yaw: number, pitch: number): void {
    const target = wantRaised ? 1 : 0;
    this.raised += (target - this.raised) * Math.min(1, dt * 12);
    // Le miroir regarde derrière Happy
    this.cam.position.copy(eye);
    this.cam.rotation.set(-pitch * 0.5, yaw + Math.PI, 0, 'YXZ');
    // Il monte du bas de l'écran
    this.group.position.y = THREE.MathUtils.lerp(-1.6, 0.42, this.raised);
  }

  resize(aspect: number): void {
    this.overlayCam.left = -aspect;
    this.overlayCam.right = aspect;
    this.overlayCam.updateProjectionMatrix();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (this.raised < 0.02) return;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(null);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlay, this.overlayCam);
    renderer.autoClear = auto;
  }
}
