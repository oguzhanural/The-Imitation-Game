// His side of a fight: three strokes of the sword that run into each other if the button is pressed again in
// time, a roll out of the way, a blow taken, a fall. Each is a clip played as an action (Player.act); this decides
// which, when, toward whom, and whether the blade met anything.
//
// A target is anything with { alive, position (Vector3, its middle), body: [Vector3, Vector3] (the line its body
// lies along), radius (how thick it is round that line), hit(damage, from, heavy) }: the wolves
// (src/game/wolf.js), or a post to practise on (lab.dummy).
import * as THREE from 'three';

// the combo: each stroke, the clip that eases out of it if nothing follows, and what it takes off a wolf
const COMBO = [
  { clip: 'Sword_Regular_A', rec: 'Sword_Regular_A_Rec', damage: 30, rate: 1.05 },
  { clip: 'Sword_Regular_B', rec: 'Sword_Regular_B_Rec', damage: 30, rate: 1.05 },
  // the last has a long stillness after it, cut short
  { clip: 'Sword_Regular_C', rec: null, damage: 45, rate: 1.1, to: 0.62, heavy: true },
];
const REACH = 0.55; // how near he steps in: the target's skin this far from his feet at the strike
const SWEEP = 6; // blades tried between one frame's and the next
const LOCK = 8; // a target further than this is not turned to
const QUEUE_FROM = 0.2; // a press this far into a stroke is kept for the next one
const ACTIVE = [0.18, 0.9]; // the part of a stroke in which the blade can bite (and only while it moves fast)
const angleWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Shortest distance between segments p1-q1 and p2-q2. */
const d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), r0 = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
export function segSegDist(p1, q1, p2, q2) {
  d1.subVectors(q1, p1); d2.subVectors(q2, p2); r0.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r0);
  let s, t;
  if (a < 1e-9 && e < 1e-9) return p1.distanceTo(p2);
  if (a < 1e-9) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r0);
    if (e < 1e-9) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      s = denom > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

