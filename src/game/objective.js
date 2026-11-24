// Where he is meant to go: a place on the ground, a name for it, and when he counts as there. Each frame it tells
// the compass the way to it and how far it is, and once he is there it says so and lets the compass go quiet.
import { bearingOf } from './hud.js';

export class Objective {
  /** at: {x, z}. label, goal, done: i18n keys. reached(feet): whether he is there. */
  constructor({ at, label, goal, done, reached }) {
    this.at = at; this.label = label; this.goal = goal; this.doneKey = done; this.reached = reached;
    this.done = false;
    this.dist = Infinity;
  }

  /** feet: where he stands. heading: where the eye looks (a bearing). */
  update(feet, heading, hud) {
    if (!this.done && this.reached(feet)) {
      this.done = true;
      hud.say(this.doneKey, 5);
    }
    const dx = this.at.x - feet.x, dz = this.at.z - feet.z;
    this.dist = Math.hypot(dx, dz);
    hud.compass(heading, this.done ? null : { bearing: bearingOf(dx, dz), dist: this.dist, label: this.label });
  }
}
