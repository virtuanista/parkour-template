import { Character, type Action } from '../core/character';
import { TUNING, type Variant } from '../core/config';
import { buildLevel, FINISH_Z, SPAWN } from '../core/level';
import { Bot } from './bot';
export const DT = 1 / 60;
export interface RunResult { variant: Variant; seed: number; finished: boolean; time: number; presses: number; falls: number; avgSpeed: number; actions: Partial<Record<Action, number>> }
/** Los puntos de control solo se guardan en suelo firme. */
export function updateCheckpoint(c: Character) {
  const z = c.pos.z < -54.5 ? -55 : c.pos.z < -37.8 ? -38.5 : null;
  if (z !== null && Math.abs(c.pos.x) < 6 && c.state === 'ground' && c.checkpoint.z > z) c.checkpoint = { x: 0, y: 0, z };
}
export function runTrial(variant: Variant, seed: number, limit = 60): RunResult {
  const c = new Character(buildLevel(), TUNING[variant], SPAWN), bot = new Bot(seed);
  const actions: RunResult['actions'] = {};
  c.onAction = a => { actions[a] = (actions[a] ?? 0) + 1; };
  let time = 0;
  while (time < limit && c.pos.z > FINISH_Z) { c.step(bot.input(c, DT), DT); time += DT; updateCheckpoint(c); }
  return { variant, seed, finished: c.pos.z <= FINISH_Z, time, presses: bot.presses, falls: actions.respawn ?? 0, avgSpeed: (SPAWN.z - FINISH_Z) / time, actions };
}
export interface Summary { variant: Variant; n: number; completion: number; time: number; presses: number; falls: number; avgSpeed: number }
export function summarize(rs: RunResult[]): Summary {
  const m = (f: (r: RunResult) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  return { variant: rs[0].variant, n: rs.length, completion: m(r => +r.finished), time: m(r => r.time), presses: m(r => r.presses), falls: m(r => r.falls), avgSpeed: m(r => r.avgSpeed) };
}
/** Reparto 50/50 persistente; ?variant=A|B lo fuerza. */
export function assignVariant(): Variant {
  const q = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  if (q === 'A' || q === 'B') return q;
  try {
    const s = localStorage.getItem('parkour.variant');
    if (s === 'A' || s === 'B') return s;
    const v: Variant = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem('parkour.variant', v);
    return v;
  } catch { return 'A'; }
}
