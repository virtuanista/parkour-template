export interface V3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export type Kind = 'ground' | 'vault' | 'mantle' | 'wall' | 'beam' | 'ledge';
export interface Box { id: number; min: V3; max: V3; kind: Kind }
export interface Hit { box: Box; t: number; point: V3; normal: V3 }
const EPS = 1e-4;

/** Mundo de cajas alineadas a ejes. Sustituible por un motor físico con la misma interfaz. */
export class World {
  boxes: Box[] = [];
  add(kind: Kind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box {
    const b: Box = { id: this.boxes.length, kind,
      min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)) };
    this.boxes.push(b);
    return b;
  }
  /** Cajas que solapan con el volumen del personaje (pies en p). */
  overlaps(p: V3, r: number, h: number): Box[] {
    return this.boxes.filter(b => p.x + r > b.min.x + EPS && p.x - r < b.max.x - EPS &&
      p.z + r > b.min.z + EPS && p.z - r < b.max.z - EPS && p.y + h > b.min.y + EPS && p.y < b.max.y - EPS);
  }
  free(p: V3, r: number, h: number) { return this.overlaps(p, r, h).length === 0; }

  raycast(o: V3, d: V3, max: number): Hit | null {
    let best: Hit | null = null;
    for (const box of this.boxes) {
      let tn = -Infinity, tf = Infinity, axis: 'x' | 'y' | 'z' = 'x', miss = false;
      for (const a of ['x', 'y', 'z'] as const) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < box.min[a] || o[a] > box.max[a]) { miss = true; break; } continue; }
        const t1 = (box.min[a] - o[a]) / d[a], t2 = (box.max[a] - o[a]) / d[a];
        if (Math.min(t1, t2) > tn) { tn = Math.min(t1, t2); axis = a; }
        tf = Math.min(tf, Math.max(t1, t2));
      }
      if (miss || tn > tf || tn < 0 || tn > max || (best && tn >= best.t)) continue;
      const n = v3(); n[axis] = -Math.sign(d[axis]);
      best = { box, t: tn, normal: n, point: v3(o.x + d.x * tn, o.y + d.y * tn, o.z + d.z * tn) };
    }
    return best;
  }
  /** Suelo más alto bajo el volumen, entre p.y y p.y - depth. */
  floor(p: V3, r: number, depth: number): number | null {
    let y: number | null = null;
    for (const b of this.boxes) {
      if (p.x + r <= b.min.x + EPS || p.x - r >= b.max.x - EPS || p.z + r <= b.min.z + EPS || p.z - r >= b.max.z - EPS) continue;
      if (b.max.y <= p.y + 1e-3 && b.max.y >= p.y - depth && (y === null || b.max.y > y)) y = b.max.y;
    }
    return y;
  }
}
