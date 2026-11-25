// The same wanderer on a ridge of snow at night, under the aurora, with a lantern. Painted with the same painter
// as the wood (src/oilpaint); only the world is new. It is the picture a bare address shows (src/scenes.js).
//   ?capture       no clock: window.lab.step(dt, n) advances it (for stills and films)
//   ?quality=low   for slower machines: fewer pixels, no veil behind the aurora, less snow in the air
//   ?canvas=0 ?impasto=0..2    parts of the finish, for comparing
import * as THREE from 'three';
import { patchBlock } from 'patch-block';
import recipe from '../../recipe.json';
import RAPIER from '../figure/rapier/rapier.mjs';
import { createShared, WIND } from '../oilpaint/common.js';
import { createBrushSheet } from '../oilpaint/brush.js';
import { createShade } from '../oilpaint/shade.js';
import { createFrame } from '../oilpaint/finish.js';
import { noise } from '../world/noise.js';
import { createFigure } from '../figure/figure.js';
import { Animator } from '../figure/animator.js';
import { Player } from '../figure/player.js';
import { Input } from '../figure/input.js';
import { Follow } from '../figure/camera.js';
import { prepareLand, createLand, heightAt, crestX, START, MOON, EXTENT, CABIN } from './land.js';
import { createSnow } from './snow.js';
import { createSky } from './sky.js';
import { createFar } from './far.js';
import { createTracks } from './tracks.js';
import { createLantern } from './lantern.js';
import { createDrift } from './drift.js';
import { createPines } from './pines.js';
import { createCabin } from './cabin.js';
import { t, onLang } from '../game/i18n.js';
import { createHud, bearingOf } from '../game/hud.js';
import { Objective } from '../game/objective.js';
import { Health } from '../game/health.js';
import { Combat } from '../game/combat.js';
import { createSword } from './sword.js';
import { loadWolfModel, Wolf } from '../game/wolf.js';
import { Encounters } from '../game/encounters.js';
import { paintWolf } from './wolf-paint.js';
import { createAudio } from '../game/audio.js';
import { createWind, createSteps, createFire, createSwish, createKnocks } from '../game/synth.js';
import { loadSounds } from '../game/sounds.js';
import { createMusic } from '../game/music.js';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');

let shown = true;
let loaded = false;
const block = patchBlock({
  ...recipe.block,
  onSet() {},
  onTrigger() {},
  onVisible(visible) { shown = visible; if (loaded) run(); },
});
block.progress(0.03, 'Laying the ground');
const timings = {};
let mark = performance.now();
const lap = (name) => { const now = performance.now(); timings[name] = Math.round(now - mark); mark = now; };

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.getElementById('view').appendChild(renderer.domElement);

// the night: a low moon for the sun, thin clear air, and the lantern's colour
const shared = createShared();
shared.tBrush.value = createBrushSheet();
shared.uSunDir.value.copy(MOON);
shared.uHaze.value.setRGB(0.035, 0.12, 0.17);
shared.uHazeSun.value.setRGB(0.06, 0.16, 0.2);
shared.uHazeGlow.value.setRGB(0.03, 0.045, 0.05);
shared.uHazeDensity.value = 0.00046;
shared.uShadeBias.value = 0.0004;
shared.uBounce.value.setRGB(0.015, 0.06, 0.07);
shared.uLampCol.value.setRGB(1.0, 0.6, 0.24);
shared.uGlazeMul.value.setRGB(0.3, 0.38, 0.62); // his shadow on the snow is blue
shared.uGlazeAdd.value.setRGB(0.0, 0.008, 0.03);
shared.uGlow = { value: new THREE.Vector3(1, 0, 0) };
shared.uWarm = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] };
shared.uRoom = { value: new THREE.Vector4(0, 0, -1, -1) };
if (q.has('impasto')) shared.uImpasto.value = +q.get('impasto');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 16000);
// Listened for from the start, not once loaded: the page may go fullscreen while the world is still being made.
// The frame's target joins in once it exists.
let fitFrame = () => {};
function fitView() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitFrame();
}
addEventListener('resize', fitView);
lap('start');