export class Combat {
  /** targets(): the things that can be struck now. */
  constructor({ player, sword, health, targets }) {
    this.player = player; this.sword = sword; this.health = health; this.targets = targets;
    this.step = -1; // which stroke of the combo is playing (or was last)
    this.queued = false;
    this.struck = new Set(); // what this stroke has already met
    this.hitstop = 0; // seconds the world is held after a blow lands
    this.target = null;
    this.rolledAt = -9;
    this.clock = 0;
    this.events = []; // what happened this frame, for whoever listens: { type: 'hit', target, damage, heavy } | strike | roll
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); // the blade now
    this.pa = new THREE.Vector3(); this.pb = new THREE.Vector3(); // and the frame before
    this.sa = new THREE.Vector3(); this.sb = new THREE.Vector3();
    this.had = false;
  }

  get kind() { return this.player.mode === 'act' ? this.player.action.kind : null; }
  get swinging() { return this.kind === 'attack'; }

  /** Before the player moves: reads the buttons, starts and chains actions. camYaw: where the eye looks. */
  update(dt, input, camYaw) {
    this.clock += dt;
    this.events.length = 0;
    const P = this.player;
    if (this.health.dead) return;
    const want = this.wanted(input, camYaw);
    this.pick(want);
    const kind = this.kind, st = P.action?.state;

    if (input.dodge && P.grounded && this.clock - this.rolledAt > 0.45 && (kind == null || kind === 'rec' || (kind === 'attack' && st.u > 0.5))) {
      return this.roll(want);
    }
    if (kind == null && P.mode === 'move' && P.grounded && input.attack) return this.strike(0, want);
    if (kind === 'attack') {
      if (input.attack && st.u > QUEUE_FROM) this.queued = true;
      if (st.done) {
        if (this.queued && this.step < COMBO.length - 1) return this.strike(this.step + 1, want);
        const rec = COMBO[this.step].rec;
        if (rec) P.act('rec', rec, { rate: 1.1, travel: 0.5, fade: 0.08 });
        else P.endAct(0.4);
      }
      return;
    }
    if (kind === 'rec') {
      // a press during the ease-out carries on the combo; moving off ends it
      if (input.attack) return this.strike(Math.min(this.step + 1, COMBO.length - 1), want);
      if (want.mag > 0.1 && st.u > 0.25) P.endAct(0.2);
    }
  }

  /** After the clips have posed him and the sword is in his hand: whether the blade met anything. */
  resolve() {
    const was = this.had;
    this.pa.copy(this.a); this.pb.copy(this.b);
    this.sword.edge(this.a, this.b);
    this.had = this.kind === 'attack';
    if (this.kind !== 'attack' || this.hitstop > 0 || !was) return;
    const st = this.player.action.state;
    if (st.u < ACTIVE[0] || st.u > ACTIVE[1] || this.sword.speed < 3.5) return;
    const stroke = COMBO[this.step];
    for (const t of this.targets()) {
      if (!t.alive || this.struck.has(t)) continue;
      // the blade moves a metre or more between frames at the height of a stroke: what it swept through
      // since the last one is tried, a few blades' worth between there and here
      let met = false;
      for (let k = 1; k <= SWEEP && !met; k++) {
        this.sa.lerpVectors(this.pa, this.a, k / SWEEP); this.sb.lerpVectors(this.pb, this.b, k / SWEEP);
        met = segSegDist(this.sa, this.sb, t.body[0], t.body[1]) <= t.radius + 0.03;
      }
      if (!met) continue;
      this.struck.add(t);
      t.hit(stroke.damage, this.player.feet, !!stroke.heavy);
      this.hitstop = stroke.heavy ? 0.1 : 0.065;
      this.events.push({ type: 'hit', target: t, damage: stroke.damage, heavy: !!stroke.heavy });
    }
  }

  /** A bite landed on him (from: where it came from). */
  hurt(from) {
    const P = this.player;
    this.queued = false;
    if (this.health.dead) {
      P.act('dead', 'Death01', { hold: true, travel: 0.6, fade: 0.08 });
      return;
    }
    P.yaw = Math.atan2(from.x - P.feet.x, from.z - P.feet.z);
    P.act('hurt', 'Hit_Chest', { rate: 1.25, travel: 0.6, fade: 0.06 });
  }

  /** Getting up off the snow, after waking at a resting point. */
  rise() {
    this.queued = false; this.step = -1;
    this.player.act('rise', 'LayToIdle', { rate: 1.2, travel: 0, fade: 0.01 });
  }

  // --- inside ---------------------------------------------------------------------------------
  wanted(input, camYaw) {
    const m = input.move, mag = Math.min(1, Math.hypot(m.x, m.y));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const x = fx * m.y - fz * m.x, z = fz * m.y + fx * m.x;
    return { mag, yaw: mag > 0.05 ? Math.atan2(x, z) : null, camYaw };
  }

  /** Chooses whom he turns to: the one nearest, counting those off to the side as further, keeping the last. */
  pick(want) {
    const P = this.player, look = want.yaw ?? want.camYaw;
    let best = null, bestScore = Infinity;
    for (const t of this.targets()) {
      if (!t.alive) continue;
      const dx = t.position.x - P.feet.x, dz = t.position.z - P.feet.z, d = Math.hypot(dx, dz);
      if (d > LOCK) continue;
      const off = Math.abs(angleWrap(Math.atan2(dx, dz) - look));
      const score = d * (1 + off * 0.6) - (t === this.target ? 1.5 : 0);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    this.target = best;
  }

  strike(i, want) {
    const P = this.player, stroke = COMBO[i];
    this.step = i;
    this.queued = false;
    this.struck.clear();
    let face = want.yaw ?? P.yaw, travel = 1;
    const t = this.target;
    if (t) {
      const dx = t.position.x - P.feet.x, dz = t.position.z - P.feet.z, d = Math.hypot(dx, dz);
      face = Math.atan2(dx, dz);
      // step in to meet it, or hold back if it is already close
      const motion = P.man.motion[stroke.clip];
      const own = Math.max(0.2, motion.speed * motion.duration);
      travel = THREE.MathUtils.clamp((d - t.radius - REACH) / own, 0.2, 2.6);
    }
    P.yaw = face + THREE.MathUtils.clamp(angleWrap(P.yaw - face), -0.5, 0.5); // a quick turn, finished as it plays
    P.act('attack', stroke.clip, { rate: stroke.rate, to: stroke.to ?? 1, travel, face, turn: 14, hold: true, fade: i ? 0.06 : 0.1 });
    this.events.push({ type: 'strike', step: i });
  }

  roll(want) {
    const P = this.player;
    this.queued = false;
    this.rolledAt = this.clock;
    // the way the stick or keys ask; with none, away from whoever he faces
    let yaw = want.yaw;
    if (yaw == null) yaw = this.target ? Math.atan2(P.feet.x - this.target.position.x, P.feet.z - this.target.position.z) : P.yaw;
    P.yaw = yaw;
    P.act('roll', 'Roll', { from: 0.04, to: 0.86, rate: 1.3, travel: 0.62, fade: 0.06, fadeOut: 0.2 });
    this.events.push({ type: 'roll' });
    this.health.shield(0.5);
  }
}
