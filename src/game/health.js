// How much he can still take. A bite takes some of it and leaves him a moment in which nothing more can (so two
// wolves can't take him in one breath); at nothing he falls. A resting point gives it all back.
export class Health {
  constructor(max = 100) {
    this.max = max;
    this.value = max;
    this.guard = 0; // seconds left in which no harm comes to him
    this.dead = false;
  }

  update(dt) { this.guard = Math.max(0, this.guard - dt); }

  /** Takes `amount`, unless he is guarded or already down. Returns whether it landed. */
  hurt(amount, { guard = 0.7 } = {}) {
    if (this.dead || this.guard > 0 || amount <= 0) return false;
    this.value = Math.max(0, this.value - amount);
    this.guard = guard;
    if (this.value === 0) this.dead = true;
    return true;
  }

  /** Guarded for `seconds` from now (a dodge, a moment after waking). */
  shield(seconds) { this.guard = Math.max(this.guard, seconds); }

  fill() { this.value = this.max; this.dead = false; this.guard = 0; }

  get share() { return this.value / this.max; }
}
