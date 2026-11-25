// Music made in code, as everything else here is: a slow, cold ambient piece that never quite repeats.
//
//   a drone       low D and its fifth, always there, very quiet
//   pads          four-note chords in D Dorian, one every ten to fourteen seconds, each swelling in and dying away
//                 over the next, through a long reverb; brighter while the aurora is
//   shimmer       now and then a high bell-like note from the pentatonic scale, more often under a bright sky
//   in a fight    (intensity 0..1) a heartbeat-like pulse comes in under it, the pads open and a held tension
//                 tone (a minor second) rises; all of it goes again once the fight is won
//
// update(dt, { glow, intensity }) each frame; it schedules its own notes a little ahead on the audio clock.
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

// D Dorian, voiced open: (root, then the notes above it)
const CHORDS = [
  [50, 57, 64, 65], // Dm(add9)
  [46, 53, 60, 62], // Bb(add9)
  [48, 55, 62, 64], // C(add9)
  [43, 50, 57, 62], // G sus
  [45, 52, 60, 64], // Am7
  [41, 48, 57, 60], // F
];
const SHIMMER = [74, 76, 77, 79, 81, 84, 86]; // high D Dorian, mostly pentatonic

/** A long, dark reverb for the music: four seconds of noise dying away, darkening as it goes. */
function hallImpulse(ctx, seconds = 4.2) {
  const n = Math.round(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.35 - 0.3 * t);
      d[i] = lp * Math.pow(1 - t, 2.2);
    }
  }
  return b;
}

export function createMusic(audio) {
  const { ctx, bus } = audio;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(bus.music);
  // most of it goes through the hall; a little is heard dry
  const hall = ctx.createConvolver();
  hall.buffer = hallImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.85;
  const dry = ctx.createGain(); dry.gain.value = 0.35;
  hall.connect(wet); wet.connect(out); dry.connect(out);
  const send = ctx.createGain();
  send.connect(hall); send.connect(dry);
  // the pads' shared tone: darker or brighter with the sky
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 900; tone.Q.value = 0.4;
  tone.connect(send);

  // the drone
  const drone = ctx.createGain(); drone.gain.value = 0.11; drone.connect(tone);
  for (const [n, type, g] of [[38, 'sine', 1], [45, 'sine', 0.5], [50, 'triangle', 0.18]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n);
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(drone); o.start();
  }

  // the tension tone and the pulse, for fights
  const tension = ctx.createGain(); tension.gain.value = 0; tension.connect(send);
  for (const n of [62, 63]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = rand(-6, 6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const og = ctx.createGain(); og.gain.value = 0.07;
    o.connect(f); f.connect(og); og.connect(tension); o.start();
  }
  const pulse = ctx.createGain(); pulse.gain.value = 0; pulse.connect(dry); pulse.connect(hall);

  /** One pad chord: two slightly detuned voices a note, swelling in over `rise`, holding, dying over `fall`. */
  function chord(notes, at, hold) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.06, at + 4.5);
    g.gain.setValueAtTime(0.06, at + hold);
    g.gain.linearRampToValueAtTime(0, at + hold + 6);
    g.connect(tone);
    for (const n of notes) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = n < 48 ? 'triangle' : 'sawtooth';
        o.frequency.value = midi(n); o.detune.value = det + rand(-2, 2);
        const og = ctx.createGain(); og.gain.value = n < 48 ? 0.9 : 0.35;
        o.connect(og); og.connect(g);
        o.start(at); o.stop(at + hold + 6.1);
      }
    }
  }
  /** A bell-like note high up: a sine and its bright partial, struck and ringing away. */
  function bell(n, at, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3.5);
    g.connect(send);
    for (const [mul, k] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n) * mul;
      const og = ctx.createGain(); og.gain.value = k;
      o.connect(og); og.connect(g); o.start(at); o.stop(at + 3.6);
    }
  }
  /** One beat of the pulse: a low thump falling in pitch, then its softer echo, like a heart. */
  function beat(at, level) {
    for (const [dt, k] of [[0, 1], [0.24, 0.6]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(90, at + dt); o.frequency.exponentialRampToValueAtTime(42, at + dt + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at + dt); g.gain.linearRampToValueAtTime(level * k, at + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dt + 0.35);
      o.connect(g); g.connect(pulse); o.start(at + dt); o.stop(at + dt + 0.4);
    }
  }

  let nextChord = 0, which = Math.floor(Math.random() * CHORDS.length), nextBell = 3, nextBeat = 0, fight = 0, started = false;
  return {
    get fight() { return fight; },
    update(dt, { glow = 1, intensity = 0 } = {}) {
      if (!audio.running) return;
      const now = ctx.currentTime;
      if (!started) { started = true; nextChord = now + 0.5; nextBeat = now; out.gain.setTargetAtTime(0.5, now, 3); }
      // after the page has been hidden a while, start again from now rather than catch up all at once
      if (nextChord < now - 1) nextChord = now + 0.5;
      if (nextBeat < now) nextBeat = now + 0.05;
      fight += (intensity - fight) * (1 - Math.exp(-dt / (intensity > fight ? 0.8 : 4)));
      tone.frequency.setTargetAtTime(500 + 700 * Math.max(0, glow - 0.8) / 0.5 + 900 * fight, now, 1.5);
      tension.gain.setTargetAtTime(1.7 * fight, now, 1.2);
      pulse.gain.setTargetAtTime(1.3 * fight, now, 0.8);
      // the next chord, a few seconds ahead: never the same twice, a step away more often than a leap
      if (now > nextChord - 1) {
        const hold = rand(9, 13);
        chord(CHORDS[which], nextChord, hold);
        which = (which + (Math.random() < 0.7 ? 1 : 2 + Math.floor(Math.random() * 3))) % CHORDS.length;
        nextChord += hold;
      }
      if (now > nextBell) {
        bell(SHIMMER[Math.floor(Math.random() * SHIMMER.length)], now + 0.05, 0.025 + 0.025 * Math.min(1, Math.max(0, glow - 0.9) * 3));
        nextBell = now + rand(2.5, 7) / Math.max(0.6, glow);
      }
      // the pulse is scheduled whether it is heard or not, so it comes in on the beat
      if (now > nextBeat - 0.2) { beat(nextBeat, 0.6); nextBeat += 60 / (64 + 18 * fight); }
    },
  };
}
