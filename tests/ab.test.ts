import { expect, it } from 'vitest';
import { runTrial, summarize } from '../src/ab/run';
it('A/B: 200 semillas emparejadas, ambas variantes completables', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
  const a = seeds.map(s => runTrial('A', s)), b = seeds.map(s => runTrial('B', s));
  console.table([summarize(a), summarize(b)]);
  const d = a.map((r, i) => r.time - b[i].time), m = d.reduce((x, y) => x + y) / d.length;
  const se = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1) / d.length);
  console.log(`A-B tiempo: ${m.toFixed(2)} s, IC95 [${(m - 1.96 * se).toFixed(2)}, ${(m + 1.96 * se).toFixed(2)}]`);
  console.log('acciones', JSON.stringify({ A: a[0].actions, B: b[0].actions }));
  for (const r of [a, b]) expect(summarize(r).completion).toBeGreaterThanOrEqual(0.95);
});
