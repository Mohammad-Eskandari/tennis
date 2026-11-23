// World coordinates: metres. x spans sidelines, z spans baselines, y is up.
export const COURT = Object.freeze({
  length: 23.77,
  singles: 8.23,
  doubles: 10.97,
  service: 6.4,
  net: 0.914,
  radius: 0.0335,
});
export const STEP = 1 / 120;
export const SURFACES = Object.freeze({
  hard: { restitution: 0.76, friction: 0.83, color: 0x347d91, outer: 0x285764 },
  clay: { restitution: 0.8, friction: 0.72, color: 0xad6043, outer: 0x824936 },
  grass: { restitution: 0.67, friction: 0.9, color: 0x568262, outer: 0x3f6551 },
});
export const DIFFICULTIES = Object.freeze({
  beginner: { speed: 4.1, reaction: 0.38, error: 1.1, miss: 0.24 },
  intermediate: { speed: 5.2, reaction: 0.24, error: 0.55, miss: 0.12 },
  advanced: { speed: 6.1, reaction: 0.15, error: 0.23, miss: 0.04 },
});
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
