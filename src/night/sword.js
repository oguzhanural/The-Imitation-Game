// His sword: a plain long blade, a cross guard, a leather grip. It is held in his right fist, found each frame
// from his knuckles (the blade runs out past the thumb, its edge along the fingers), so it goes wherever the clips
// take the hand. Painted like his hat: the shapes carry an underpainting and strokes ride on them, steel under
// the moon, warm where the lantern reaches. A swing leaves a short trail of cold light behind the blade.
import * as THREE from 'three';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { paint } from '../figure/figure.js';

// light, half-tone, shade under the moon, then the thing's own colour for the lantern
const STEEL = [[0.62, 0.74, 0.84], [0.25, 0.33, 0.44], [0.07, 0.1, 0.17], [0.95, 0.85, 0.7]];
const IRON = [[0.32, 0.34, 0.38], [0.13, 0.14, 0.18], [0.04, 0.045, 0.07], [0.7, 0.55, 0.35]];
const LEATHER = [[0.3, 0.2, 0.15], [0.13, 0.08, 0.07], [0.05, 0.03, 0.04], [0.55, 0.3, 0.16]];
export const BLADE = { base: 0.125, tip: 0.94 }; // along the sword from the middle of the grip, metres
const TRAIL = 40; // strokes of the trail

export function createSword(shared) {
  const object = new THREE.Group();
  const shade = (p) => paint(shared, p, { grain: 3 });
  // the blade: flat, tapering to a point
  const outline = new THREE.Shape();
  outline.moveTo(-0.022, BLADE.base); outline.lineTo(0.022, BLADE.base); outline.lineTo(0.019, 0.81);
  outline.lineTo(0, BLADE.tip); outline.lineTo(-0.019, 0.81); outline.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.007, bevelEnabled: false });
  bladeGeo.translate(0, 0, -0.0035);
  const blade = new THREE.Mesh(bladeGeo, shade(STEEL));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 0.036), shade(IRON));
  guard.position.y = 0.11;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.2, 8), shade(LEATHER));
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), shade(IRON));
  pommel.position.y = -0.112;
  for (const m of [blade, guard, grip, pommel]) { m.layers.enable(1); object.add(m); }

  // strokes on it: down the blade on both faces, a few across the guard and round the grip
  const pos = [], dir = [], nrm = [], pal = [];
  const put = (p, d, n, k) => { pos.push(...p); dir.push(...d); nrm.push(...n); pal.push(k); };
  for (let i = 0; i < 64; i++) {
    const t = (i % 32) / 32, side = i < 32 ? 1 : -1;
    const y = BLADE.base + 0.02 + t * (BLADE.tip - BLADE.base - 0.08);
    put([((i * 0.618) % 1 - 0.5) * 0.026, y, 0.005 * side], [0, 1, 0], [0, 0, side], 0);
  }
  for (let i = 0; i < 10; i++) put([-0.09 + i * 0.02, 0.11, (i % 2 ? 1 : -1) * 0.019], [1, 0, 0], [0, 0, i % 2 ? 1 : -1], 1);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4;
    put([Math.cos(a) * 0.019, -0.09 + (i / 12) * 0.18, Math.sin(a) * 0.019], [-Math.sin(a), 0.3, Math.cos(a)], [Math.cos(a), 0, Math.sin(a)], 2);
  }
  const n = pal.length;
  const PALS = [STEEL, IRON, LEATHER];
  const glsl = (i) => PALS.map((p) => `vec3(${p[i]})`).join(', ');
  const dabs = dabMesh(dabGeometry(n, { aPos: [new Float32Array(pos), 3], aDir: [new Float32Array(dir), 3], aNrm: [new Float32Array(nrm), 3], aPal: [new Float32Array(pal), 1] }), dabMaterial(shared, {
    head: /* glsl */ `in vec3 aPos; in vec3 aDir; in vec3 aNrm; in float aPal; uniform mat4 uSword;
      const vec3 SW_L[3] = vec3[3](${glsl(0)}); const vec3 SW_M[3] = vec3[3](${glsl(1)});
      const vec3 SW_S[3] = vec3[3](${glsl(2)}); const vec3 SW_O[3] = vec3[3](${glsl(3)});`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        vec4 r = hash4(float(gl_InstanceID) * 5.3 + 3.0);
        int k = int(aPal + 0.5);
        vec3 P = (uSword * vec4(aPos, 1.0)).xyz;
        vec3 Nn = normalize(mat3(uSword) * aNrm);
        if (dot(Nn, cameraPosition - P) < 0.0) Nn = -Nn;
        float lit = sunAt(P + Nn * 0.05) * clamp(dot(Nn, uSunDir) * 0.85 + 0.45, 0.0, 1.0);
        vec3 c = jitter(paint3(SW_L[k], SW_M[k], SW_S[k], lit, r.x), r.yzw, 0.3);
        // the blade throws back the sky: a cold glint where it turns toward the eye
        if (k == 0) c += vec3(0.25, 0.4, 0.45) * pow(max(dot(reflect(-normalize(cameraPosition - P), Nn), uSunDir), 0.0), 6.0);
        c += SW_O[k] * uLampCol * lampAt(P, Nn);
        d.pos = P; d.dir = mat3(uSword) * aDir;
        d.size = (k == 0 ? vec2(0.022, 0.09) : vec2(0.018, 0.04)) * (0.8 + 0.4 * r.y);
        d.turnabout = 1.0;
        d.c1 = hazed(c, P); d.c2 = hazed(c * 1.2, P);
        d.seed = float(gl_InstanceID); d.lift = 0.3;
      }`,
    uniforms: { uSword: { value: object.matrixWorld } },
    minPx: [2, 4], maxPx: [120, 300], cells: [0, 4],
  }), 5);

  // the trail: where the blade has been in the last moments of a swing, as strokes of light that add up
  const tPos = new Float32Array(TRAIL * 3), tDir = new Float32Array(TRAIL * 3), tAge = new Float32Array(TRAIL).fill(9);
  const trailGeo = dabGeometry(TRAIL, { aPos: [tPos, 3], aDir: [tDir, 3], aAge: [tAge, 1] }, true);
  const trail = dabMesh(trailGeo, dabMaterial(shared, {
    head: /* glsl */ `in vec3 aPos; in vec3 aDir; in float aAge;`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float fade = 1.0 - clamp(aAge / 0.22, 0.0, 1.0);
        if (fade <= 0.0) { d.alive = 0.0; return; }
        vec4 r = hash4(float(gl_InstanceID) * 2.1 + 9.0);
        d.pos = aPos; d.dir = aDir;
        d.size = vec2(0.05, 0.42) * (0.7 + 0.5 * r.x) * (0.6 + 0.4 * fade);
        d.c1 = vec3(0.32, 0.55, 0.62) * fade * fade * 0.55;
        d.c2 = d.c1 * 1.4;
        d.seed = float(gl_InstanceID); d.lift = 0.0;
      }`,
    uniforms: { uImpasto: { value: 0.2 } },
    minPx: [2, 4], maxPx: [200, 600], cells: [0, 6],
  }), 22);
  const tm = trail.material;
  tm.transparent = true; tm.blending = THREE.AdditiveBlending; tm.alphaToCoverage = false; tm.depthWrite = false;

  const across = new THREE.Vector3(), along = new THREE.Vector3(), out = new THREE.Vector3(), basis = new THREE.Matrix4();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const tip = new THREE.Vector3(), lastTip = new THREE.Vector3(), mid = new THREE.Vector3();
  let next = 0, had = false;
  const at = (bones, name, o) => o.setFromMatrixPosition(bones[name].matrixWorld);
  return {
    object, dabs, trail,
    tip, // where the point of the blade is, in the world
    speed: 0, // how fast the point moves, m/s
    /** Puts it in his right fist. Call after the hand has its last turn for the frame. */
    hold(bones) {
      // across the knuckles from little finger to forefinger is the way the blade runs out of a fist
      at(bones, 'index_01_r', v1); at(bones, 'pinky_01_r', v2);
      along.subVectors(v1, v2).normalize();
      // the fingers point the way the edge does
      at(bones, 'middle_01_r', v1); at(bones, 'hand_r', v2);
      across.subVectors(v1, v2);
      across.addScaledVector(along, -across.dot(along)).normalize();
      out.crossVectors(across, along);
      basis.makeBasis(across, along, out);
      object.quaternion.setFromRotationMatrix(basis);
      // the grip sits in the middle of the fist
      at(bones, 'middle_01_r', v1); at(bones, 'hand_r', v2);
      object.position.copy(v1).lerp(v2, 0.35).addScaledVector(across, 0.025);
      object.updateMatrixWorld(true);
    },
    /** The trail: lays a stroke where the blade is while `swinging`, and lets the old ones fade. */
    update(dt, swinging) {
      tip.set(0, BLADE.tip, 0).applyMatrix4(object.matrixWorld);
      this.speed = had ? tip.distanceTo(lastTip) / Math.max(dt, 1e-4) : 0;
      for (let i = 0; i < TRAIL; i++) tAge[i] += dt;
      if (swinging && had && this.speed > 3) {
        // two strokes a frame, along the outer half of the blade, lying the way it moves
        for (const s of [0.55, 0.85]) {
          mid.set(0, BLADE.base + s * (BLADE.tip - BLADE.base), 0).applyMatrix4(object.matrixWorld);
          tPos.set([mid.x, mid.y, mid.z], next * 3);
          v1.subVectors(tip, lastTip).normalize();
          tDir.set([v1.x, v1.y, v1.z], next * 3);
          tAge[next] = 0;
          next = (next + 1) % TRAIL;
        }
        trailGeo.attributes.aPos.needsUpdate = trailGeo.attributes.aDir.needsUpdate = true;
      }
      trailGeo.attributes.aAge.needsUpdate = true;
      lastTip.copy(tip);
      had = true;
    },
    /** The blade as a segment, base to point, in the world. */
    edge(a, b) {
      a.set(0, BLADE.base, 0).applyMatrix4(object.matrixWorld);
      b.set(0, BLADE.tip, 0).applyMatrix4(object.matrixWorld);
    },
  };
}
