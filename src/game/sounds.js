// Recorded sounds: the living ones, which code makes badly (a wolf's howl, a man's breath). Each file is one
// recording from Freesound, all CC0 (LICENCE-NOTES.md), kept whole; a sound is a named set of cuts out of them
// ([file, start s, length s]), and each time it plays one of its cuts is chosen, never the same twice running.
// The recordings are of every loudness: each cut is measured once loaded and brought to one level (LEVEL, kept
// a decibel under full at its peak), so `gain` in the bank is only how loud it should be against the others.
//
// play(name, { at, gain, rate, follow }) plays it through the voice or effects bus. With `at` (a world point) it
// is heard from there, through an HRTF panner; `follow` (a Vector3 it reads each frame through update()) keeps it
// on a moving thing.
const FILES = {
  howl: 'wolf-howl-398430', growls: 'wolf-growls-434049', snarl: 'wolf-snarl-190595', bark: 'wolf-bark-420447',
  barks: 'wolf-barks-420451', yelps: 'wolf-yelps-160478', whines: 'wolf-whines-462660', efforts: 'man-efforts-803168',
  grunt1: 'man-grunt-1-257710', grunt2: 'man-grunt-2-257709', hurt1: 'man-hurt-1-342229', hurt3: 'man-hurt-3-342231',
  death: 'man-death-173126', hits: 'sword-hits-body-411122', stabs: 'sword-stabs-259542', falls: 'body-falls-snow-675895',
};

// name: { cuts: [[file, start, length]], bus, gain, ref (metres at which a placed sound is at full strength) }
const LEVEL = -20; // dB RMS every cut is brought to
const BANK = {
  howl: { cuts: [['howl', 0.95, 6.4]], bus: 'voice', gain: 1.0, ref: 16 },
  growl: { cuts: [['growls', 5.6, 1.15], ['growls', 1.85, 0.7], ['growls', 12.65, 0.5], ['growls', 3.05, 0.5]], bus: 'voice', gain: 0.5, ref: 3 },
  snarl: { cuts: [['snarl', 2.1, 1.1]], bus: 'voice', gain: 0.8, ref: 4 },
  bark: { cuts: [['bark', 0.0, 0.4], ['barks', 0.28, 0.4], ['barks', 1.73, 0.4], ['barks', 4.28, 0.3], ['barks', 5.62, 0.3]], bus: 'voice', gain: 0.7, ref: 4 },
  yelp: { cuts: [['yelps', 3.06, 0.6], ['yelps', 7.13, 0.5], ['yelps', 7.7, 0.7], ['yelps', 3.73, 0.3]], bus: 'voice', gain: 0.6, ref: 4 },
  whine: { cuts: [['whines', 1.48, 1.6], ['whines', 3.85, 0.95]], bus: 'voice', gain: 0.55, ref: 4 },
  effort: { cuts: [['efforts', 0.13, 0.35], ['efforts', 4.23, 0.3], ['efforts', 5.56, 0.55], ['efforts', 7.33, 0.35], ['efforts', 8.7, 0.3], ['efforts', 10.07, 0.4], ['efforts', 11.63, 0.4], ['grunt2', 0.2, 0.5], ['grunt1', 0.5, 0.55]], bus: 'sfx', gain: 0.4 },
  pain: { cuts: [['hurt1', 0.0, 0.45], ['hurt3', 0.1, 0.35], ['efforts', 13.4, 0.7]], bus: 'sfx', gain: 0.55 },
  death: { cuts: [['death', 0.5, 1.05]], bus: 'sfx', gain: 0.65 },
  flesh: { cuts: [['hits', 0.05, 0.6], ['stabs', 0.15, 0.3], ['stabs', 1.49, 0.3], ['stabs', 2.72, 0.3], ['stabs', 3.97, 0.3], ['stabs', 5.15, 0.3], ['stabs', 7.36, 0.3]], bus: 'sfx', gain: 0.6 },
  fall: { cuts: [['falls', 5.0, 0.4], ['falls', 10.6, 0.45], ['falls', 16.5, 0.55], ['falls', 22.38, 0.4]], bus: 'sfx', gain: 0.6, ref: 4 },
};

export async function loadSounds(audio, base = './sounds/') {
  const { ctx, bus } = audio;
  const buffers = {};
  await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
    try {
      const data = await (await fetch(`${base}${file}.mp3`)).arrayBuffer();
      buffers[key] = await ctx.decodeAudioData(data);
    } catch (e) { console.warn(`sound ${file} could not be read`, e); }
  }));
  // each cut's correction to LEVEL, held under -1 dB at its peak
  const trim = {};
  for (const [name, s] of Object.entries(BANK)) {
    trim[name] = s.cuts.map(([file, start, length]) => {
      const b = buffers[file];
      if (!b) return 1;
      const d = b.getChannelData(0), a = Math.floor(start * b.sampleRate), e = Math.min(d.length, Math.floor((start + length) * b.sampleRate));
      let sum = 0, peak = 1e-6;
      for (let i = a; i < e; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
      const rms = Math.sqrt(sum / Math.max(1, e - a)) || 1e-6;
      return Math.min(10 ** (LEVEL / 20) / rms, 10 ** (-1 / 20) / peak);
    });
  }
  const last = {};
  const placed = new Set(); // { panner, follow, until }
  const counts = {};
  return {
    counts,
    /** Plays one cut of `name`. Returns { stop() } or null. */
    play(name, { at = null, follow = null, gain = 1, rate = 1, delay = 0 } = {}) {
      const s = BANK[name];
      if (!s) return null;
      let i = Math.floor(Math.random() * s.cuts.length);
      if (s.cuts.length > 1 && i === last[name]) i = (i + 1) % s.cuts.length;
      last[name] = i;
      const [file, start, length] = s.cuts[i];
      const buffer = buffers[file];
      if (!buffer) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate * (0.96 + Math.random() * 0.08) * Math.sqrt(audio.pace);
      const g = ctx.createGain();
      const level = s.gain * gain * trim[name][i];
      g.gain.value = level;
      src.connect(g);
      let entry = null;
      const where = follow ?? at;
      if (where) {
        const p = ctx.createPanner();
        p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
        p.refDistance = s.ref ?? 3; p.rolloffFactor = 1.1; p.maxDistance = 400;
        p.positionX.value = where.x; p.positionY.value = where.y + 0.5; p.positionZ.value = where.z;
        g.connect(p); p.connect(bus[s.bus]);
        if (follow) { entry = { panner: p, follow, until: ctx.currentTime + delay + length / src.playbackRate.value + 0.1 }; placed.add(entry); }
      } else g.connect(bus[s.bus]);
      // a short fade at each end, so a cut never clicks
      const t0 = ctx.currentTime + delay, dur = length / src.playbackRate.value;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(level, t0 + 0.012);
      g.gain.setValueAtTime(level, t0 + Math.max(0.013, dur - 0.04));
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      src.start(t0, start, length + 0.02);
      counts[name] = (counts[name] ?? 0) + 1;
      return { stop() { try { src.stop(); } catch { /* already over */ } } };
    },
    /** Keeps sounds on the things they follow. */
    update() {
      const now = ctx.currentTime;
      for (const e of placed) {
        if (now > e.until) { placed.delete(e); continue; }
        e.panner.positionX.setTargetAtTime(e.follow.x, now, 0.03);
        e.panner.positionY.setTargetAtTime(e.follow.y + 0.5, now, 0.03);
        e.panner.positionZ.setTargetAtTime(e.follow.z, now, 0.03);
      }
    },
  };
}

export const SOUND_FILES = FILES;