// what he wears by night: light, half-tone, shade under the moon, then the cloth's own colour for the lantern
const NIGHT_CLOTHES = {
  CLOAK: [[0.2, 0.42, 0.6], [0.07, 0.17, 0.32], [0.025, 0.06, 0.15], [0.16, 0.3, 0.5]],
  HAT: [[0.4, 0.46, 0.44], [0.17, 0.2, 0.22], [0.06, 0.075, 0.1], [0.85, 0.72, 0.42]],
  SHIRT: [[0.38, 0.45, 0.5], [0.15, 0.2, 0.27], [0.055, 0.08, 0.13], [0.8, 0.72, 0.56]],
  TROUSERS: [[0.26, 0.28, 0.3], [0.12, 0.13, 0.17], [0.05, 0.055, 0.09], [0.45, 0.32, 0.2]],
  SKIN: [[0.6, 0.53, 0.5], [0.3, 0.25, 0.27], [0.12, 0.1, 0.14], [0.85, 0.62, 0.46]],
  BOOTS: [[0.2, 0.18, 0.17], [0.09, 0.08, 0.09], [0.04, 0.035, 0.05], [0.35, 0.22, 0.14]],
  HAIR: [[0.18, 0.15, 0.14], [0.09, 0.07, 0.08], [0.04, 0.035, 0.05], [0.3, 0.2, 0.13]],
  EYES: [[0.1, 0.09, 0.09], [0.06, 0.05, 0.06], [0.03, 0.03, 0.04], [0.15, 0.1, 0.08]],
};
let told = 0;
const say = (value, label) => { told = Math.max(told, value); block.progress(told, label); };
// his sword fighting, roll, blows taken and fall come in a file of their own
const figureComing = createFigure(shared, (done) => say(0.05 + 0.55 * done, 'Fetching the wanderer'), NIGHT_CLOTHES, { extraClips: ['starter-man-combat.glb'] });
const wolfComing = loadWolfModel('./creatures/wolf.glb');

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
await prepareLand((done) => { say(0.03 + 0.09 * done, 'Laying the ground'); return turn(); });
const land = createLand(shared);
lap('land');
say(0.12, 'Laying the snow');
await turn();
const snow = createSnow(shared);
const pines = createPines(shared);
land.shade.add(pines.caster); // the moon lays their shadows down the snow with the horns'
const cabin = createCabin(shared);
land.shade.add(cabin.caster);
lap('snow');
const sky = createSky(shared);
const far = createFar(shared);
const tracks = createTracks(shared);
const drift = createDrift(shared);
const lantern = createLantern(shared);
const sword = createSword(shared);
// the moon sees the whole ridge: its picture of the shade is what lays the horns' shadow down the snow
const shade = createShade(renderer, shared, land.shade, { sun: MOON, size: [4096, 3072], box: [740, 560], centre: [0, 150, 0], back: 1600, near: 700, far: 2500 });
lap('shade');
say(0.25, 'Fetching the wanderer');
await turn();
scene.add(sky.group, far.group, land.mesh, snow.group, pines.group, cabin.group, tracks.mesh, lantern.object, lantern.glow, drift, sword.object, sword.dabs, sword.trail);

await RAPIER.init();
const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
{
  const f = land.heightField();
  physics.createCollider(RAPIER.ColliderDesc.heightfield(f.cells, f.cells, f.heights, { x: 2 * f.half, y: 1, z: 2 * f.half }));
  for (const t of pines.colliders) physics.createCollider(RAPIER.ColliderDesc.cylinder(4, t.r).setTranslation(t.x, t.y + 4, t.z));
  for (const s of cabin.solid) physics.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(s.x, s.y, s.z));
}
lap('physics');

const figure = await figureComing;
const { man } = figure;
scene.add(man.object, figure.cloakMesh, figure.dabs);
const animator = new Animator(man);
const spawn = new THREE.Vector3(START.x, heightAt(START.x, START.z), START.z);
const player = new Player({ RAPIER, world: physics, man, animator, spawn, yaw: Math.PI });
const follow = new Follow(camera);
follow.yaw = Math.PI;
// the eye sits low and looks up past him: the picture is mostly sky
follow.pitch = -0.07;
follow.lift = 1.5;
follow.sink = 0.7;
const input = new Input(renderer.domElement, { pads: !capture && !q.has('nopad') });
physics.step();
// he has come up from the south: his tracks are already there behind him
tracks.lay(crestX, START.z + 16, START.z + 0.4);
lap('figure');

// --- the wolves: six, in five fights along the way, the last two at once ---
const wolfModel = await wolfComing;
/** What keeps a wolf out of things: the spruces near the way, and the cabin. */
const push = new THREE.Vector3();
function keepOut(x, z) {
  push.set(0, 0, 0);
  for (const t of pines.colliders) {
    const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), gap = t.r + 0.45;
    if (d < gap && d > 1e-4) { push.x += (dx / d) * (gap - d); push.z += (dz / d) * (gap - d); }
  }
  const cx = x - CABIN.x, cz = z - CABIN.z, ox = 3.6 - Math.abs(cx), oz = 3.1 - Math.abs(cz);
  if (ox > 0 && oz > 0) { if (ox < oz) push.x += Math.sign(cx || 1) * ox; else push.z += Math.sign(cz || 1) * oz; }
  return push;
}
const makeWolf = () => {
  const w = new Wolf({ model: wolfModel, paint: (object) => paintWolf(shared, object), ground: heightAt, avoid: keepOut });
  scene.add(w.object, w.dabs);
  return w;
};
// each fight: where it starts (he has come that far north) and where its wolves come from, round where he is
const flank = (side, ahead, out = 20) => (feet) => ({ x: crestX(feet.z - ahead) + side * out, z: feet.z - ahead });
const FIGHTS = [
  { at: 284, from: [flank(-1, -4)] }, // out of the spruces to the west, from a little behind
  { at: 222, from: [flank(1, 6)] }, // up the eastern slope
  // they come up from below the crest, where the ridge falls away, so none is seen to appear
  { at: 165, from: [flank(1, 26, 24)] }, // up over the knoll's eastern shoulder, ahead of him
  { at: 95, from: [flank(-1, 8)] },
  { at: 30, from: [flank(-1, 24, 24), flank(1, -6)], delays: [0, 2.5] }, // two: one ahead from the west, one behind him from the east
];
const encounters = new Encounters(FIGHTS.map((f) => ({
  trigger: (feet) => feet.z < f.at,
  spawn: (feet) => f.from.map((at, i) => ({ ...at(feet), delay: f.delays?.[i] ?? 0 })),
})), (i) => FIGHTS[i].from.map(makeWolf));

