// What the scene sounds like: one audio context behind the eye (three's AudioListener on the camera), and the
// buses everything goes through.
//
//   ambience  the open air: wind, snow. Muffled when he is indoors.
//   sfx       his steps, his sword, blows; with a send to a small room's echo while he is indoors
//   voice     wolves and him
//   music     never muffled
//
// Over all of it sits one low-pass, which is how slow motion sounds (slow(k)). Browsers keep audio silent until
// the page is clicked or a key is pressed; the context is woken by the first one. Stills and films (?capture,
// ?clean) are silent unless ?sound asks; a choice to mute is remembered (localStorage, when it can be).
import * as THREE from 'three';

const KEY = 'oilpaint.sound';
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = (v) => { try { localStorage.setItem(KEY, v); } catch { /* forgotten, that's all */ } };

/** A buffer of white noise, `seconds` long, made once and looped by whoever needs it. */
function noiseBuffer(ctx, seconds = 4) {
  const b = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return b;
}

/** An impulse for a small timber room: a short, soft, darkening tail. */
function roomImpulse(ctx, seconds = 0.55) {
  const n = Math.round(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * t); // darker as it dies
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.004 ? i / (ctx.sampleRate * 0.004) : 1);
    }
  }
  return b;
}

export function createAudio({ camera, silent = false }) {
  const q = new URLSearchParams(location.search);
  const forced = q.has('sound');
  if (silent && !forced) return null;
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const ctx = listener.context;
  const input = listener.getInput();

  // slow motion: everything darkens through one filter at the end; then a limiter, so that a snarl, a blow
  // and a cry together never break up
  const dull = ctx.createBiquadFilter();
  dull.type = 'lowpass'; dull.frequency.value = 20000; dull.Q.value = 0.5;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -8; limit.knee.value = 6; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.2;
  listener.gain.disconnect();
  listener.gain.connect(dull); dull.connect(limit); limit.connect(ctx.destination);

  const bus = (to = input) => { const g = ctx.createGain(); g.connect(to); return g; };
  // the open air is heard through a wall when he is in
  const wall = ctx.createBiquadFilter();
  wall.type = 'lowpass'; wall.frequency.value = 20000; wall.Q.value = 0.3;
  wall.connect(input);
  const ambience = bus(wall);
  const sfx = bus();
  const voice = bus(wall);
  const music = bus();
  // the room's echo, sent to from sfx while indoors
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const roomSend = ctx.createGain();
  roomSend.gain.value = 0;
  sfx.connect(roomSend); roomSend.connect(room); room.connect(input);

  const noise = noiseBuffer(ctx);
  let muted = remembered() === 'off';
  listener.setMasterVolume(muted ? 0 : 1);
  // the first click or key wakes it
  const wake = () => { if (ctx.state !== 'running') ctx.resume(); };
  for (const e of ['pointerdown', 'keydown', 'touchstart']) addEventListener(e, wake, { capture: true });

  let indoors = 0, slowK = 1;
  return {
    ctx, listener, noise, bus: { ambience, sfx, voice, music },
    get running() { return ctx.state === 'running'; },
    get muted() { return muted; },
    /** Turns all of it on or off, and remembers. */
    mute(on) {
      muted = on;
      remember(on ? 'off' : 'on');
      listener.gain.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
    },
    /** How far indoors he is, 0..1: the air outside goes behind a wall and steps take the room's echo. */
    indoors(k) {
      if (Math.abs(k - indoors) < 0.01) return;
      indoors = k;
      const t = ctx.currentTime;
      wall.frequency.setTargetAtTime(20000 * Math.pow(450 / 20000, k), t, 0.08);
      roomSend.gain.setTargetAtTime(0.55 * k, t, 0.08);
    },
    /** Slow motion: k is the game's pace (1 normal, 0.25 slow); the sound dulls with it. */
    slow(k) {
      if (Math.abs(k - slowK) < 0.01) return;
      slowK = k;
      dull.frequency.setTargetAtTime(20000 * Math.pow(k, 2.6), ctx.currentTime, 0.06);
    },
    get pace() { return slowK; },
  };
}
