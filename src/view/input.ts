import { noInput, type Input } from '../core/character';

/** Teclado + ratón (pointer lock) + mando estándar + táctil. Devuelve dirección en espacio de mundo. */
export class Controls {
  private keys = new Set<string>(); private touch = { id: -1, x: 0, y: 0, mx: 0, my: 0 };
  look = { x: 0, y: 0 };
  constructor(el: HTMLElement, enabled: () => boolean) {
    addEventListener('keydown', e => { if (enabled() && ['Space', 'Tab'].includes(e.code)) e.preventDefault(); this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('click', () => { if (enabled() && matchMedia('(pointer: fine)').matches) void Promise.resolve(el.requestPointerLock()).catch(() => {}); });
    addEventListener('mousemove', e => { if (document.pointerLockElement === el) { this.look.x += e.movementX * 0.0025; this.look.y += e.movementY * 0.0025; } });
    // Táctil: mitad izquierda = mover, mitad derecha = cámara.
    const last = new Map<number, { x: number; y: number }>();
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      last.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.clientX < innerWidth / 2 && this.touch.id < 0) this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, mx: 0, my: 0 };
    });
    el.addEventListener('pointermove', e => {
      const l = last.get(e.pointerId); if (!l) return;
      if (e.pointerId === this.touch.id) { this.touch.mx = (e.clientX - this.touch.x) / 60; this.touch.my = (e.clientY - this.touch.y) / 60; }
      else { this.look.x += (e.clientX - l.x) * 0.006; this.look.y += (e.clientY - l.y) * 0.006; }
      last.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const end = (e: PointerEvent) => { last.delete(e.pointerId); if (e.pointerId === this.touch.id) this.touch = { id: -1, x: 0, y: 0, mx: 0, my: 0 }; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll<HTMLElement>('[data-key]')) {
      b.addEventListener('pointerdown', e => { e.preventDefault(); this.keys.add(b.dataset.key!); });
      for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => this.keys.delete(b.dataset.key!));
    }
  }
  read(yaw: number): Input {
    const k = this.keys, i = noInput(), on = (...c: string[]) => c.some(x => k.has(x));
    let x = +on('KeyD', 'ArrowRight') - +on('KeyA', 'ArrowLeft') + this.touch.mx, y = +on('KeyS', 'ArrowDown') - +on('KeyW', 'ArrowUp') + this.touch.my;
    i.sprint = on('ShiftLeft', 'ShiftRight') || Math.hypot(this.touch.mx, this.touch.my) > 1; i.jump = on('Space'); i.crouch = on('KeyC', 'ControlLeft');
    const pad = navigator.getGamepads?.().find(p => p?.mapping === 'standard');
    if (pad) {
      const dz = (v: number) => Math.abs(v) < 0.15 ? 0 : v;
      x += dz(pad.axes[0]); y += dz(pad.axes[1]); this.look.x += dz(pad.axes[2]) * 0.045; this.look.y += dz(pad.axes[3]) * 0.03;
      i.jump ||= pad.buttons[0].pressed; i.crouch ||= pad.buttons[1].pressed; i.sprint ||= pad.buttons[7].pressed || pad.buttons[10].pressed;
    }
    const l = Math.max(1, Math.hypot(x, y)); x /= l; y /= l;
    i.x = x * Math.cos(yaw) + y * Math.sin(yaw); i.z = -x * Math.sin(yaw) + y * Math.cos(yaw);
    return i;
  }
}