const frame = createFrame(renderer, shared);
fitFrame = () => frame.resize();
frame.uniforms.uCanvas.value = q.has('canvas') ? +q.get('canvas') : 1;
frame.uniforms.uShafts.value = 0; // no sun stands in this air
// ?quality wins; otherwise Patch's performance mode, where there is one. Low draws at the screen's own pixels,
// without the veil behind the aurora and with less snow in the air.
function applyQuality() {
  const low = (q.get('quality') ?? window.patch?.quality ?? 'high') === 'low';
  renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, low ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  frame.resize();
  const veil = sky.group.getObjectByName('veil');
  if (veil) veil.visible = !low;
  drift.geometry.instanceCount = low ? 900 : 2400;
}
applyQuality();
window.patch?.addEventListener?.('qualitychange', applyQuality);

const wind = { x: WIND.x, z: WIND.y };
let time = 0;
/** How hard the wind blows at (x, z) now, 0..1: the bands the snow in the air moves in, and the sound of it. */
function gustAt(x, z) {
  const along = x * wind.x + z * wind.z, across = -x * wind.z + z * wind.x;
  return THREE.MathUtils.clamp(0.5 + 0.8 * noise((along - time * 4) / 40, across / 90) + 0.3 * noise((along - time * 6.5) / 11, across / 17), 0, 1);
}
function air(x, y, z, out) {
  const gust = gustAt(x, z);
  const speed = 0.6 + 3.6 * gust * gust;
  return out.set(wind.x * speed, 0.25 * Math.sin(time * 2.3 + x) * gust, wind.z * speed);
}

function place(x, z, yaw) {
  const y = heightAt(x, z), half = player.halfHeight();
  player.body.setTranslation({ x, y: y + player.t.radius + half + 0.05, z }, true);
  physics.propagateModifiedBodyPositionsToColliders();
  player.feet.set(x, y, z); player.prevFeet.copy(player.feet); player.visualY = y;
  player.vel.set(0, 0, 0); player.speed = 0; player.mode = 'move'; player.grounded = true;
  player.yaw = player.lastYaw = yaw;
  animator.lock = null; animator.lockOff = null;
  animator.enter(animator.locoState({ strafe: false }), 0.05);
}

// He holds the lantern out at his side in his left hand (the sword has the right): the left arm is set to that after
// the clips have had it, upper arm out and a little forward, forearm forward and level, as much as `weight` says
// (while he fights or rolls the clips keep most of the arm). Directions are in his own frame (+x his left, +z ahead).
const HOLD = [['upperarm_l', 'lowerarm_l', new THREE.Vector3(0.72, -0.52, 0.42).normalize()], ['lowerarm_l', 'hand_l', new THREE.Vector3(0.42, 0.16, 0.86).normalize()]];
const from = new THREE.Vector3(), to = new THREE.Vector3(), swing = new THREE.Quaternion(), pq = new THREE.Quaternion(), wq = new THREE.Quaternion(), aim = new THREE.Quaternion();
const grip = new THREE.Vector3(), forearm = new THREE.Vector3(), back = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), want = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const at = (name, out) => out.setFromMatrixPosition(man.bones[name].matrixWorld);
const HAND_TURN = q.has('hand') ? +q.get('hand') : 0; // a turn of the wrist added to that, for trying
/** Closes a hand ('l' or 'r') round a handle. */
function fist(side) {
  for (const f of animator.fingerPoses ?? []) if (f.bone.name.endsWith(`_${side}`)) f.bone.quaternion.slerpQuaternions(f.flat, f.fist, f.thumb ? 0.75 : 1);
  man.bones[`hand_${side}`].updateMatrixWorld(true);
}
function holdLantern(weight) {
  for (const [bone, child, dir] of HOLD) {
    const b = man.bones[bone];
    from.setFromMatrixPosition(man.bones[child].matrixWorld).sub(to.setFromMatrixPosition(b.matrixWorld)).normalize();
    to.copy(dir).applyQuaternion(man.object.quaternion);
    swing.setFromUnitVectors(from, to);
    b.parent.getWorldQuaternion(pq); b.getWorldQuaternion(wq);
    aim.copy(pq.invert().multiply(swing.multiply(wq)));
    b.quaternion.slerp(aim, weight);
    b.updateMatrixWorld(true);
  }
  // The hand is turned about the forearm until its back is uppermost, and closed into a fist: the lantern's
  // handle hangs from inside it. (The back of the hand is found from the knuckles: along the hand, across it;
  // across runs from forefinger to little finger on this side, the mirror of the right.)
  const hand = man.bones.hand_l;
  forearm.copy(at('hand_l', v1)).sub(at('lowerarm_l', v2)).normalize();
  at('middle_01_l', v1).sub(at('hand_l', want));
  at('pinky_01_l', v2).sub(at('index_01_l', want));
  back.crossVectors(v1, v2);
  back.addScaledVector(forearm, -back.dot(forearm)).normalize();
  want.copy(UP).addScaledVector(forearm, -UP.dot(forearm)).normalize();
  animator.rotateWorld(hand, forearm, (Math.atan2(forearm.dot(v1.crossVectors(back, want)), back.dot(want)) + HAND_TURN) * weight);
  fist('l');
  grip.set(0, 0, 0);
  for (const name of ['index_01_l', 'ring_01_l', 'index_02_l', 'ring_02_l']) grip.add(at(name, v1));
  grip.multiplyScalar(0.25);
}

