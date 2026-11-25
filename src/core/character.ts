import type { Tuning } from './config';
import { plan, scan, type Obstacle } from './detect';
import { v3, type V3, type World } from './world';

export interface Input { x: number; z: number; sprint: boolean; jump: boolean; crouch: boolean }
export const noInput = (): Input => ({ x: 0, z: 0, sprint: false, jump: false, crouch: false });
export type State = 'ground' | 'air' | 'slide' | 'traverse' | 'hang' | 'wallrun' | 'roll';
export type Action = 'jump' | 'vault' | 'mantle' | 'grab' | 'climb' | 'wallrun' | 'walljump' | 'slide' | 'roll' | 'hardland' | 'drop' | 'respawn';
interface Traversal { type: 'vault' | 'mantle' | 'climb' | 'grab'; pts: [V3, V3, V3]; time: number; dur: number; edge: V3; normal: V3; exit: V3; next: State }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: V3, b: V3, t: number) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Máquina de estados del personaje. Determinista, a paso fijo y sin dependencias de render. */
export class Character {
  pos: V3; vel = v3(); yaw = Math.PI; state: State = 'ground'; crouched = false;
  trav: Traversal | null = null; ledge: Obstacle | null = null; wallNormal = v3(); wallSide = 0;
  stateTime = 0; shimmy = 0; checkpoint: V3; onAction: (a: Action) => void = () => {};
  private coyote = 0; private buffer = 0; private prevJump = false; private prevCrouch = false;
  private ledgeLock = 0; private push = 0; private lastWall = -1; private hard = 0;

