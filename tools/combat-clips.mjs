// Makes a file of chosen clips out of Quaternius' Universal Animation Library .glb files, which carry a mannequin
// as well: its mesh, skin and pictures are left out, the skeleton's nodes are kept (the clips name them), and only
// the data the chosen clips read is copied, byte for byte, as tools/compact-glb.mjs does.
//
//   node tools/combat-clips.mjs <out.glb> <in.glb>:<Clip>[=<NewName>],<Clip>... [<in.glb>:...]
//
// The starter man stands on the same skeleton, so the clips play on him unchanged (every bone name is checked).
import { readFileSync, writeFileSync } from 'node:fs';

const [to, ...sources] = process.argv.slice(2);
if (!to || !sources.length) throw new Error('usage: combat-clips.mjs <out.glb> <in.glb>:<Clip>,<Clip> ...');

function readGlb(path) {
  const glb = readFileSync(path);
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a .glb`);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = glb.subarray(20 + jsonLength + 8, 20 + jsonLength + 8 + glb.readUInt32LE(20 + jsonLength));
  if (json.buffers.length !== 1) throw new Error(`${path}: one buffer expected`);
  return { json, bin };
}

const parts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const accessors = [];
const chunks = [];
let length = 0;
const animations = [];
let nodes = null; // the skeleton, from the first file; the others must name the same bones

for (const source of sources) {
  const cut = source.lastIndexOf(':');
  const path = source.slice(0, cut);
  const wanted = source.slice(cut + 1).split(',').map((s) => s.split('='));
  const { json, bin } = readGlb(path);
  const names = json.nodes.map((n) => n.name);
  if (!nodes) {
    nodes = json.nodes.map(({ mesh, skin, ...n }) => n); // the bones and their parents; no mesh, no skin
  } else {
    const ours = new Set(nodes.map((n) => n.name));
    const missing = names.filter((n) => !ours.has(n));
    if (missing.length) throw new Error(`${path}: nodes the first file lacks: ${missing.join(', ')}`);
  }
  const index = new Map(nodes.map((n, i) => [n.name, i]));
  const remap = new Map();
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
  for (const [name, rename] of wanted) {
    const animation = json.animations.find((a) => a.name === name);
    if (!animation) throw new Error(`${path}: no clip ${name}`);
    animations.push({
      name: rename ?? name,
      samplers: animation.samplers.map((s) => ({ ...s, input: keep(s.input), output: keep(s.output) })),
      channels: animation.channels.map((c) => ({ ...c, target: { ...c.target, node: index.get(names[c.target.node]) } })),
    });
  }
}

const json = {
  asset: { version: '2.0', generator: 'oil-paint tools/combat-clips.mjs' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i))) }],
  nodes,
  animations,
  accessors,
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: length }],
  buffers: [{ byteLength: length }],
};
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
console.log(`${animations.length} clips: ${animations.map((a) => a.name).join(', ')}; ${((28 + text.length + body.length) / 1e6).toFixed(2)} MB`);
