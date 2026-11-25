import type { Tuning } from './config';
import { v3, type Box, type V3, type World } from './world';

export interface Obstacle { box: Box; normal: V3; edge: V3; height: number; depth: number; top: V3; topFree: boolean; back: V3 | null; backFloor: number | null }
export type Plan = { type: 'vault' | 'mantle'; obs: Obstacle };

/** Escanea por capas hacia delante y describe el primer obstáculo con borde utilizable. */
export function scan(w: World, t: Tuning, pos: V3, dir: V3, reach: number, maxH: number): Obstacle | null {
  for (let h = t.minObstacle - 0.05; h <= maxH; h += 0.2) {
    const hit = w.raycast(v3(pos.x, pos.y + h, pos.z), v3(dir.x, 0, dir.z), reach);
    if (!hit || hit.normal.y !== 0) continue;
    const n = hit.normal, b = hit.box;
    if (-(dir.x * n.x + dir.z * n.z) < 0.6) continue;
    const height = b.max.y - pos.y;
    if (height > maxH || height < t.minObstacle) continue;
    const inset = t.radius + 0.12;
    const at = (d: number, y: number) => v3(hit.point.x - n.x * d, y, hit.point.z - n.z * d);
    const depth = n.x ? b.max.x - b.min.x : b.max.z - b.min.z;
    const top = at(inset, b.max.y), edge = at(0, b.max.y);
    // El borde debe estar despejado: si otra caja lo tapa no hay donde poner las manos.
    if (!w.free(at(0.06, b.max.y + 0.02), 0.05, 0.3)) continue;
    const backP = at(depth + inset, b.max.y);
    const backFree = w.free(v3(backP.x, b.max.y, backP.z), t.radius, t.crouchHeight);
    const bf = w.floor(backP, t.radius, height + 1.3);
    return { box: b, normal: n, edge, height, depth, top, topFree: w.free(top, t.radius, t.height),
      back: backFree ? backP : null, backFloor: bf };
  }
  return null;
}

/** Árbol de decisión de suelo: vault si es bajo y fino con salida libre; si no, mantle. */
export function plan(w: World, t: Tuning, pos: V3, dir: V3, speed: number): Plan | null {
  const obs = scan(w, t, pos, dir, t.traceBase + speed * t.traceSpeed, t.mantleMaxHeight);
  if (!obs) return null;
  if (obs.height <= t.vaultMaxHeight && obs.depth <= t.vaultMaxDepth && obs.back && speed > t.walk) {
    const y = obs.backFloor ?? pos.y;
    if (w.free(v3(obs.back.x, y, obs.back.z), t.radius, t.height)) return { type: 'vault', obs };
  }
  return obs.topFree ? { type: 'mantle', obs } : null;
}