// --- the story: the first thing asked of him is to reach the cabin ---
// The words over the picture are left out of stills and films (?capture, ?clean) unless ?hud asks for them.
const hud = createHud({ hidden: (capture || q.has('clean')) && !q.has('hud') });
// he counts as there on its doorstep; the compass points at the door, in the middle of the south wall's east half
const objective = new Objective({
  at: { x: CABIN.x + 1.75, z: CABIN.z + 3.2 },
  label: 'obj.cabin', goal: 'obj.cabin.goal', done: 'obj.cabin.done',
  reached: (feet) => cabin.threshold(feet),
});
const looking = new THREE.Vector3();

// --- his life: bites take from it; at nothing he falls, the dark comes down, and he wakes at the last resting point ---
const health = new Health(100);
// where he wakes: where he began, until a fight is won (each one won moves it on)
const checkpoint = { x: spawn.x, z: spawn.z, yaw: Math.PI };
let fallen = -1; // seconds since he fell, or -1 while he stands
const FALLEN_FOR = 2.8;
const STILL = { move: { x: 0, y: 0 }, walk: false, sprint: false, strafe: false, jump: false, attack: false, dodge: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' };
// what can be struck: the wolves, and anything put up to practise on (lab.dummy)
const foes = encounters.all;
const combat = new Combat({ player, sword, health, targets: () => foes });
/** A bite: `from` is where it came from. */
function hurt(amount, from = null) {
  if (!health.hurt(amount)) return false;
  hud.hurt();
  sound?.knocks.snap();
  if (health.dead) { voices?.play('death'); voices?.play('fall', { delay: 0.7 }); } else voices?.play('pain');
  combat.hurt(from ?? player.feet.clone().add(player.facing()));
  if (health.dead) { fallen = 0; hud.veil(true); }
  return true;
}
function wake() {
  place(checkpoint.x, checkpoint.z, checkpoint.yaw);
  follow.yaw = checkpoint.yaw; follow.pivot.set(0, 0, 0);
  health.fill();
  health.shield(1.5);
  fallen = -1;
  hud.veil(false);
  combat.rise();
  encounters.reset();
}
/** A resting point here: where he will wake if he falls, with his health given back. */
function rest(x, z, yaw) {
  Object.assign(checkpoint, { x, z, yaw });
  health.fill();
}

const size = new THREE.Vector2();
// Through his own eyes: always in the cabin and on its doorstep, where there is no room for an eye behind him,
// and anywhere else with V. `first` is how far the eye has gone over to it, 0..1.
let first = 0, firstKey = false;
const outlook = new THREE.Vector3(), eyeAt = new THREE.Vector3(), gaze = new THREE.Vector3();
addEventListener('keydown', (e) => { if (e.code === 'KeyV') firstKey = !firstKey; });
// --- what it sounds like (src/game/audio.js, src/game/synth.js): silent in stills and films ---
const audio = createAudio({ camera, silent: capture || q.has('clean') });
const sound = audio && { wind: createWind(audio), steps: createSteps(audio), fire: createFire(audio), swish: createSwish(audio), knocks: createKnocks(audio), music: createMusic(audio) };
// the recorded ones: wolves, his breath, blows (src/game/sounds.js)
const voices = audio ? await loadSounds(audio) : null;
const heard = { pinned: { l: true, r: true }, shelter: 0, n: 0 };
// the button in the corner (and M) turns it all off and on, and is remembered
{
  const button = document.querySelector('[data-sound]');
  if (audio && button) {
    const show = () => { button.textContent = t(audio.muted ? 'sound.off' : 'sound.on'); button.classList.toggle('on', !audio.muted); };
    const flip = () => { audio.mute(!audio.muted); show(); };
    button.hidden = false;
    button.addEventListener('click', flip);
    addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) flip(); });
    onLang(show);
  } else button?.remove();
}
const fireAt = new THREE.Vector3();
/** Each frame, after he has moved and the eye is set: the air, his steps, the fire. */
function listen(dt, onGround, isIn) {
  if (!sound) return;
  const p = player.feet;
  // the wind: as hard as it blows where he stands, quieter among the spruces, heard from the side it comes from
  if (heard.n++ % 15 === 0) {
    let near = 0;
    for (const t of pines.colliders) if (Math.abs(t.x - p.x) < 12 && Math.abs(t.z - p.z) < 12) near++;
    heard.shelter = Math.min(1, near / 14);
  }
  camera.getWorldDirection(looking);
  const side = -(wind.x * -looking.z + wind.z * looking.x) / Math.hypot(looking.x, looking.z || 1e-6);
  sound.wind.update(dt, gustAt(p.x, p.z), heard.shelter, side);
  // a step each time a heel lands
  const feet = animator.feetInfo;
  const kind = combat.kind;
  for (const s of ['l', 'r']) {
    const now = !!feet?.[s]?.pinned;
    if (now && !heard.pinned[s] && onGround && (player.speed > 0.3 || kind === 'attack' || kind === 'rec')) sound.steps.step(s, Math.max(player.speed, 2), isIn);
    heard.pinned[s] = now;
  }
  audio.indoors(isIn ? 1 : 0);
  fireAt.set(shared.uFire.value.x, shared.uFire.value.y, shared.uFire.value.z);
  const near = isIn ? 1 : Math.max(0, 1 - p.distanceTo(fireAt) / 16) ** 2;
  sound.fire.update(dt, near, isIn ? 1 : 0);
  sound.swish.update(dt, sword.speed, combat.swinging);
  // a circling wolf growls now and then, from where it is
  for (const w of encounters.all) {
    if (w.state !== 'circle') continue;
    w.growlIn = (w.growlIn ?? 0.6 + Math.random()) - dt;
    if (w.growlIn < 0) { voices?.play('growl', { follow: w.pos }); w.growlIn = 1.6 + Math.random() * 2; }
  }
  voices?.update();
  // the music breathes with the aurora, and tightens while a fight is on
  sound.music.update(dt, { glow: shared.uGlow.value.x, intensity: encounters.running ? 1 : 0 });
}
/** What he and the wolves do, heard: called with each frame's events. */
function voice(e) {
  if (!voices) return;
  switch (e.type) {
    case 'strike': if (e.step === 2 || Math.random() < 0.6) voices.play('effort'); break;
    case 'hit': voices.play('flesh', { gain: e.heavy ? 1.2 : 0.9 }); break;
    case 'roll': sound.knocks.roll(); break;
    case 'start': voices.play('howl', { at: encounters.defs[e.index].wolves[0].pos }); break;
    case 'crouch': voices.play('snarl', { follow: e.wolf.pos }); break;
    case 'spring': voices.play('bark', { follow: e.wolf.pos }); break;
    case 'hurt': voices.play('yelp', { follow: e.wolf.pos, delay: 0.03 }); break;
    case 'down': voices.play('whine', { follow: e.wolf.pos, delay: 0.15 }); voices.play('fall', { at: e.wolf.pos, delay: 0.45 }); break;
  }
}

