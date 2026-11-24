// Turns a .gltf with its data inside it (a base64 buffer, as Quaternius' animals come) into a .glb with only the
// clips asked for: the mesh, its skin and the chosen clips are kept, everything they don't read is left out.
//
//   node tools/creature-glb.mjs <in.gltf> <out.glb> <Clip>,<Clip>,...
import { readFileSync, writeFileSync } from 'node:fs';

const [from, to, list] = process.argv.slice(2);
if (!from || !to || !list) throw new Error('usage: creature-glb.mjs <in.gltf> <out.glb> <Clip>,<Clip>');
const json = JSON.parse(readFileSync(from, 'utf8'));
if (json.buffers.length !== 1 || !json.buffers[0].uri?.startsWith('data:')) throw new Error('one embedded buffer expected');
if (json.images?.length) throw new Error('pictures are not handled: the painter ignores them anyway');
const bin = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64');

const wanted = list.split(',');
const missing = wanted.filter((n) => !json.animations.some((a) => a.name === n));
if (missing.length) throw new Error(`no clips: ${missing.join(', ')}`);
json.animations = json.animations.filter((a) => wanted.includes(a.name));

const parts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const remap = new Map();
const accessors = [];
const chunks = [];
let length = 0;
const keep = (i) => {
  if (remap.has(i)) return remap.get(i);
  const a = json.accessors[i];
  const view = json.bufferViews[a.bufferView];
  if (view.byteStride || a.sparse) throw new Error('interleaved or sparse data: not handled');
  const size = a.count * parts[a.type] * bytes[a.componentType];
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  chunks.push(bin.subarray(start, start + size));
  const pad = (4 - (size % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  accessors.push({ ...a, bufferView: 0, byteOffset: length });
  length += size + pad;
  remap.set(i, accessors.length - 1);
  return accessors.length - 1;
};
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = keep(p.attributes[k]);
    if (p.indices != null) p.indices = keep(p.indices);
    if (p.targets) for (const t of p.targets) for (const k of Object.keys(t)) t[k] = keep(t[k]);
  }
}
for (const skin of json.skins ?? []) if (skin.inverseBindMatrices != null) skin.inverseBindMatrices = keep(skin.inverseBindMatrices);
for (const animation of json.animations) {
  for (const s of animation.samplers) { s.input = keep(s.input); s.output = keep(s.output); }
}
json.accessors = accessors;
json.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: length }];
json.buffers = [{ byteLength: length }];
json.asset = { ...json.asset, generator: 'oil-paint tools/creature-glb.mjs' };

let text = Buffer.from(JSON.stringify(json), 'utf8');
if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
const body = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
const head = (size, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(size, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
writeFileSync(to, Buffer.concat([header, head(text.length, 0x4e4f534a), text, head(body.length, 0x004e4942), body]));
console.log(`${json.animations.length} clips: ${wanted.join(', ')}; ${((28 + text.length + body.length) / 1e6).toFixed(2)} MB`);