  constructor(readonly world: World, readonly t: Tuning, spawn: V3) { this.pos = { ...spawn }; this.checkpoint = { ...spawn }; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get bodyHeight() { return this.crouched || this.state === 'slide' || this.state === 'roll' ? this.t.crouchHeight : this.t.height; }
  get traverseAlpha() { return this.trav ? clamp01(this.trav.time / this.trav.dur) : 0; }

  private set(s: State) { this.state = s; this.stateTime = 0; }
  respawn() {
    this.pos = { ...this.checkpoint }; this.vel = v3(); this.trav = null; this.ledge = null; this.crouched = false;
    this.lastWall = -1; this.buffer = 0; this.set('air'); this.onAction('respawn');
  }

  step(inp: Input, dt: number) {
    const t = this.t, m = Math.hypot(inp.x, inp.z), k = m > 1 ? 1 / m : 1;
    const dir = v3(inp.x * k, 0, inp.z * k), mag = Math.min(1, m);
    const jumpEdge = inp.jump && !this.prevJump, crouchEdge = inp.crouch && !this.prevCrouch;
    this.prevJump = inp.jump; this.prevCrouch = inp.crouch;
    this.buffer = jumpEdge ? t.buffer : Math.max(0, this.buffer - dt);
    this.ledgeLock = Math.max(0, this.ledgeLock - dt); this.hard = Math.max(0, this.hard - dt);
    this.stateTime += dt;
    switch (this.state) {
      case 'ground': this.ground(inp, dir, mag, crouchEdge, dt); break;
      case 'slide': this.slide(dir, dt); break;
      case 'roll': this.roll(dt); break;
      case 'air': this.air(dir, mag, dt); break;
      case 'wallrun': this.wallrun(dir, mag, dt); break;
      case 'hang': this.hang(dir, mag, jumpEdge, crouchEdge, dt); break;
      case 'traverse': this.traverse(dt); break;
    }
    if (this.pos.y < -8) this.respawn();
  }

  // ---------- estados ----------
  private ground(inp: Input, dir: V3, mag: number, crouchEdge: boolean, dt: number) {
    const t = this.t;
    this.lastWall = -1; this.coyote = t.coyote;
    if (crouchEdge && this.speed > t.slideMinSpeed) {
      const f = Math.min(this.speed, t.sprint) / this.speed + t.slideBoost / this.speed;
      this.vel.x *= f; this.vel.z *= f; this.crouched = true; this.set('slide'); this.onAction('slide'); return;
    }
    this.crouched = inp.crouch || (this.crouched && !this.canStand());
    if (!this.crouched && mag > 0.2) {
      const auto = t.autoTraverse && inp.sprint && this.speed > t.run * 0.8;
      if (this.buffer > 0 || auto) {
        const p = plan(this.world, t, this.pos, this.norm(dir), this.speed);
        if (p) { this.buffer = 0; this.startObstacle(p.type, p.obs); return; }
      }
    }
    if (this.buffer > 0 && this.canStand()) { this.jump(); return; }
    const max = (this.crouched ? t.crouchSpeed : inp.sprint ? t.sprint : t.run) * (this.hard > 0 ? 0.35 : 1);
    this.accelerate(dir, max * mag, mag > 0.01 ? t.accel : t.friction, dt);
    this.face(dir, mag, dt);
    this.move(dt, true);
    this.stick();
  }
  private slide(dir: V3, dt: number) {
    const t = this.t, s = this.speed;
    const f = s > 0 ? Math.max(0, s - t.slideFriction * dt) / s : 0;
    this.vel.x = this.vel.x * f + dir.x * 2 * dt; this.vel.z = this.vel.z * f + dir.z * 2 * dt;
    this.move(dt, true);
    if (!this.stick()) return;
    if (this.buffer > 0 && this.canStand()) { this.jump(); return; }
    const blocked = !this.canStand();
    if ((this.stateTime > 0.75 && !blocked) || this.speed < t.crouchSpeed) { this.crouched = blocked; this.set('ground'); }
  }
  private roll(dt: number) {
    this.move(dt, true);
    if (!this.stick()) return;
    if (this.stateTime > 0.55) { this.crouched = !this.canStand(); this.set('ground'); }
  }
  private air(dir: V3, mag: number, dt: number) {
    const t = this.t;
    this.coyote = Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) { this.jump(); return; }
    if (this.crouched && this.canStand()) this.crouched = false;
    if (mag > 0.01) this.accelerate(dir, Math.max(t.run, Math.min(this.speed, t.sprint)) * mag, t.airAccel, dt);
    this.face(dir, mag, dt);
    this.vel.y = Math.max(-25, this.vel.y - t.gravity * dt);
    if (mag > 0.2 && this.ledgeLock <= 0 && this.vel.y < 3.5) {
      const obs = scan(this.world, t, this.pos, this.norm(dir), t.radius + 0.35, t.ledgeMax);
      if (obs && obs.topFree) {
        if (obs.height >= t.ledgeMin) { if (this.tryGrab(obs)) return; }
        else { this.startObstacle('mantle', obs); return; }
      }
    }
    if (this.tryWallRun()) return;
    const fall = -this.vel.y;
    this.move(dt, false);
    const f = this.vel.y <= 0 ? this.world.floor(this.pos, t.radius, 0.02) : null;
    if (f !== null) {
      this.pos.y = f; this.vel.y = 0;
      if (fall > t.hardFallSpeed && this.speed < t.walk) { this.hard = 0.7; this.vel.x = this.vel.z = 0; this.onAction('hardland'); this.set('ground'); }
      else if (fall > t.rollFallSpeed && this.speed > t.walk) { this.crouched = true; this.set('roll'); this.onAction('roll'); }
      else this.set('ground');
    }
  }
  private wallrun(dir: V3, mag: number, dt: number) {
    const t = this.t, n = this.wallNormal;
    if (this.buffer > 0) {
      this.buffer = 0; this.vel.x += n.x * t.wallJumpOut; this.vel.z += n.z * t.wallJumpOut; this.vel.y = t.jump;
      this.set('air'); this.coyote = 0; this.onAction('walljump'); return;
    }
    const hit = this.world.raycast(v3(this.pos.x, this.pos.y + 1, this.pos.z), v3(-n.x, 0, -n.z), t.radius + 0.5);
    const along = dir.x * this.vel.x + dir.z * this.vel.z;
    if (!hit || this.stateTime > t.wallRunTime || mag < 0.2 || along <= 0 || this.speed < t.wallRunMinSpeed * 0.7) { this.set('air'); this.coyote = 0; return; }
    const vn = this.vel.x * n.x + this.vel.z * n.z;
    this.vel.x -= n.x * vn; this.vel.z -= n.z * vn;
    this.vel.y -= t.gravity * t.wallRunGravity * dt;
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.move(dt, false);
    const f = this.vel.y <= 0 ? this.world.floor(this.pos, t.radius, 0.02) : null;
    if (f !== null) { this.pos.y = f; this.vel.y = 0; this.set('ground'); }
  }
  private hang(dir: V3, mag: number, jumpEdge: boolean, crouchEdge: boolean, dt: number) {
    const o = this.ledge!, n = o.normal, t = this.t;
    const toward = -(dir.x * n.x + dir.z * n.z) * mag;
    this.push = toward > 0.6 ? this.push + dt : 0;
    if (crouchEdge) { this.release(); this.onAction('drop'); return; }
    if (jumpEdge && toward < -0.5) {
      this.buffer = 0; this.release(); this.vel = v3(n.x * 5, t.jump * 0.85, n.z * 5);
      this.yaw = Math.atan2(n.x, n.z); this.onAction('walljump'); return;
    }
    if ((jumpEdge || this.push > 0.3) && this.world.free(o.top, t.radius, t.height)) {
      this.buffer = 0; this.begin('climb', o, o.top, 0.8, v3(-n.x * 1.5, 0, -n.z * 1.5)); this.onAction('climb'); return;
    }
    const tx = -n.z, tz = n.x, s = dir.x * tx + dir.z * tz;
    this.shimmy = Math.abs(s) > 0.4 ? Math.sign(s) : 0;
    const d = this.shimmy * 1.4 * dt, np = v3(this.pos.x + tx * d, this.pos.y, this.pos.z + tz * d);
    const a = n.x ? 'z' : 'x', e = o.edge[a] + (n.x ? tz : tx) * d, b = o.box;
    const clear = this.world.free(v3(o.edge.x + tx * d - n.x * 0.06, b.max.y + 0.02, o.edge.z + tz * d - n.z * 0.06), 0.05, 0.3);
    if (d && e > b.min[a] + 0.3 && e < b.max[a] - 0.3 && clear && this.world.free(np, t.radius, t.height)) {
      this.pos = np;
      for (const p of [o.edge, o.top]) { p.x += tx * d; p.z += tz * d; }
    } else this.shimmy = 0;
  }
  private traverse(dt: number) {
    const tr = this.trav!, [a, b, c] = tr.pts;
    tr.time += dt;
    const u = clamp01(tr.time / tr.dur), e = tr.type === 'vault' && this.t.momentum >= 1 ? u : smooth(u);
    if (tr.type === 'vault' || tr.type === 'grab') { // Bézier cuadrática que pasa por b en u=0.5
      const q = v3(2 * b.x - (a.x + c.x) / 2, 2 * b.y - (a.y + c.y) / 2, 2 * b.z - (a.z + c.z) / 2);
      this.pos = mix(mix(a, q, e), mix(q, c, e), e);
    } else this.pos = e < 0.6 ? mix(a, b, smooth(e / 0.6)) : mix(b, c, smooth((e - 0.6) / 0.4));
    if (u >= 1) {
      this.pos = { ...c }; this.vel = { ...tr.exit }; this.trav = null; this.crouched = false; this.push = 0;
      this.coyote = 0; this.set(tr.next);
      if (tr.next === 'ground') this.stick();
    }
  }