// --- the danger focus: in the first fight and the last, the moment a wolf comes into sight the world slows, the
// eye turns to it and narrows, he turns to face it, and the sound dulls; then all of it lets go ---
const FOCUS = { at: [0, FIGHTS.length - 1], length: 1.35, pace: 0.25 };
const focus = { t: -1, wolf: null, done: new Set(), amount: 0 };
const sight = new THREE.Vector3();
const toWolf = new THREE.Vector3(), eyeTry = new THREE.Vector3();
/** Whether from `eye` all of the wolf can be seen, down to its feet: no ground and no spruce in between. */
function clearTo(eye, w) {
  toWolf.set(w.pos.x, w.pos.y + 0.15, w.pos.z);
  for (let k = 1; k < 12; k++) {
    sight.lerpVectors(eye, toWolf, k / 12);
    if (heightAt(sight.x, sight.z) > sight.y - 0.05) return false;
  }
  return !pines.hides(eye, w.position) && !pines.hides(eye, toWolf);
}
/** Where over his shoulder the eye goes to see wolf w: [side, height], tried right then left, low then high. */
const SHOULDERS = [[1.5, 2.1], [-1.5, 2.1], [1.6, 3.2], [-1.6, 3.2], [2.6, 2.6], [-2.6, 2.6]];
function shoulderAt(w, side, up, out) {
  const dx = w.pos.x - player.feet.x, dz = w.pos.z - player.feet.z, l = Math.hypot(dx, dz) || 1;
  out.set(player.feet.x - (dx / l) * 3.2 - (dz / l) * side, player.feet.y + up, player.feet.z - (dz / l) * 3.2 + (dx / l) * side);
  out.y = Math.max(out.y, heightAt(out.x, out.z) + 0.6);
  return out;
}
/** The first shoulder from which the wolf, near enough, can be seen whole; null if none. */
function shoulderFor(w) {
  if (w.pos.distanceTo(player.feet) > 20) return null;
  return SHOULDERS.find(([side, up]) => clearTo(shoulderAt(w, side, up, eyeTry), w)) ?? null;
}
/** Real seconds in: how fast the world runs now (1 normal), and starts a focus when one is due. */
function focusPace(realDt) {
  if (focus.t < 0) {
    const i = encounters.index;
    if (!encounters.running || focus.done.has(i) || !FOCUS.at.includes(i) || health.dead) return 1;
    let shoulder = null;
    const w = encounters.current.wolves.find((w) => w.alive && (shoulder = shoulderFor(w)));
    if (!w) return 1;
    focus.done.add(i); focus.t = 0; focus.wolf = w; focus.shoulder = shoulder;
    // the further off it is, the more the eye narrows on it
    focus.narrow = THREE.MathUtils.clamp(4 + 0.75 * w.pos.distanceTo(player.feet), 7, 19);
  }
  focus.t += realDt;
  const t = focus.t, L = FOCUS.length;
  if (t > L) { focus.t = -1; focus.wolf = null; focus.amount = 0; return 1; }
  // in fast, held, out slower
  focus.amount = t < 0.15 ? t / 0.15 : t > L - 0.4 ? (L - t) / 0.4 : 1;
  focus.amount = focus.amount * focus.amount * (3 - 2 * focus.amount);
  return 1 - (1 - FOCUS.pace) * focus.amount;
}

