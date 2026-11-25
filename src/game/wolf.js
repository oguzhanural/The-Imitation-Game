// A wolf that hunts him. It comes in at a gallop, slows to a walk and circles him at a few strides, and when the
// pack lets it (one bites at a time) it crouches, which is the warning, then springs and bites. A blow of the
// sword staggers it and spoils a spring; enough of them and it falls and stays fallen.
//
// It does not use the physics: it runs on the ground's height (ground(x, z)), keeps out of the trees it is told
// of (avoid(x, z) -> push), off him, and off the other wolves.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const SCALE = 0.36; // the model is drawn large: this makes it a wolf, about 0.95 m to the tips of its ears
const HP = 100;
const RUN = 7.2, WALK = 1.7; // m/s
const GALLOP_AT = 6.2, WALK_AT = 1.5; // the speeds its gallop and walk clips are drawn for, at this size
const RING = [4.2, 6.0]; // how far off it circles
const BITE_REACH = 1.05; // from its nose to his middle
const BITE = 20;
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const angleWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a, b) => a + Math.random() * (b - a);

export async function loadWolfModel(url, onProgress) {
  return new GLTFLoader().loadAsync(url, (e) => onProgress?.(e.total ? e.loaded / e.total : 0));
}

export class Wolf {
  /**
   * model: the loaded glTF. paint(object) -> { dabs, update }. ground(x, z) -> height. avoid(x, z, out) adds the
   * push out of anything solid to out.
   */
  constructor({ model, paint, ground, avoid = null }) {
    this.object = SkeletonUtils.clone(model.scene);
    this.object.scale.setScalar(SCALE);
    this.object.visible = false;
    const painted = paint(this.object);
    this.dabs = painted.dabs;
    this.dabs.visible = false;
    this.paintUpdate = painted.update;
    this.ground = ground; this.avoid = avoid;
    this.mixer = new THREE.AnimationMixer(this.object);
    this.actions = {};
    for (const clip of model.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;

    this.pos = new THREE.Vector3(); // its feet
    this.vel = new THREE.Vector3(); // pushed (a blow), on top of what it does itself
    this.yaw = 0;
    this.hp = HP;
    this.state = 'hidden';
    this.timer = 0;
    this.side = Math.random() < 0.5 ? 1 : -1; // which way it circles
    this.alive = false; // can be struck
    this.position = new THREE.Vector3(); // its middle, for the sword and the bar over it
    this.body = [new THREE.Vector3(), new THREE.Vector3()];
    this.radius = 0.27;
    this.head = new THREE.Vector3();
    this.lastHit = -9;
    this.clock = 0;
    this.events = []; // { type: 'bite' | 'down' | 'crouch' | 'spring' | 'hurt' }, taken by whoever runs the fight
  }

  get share() { return Math.max(0, this.hp) / HP; }
  get shown() { return this.state !== 'hidden'; }

  /** Puts it at (x, z) facing yaw, hidden until it is let loose. */
  place(x, z, yaw) {
    this.pos.set(x, this.ground(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.hp = HP;
    this.alive = false;
    this.state = 'hidden';
    this.object.visible = this.dabs.visible = false;
    this.pose();
  }

  /** Lets it loose: it comes for him. */
  loose() {
    this.state = 'approach';
    this.alive = true;
    this.object.visible = this.dabs.visible = true;
    this.play('Gallop', { fade: 0 });
  }

  /** A blow from the sword. */
  hit(damage, from, heavy) {
    if (!this.alive) return;
    this.hp -= damage;
    this.lastHit = this.clock;
    const away = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.vel.addScaledVector(away, heavy ? 5 : 3);
    this.token?.release(this);
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.timer = 0;
      this.play('Death', { loop: false, fade: 0.08 });
      this.events.push({ type: 'down' });
      return;
    }
    this.state = 'stagger';
    this.timer = 0;
    this.events.push({ type: 'hurt' });
    this.play(Math.random() < 0.5 ? 'Idle_HitReact1' : 'Idle_HitReact2', { loop: false, fade: 0.05, rate: 1.1 });
  }

  /**
   * target: his feet. pack: { others: [Wolf], token: { take(wolf) -> bool, release(wolf) } }. guarded: whether a bite
   * would land on him now.
   */
  update(dt, target, pack) {
    this.clock += dt;
    if (this.state === 'hidden') return;
    if (this.state === 'dead') {
      // it lies where it fell; once the clip is over nothing more moves
      this.timer += dt;
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this.move(dt, 0, null, pack);
      if (this.timer < 3) { this.mixer.update(dt); this.pose(); }
      return;
    }
    this.token = pack.token;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, dist = Math.hypot(dx, dz);
    const toward = Math.atan2(dx, dz);
    this.timer += dt;
    let speed = 0, heading = toward;

    switch (this.state) {
      case 'approach':
        speed = RUN;
        if (dist < RING[1] + 0.5) this.circle();
        break;
      case 'circle': {
        // round him at a walk, drifting to the ring; when its turn comes, it crouches
        const want = THREE.MathUtils.clamp(this.ring, RING[0], RING[1]);
        const radial = THREE.MathUtils.clamp((dist - want) * 0.8, -1, 1);
        heading = Math.atan2(dx * radial + -dz * this.side * 0.9, dz * radial + dx * this.side * 0.9);
        speed = WALK;
        this.faceInstead = toward;
        if (dist > RING[1] + 4) { this.state = 'approach'; this.play('Gallop', { fade: 0.25 }); }
        else if (this.timer > this.wait && pack.token.take(this)) this.crouch();
        break;
      }
      case 'crouch':
        // the warning: it draws back, eyes on him
        heading = toward; speed = 0;
        if (this.timer > 0.55) { this.distAtSpring = dist; this.spring(toward); }
        break;
      case 'spring': {
        const a = this.actions.Attack, u = a.time / a.getClip().duration;
        heading = this.lunge;
        // the spring covers what lay between them when it set off, ending a jaw's length short of him
        speed = this.timer < 0.4 && dist > 0.8 ? this.leap : 0;
        // the jaws close in the middle of the clip: once, if he is there and not rolling clear
        this.headAt();
        if (!this.bit && u > 0.34 && u < 0.62) {
          const reach = Math.hypot(target.x - this.head.x, target.z - this.head.z);
          if (reach < BITE_REACH) { this.bit = true; this.events.push({ type: 'bite', damage: BITE, from: this.pos.clone() }); }
        }
        if (u > 0.9 || !a.isRunning()) this.recover();
        break;
      }
      case 'recover':
        // it backs off a few steps, still facing him
        heading = toward + Math.PI; speed = 1.4;
        this.faceInstead = toward;
        if (this.timer > 0.9) this.circle(rand(0.8, 1.8));
        break;
      case 'stagger':
        speed = 0;
        if (this.timer > 0.55) this.circle(rand(0.6, 1.4));
        break;
    }
    this.move(dt, speed, heading, pack);
    // the clip's pace matches its feet
    if (this.current === this.actions.Gallop) this.current.timeScale = THREE.MathUtils.clamp(this.groundSpeed / GALLOP_AT, 0.6, 1.4);
    if (this.current === this.actions.Walk) this.current.timeScale = THREE.MathUtils.clamp(this.groundSpeed / WALK_AT, 0.4, 1.6) * (this.state === 'recover' ? -1 : 1);
    this.mixer.update(dt);
    this.pose();
  }

  // --- inside ---------------------------------------------------------------------------------
  circle(wait = rand(1.3, 2.8)) {
    this.state = 'circle';
    this.timer = 0;
    this.wait = wait;
    this.ring = rand(RING[0], RING[1]);
    if (Math.random() < 0.3) this.side = -this.side;
    this.play('Walk', { fade: 0.3 });
  }

  crouch() {
    this.state = 'crouch';
    this.timer = 0;
    this.events.push({ type: 'crouch' });
    // the first frames of the attack, slowed, are the drawing back
    this.play('Attack', { loop: false, fade: 0.15, rate: 0.35 });
  }

  spring(toward) {
    this.state = 'spring';
    this.timer = 0;
    this.events.push({ type: 'spring' });
    this.bit = false;
    this.lunge = toward;
    this.leap = THREE.MathUtils.clamp((this.distAtSpring - 0.85) / 0.4, 4, 12);
    this.actions.Attack.timeScale = 1.15;
  }

  recover() {
    this.state = 'recover';
    this.timer = 0;
    this.token?.release(this);
    this.play('Walk', { fade: 0.25 });
  }

  /** Moves it along `heading` at `speed`, plus any push, kept clear of trees, him and the pack; turns it. */
  move(dt, speed, heading, pack) {
    const v = new THREE.Vector3();
    if (heading != null) v.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
    v.add(this.vel);
    this.vel.multiplyScalar(Math.exp(-5 * dt));
    const was = this.pos.clone();
    this.pos.addScaledVector(v, dt);
    // keep apart: from him (a body's width), from each other, from trees
    if (pack && this.state !== 'dead') {
      const t = pack.target;
      if (t) this.pushOff(t.x, t.z, 0.7);
      for (const o of pack.others) if (o !== this && o.shown) this.pushOff(o.pos.x, o.pos.z, o.state === 'dead' ? 0.8 : 1.3);
    }
    if (this.avoid) { const p = this.avoid(this.pos.x, this.pos.z); this.pos.x += p.x; this.pos.z += p.z; }
    this.pos.y = this.ground(this.pos.x, this.pos.z);
    this.groundSpeed = Math.hypot(this.pos.x - was.x, this.pos.z - was.z) / Math.max(dt, 1e-4);
    const face = this.faceInstead ?? (speed > 0.2 ? heading : null);
    this.faceInstead = null;
    if (face != null && this.state !== 'dead' && this.state !== 'stagger') {
      const rate = this.state === 'spring' ? 4 : this.state === 'crouch' ? 10 : 7;
      this.yaw += THREE.MathUtils.clamp(angleWrap(face - this.yaw), -rate * dt, rate * dt);
    }
  }

  pushOff(x, z, gap) {
    const dx = this.pos.x - x, dz = this.pos.z - z, d = Math.hypot(dx, dz);
    if (d < gap && d > 1e-4) { this.pos.x += (dx / d) * (gap - d); this.pos.z += (dz / d) * (gap - d); }
  }

  play(name, { fade = 0.2, loop = true, rate = 1 } = {}) {
    const next = this.actions[name];
    if (!next) return;
    if (this.current === next && loop) { next.timeScale = rate; return; }
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = rate;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && fade > 0) { next.fadeIn(fade); this.current.fadeOut(fade); }
    else if (this.current) this.current.stop();
    this.current = next;
  }

  headAt() {
    return this.head.set(this.pos.x + Math.sin(this.yaw) * 0.85, this.pos.y + 0.6, this.pos.z + Math.cos(this.yaw) * 0.85);
  }

  /** Sets the model where it stands and the line its body lies along, for the sword. */
  pose() {
    this.object.position.copy(this.pos);
    this.object.rotation.set(0, this.yaw, 0);
    this.object.updateMatrixWorld(true);
    const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
    const low = this.state === 'dead' ? 0.2 : 0.55;
    this.body[0].set(this.pos.x - sx * 0.42, this.pos.y + low, this.pos.z - cz * 0.42);
    this.body[1].set(this.pos.x + sx * 0.5, this.pos.y + low + 0.05, this.pos.z + cz * 0.5);
    this.position.lerpVectors(this.body[0], this.body[1], 0.5);
    if (this.object.visible) this.paintUpdate();
  }
}
