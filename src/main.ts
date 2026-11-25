import * as THREE from 'three';
import { Character, type Action } from './core/character';
import { TUNING, type Variant } from './core/config';
import { buildLevel, FINISH_Z, SPAWN } from './core/level';
import { Bot } from './ab/bot';
import { assignVariant, DT, updateCheckpoint } from './ab/run';
import { Controls } from './view/input';
import { Stage } from './view/stage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ACCENT: Record<Variant, number> = { A: 0xd8553a, B: 0x147d7a };
const ES: Record<Action, string> = { jump: 'salto', vault: 'vault', mantle: 'mantle', grab: 'agarre', climb: 'trepar', wallrun: 'wall run', walljump: 'wall jump', slide: 'deslizar', roll: 'voltereta', hardland: 'caída dura', drop: 'soltarse', respawn: 'reaparición' };

interface Session { c: Character; stage: Stage; bot: Bot | null; time: number; done: boolean; last: string; actions: Action[]; prev: THREE.Vector3; started: boolean }
function session(v: Variant, bot: Bot | null): Session {
  const world = buildLevel(), c = new Character(world, TUNING[v], SPAWN);
  const s: Session = { c, stage: new Stage(world, ACCENT[v]), bot, time: 0, done: false, last: '', actions: [], prev: new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z), started: !!bot };
  c.onAction = a => { s.last = ES[a]; s.actions.push(a); };
  return s;
}

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setScissorTest(true);
const resize = () => renderer.setSize(innerWidth, innerHeight, false);
addEventListener('resize', resize); resize();

let variant = assignVariant(), mode: 'menu' | 'play' | 'ab' = 'menu';
let sessions: Session[] = [session(variant, new Bot(1))];
const controls = new Controls(canvas, () => mode !== 'menu');

function disposeAll() {
  for (const s of sessions) s.stage.scene.traverse(o => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) { m.map?.dispose(); m.dispose(); } }
    if (o instanceof THREE.DirectionalLight) o.dispose();
  });
}
function start(m: typeof mode) {
  disposeAll(); mode = m;
  sessions = m === 'ab' ? [session('A', new Bot(1)), session('B', new Bot(1))] : [session(variant, m === 'menu' ? new Bot(1) : null)];
  $('menu').hidden = m !== 'menu'; $('hud').hidden = m === 'menu'; $('p1').hidden = m !== 'ab'; $('p0').style.borderColor = sessions[0].c.t.variant === 'B' ? 'var(--b)' : 'var(--accent)'; $('result').hidden = true;
  if (m === 'menu') document.exitPointerLock?.(); else (document.activeElement as HTMLElement | null)?.blur();
}
function pick(v: Variant) {
  variant = v; $('assigned').textContent = `${v} (${TUNING[v].label.toLowerCase()})`;
  document.querySelector<HTMLInputElement>(`input[value=${v}]`)!.checked = true;
}
pick(variant);
document.querySelectorAll<HTMLInputElement>('input[name=variant]').forEach(r => r.addEventListener('change', () => { pick(r.value as Variant); start('menu'); }));
$('play').onclick = () => start('play');
$('compare').onclick = () => start('ab');
addEventListener('keydown', e => {
  if (mode === 'menu' || e.repeat) return;
  if (e.code === 'KeyR') start(mode);
  if (e.code === 'Tab') start('menu');
});

function tick(s: Session) {
  const { c } = s; s.prev.set(c.pos.x, c.pos.y, c.pos.z);
  const inp = s.bot ? s.bot.input(c, DT) : controls.read(s.stage.yaw);
  if (s.done && s.bot) { inp.x = inp.z = 0; inp.jump = inp.crouch = false; }
  if (inp.x || inp.z) s.started = true;
  c.step(inp, DT); updateCheckpoint(c);
  if (s.done) return;
  if (s.started) s.time += DT;
  if (c.pos.z <= FINISH_Z && Math.abs(c.pos.x) < 6) {
    s.done = true;
    if (mode === 'play') showResult(`Meta en ${s.time.toFixed(2)} s con la variante ${c.t.variant}. Pulsa R para repetir.`);
    if (mode === 'ab' && sessions.every(x => x.done)) showResult(`A: ${sessions[0].time.toFixed(2)} s. B: ${sessions[1].time.toFixed(2)} s. Es un jugador simulado con el mismo error en ambas.`);
  }
}
function showResult(t: string) { $('result').textContent = t; $('result').hidden = false; }

let last = performance.now(), acc = 0, fps = 60;
const pos = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (mode === 'play') {
    const st = sessions[0].stage; st.yaw -= controls.look.x; st.pitch = Math.max(-0.5, Math.min(1.2, st.pitch + controls.look.y));
  }
  controls.look.x = controls.look.y = 0;
  while (acc >= DT) { sessions.forEach(tick); acc -= DT; }
  if (mode === 'menu') { if (sessions[0].done) start('menu'); sessions[0].stage.yaw = 0.5; }
  const w = innerWidth / sessions.length, h = innerHeight;
  sessions.forEach((s, i) => {
    const { c, stage } = s; pos.set(c.pos.x, c.pos.y, c.pos.z);
    if (pos.distanceTo(s.prev) < 2) pos.lerpVectors(s.prev, pos, acc / DT);
    stage.update(c, pos, dt);
    stage.camera.aspect = w / h; stage.camera.updateProjectionMatrix();
    renderer.setViewport(w * i, 0, w, h); renderer.setScissor(w * i, 0, w, h); renderer.render(stage.scene, stage.camera);
    if (mode !== 'menu') $('p' + i).textContent = `${c.t.variant}, ${c.t.label.toLowerCase()}\n${s.time.toFixed(2)} s\n${c.speed.toFixed(1)} m/s\nEstado: ${c.state}\nÚltima: ${s.last || 'ninguna'}\n${fps.toFixed(0)} fps`;
  });
});

/** Ganchos para pruebas E2E y depuración desde consola. */
declare global { interface Window { __parkour: unknown } }
window.__parkour = { get sessions() { return sessions.map(s => ({ variant: s.c.t.variant, pos: { ...s.c.pos }, state: s.c.state, done: s.done, time: s.time, actions: [...s.actions] })); }, get mode() { return mode; } };
const q = new URLSearchParams(location.search).get('mode');
if (q === 'ab' || q === 'play') start(q);