let holdW = 1; // how much of his left arm is given to holding the lantern out, 0..1
function tick(dt) {
  dt = Math.min(dt, 1 / 20);
  // a blow that lands holds the world a moment
  if (combat.hitstop > 0) { combat.hitstop -= dt; dt *= 0.1; }
  const realDt = dt, pace = focusPace(realDt);
  dt *= pace;
  audio?.slow(pace);
  time += dt;
  health.update(dt);
  if (fallen >= 0 && (fallen += dt) > FALLEN_FOR) wake();
  // read even while he lies there, so nothing pressed meanwhile is kept for after
  const inp = fallen >= 0 ? (input.read(dt), STILL) : input.read(dt);
  const isIn = cabin.inside(player.feet);
  first += ((firstKey || cabin.threshold(player.feet) ? 1 : 0) - first) * (1 - Math.exp(-6 * dt));
  const fp = first * first * (3 - 2 * first);
  cabin.update(time);
  combat.update(dt, inp, follow.yaw);
  player.update(dt, inp, follow.yaw);
  const kind = combat.kind; // what action he is in, if any
  // off the ridge and into the fjord, or off the map: he starts again from the last resting point
  if (player.feet.y < 1.5 || Math.max(Math.abs(player.feet.x), Math.abs(player.feet.z)) > EXTENT - 30) place(checkpoint.x, checkpoint.z, checkpoint.yaw);
  const root = player.visualRoot(dt);
  man.object.position.copy(root);
  man.object.rotation.set(0, player.yaw, 0);
  man.object.updateMatrixWorld(true);
  const local = player.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -player.yaw);
  animator.update(dt, { speed: player.mode === 'move' ? player.speed : Math.hypot(local.x, local.z), moveAngle: player.moveAngle, grounded: player.grounded });
  animator.relaxHands(player.speed);
  animator.uprightTrunk(dt, player.speed, kind ? 0 : player.grounded && player.mode !== 'jump' && player.mode !== 'air' ? 1 : 0.3);
  const lookW = player.mode === 'move' || player.mode === 'idleExtra' ? THREE.MathUtils.clamp(1 - (player.speed - 1.5) / 2, 0, 1) : 0;
  animator.lookToward(dt, camera.getWorldDirection(new THREE.Vector3()), lookW);
  animator.armClearance(dt);
  if (player.mode === 'move' && !player.strafe) animator.leanInto(dt, player.turnRate, player.speed, player.accelF);
  else animator.leanInto(dt, 0, 0, 0);
  const onGround = player.grounded && player.mode !== 'jump' && player.mode !== 'air';
  // feet are set on the ground under a stroke of the sword, not in a roll or a fall
  const feetW = !onGround ? 0 : kind == null ? 1 : kind === 'attack' || kind === 'rec' || kind === 'hurt' ? 0.6 : 0;
  animator.placeFeet(dt, (x, z, from) => player.ground(x, z, from, 1.4), root.y, feetW);
  man.object.updateMatrixWorld(true);
  holdW += ((kind == null ? 1 : kind === 'attack' || kind === 'rec' ? 0.4 : 0) - holdW) * (1 - Math.exp(-10 * dt));
  holdLantern(holdW);
  fist('r');
  sword.hold(man.bones);
  sword.update(dt, combat.swinging);
  combat.resolve();
  for (const e of combat.events) voice(e);
  // the wolves move, and bite
  for (const e of encounters.update(dt, player.feet)) {
    voice(e);
    if (e.type === 'bite') hurt(e.damage, e.from);
    else if (e.type === 'start') hud.say(e.index === 0 ? 'tut.fight' : e.index === FIGHTS.length - 1 ? 'wolves.two' : 'wolves.come', 4);
    else if (e.type === 'won') {
      rest(player.feet.x, player.feet.z, player.yaw);
      hud.say(encounters.done ? 'wolves.gone' : 'checkpoint', 3.5);
    }
  }
  figure.updateCloak(dt, air, heightAt);
  lantern.update(dt, grip, player.yaw);
  if (!isIn) tracks.update(root, player.yaw, player.speed, onGround);
  listen(dt, onGround, isIn);

  // in a focus the eye swings round to the wolf, quickly but not at once, and he turns to it too
  if (focus.wolf) {
    const to = Math.atan2(focus.wolf.pos.x - player.feet.x, focus.wolf.pos.z - player.feet.z);
    const turn = (a, rate) => a + THREE.MathUtils.clamp(Math.atan2(Math.sin(to - a), Math.cos(to - a)), -rate * realDt, rate * realDt);
    follow.yaw = turn(follow.yaw, 4.5 * focus.amount);
    if (player.mode === 'move') player.yaw = turn(player.yaw, 6 * focus.amount);
  }
  // a trunk between the eye and him brings the eye in; over the ground it rises instead
  follow.update(dt, root, inp.look, inp.zoom, (o, d, max) => {
    let hit = player.castRay(o, d, max);
    if (hit != null && o.y + d.y * hit - heightAt(o.x + d.x * hit, o.z + d.z * hit) < 0.5) hit = null;
    const tree = pines.block(o, d, max);
    return tree != null && (hit == null || tree < hit) ? tree : hit;
  }, (x, z) => heightAt(x, z) + 0.55);
  // in a focus the eye goes over his shoulder (whichever sees the wolf) and looks at it: he to one side, it in the middle
  if (focus.wolf) {
    const w = focus.wolf;
    camera.position.lerp(shoulderAt(w, focus.shoulder[0], focus.shoulder[1], eyeTry), focus.amount);
    camera.getWorldDirection(gaze);
    sight.set(focus.wolf.pos.x, focus.wolf.pos.y + 0.45, focus.wolf.pos.z).sub(camera.position).normalize();
    gaze.lerp(sight, focus.amount).normalize();
    camera.lookAt(sight.copy(camera.position).add(gaze));
  }
  if (fp > 0.002) {
    // the eye comes forward into his head and looks where the mouse has it look
    const cp = Math.cos(follow.pitch), sp = Math.sin(follow.pitch);
    gaze.set(Math.sin(follow.yaw) * cp, -sp, Math.cos(follow.yaw) * cp);
    eyeAt.set(root.x + Math.sin(follow.yaw) * 0.08, root.y + 1.66, root.z + Math.cos(follow.yaw) * 0.08);
    camera.getWorldDirection(outlook).multiplyScalar(6).add(camera.position);
    camera.position.lerp(eyeAt, fp);
    camera.lookAt(outlook.lerp(eyeAt.addScaledVector(gaze, 6), fp));
  }
  // seen from so close the picture is wider, and nothing of him is in it: the lantern's light is, the lantern isn't
  lantern.object.visible = lantern.glow.visible = fp < 0.5;
  sword.object.visible = sword.dabs.visible = sword.trail.visible = fp < 0.5;
  camera.fov = 46 + 18 * fp - (focus.narrow ?? 0) * focus.amount;
  camera.near = 0.3 - 0.2 * fp;
  camera.updateProjectionMatrix();
  man.object.visible = figure.cloakMesh.visible = figure.dabs.visible = fp < 0.5;
  camera.updateMatrixWorld(true);
  renderer.getDrawingBufferSize(size);
  shared.uTime.value = time;
  shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / size.y;
  shared.uFocus.value.copy(root);
  // the aurora breathes: brighter and dimmer over a minute or so, and the snow under it with it
  shared.uGlow.value.x = 1.0 + 0.2 * Math.sin(time * 0.11) + 0.1 * Math.sin(time * 0.37 + 1.0) + 0.07 * Math.sin(time * 1.1 + 2.0);
  snow.follow(camera.position.x, camera.position.z);
  shade.update(scene, root);
  frame.render(scene, camera);
  camera.getWorldDirection(looking);
  objective.update(player.feet, bearingOf(looking.x, looking.z), hud);
  hud.life(health.share);
  // a bar over the wolf he is turned to, or the one he struck last
  const foe = [combat.target, ...combat.events.map((e) => e.target)].find((w) => w?.alive);
  if (foe && foe.position.distanceTo(player.feet) < 14) {
    looking.copy(foe.position); looking.y += 0.55;
    looking.project(camera);
    hud.foe(looking.z < 1 ? ((looking.x + 1) / 2) * innerWidth : null, ((1 - looking.y) / 2) * innerHeight, foe.share);
  } else hud.foe(null);
}

