import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Modèles .glb du dossier public/models (faits dans Blender : tools/blender/azetin.py,
// ou repris de Dantokpa Dash : arbres, taxi-moto, pneus, fûts, générateur, bidons, pirogue).
export const MODEL_NAMES = [
  'az-4x4', 'az-hut-thatch', 'az-hut-tin', 'az-hut-burnt', 'az-healer', 'az-asen', 'az-atelier', 'az-buvette',
  'az-station', 'az-stump', 'az-stele', 'az-sign', 'az-lamp', 'az-drum', 'az-barrels', 'az-throne',
  'tr-coco', 'tr-mango', 'tr-neem', 'tr-bush', 'tr-grass',
  'ob-zem', 'ob-tires', 'barrel', 'generator', 'jerrycan', 'pirogue', 'gas-bottle',
  // personnages (corps Quaternius aux traits africains, vêtements cousus dans Blender : repris de Dantokpa Dash)
  'body-m', 'body-f', 'anims', 'top-bomba-m', 'top-chemise-m', 'top-robe-f', 'top-haut-f', 'bot-pagne-m', 'bot-pagne-f',
  'hair-short04-m', 'hair-braid01-f', 'hair-beard', 'hat-gele', 'shoe-sandale-m', 'shoe-sandale-f',
  // plus de variété (Dantokpa Dash) : coiffures, coupes pour les deux sexes, chaussures
  'hair-afro01-m', 'hair-afro01-f', 'hair-bob02-f', 'hair-braid01-m', 'hair-long01-f', 'hair-ponytail01-f', 'hair-short02-m', 'hair-short04-f',
  'top-bomba-f', 'top-chemise-f', 'top-haut-m', 'top-robe-m',
  'shoe-babouche-m', 'shoe-babouche-f', 'shoe-tapette-m', 'shoe-tapette-f', 'shoe-derby-m', 'shoe-derby-f', 'shoe-basket-m', 'shoe-basket-f',
] as const;

export type ModelName = (typeof MODEL_NAMES)[number];
export type Models = Partial<Record<ModelName, THREE.Object3D>>;
// Animations (fichier anims.glb : Idle_Loop, Walk_Loop, Sprint_Loop, Hit_Chest, Death01…)
export const clips: THREE.AnimationClip[] = [];

// Charge tous les modèles ; un modèle qui manque est simplement absent (le village garde un bloc à sa place).
export async function loadModels(onProgress: (done: number, total: number) => void): Promise<Models> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = import.meta.env.BASE_URL;
  // .glb par défaut ; la version d'aperçu en ligne utilise le même modèle en glTF JSON (VITE_MODEL_EXT=json)
  const ext = (import.meta.env.VITE_MODEL_EXT as string | undefined) ?? 'glb';
  const out: Models = {};
  let done = 0;
  await Promise.all(MODEL_NAMES.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`${base}models/${name}.${ext}`);
      const root = gltf.scene;
      if (name === 'anims') clips.push(...gltf.animations);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const s = mat as THREE.MeshStandardMaterial;
          // La nuit, les textures trop brillantes trahissent le décor : on les mate un peu
          if (s.isMeshStandardMaterial && s.map) s.map.anisotropy = 4;
        }
      });
      out[name] = root;
    } catch {
      console.warn(`Modèle manquant : ${name}`);
    }
    onProgress(++done, MODEL_NAMES.length);
  }));
  return out;
}

// Copie d'un modèle, recentrée en X/Z et posée au sol, à l'échelle voulue
export function instance(models: Models, name: ModelName, scale = 1, recenter = false): THREE.Object3D | null {
  const src = models[name];
  if (!src) return null;
  const obj = src.clone(true);
  obj.scale.setScalar(scale);
  if (recenter) {
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    obj.position.set(-c.x, -box.min.y, -c.z);
    holder.add(obj);
    return holder;
  }
  return obj;
}
