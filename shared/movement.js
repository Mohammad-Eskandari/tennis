import { clamp } from "./config.js";
// Shared by authoritative simulation and local movement prediction.
export function movePlayer(p, control, dt, moving = true) {
  const n = Math.max(1, Math.hypot(control.x || 0, control.z || 0)),
    speed = control.speed || (control.sprint ? 7 : 5.3),
    a = 1 - Math.exp(-16 * dt);
  p.vx += (((control.x || 0) / n) * speed - p.vx) * a;
  p.vz += (((control.z || 0) / n) * speed - p.vz) * a;
  if (moving) {
    p.x = clamp(p.x + p.vx * dt, -6.6, 6.6);
    p.z = clamp(
      p.z + p.vz * dt,
      p.side < 0 ? -14.5 : 0.6,
      p.side < 0 ? -0.6 : 14.5,
    );
  }
}