window.lab = {
  THREE, player, follow, camera, input, animator, figure, shared, frame, renderer, timings, counts: { ...snow.counts, ...pines.counts, ...cabin.counts }, cabin, heightAt, crestX, tracks, sky, hud, objective, health, combat, sword, foes, encounters, FIGHTS, audio, sound, voices, focus,
  /** Puts him just short of fight i (earlier ones counted as won), facing north. */
  fight(i) {
    for (let k = 0; k < encounters.defs.length; k++) for (const w of encounters.defs[k].wolves) w.place(w.pos.x, w.pos.z, 0);
    encounters.index = i; encounters.running = false;
    const z = FIGHTS[i].at + 3;
    place(crestX(z), z, Math.PI); follow.yaw = Math.PI; follow.pivot.set(0, 0, 0);
    rest(crestX(z), z, Math.PI);
  },
  /** A post to practise on at (x, z): it takes blows like a wolf would and says how many. */
  dummy(x, z, hp = 100) {
    const y = heightAt(x, z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 10), new THREE.MeshBasicMaterial({ color: 0x3a2a22 }));
    mesh.position.set(x, y + 0.7, z);
    scene.add(mesh);
    const d = { alive: true, hp, blows: 0, radius: 0.36, position: new THREE.Vector3(x, y + 0.8, z), body: [new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(x, y + 1.35, z)], mesh,
      hit(damage) { d.hp -= damage; d.blows++; if (d.hp <= 0) { d.alive = false; mesh.material.color.setHex(0x8a2a22); } } };
    foes.push(d);
    return d;
  },
  /** Bites him for `amount` (as a wolf would). */
  hurt(amount = 25) { return hurt(amount); },
  /** A resting point where he stands now. */
  checkpoint() { rest(player.feet.x, player.feet.z, player.yaw); return { ...checkpoint }; },
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) tick(dt); },
  setInput(fn) { input.override = fn; },
  /** Puts him at (x, z) on the ground, facing (fx, fz), with the eye behind him. */
  teleport(x, z, fx, fz) {
    place(x, z, Math.atan2(fx - x, fz - z));
    follow.yaw = player.yaw; follow.pivot.set(0, 0, 0);
    tick(1 / 60);
  },
  /** A fixed view for stills: eye and what it looks at. Call with nothing to go back to following him. */
  view(eye, target) { follow.free = eye ? { position: new THREE.Vector3(...eye), target: new THREE.Vector3(...target) } : null; },
  /** Moves the clock on without moving him, to see the sky at another moment. */
  wait(seconds) { time += seconds; },
  /** Through his eyes (true) or from behind him (false), as V does. */
  first(on) { firstKey = on; },
  /** His tracks along the crest from z0 to z1, as if he had walked it. */
  trail(z0, z1) { tracks.lay(crestX, z0, z1); },
};

