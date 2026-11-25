import { noInput, type Character, type Input } from '../core/character';
/** PRNG con semilla: mismo error humano en A y B para la misma semilla. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
interface Cue { z: number; key: 'jump' | 'crouch'; hold: number }
const CUES: Cue[] = [
  { z: -4.9, key: 'jump', hold: 0.1 }, { z: -9.9, key: 'jump', hold: 0.1 }, { z: -13.8, key: 'crouch', hold: 0.7 },
  { z: -21.9, key: 'jump', hold: 0.1 }, { z: -33.6, key: 'jump', hold: 0.1 }, { z: -43.6, key: 'jump', hold: 0.1 },
  { z: -51.5, key: 'jump', hold: 0.1 }, { z: -59, key: 'jump', hold: 0.1 },
];
/** Jugador simulado: guion por posición con error de ±jitter metros y reintento si se atasca. */
export class Bot {
  presses = 0; private cues: Cue[]; private next = 0; private hold = 0; private key: Cue['key'] = 'jump';
  private best = 99; private stuck = 0; private lastZ = 99;
  constructor(seed: number, jitter = 0.9) {
    const r = rng(seed * 7919); r(); r();
    this.cues = CUES.map(c => ({ ...c, z: c.z + (r() + r() - 1) * jitter }));
  }
  input(c: Character, dt: number): Input {
    const i = noInput(), z = c.pos.z;
    if (z > this.lastZ + 2) { this.next = this.cues.findIndex(q => q.z < z); this.hold = 0; this.best = z; } // reaparición
    this.lastZ = z;
    const tx = z < -38 && z > -53 ? 0.75 : 0, dx = tx - c.pos.x, l = Math.hypot(dx, 4);
    i.x = dx / l; i.z = -4 / l; i.sprint = true;
    this.hold -= dt;
    const cue = this.cues[this.next];
    if (cue && z <= cue.z) { this.next++; this.hold = cue.hold; this.key = cue.key; this.presses++; }
    if (z < this.best - 0.05) { this.best = z; this.stuck = 0; } else if (c.state === 'ground') this.stuck += dt;
    if (this.stuck > 0.5) { this.stuck = 0; this.hold = 0.1; this.key = 'jump'; this.presses++; }
    if (this.hold > 0) i[this.key] = true;
    return i;
  }
}
