import * as THREE from 'three';
import type { Character } from '../core/character';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const L = { thigh: 0.44, shin: 0.44, arm: 0.31, fore: 0.31 };
interface Pose { hips: THREE.Vector3; lean: number; twist: number; spin: number; roll: number; hands: THREE.Vector3[]; feet: THREE.Vector3[] }

/** Maniquí original hecho con primitivas. Animación 100 % procedural con IK de dos huesos.
 *  Espacio local: +z hacia delante, +x a la izquierda; índice 0 = izquierda, 1 = derecha. */
export class Rig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Mesh; private pelvis: THREE.Mesh; private head: THREE.Group; private scarf: THREE.Mesh[] = [];
  private limbs: Record<'ua' | 'fa' | 'th' | 'sh', THREE.Mesh[]>; private palms: THREE.Mesh[] = []; private shoes: THREE.Mesh[] = [];
  private cur: Pose | null = null; private phase = 0; private time = 0; private landing = 0; private prevAir = false;

  constructor(accent: number) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.7 });
    const main = new THREE.MeshStandardMaterial({ color: 0xe9e3d5, roughness: 0.6 });
    const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D = this.body) => { const o = new THREE.Mesh(g, m); o.castShadow = true; p.add(o); return o; };
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len - r, 4, 12);
    const pair = (r: number, len: number, m: THREE.Material) => [0, 1].map(() => mk(cap(r, len), m));
    this.limbs = { ua: pair(0.06, L.arm, main), fa: pair(0.052, L.fore, dark), th: pair(0.088, L.thigh, dark), sh: pair(0.068, L.shin, dark) };
    this.torso = mk(new THREE.CapsuleGeometry(0.165, 0.27, 6, 16), main); this.torso.scale.z = 0.72;
    this.pelvis = mk(new THREE.SphereGeometry(0.155, 16, 12), dark);
    this.head = new THREE.Group(); this.body.add(this.head);
    mk(new THREE.SphereGeometry(0.135, 20, 16), main, this.head).scale.set(0.9, 1.1, 1);
    const visor = mk(new THREE.BoxGeometry(0.2, 0.06, 0.08), acc, this.head); visor.position.set(0, 0.02, 0.1);
    for (let i = 0; i < 2; i++) { this.palms.push(mk(new THREE.SphereGeometry(0.062, 12, 10), acc)); this.shoes.push(mk(new THREE.BoxGeometry(0.11, 0.09, 0.26), acc)); }
    for (let i = 0; i < 4; i++) this.scarf.push(mk(new THREE.BoxGeometry(0.11 - i * 0.015, 0.03, 0.15), acc));
    this.root.add(this.body);
  }

  update(c: Character, dt: number, pos: THREE.Vector3) {
    this.time += dt;
    this.root.position.copy(pos); this.root.rotation.y = c.yaw;
    this.root.updateMatrixWorld();
    const air = c.state === 'air';
    if (this.prevAir && !air && c.state === 'ground') this.landing = 1;
    this.prevAir = air; this.landing = Math.max(0, this.landing - dt * 4);
    const p = this.pose(c, dt);
    if (!this.cur) this.cur = p;
    const snap = c.state === 'traverse' || c.state === 'hang' ? 24 : c.state === 'ground' ? 28 : 15;
    const k = 1 - Math.exp(-snap * dt), q = this.cur;
    q.hips.lerp(p.hips, k);
    for (let i = 0; i < 2; i++) { q.hands[i].lerp(p.hands[i], k); q.feet[i].lerp(p.feet[i], k); }
    for (const a of ['lean', 'twist', 'roll'] as const) q[a] += (p[a] - q[a]) * k;
    q.spin = p.spin;
    this.apply(q);
  }

  private pose(c: Character, dt: number): Pose {
    const p: Pose = { hips: V(0, 0.93, 0), lean: 0.03, twist: 0, spin: 0, roll: 0, hands: [V(0.28, 0.85, 0.06), V(-0.28, 0.85, 0.06)], feet: [V(0.11, 0.05, 0), V(-0.11, 0.05, 0)] };
    const local = (x: number, y: number, z: number) => this.root.worldToLocal(V(x, y, z));
    /** Manos apoyadas en el borde real del obstáculo. */
    const edgeHands = (e: { x: number; y: number; z: number }, n: { x: number; z: number }, w = 0.22) => {
      for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; p.hands[i] = local(e.x - n.z * w * s - n.x * 0.04, e.y + 0.03, e.z + n.x * w * s - n.z * 0.04); }
    };
    const stride = (speed: number, crouch: number) => {
      const len = 0.75 + speed * 0.17;
      this.phase += (speed * dt / len) * Math.PI;
      const w = Math.min(1, speed / 1.5), run = Math.min(1, speed / 7);
      p.hips.y = 0.93 - crouch - run * 0.06 + Math.abs(Math.sin(this.phase)) * 0.05 * w; p.lean = 0.04 + run * 0.28 + crouch * 1.3; p.twist = Math.sin(this.phase) * 0.22 * w;
      for (let i = 0; i < 2; i++) {
        const a = this.phase + i * Math.PI, sw = Math.sin(a), lift = Math.max(0, Math.cos(a));
        p.feet[i].z = sw * (0.18 + run * 0.32) * w; p.feet[i].y = 0.05 + lift * (0.1 + run * 0.3) * w;
        p.hands[i].z = 0.1 - sw * (0.18 + run * 0.26) * w + run * 0.06; p.hands[i].y = 0.88 - crouch + run * 0.22 - sw * run * 0.12;
      }
      if (w < 0.1) p.hips.y += Math.sin(this.time * 2) * 0.008;
    };
    const s = c.speed;
    switch (c.state) {
      case 'ground': stride(s, c.crouched ? 0.38 : this.landing * 0.16); break;
      case 'air': {
        const up = Math.max(-1, Math.min(1, c.vel.y / 6));
        p.hips.y = 0.95; p.lean = 0.12 + up * 0.1;
        p.feet = [V(0.12, 0.3 + up * 0.1, 0.22), V(-0.12, 0.14, -0.28 + up * 0.08)];
        p.hands = [V(0.5, 1.3 - up * 0.15, 0.1), V(-0.5, 1.3 - up * 0.15, 0.15)];
        break;
      }
      case 'slide':
        p.hips.set(0, 0.3, -0.12); p.lean = -0.7; p.feet = [V(0.12, 0.09, 0.68), V(-0.14, 0.2, 0.4)];
        p.hands = [V(0.4, 0.15, -0.45), V(-0.35, 0.62, 0.15)];
        break;
      case 'roll': {
        p.hips.y = 0.42; p.lean = 1; p.spin = Math.min(1, c.stateTime / 0.5) * Math.PI * 2;
        p.feet = [V(0.12, 0.2, 0.22), V(-0.12, 0.2, 0.2)]; p.hands = [V(0.2, 0.32, 0.36), V(-0.2, 0.32, 0.36)];
        break;
      }
      case 'wallrun': {
        stride(s, 0);
        const side = c.wallSide; // +1 = muro a la derecha (-x local)
        p.roll = -side * 0.32; p.lean = 0.2;
        for (const f of p.feet) { f.x = -side * 0.28 + f.x * 0.4; f.y += 0.12; }
        p.hands[side > 0 ? 1 : 0].set(-side * 0.34, 1.2, 0.2); p.hands[side > 0 ? 0 : 1].set(side * 0.6, 1.25, 0);
        break;
      }
      case 'hang': {
        const o = c.ledge!; edgeHands(o.edge, o.normal);
        const sw = Math.sin(this.time * (c.shimmy ? 8 : 1.6)) * (c.shimmy ? 0.1 : 0.02);
        p.hands[0].x += sw; p.hands[1].x -= sw;
        p.hips.set(sw * 0.4, 0.86, -0.05); p.lean = 0.05; p.feet = [V(0.12, 0.16 + sw, 0.24), V(-0.12, 0.28 - sw, 0.24)];
        break;
      }
      case 'traverse': {
        const tr = c.trav!, u = c.traverseAlpha;
        edgeHands(tr.edge, tr.normal);
        if (tr.type === 'vault') {
          const over = Math.sin(u * Math.PI);
          p.hips.set(0, 0.9 - over * 0.2, 0); p.lean = 0.35 + over * 0.35; p.roll = over * 0.2;
          p.feet = [V(0.3, 0.1 + over * 0.28, 0.2 + over * 0.2), V(-0.05, 0.1 + over * 0.3, 0.1 + over * 0.35)];
          if (u > 0.62) p.hands = [V(0.4, 1.1, 0.1), V(-0.4, 1.1, 0.1)]; else p.hands[1].set(-0.42, 1.2, 0.05);
        } else if (tr.type === 'grab') { p.lean = 0.05; p.feet = [V(0.12, 0.2, 0.1), V(-0.12, 0.1, 0)]; }
        else {
          const tuck = Math.sin(Math.min(1, u * 1.15) * Math.PI);
          p.hips.set(0, 0.93 - tuck * 0.28, 0); p.lean = 0.08 + tuck * 0.75;
          p.feet = [V(0.14, 0.06 + tuck * 0.34, 0.1 + tuck * 0.2), V(-0.12, 0.06 + tuck * 0.1, -tuck * 0.12)];
          if (u > 0.82) p.hands = [V(0.28, 0.95, 0.2), V(-0.28, 0.95, 0.2)];
        }
      }
    }
    return p;
  }

  private apply(p: Pose) {
    // Voltereta: giro alrededor de la pelvis.
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    if (p.spin) { const h = p.hips.y; this.body.rotation.x = p.spin; this.body.position.set(0, h - h * Math.cos(p.spin), -h * Math.sin(p.spin)); }
    else this.body.rotation.z = p.roll * 0.6;
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean, p.twist, 0, 'XYZ'));
    const at = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(rot).add(p.hips);
    this.pelvis.position.copy(p.hips);
    this.torso.position.copy(at(0, 0.3, 0)); this.torso.quaternion.copy(rot);
    this.head.position.copy(at(0, 0.68, 0.02)); this.head.rotation.set(p.lean * 0.35, 0, 0);
    this.scarf.forEach((m, i) => {
      m.position.copy(at(0, 0.5 + Math.sin(this.time * 9 - i) * 0.02 * i - i * 0.03, -0.15 - i * 0.12)); m.quaternion.copy(rot);
    });
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const sh = at(0.23 * s, 0.49, 0), hip = p.hips.clone().add(V(0.1 * s, -0.04, 0));
      const hand = this.ik(sh, p.hands[i], L.arm, L.fore, V(0.5 * s, -0.4, -1), this.limbs.ua[i], this.limbs.fa[i]);
      const ankle = this.ik(hip, p.feet[i], L.thigh, L.shin, V(0.08 * s, 0.1, 1), this.limbs.th[i], this.limbs.sh[i]);
      this.palms[i].position.copy(hand);
      this.shoes[i].position.copy(ankle).add(V(0, 0, 0.06)); this.shoes[i].rotation.x = Math.max(0, (ankle.y - 0.12) * -0.5 - ankle.z * 0.4);
    }
  }
  /** IK analítica de dos huesos con vector polo; devuelve el extremo alcanzable. */
  private ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, m1: THREE.Mesh, m2: THREE.Mesh) {
    const d = target.clone().sub(a), len = Math.min(Math.max(d.length(), 0.08), (l1 + l2) * 0.998);
    if (d.lengthSq() < 1e-8) d.set(0, -1, 0);
    d.normalize();
    const end = a.clone().addScaledVector(d, len), x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const perp = pole.clone().addScaledVector(d, -pole.dot(d));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    const mid = a.clone().addScaledVector(d, x).addScaledVector(perp.normalize(), h);
    this.seg(m1, a, mid); this.seg(m2, mid, end);
    return end;
  }
  private seg(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  }
}
