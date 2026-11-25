export type Variant = 'A' | 'B';

export interface Tuning {
  variant: Variant; label: string;
  walk: number; run: number; sprint: number; crouchSpeed: number;
  accel: number; airAccel: number; friction: number; gravity: number; jump: number;
  coyote: number; buffer: number;
  radius: number; height: number; crouchHeight: number; step: number;
  minObstacle: number; vaultMaxHeight: number; vaultMaxDepth: number; mantleMaxHeight: number;
  traceBase: number; traceSpeed: number;
  ledgeMin: number; ledgeMax: number; hangOffset: number;
  wallRunMinSpeed: number; wallRunTime: number; wallRunGravity: number; wallJumpOut: number;
  slideMinSpeed: number; slideBoost: number; slideFriction: number;
  rollFallSpeed: number; hardFallSpeed: number;
  /** Lanza vault/mantle sin pulsar salto cuando se esprinta hacia el obstáculo. */
  autoTraverse: boolean;
  /** Fracción de velocidad de entrada que se conserva al salir de un vault. */
  momentum: number;
}

const base: Tuning = {
  variant: 'A', label: 'Manual', walk: 2.2, run: 4.6, sprint: 7, crouchSpeed: 2.2,
  accel: 30, airAccel: 9, friction: 26, gravity: 18, jump: 6.2, coyote: 0.1, buffer: 0.12,
  radius: 0.32, height: 1.8, crouchHeight: 1.0, step: 0.4,
  minObstacle: 0.45, vaultMaxHeight: 1.25, vaultMaxDepth: 1.1, mantleMaxHeight: 2.0,
  traceBase: 0.75, traceSpeed: 0.12, ledgeMin: 1.4, ledgeMax: 2.15, hangOffset: 1.9,
  wallRunMinSpeed: 4, wallRunTime: 1.3, wallRunGravity: 0.22, wallJumpOut: 4,
  slideMinSpeed: 4.3, slideBoost: 1.5, slideFriction: 4, rollFallSpeed: 9, hardFallSpeed: 16,
  autoTraverse: false, momentum: 0.6,
};

export const TUNING: Record<Variant, Tuning> = {
  A: base,
  B: { ...base, variant: 'B', label: 'Fluida', autoTraverse: true, momentum: 1, coyote: 0.14, buffer: 0.18 },
};