  // ---------- transiciones ----------
  private begin(type: Traversal['type'], o: Obstacle, end: V3, dur: number, exit: V3, next: State = 'ground', mid?: V3) {
    const p = { ...this.pos };
    this.trav = { type, pts: [p, mid ?? v3(p.x, o.box.max.y + 0.02, p.z), { ...end }], time: 0, dur, edge: { ...o.edge }, normal: o.normal, exit, next };
    this.yaw = Math.atan2(-o.normal.x, -o.normal.z); this.crouched = false; this.vel = v3(); this.set('traverse');
  }
  private startObstacle(type: 'vault' | 'mantle', o: Obstacle) {
    const n = o.normal, entry = Math.max(this.speed, this.t.walk);
    if (type === 'mantle') {
      const s = Math.min(entry * this.t.momentum, this.t.run);
      this.begin('mantle', o, o.top, 0.35 + Math.max(0, o.height) * 0.2, v3(-n.x * s, 0, -n.z * s));
    } else {
      const end = v3(o.back!.x, o.backFloor ?? this.pos.y, o.back!.z);
      const dist = Math.hypot(end.x - this.pos.x, end.z - this.pos.z), s = entry * this.t.momentum;
      const mid = v3(o.edge.x - n.x * o.depth / 2, o.box.max.y + 0.05, o.edge.z - n.z * o.depth / 2);
      const dur = Math.max(this.t.momentum >= 1 ? 0.32 : 0.6, dist / entry);
      this.begin('vault', o, end, dur, v3(-n.x * s, 0, -n.z * s), o.backFloor !== null ? 'ground' : 'air', mid);
    }
    this.onAction(type);
  }
  private tryGrab(o: Obstacle): boolean {
    const t = this.t, n = o.normal, r = t.radius + 0.03;
    const end = v3(o.edge.x + n.x * r, o.box.max.y - t.hangOffset, o.edge.z + n.z * r);
    if (!this.world.free(end, t.radius, t.height)) return false;
    this.ledge = { ...o, edge: { ...o.edge }, top: { ...o.top } };
    this.begin('grab', o, end, 0.16, v3(), 'hang', mix(this.pos, end, 0.5)); this.onAction('grab');
    return true;
  }
  private release() { this.ledgeLock = 0.5; this.ledge = null; this.vel = v3(); this.coyote = 0; this.set('air'); }
  private jump() {
    this.buffer = 0; this.coyote = 0; this.crouched = false; this.vel.y = this.t.jump; this.set('air'); this.onAction('jump');
  }
  private tryWallRun(): boolean {
    const t = this.t, s = this.speed;
    if (s < t.wallRunMinSpeed || this.vel.y < -5 || this.vel.y > 4.5) return false;
    if (this.world.floor(this.pos, t.radius, 0.35) !== null) return false;
    const fx = this.vel.x / s, fz = this.vel.z / s;
    for (const side of [1, -1]) { // +1 = derecha
      const h = this.world.raycast(v3(this.pos.x, this.pos.y + 1, this.pos.z), v3(-fz * side, 0, fx * side), t.radius + 0.45);
      if (!h || h.box.id === this.lastWall || h.box.max.y < this.pos.y + 1.6 || Math.abs(fx * h.normal.x + fz * h.normal.z) > 0.6) continue;
      this.wallNormal = h.normal; this.wallSide = side; this.lastWall = h.box.id;
      const vn = this.vel.x * h.normal.x + this.vel.z * h.normal.z;
      this.vel.x -= h.normal.x * vn; this.vel.z -= h.normal.z * vn;
      this.vel.y = Math.max(this.vel.y, 1.8);
      this.set('wallrun'); this.onAction('wallrun');
      return true;
    }
    return false;
  }

