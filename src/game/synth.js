// Sounds made in code, as the pictures are: nothing is recorded. Each is tied to what the scene is doing, so the
// ear and the eye agree: the wind blows as hard as the snow in the air says, a step sounds when a heel lands.
//
//   createWind   a roar under everything, a body of rushing air, a whistle in the strongest gusts, the hiss of
//                blown snow; the wind's side is heard from where it comes
//   createSteps  a crunch of snow for each step (eight of them, made once), or a knock of boards indoors
//   createFire   the cabin's fire: a low breath and crackles, behind the wall until he is in
const rand = (a, b) => a + Math.random() * (b - a);

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = frequency; f.Q.value = Q;
  return f;
}
function gain(ctx, value = 0) { const g = ctx.createGain(); g.gain.value = value; return g; }
function loop(ctx, buffer, offset = 0) {
  const s = ctx.createBufferSource();
  s.buffer = buffer; s.loop = true;
  s.start(0, offset % buffer.duration);
  return s;
}

/** The wind. update(gust 0..1, shelter 0..1 among trees, side -1..1 where it comes from). */
export function createWind(audio) {
  const { ctx, noise, bus } = audio;
  const pan = ctx.createStereoPanner();
  pan.connect(bus.ambience);
  const layer = (type, f, Q, offset) => {
    const g = gain(ctx), flt = filter(ctx, type, f, Q);
    loop(ctx, noise, offset).connect(flt); flt.connect(g); g.connect(pan);
    return { g, f: flt };
  };
  const rumble = layer('lowpass', 140, 0.6, 0);
  const body = layer('bandpass', 520, 0.7, 1.3);
  const whistle = layer('bandpass', 900, 11, 2.1);
  const hiss = layer('highpass', 4200, 0.5, 2.9);
  let wobble = 0;
  return {
    update(dt, gust, shelter, side) {
      const t = ctx.currentTime, tc = 0.35;
      wobble += dt;
      const open = 1 - 0.65 * shelter;
      rumble.g.gain.setTargetAtTime(0.5 * (0.45 + 0.8 * gust), t, tc);
      body.g.gain.setTargetAtTime(0.32 * (0.15 + 1.2 * gust * gust) * open, t, tc);
      body.f.frequency.setTargetAtTime((380 + 520 * gust) * (1 - 0.35 * shelter), t, tc);
      // the whistle only sings in the strong gusts, and wanders in pitch as they do
      const sing = Math.max(0, gust - 0.55) / 0.45;
      whistle.g.gain.setTargetAtTime(0.11 * sing * sing * open, t, tc);
      whistle.f.frequency.setTargetAtTime(760 + 420 * gust + 90 * Math.sin(wobble * 0.7), t, tc);
      hiss.g.gain.setTargetAtTime(0.1 * gust * gust * open, t, tc);
      pan.pan.setTargetAtTime(Math.max(-0.6, Math.min(0.6, side * 0.6)), t, 0.5);
    },
  };
}

// --- steps ---------------------------------------------------------------------------------------
/** One step in snow: many small grains of crust breaking over a tenth of a second, over a soft thud. */
function crunch(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 0.22);
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const span = 0.09 + 0.05 * Math.random();
  for (let g = 0, grains = 70 + Math.floor(Math.random() * 40); g < grains; g++) {
    const t0 = Math.floor(Math.pow(Math.random(), 1.6) * span * sr);
    const amp = (1 - t0 / (span * sr * 1.2)) * rand(0.2, 1);
    const len = Math.floor(rand(20, 140));
    for (let k = 0; k < len && t0 + k < n; k++) d[t0 + k] += amp * (Math.random() * 2 - 1) * Math.exp(-k / (len * 0.3));
  }
  // take the harshest top off, and lay a soft weight under it
  let lp = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    lp += (d[i] - lp) * 0.55;
    d[i] = lp + 0.35 * Math.sin((i / sr) * 2 * Math.PI * 85) * Math.exp(-i / (sr * 0.025));
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
  return b;
}
/** One step on boards: a knock and the boom of the hollow under them. */
function knock(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 0.18);
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const f = rand(95, 125);
  let lp = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += ((Math.random() * 2 - 1) - lp) * 0.2;
    d[i] = Math.sin(t * 2 * Math.PI * f) * Math.exp(-t / 0.045) + 0.5 * lp * Math.exp(-t / 0.012) + 0.25 * Math.sin(t * 2 * Math.PI * f * 2.7) * Math.exp(-t / 0.02);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
  return b;
}

