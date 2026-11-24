// A white wolf as the night paints it: the body in three mixes of snow-white under the moon, its pale belly and
// face lighter still, nose and eyes dark; and strokes of fur pinned to it that ride with its bones, laid back
// along the body and down its flanks. The lantern warms whatever it comes near, as it does him.
import * as THREE from 'three';
import { paint } from '../figure/figure.js';
import { pinDabs } from '../oilpaint/pins.js';

// light, half-tone, shade under the moon, then the fur's own colour for the lantern
const FUR = [[0.74, 0.83, 0.9], [0.33, 0.43, 0.56], [0.08, 0.12, 0.22], [0.98, 0.9, 0.78]];
const PALE = [[0.86, 0.92, 0.97], [0.46, 0.56, 0.68], [0.13, 0.18, 0.29], [1.0, 0.95, 0.85]];
const DARK = [[0.09, 0.09, 0.11], [0.045, 0.045, 0.06], [0.02, 0.02, 0.03], [0.22, 0.13, 0.08]];

/** Paints a wolf (a clone of the model, already scaled). Returns { dabs, update() } for its strokes of fur. */
export function paintWolf(shared, object) {
  const meshes = [];
  object.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const parts = [];
  for (const m of meshes) {
    const name = m.material?.name ?? '';
    const pal = name === 'Main' ? FUR : name === 'Main_Light' ? PALE : DARK;
    m.material = paint(shared, pal, { skinned: true, grain: 0.8 });
    m.frustumCulled = false;
    m.layers.enable(1); // its shadow goes over the snow like his
    // the model runs nose to tail along z (head +z): fur lies back, and down the flanks
    const style = (k) => (p, n) => ({ pal: k, size: [0.06, 0.15], dir: new THREE.Vector3(0, -0.25 - 0.6 * Math.abs(n.x), -1) });
    if (name === 'Main') parts.push({ mesh: m, count: 420, style: style(0) });
    if (name === 'Main_Light') parts.push({ mesh: m, count: 180, style: style(1) });
  }
  const fur = pinDabs(shared, [FUR, PALE], parts);
  return { dabs: fur.mesh, update: () => fur.update() };
}
