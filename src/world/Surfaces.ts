import * as THREE from 'three';

// Matières photographiques (Poly Haven, CC0) : relief et rugosité posés sur les matériaux des modèles,
// et sol de latérite. Les couleurs des modèles (faites dans Blender) restent : on ajoute le grain.
const base = () => `${import.meta.env.BASE_URL}textures/`;
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(file: string, repeat: number, srgb: boolean): THREE.Texture {
  const key = `${file}@${repeat}`;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`${base()}tex_${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

export type SurfaceKind = 'banco' | 'tin' | 'wood' | 'ash';
const SETS: Record<SurfaceKind, { name: string; repeat: number; normal: number; rough: number }> = {
  banco: { name: 'clay_plaster', repeat: 1.5, normal: 0.9, rough: 1 },
  tin: { name: 'corrugated_iron_02', repeat: 1.5, normal: 1.1, rough: 1 },
  wood: { name: 'old_planks_02', repeat: 1.5, normal: 0.9, rough: 1 },
  ash: { name: 'burned_ground_01', repeat: 1.5, normal: 0.8, rough: 1 },
};

export function kindOf(matName: string): SurfaceKind | null {
  const n = matName.toLowerCase();
  if (/rust|tin|metal|iron|roof/.test(n)) return 'tin';
  if (/wood|plank|beam|post|door|stump/.test(n)) return 'wood';
  if (/char|ash|burnt_ground|soot/.test(n)) return 'ash';
  if (/banco|concrete|plaster|wall|clay/.test(n)) return 'banco';
  return null;
}

// Ajoute relief + rugosité à un matériau de modèle (sans toucher à sa couleur)
export function dress(m: THREE.MeshStandardMaterial) {
  const k = kindOf(m.name || '');
  if (!k) return;
  const s = SETS[k];
  m.normalMap = tex(`${s.name}_nor_gl_1k`, s.repeat, false);
  m.normalScale.set(s.normal, s.normal);
  m.roughnessMap = tex(`${s.name}_rough_1k`, s.repeat, false);
  m.roughness = s.rough;
  m.needsUpdate = true;
}

// Sol de latérite : 400 m de côté, motif de ~4 m
export function groundMaterial(): THREE.MeshStandardMaterial {
  const r = 100;
  return new THREE.MeshStandardMaterial({
    color: 0xb9a79a,
    map: tex('red_laterite_soil_stones_diff_1k', r, true),
    normalMap: tex('red_laterite_soil_stones_nor_gl_1k', r, false),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: tex('red_laterite_soil_stones_rough_1k', r, false),
    roughness: 1,
  });
}

// Sol brûlé / cendre (zones calcinées)
export function ashMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x9a948e,
    map: tex('burned_ground_01_diff_1k', 12, true),
    normalMap: tex('burned_ground_01_nor_gl_1k', 12, false),
    roughnessMap: tex('burned_ground_01_rough_1k', 12, false),
    roughness: 1,
  });
}