say(0.68, 'Mixing paint');
function gpuDone() {
  const gl = renderer.getContext();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return void setTimeout(poll, 4);
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
}
if (!capture) {
  renderer.debug.checkShaderErrors = false;
  await renderer.compileAsync(scene, camera);
  lap('shaders');
  say(0.86, 'Mixing paint');
}
for (let i = 0; i < (capture ? 1 : 5); i++) {
  tick(1 / 60);
  if (capture) break;
  await gpuDone();
  say(0.88 + 0.025 * i, 'First strokes');
  await turn();
}
lap('first frame');

let running = false;
let last = 0;
function run() {
  const want = shown && !capture;
  if (want === running) return;
  running = want;
  last = performance.now();
  renderer.setAnimationLoop(want ? () => { const now = performance.now(); tick((now - last) / 1000); last = now; } : null);
}
if (!capture) {
  const hint = document.getElementById('hint');
  onLang(() => { hint.textContent = t('hint.aurora'); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyH') hint.classList.toggle('off'); });
  setTimeout(() => hint.classList.add('faded'), 9000);
  setTimeout(() => hud.say(objective.goal, 6), 1500);
}
fitView();
loaded = true;
run();
document.getElementById('loading')?.remove();
if (q.has('clean') || capture) document.getElementById('hint')?.remove();
block.ready();
window.lab.ready = true;
window.__block = { ready: true, block, timings, set() {} };