  // ---------- física ----------
  private norm(d: V3): V3 { const l = Math.hypot(d.x, d.z) || 1; return v3(d.x / l, 0, d.z / l); }
  private canStand() { return this.world.free(this.pos, this.t.radius, this.t.height); }
  private accelerate(dir: V3, speed: number, a: number, dt: number) {
    const n = this.norm(dir), dx = n.x * speed - this.vel.x, dz = n.z * speed - this.vel.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const k = Math.min(1, a * dt / d);
    this.vel.x += dx * k; this.vel.z += dz * k;
  }
  private face(dir: V3, mag: number, dt: number) {
    if (mag < 0.05) return;
    let d = Math.atan2(dir.x, dir.z) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-14 * dt));
  }
  private move(dt: number, canStep: boolean) {
    const r = this.t.radius, h = this.bodyHeight, w = this.world;
    for (const a of ['x', 'z'] as const) {
      const d = this.vel[a] * dt;
      if (!d) continue;
      this.pos[a] += d;
      const o = w.overlaps(this.pos, r, h);
      if (!o.length) continue;
      const top = Math.max(...o.map(b => b.max.y));
      if (canStep && top - this.pos.y <= this.t.step && w.free(v3(this.pos.x, top, this.pos.z), r, h)) { this.pos.y = top; continue; }
      this.pos[a] = d > 0 ? Math.min(...o.map(b => b.min[a])) - r : Math.max(...o.map(b => b.max[a])) + r;
      this.vel[a] = 0;
    }
    const dy = this.vel.y * dt;
    if (!dy) return;
    this.pos.y += dy;
    const o = w.overlaps(this.pos, r, h);
    if (o.length) {
      this.pos.y = dy < 0 ? Math.max(...o.map(b => b.max.y)) : Math.min(...o.map(b => b.min.y)) - h;
      this.vel.y = 0;
    }
  }
  /** Pega al suelo en bordillos; pasa a caída si no hay apoyo. */
  private stick(): boolean {
    const f = this.world.floor(this.pos, this.t.radius, this.t.step);
    if (f !== null) { this.pos.y = f; this.vel.y = 0; return true; }
    if (this.crouched && this.canStand()) this.crouched = false;
    this.set('air');
    return false;
  }
}
