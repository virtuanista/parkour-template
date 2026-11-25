import * as THREE from 'three';
import type { Character } from '../core/character';
import { FINISH_Z } from '../core/level';
import { v3, type Kind, type World } from '../core/world';
import { Rig } from './rig';

const COLORS: Record<Kind, number> = { ground: 0xb9ab98, vault: 0xe8b04a, mantle: 0x5fa8a0, wall: 0x7d6a8f, beam: 0xd9694f, ledge: 0x4f7fa8 };
function grid(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(40,30,50,.28)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Escena, luces, cámara de tercera persona y maniquí para un personaje. */
export class Stage {
  readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
  yaw = 0; pitch = 0.22; readonly rig: Rig;
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.6); private focus = new THREE.Vector3(); private dist = 4.2; private first = true;

  constructor(readonly world: World, accent: number) {
    const sky = 0xdce5e8;
    this.scene.background = new THREE.Color(sky); this.scene.fog = new THREE.Fog(sky, 35, 110);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f78, 1.5), this.sun, this.sun.target);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 60 });
    const tex = grid();
    for (const b of world.boxes) {
      const s = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z], geo = new THREE.BoxGeometry(s[0], s[1], s[2]);
      // UV en metros, para leer las alturas a simple vista.
      const uv = geo.attributes.uv, dims = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
      for (let i = 0; i < uv.count; i++) { const [u, w] = dims[Math.floor(i / 4)]; uv.setXY(i, uv.getX(i) * s[u], uv.getY(i) * s[w]); }
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS[b.kind], map: tex, roughness: 0.9 }));
      m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      m.castShadow = b.kind !== 'ground'; m.receiveShadow = true; this.scene.add(m);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(12, 0.02, 0.6), new THREE.MeshBasicMaterial({ color: accent }));
    line.position.set(0, 0.011, FINISH_Z); this.scene.add(line);
    this.rig = new Rig(accent); this.scene.add(this.rig.root);
  }

  update(c: Character, pos: THREE.Vector3, dt: number) {
    this.rig.update(c, dt, pos);
    const h = c.state === 'slide' || c.state === 'roll' || c.crouched ? 0.95 : 1.45;
    const want = pos.clone().setY(pos.y + h);
    if (this.first || want.distanceTo(this.focus) > 6) { this.focus.copy(want); this.first = false; }
    else this.focus.lerp(want, 1 - Math.exp(-14 * dt));
    const cp = Math.cos(this.pitch), d = v3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = this.world.raycast(this.focus, d, 4.4);
    const target = hit ? Math.max(0.5, hit.t - 0.25) : 4.2;
    this.dist = target < this.dist ? target : this.dist + (target - this.dist) * (1 - Math.exp(-4 * dt));
    this.camera.position.set(this.focus.x + d.x * this.dist, this.focus.y + d.y * this.dist, this.focus.z + d.z * this.dist);
    this.camera.lookAt(this.focus);
    const fov = 62 + Math.max(0, c.speed - 4) * 2.2;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();
    this.sun.target.position.copy(pos); this.sun.position.copy(pos).add(new THREE.Vector3(9, 20, 8));
  }
}