export function createSteps(audio) {
  const { ctx, bus } = audio;
  const snow = Array.from({ length: 8 }, () => crunch(ctx));
  const boards = Array.from({ length: 4 }, () => knock(ctx));
  let last = -1;
  return {
    count: 0,
    /** A heel has landed: side 'l' or 'r', how fast he goes (m/s), whether on boards. */
    step(side, speed, indoors) {
      const set = indoors ? boards : snow;
      let i = Math.floor(Math.random() * set.length);
      if (i === last) i = (i + 1) % set.length;
      last = i;
      const s = ctx.createBufferSource();
      s.buffer = set[i];
      s.playbackRate.value = rand(0.92, 1.08) * (speed > 3 ? 1.06 : 1) * audio.pace ** 0.5;
      const g = gain(ctx, Math.min(0.55, 0.18 + 0.07 * speed) * (indoors ? 0.7 : 1));
      const p = ctx.createStereoPanner();
      p.pan.value = side === 'l' ? -0.12 : 0.12;
      s.connect(g); g.connect(p); p.connect(bus.sfx);
      s.start();
      this.count++;
    },
  };
}

// --- the fire ------------------------------------------------------------------------------------
function crackleBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 0.06);
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let p = 0, pops = 1 + Math.floor(Math.random() * 4); p < pops; p++) {
    const t0 = Math.floor(Math.random() * n * 0.6), len = Math.floor(rand(15, 90)), amp = rand(0.3, 1);
    for (let k = 0; k < len && t0 + k < n; k++) d[t0 + k] += amp * (Math.random() * 2 - 1) * Math.exp(-k / (len * 0.25));
  }
  return b;
}

/** The fire. update(dt, near 0..1 how close and inside he is, indoors 0..1). */
export function createFire(audio) {
  const { ctx, noise, bus } = audio;
  const out = gain(ctx);
  const muffle = filter(ctx, 'lowpass', 600, 0.5);
  out.connect(muffle); muffle.connect(bus.sfx);
  const breath = filter(ctx, 'lowpass', 260, 0.8), breathG = gain(ctx, 0.35);
  loop(ctx, noise, 0.7).connect(breath); breath.connect(breathG); breathG.connect(out);
  const pops = Array.from({ length: 8 }, () => crackleBuffer(ctx));
  let level = 0;
  return {
    update(dt, near, indoors) {
      const t = ctx.currentTime;
      level = near;
      out.gain.setTargetAtTime(0.6 * near, t, 0.2);
      muffle.frequency.setTargetAtTime(600 + 9000 * indoors, t, 0.15);
      breathG.gain.setTargetAtTime(0.3 + 0.15 * Math.sin(t * 1.7) * Math.sin(t * 0.43), t, 0.3);
      // crackles come at random, a few a second
      if (level > 0.01 && Math.random() < dt * 7) {
        const s = ctx.createBufferSource();
        s.buffer = pops[Math.floor(Math.random() * pops.length)];
        s.playbackRate.value = rand(0.7, 1.4);
        const g = gain(ctx, rand(0.15, 0.6));
        s.connect(g); g.connect(out);
        s.start();
      }
    },
  };
}

// --- the sword --------------------------------------------------------------------------------------
/**
 * The sword through the air: a rush of noise that rises in pitch and strength with the speed of the point, so
 * every stroke sounds as fast as it is drawn. update(dt, speed m/s, swinging).
 */
export function createSwish(audio) {
  const { ctx, noise, bus } = audio;
  const out = gain(ctx);
  out.connect(bus.sfx);
  const body = filter(ctx, 'bandpass', 600, 1.4), bodyG = gain(ctx, 1);
  const edge = filter(ctx, 'bandpass', 2400, 3), edgeG = gain(ctx, 0.35);
  loop(ctx, noise, 1.7).connect(body); body.connect(bodyG); bodyG.connect(out);
  loop(ctx, noise, 3.1).connect(edge); edge.connect(edgeG); edgeG.connect(out);
  return {
    update(dt, speed, swinging) {
      const t = ctx.currentTime;
      const v = swinging ? Math.min(1, Math.max(0, (speed - 5) / 45)) : 0;
      out.gain.setTargetAtTime(0.55 * Math.pow(v, 1.2), t, v > 0 ? 0.012 : 0.05);
      body.frequency.setTargetAtTime(320 + 1500 * v, t, 0.02);
      edge.frequency.setTargetAtTime(1500 + 3200 * v, t, 0.02);
    },
  };
}
