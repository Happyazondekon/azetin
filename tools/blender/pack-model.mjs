// =============================================================
//  Range un modèle fait dans Blender dans le jeu (compressé meshopt) :
//    node tools/blender/pack-model.mjs az-4x4 [az-station …]
//  tools/blender/work/<nom>.glb  ->  public/models/<nom>.glb
//  La couleur des sommets (COLOR_0) porte l'éclairage précalculé : on la garde.
//  Les UV sont gardées (textures de banco, paille, tôle, enseignes).
//  (Repris de Dantokpa Dash.)
// =============================================================
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { statSync, mkdirSync } from 'node:fs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const p = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(p(new URL('../../public/models/', import.meta.url)), { recursive: true });
for (const name of process.argv.slice(2)) {
  const src = p(new URL(`./work/${name}.glb`, import.meta.url));
  const out = p(new URL(`../../public/models/${name}.glb`, import.meta.url));
  const doc = await io.read(src);
  await doc.transform(
    dedup(),
    prune({ keepAttributes: true }),
    weld(),
    quantize({ quantizeColor: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(out, doc);
  console.log(name, Math.round(statSync(src).size / 1024), 'Ko ->', Math.round(statSync(out).size / 1024), 'Ko');
}
