/**
 * Optimise a glTF/GLB into a ship-ready GLB (Part: asset pipeline).
 *
 *   node scripts/optimize-gltf.mjs <input.glb> <output.glb>
 *
 * Applies dedup → prune → resample → meshopt geometry compression. These are all
 * SAFE for skinned + animated meshes (we deliberately avoid weld/simplify/join,
 * which can tear a rig or its animation tracks). Textures are passed through —
 * KTX2/Basis is a separate step (needs the `toktx` binary); see docs/assets.md.
 *
 * Output uses EXT_meshopt_compression, which the client decodes with the bundled
 * MeshoptDecoder (no decoder files to copy).
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/optimize-gltf.mjs <input.glb> <output.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(input);
await doc.transform(
  dedup(),
  prune({ keepLeaves: false }),
  resample(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(output, doc);

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`optimised ${input} (${kb(input)} KB) -> ${output} (${kb(output)} KB)`);
