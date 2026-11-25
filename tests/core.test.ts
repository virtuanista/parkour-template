import { describe, expect, it } from 'vitest';
import { Character, noInput, type Action, type Input } from '../src/core/character';
import { TUNING, type Variant } from '../src/core/config';
import { v3, World } from '../src/core/world';
import { runTrial } from '../src/ab/run';
const DT = 1 / 60;
function setup(v: Variant, build: (w: World) => void) {
  const w = new World(); w.add('ground', -20, 20, -1, 0, 20, -20); build(w);
  const c = new Character(w, TUNING[v], v3(0, 0, 5)); const log: Action[] = []; c.onAction = a => log.push(a);
  const run = (s: number, f: (c: Character) => Partial<Input>) => { for (let i = 0; i < s / DT; i++) c.step({ ...noInput(), ...f(c) }, DT); };
  return { c, log, run };
}
const fwd = { z: -1, sprint: true };
const toHang = (c: Character) => ({ sprint: true, z: c.state === 'hang' ? 0 : -1, jump: c.pos.z < 1 && c.state !== 'hang' });
describe.each(['A', 'B'] as Variant[])('mecánicas %s', v => {
  it('acelera hasta sprint y frena', () => {
    const { c, run } = setup(v, () => {}); run(1, () => fwd); expect(c.speed).toBeCloseTo(7, 1); run(1, () => ({})); expect(c.speed).toBeCloseTo(0, 2);
  });
  it('salta y aterriza', () => {
    const { c, log, run } = setup(v, () => {}); run(0.1, () => ({ jump: true })); expect(c.state).toBe('air');
    run(1, () => ({})); expect(c.state).toBe('ground'); expect(log).toEqual(['jump']);
  });
  it('no atraviesa un muro', () => {
    const { c, run } = setup(v, w => w.add('wall', -5, 5, 0, 6, 0, -1)); run(2, () => fwd); expect(c.pos.z).toBeGreaterThanOrEqual(0.31);
  });
  it('vault sobre obstáculo bajo', () => {
    const { c, log, run } = setup(v, w => w.add('vault', -2, 2, 0, 1, 0, -0.6));
    run(2, c => ({ ...fwd, jump: c.pos.z < 1.1 && c.pos.z > 0.5 })); expect(log[0]).toBe('vault'); expect(c.pos.z).toBeLessThan(-1);
  });
  it('mantle sobre plataforma', () => {
    const { c, log, run } = setup(v, w => w.add('mantle', -2, 2, 0, 1.6, 0, -18));
    run(2, c => ({ ...fwd, jump: c.pos.z < 1.1 && c.pos.z > 0.5 })); expect(log[0]).toBe('mantle'); expect(c.pos.y).toBeCloseTo(1.6, 3);
  });
  it('no hace mantle si un techo lo impide', () => {
    const { log, run } = setup(v, w => { w.add('mantle', -2, 2, 0, 1.6, 0, -8); w.add('beam', -2, 2, 2.4, 5, 0, -8); });
    run(2, c => ({ ...fwd, jump: c.pos.z < 1.1 })); expect(log).not.toContain('mantle');
  });
  it('cuelga, se desplaza y trepa', () => {
    const { c, log, run } = setup(v, w => w.add('ledge', -4, 4, 0, 3, 0, -16));
    run(1.5, toHang); expect(c.state).toBe('hang');
    const x = c.pos.x; run(0.5, () => ({ x: 1 })); expect(c.pos.x).toBeGreaterThan(x + 0.3);
    run(1.5, () => ({ z: -1 })); expect(log).toContain('climb'); expect(c.pos.y).toBeCloseTo(3, 3);
  });
  it('el desplazamiento se detiene al final de la cornisa', () => {
    const { c, run } = setup(v, w => w.add('ledge', -1, 1, 0, 3, 0, -6));
    run(1.5, toHang); run(4, () => ({ x: 1 })); expect(c.state).toBe('hang'); expect(c.pos.x).toBeGreaterThan(0.5); expect(c.pos.x).toBeLessThan(0.75);
  });
  it('suelta la cornisa con agacharse', () => {
    const { c, log, run } = setup(v, w => w.add('ledge', -4, 4, 0, 3, 0, -6));
    run(1.5, toHang); run(1, () => ({ crouch: true })); expect(log).toContain('drop'); expect(c.pos.y).toBeCloseTo(0);
  });
  it('wall run y wall jump', () => {
    const { c, log, run } = setup(v, w => w.add('wall', 0.6, 1.2, 0, 8, 10, -20));
    run(1.1, c => ({ ...fwd, jump: c.pos.z < 3 && c.state === 'ground' })); expect(c.state).toBe('wallrun');
    run(0.1, () => ({ ...fwd, jump: true })); expect(log).toContain('walljump'); expect(c.vel.x).toBeLessThan(-2);
  });
  it('slide bajo viga', () => {
    const { c, log, run } = setup(v, w => w.add('beam', -5, 5, 1.15, 4, 0, -1));
    run(2.5, c => ({ ...fwd, crouch: c.pos.z < 2 && c.pos.z > -2 })); expect(log).toContain('slide'); expect(c.pos.z).toBeLessThan(-2); expect(c.crouched).toBe(false);
  });
  it('no se levanta bajo techo', () => {
    const { c, run } = setup(v, w => w.add('beam', -5, 5, 1.15, 4, 10, -10));
    c.crouched = true; run(1, () => ({})); expect(c.crouched).toBe(true); run(1, () => ({ jump: true })); expect(c.pos.y).toBe(0);
  });
  it('rueda tras caída alta con velocidad', () => {
    const { c, log, run } = setup(v, () => {}); c.pos.y = 3.5; c.state = 'air'; c.vel.z = -5; run(1, () => fwd); expect(log).toContain('roll');
  });
  it('reaparece al caer al vacío', () => { const { log, run } = setup(v, () => {}); run(6, () => fwd); expect(log).toContain('respawn'); });
  it('es determinista', () => expect(runTrial(v, 7)).toEqual(runTrial(v, 7)));
});
it('solo B salta obstáculos sin pulsar', () => {
  for (const v of ['A', 'B'] as Variant[]) {
    const { log, run } = setup(v, w => w.add('vault', -2, 2, 0, 1, 0, -0.6)); run(2, () => fwd); expect(log.includes('vault')).toBe(v === 'B');
  }
});
