import { v3, World } from './world';
export const FINISH_Z = -76;
export const SPAWN = v3(0, 0, 6);
/** Circuito lineal (x≈0, hacia -z) y zona libre a los lados del primer tramo. */
export function buildLevel(): World {
  const w = new World();
  w.add('ground', -24, 24, -1, 0, 14, -34);
  w.add('vault', -2.5, 2.5, 0, 1, -6, -6.6);
  w.add('vault', -2.5, 2.5, 0, 0.9, -11, -11.5);
  w.add('beam', -4, 4, 1.15, 3.2, -16, -16.8);
  w.add('wall', -4.6, -4, 0, 3.2, -16, -16.8); w.add('wall', 4, 4.6, 0, 3.2, -16, -16.8);
  w.add('mantle', -4, 4, 0, 1.6, -23, -30);
  w.add('ground', -6, 6, -1, 0, -37.4, -44);
  w.add('wall', 1.2, 1.8, -3, 6, -42, -55);
  w.add('ground', -6, 6, -1, 0, -54, -66);
  w.add('ledge', -4, 4, 0, 3, -60, -66);
  w.add('ground', -6, 6, -1, 0, -66, -82);
  // Zona libre izquierda: alturas graduadas.
  [0.5, 0.8, 1.1, 1.4, 1.8, 2.2, 2.6, 3].forEach((h, i) =>
    w.add(h <= 1.25 ? 'vault' : h <= 2 ? 'mantle' : 'ledge', -20, -17, 0, h, 8 - i * 4.5, 7.2 - i * 4.5));
  // Zona libre derecha: cornisa larga, muros paralelos y escalones.
  w.add('ledge', 14, 16, 0, 2.7, 8, -4);
  w.add('wall', 11, 11.6, 0, 6, -10, -22); w.add('wall', 14.6, 15.2, 0, 6, -10, -22);
  for (let i = 0; i < 6; i++) w.add('mantle', 18, 21, 0, 0.35 * (i + 1), -12 - i, -13 - i);
  w.add('mantle', 18, 21, 0, 2.1, -18, -23);
  return w;
}
