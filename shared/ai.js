import { DIFFICULTIES, clamp } from "./config.js";
export function aiInput(s, index) {
  const p = s.players[index],
    b = s.ball,
    side = p.side,
    d = DIFFICULTIES[s.difficulty];
  if (s.time < p.nextThink) return p.decision;
  p.nextThink = s.time + d.reaction;
  const approaching = b.vz * side > 0;
  const flight = Math.max(0, Math.min(1.5, (p.z - b.z) / (b.vz || 1)));
  const x = approaching
    ? clamp(b.x + b.vx * flight + Math.sin(s.time * 2.1) * d.error, -4.3, 4.3)
    : 0;
  const z = approaching
    ? clamp(b.z + b.vz * 0.45, side > 0 ? 2 : -12, side > 0 ? 12 : -2)
    : side * 9.6;
  const dx = x - p.x,
    dz = z - p.z;
  // A stable per-shot sample: mistakes remain consistent through the contact window.
  const sample =
    Math.abs(
      Math.sin((s.rally + s.stats.points * 13 + index * 37) * 78.233) *
        43758.5453,
    ) % 1;
  const miss = Math.min(0.45, d.miss + s.rally * 0.006);
  p.decision = {
    x: Math.abs(dx) > 0.18 ? Math.sign(dx) : 0,
    z: Math.abs(dz) > 0.25 ? Math.sign(dz) : 0,
    swing:
      approaching &&
      s.bounces > 0 &&
      (s.rally < 2 || sample > miss) &&
      Math.hypot(b.x - p.x, b.z - p.z) < 2.05 &&
      b.y < 2.7,
    shot: ["flat", "topspin", "slice"][Math.floor(s.time * 1.7) % 3],
    aim: clamp(
      -s.players[1 - index].x / 4 + Math.sin(s.rally * 2.4) * 0.65,
      -1,
      1,
    ),
    ai: true,
    speed: d.speed,
  };
  return p.decision;
}
