// The fights on the way, in order. Each waits until he reaches a place (trigger(feet)), then lets its wolves loose
// from where they are set (spawn(feet) -> [{ x, z, delay }]), and is won when all of them are down. Only one runs
// at a time, and the next waits for it. Winning one is a resting point.
//
// If he falls, the fight that was running is put back as it was before it began: its wolves hidden again, unhurt,
// to come again when he reaches its place again. Fights already won stay won.

/** One wolf bites at a time: it takes the token before it crouches, and gives it back when it is done. */
function makeToken() {
  return {
    holder: null,
    take(w) { if (!this.holder || this.holder === w || !this.holder.alive) { this.holder = w; return true; } return false; },
    release(w) { if (this.holder === w) this.holder = null; },
  };
}

export class Encounters {
  /** defs: [{ trigger(feet), spawn(feet) -> [{ x, z, delay }] }]. wolves(i): the wolves for fight i. */
  constructor(defs, wolves) {
    this.defs = defs.map((d, i) => ({ ...d, wolves: wolves(i, d) }));
    this.index = 0; // the next fight to come, or the one running
    this.running = false;
    this.clock = 0;
    this.token = makeToken();
    this.events = [];
  }

  get all() { return this.defs.flatMap((d) => d.wolves); }
  get current() { return this.defs[this.index]; }
  get done() { return this.index >= this.defs.length; }

  /** feet: where he stands. Returns this frame's events: { type: 'start' | 'won' | 'bite' | 'down', ... }. */
  update(dt, feet) {
    this.events.length = 0;
    this.clock += dt;
    const d = this.current;
    if (d && !this.running && d.trigger(feet)) this.start(feet);
    const pack = { others: this.all, token: this.token, target: feet };
    for (const w of this.all) {
      if (w.state === 'hidden' && w.dueAt != null && this.clock >= w.dueAt) { w.dueAt = null; w.loose(); }
      w.update(dt, feet, pack);
      for (const e of w.events) this.events.push({ ...e, wolf: w });
      w.events.length = 0;
    }
    if (this.running && d.wolves.every((w) => w.state === 'dead')) {
      this.running = false;
      this.events.push({ type: 'won', index: this.index });
      this.index++;
    }
    return this.events;
  }

  start(feet) {
    const d = this.current;
    this.running = true;
    const spots = d.spawn(feet);
    d.wolves.forEach((w, i) => {
      const s = spots[i];
      w.place(s.x, s.z, s.yaw ?? 0);
      w.dueAt = this.clock + (s.delay ?? 0);
    });
    this.events.push({ type: 'start', index: this.index });
  }

  /** He fell: the running fight goes back to waiting, its wolves hidden and whole. */
  reset() {
    if (!this.running) return;
    this.running = false;
    this.token.holder = null;
    for (const w of this.current.wolves) { w.dueAt = null; w.place(w.pos.x, w.pos.z, w.yaw); }
  }
}
