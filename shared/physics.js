import { COURT, SURFACES } from "./config.js";
export function ballStep(b, dt, surface = "hard") {
  const events = [],
    prev = { x: b.x, y: b.y, z: b.z },
    speed = Math.hypot(b.vx, b.vy, b.vz),
    drag = 0.007 * speed;
  b.vx -= b.vx * drag * dt;
  b.vy += (-9.81 - b.vy * drag - b.spin * Math.abs(b.vz) * 0.018) * dt;
  b.vz -= b.vz * drag * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  // Sweep through the net plane; evaluate crossing height rather than end position.
  if (prev.z * b.z < 0) {
    const t = prev.z / (prev.z - b.z),
      y = prev.y + (b.y - prev.y) * t,
      x = prev.x + (b.x - prev.x) * t;
    if (Math.abs(x) < COURT.doubles / 2 + 0.1 && y < COURT.net + COURT.radius) {
      events.push({ type: "net" });
      b.z = Math.sign(prev.z) * COURT.radius;
      b.vz *= -0.12;
      b.vy *= 0.5;
    }
  }
  if (b.y <= COURT.radius && b.vy < 0) {
    const t = (prev.y - COURT.radius) / (prev.y - b.y);
    events.push({
      type: "bounce",
      x: prev.x + (b.x - prev.x) * t,
      z: prev.z + (b.z - prev.z) * t,
    });
    b.y = COURT.radius;
    b.vy = -b.vy * SURFACES[surface].restitution;
    b.vx *= SURFACES[surface].friction;
    b.vz *= SURFACES[surface].friction;
  }
  return events;
}
export function inCourt(x, z) {
  return (
    Math.abs(x) <= COURT.singles / 2 + COURT.radius &&
    Math.abs(z) <= COURT.length / 2 + COURT.radius
  );
}
export function validServe(x, z, side, court) {
  return (
    z * side < 0 &&
    Math.abs(z) <= COURT.service + COURT.radius &&
    x * court * side >= -COURT.radius &&
    Math.abs(x) <= COURT.singles / 2 + COURT.radius
  );
}
export function launch(b, target, height = 3.2, spin = 0) {
  // Ballistic initial solution, then continuous drag/Magnus integration. No position teleport.
  const apex = Math.max(height, b.y + 0.4),
    up = Math.sqrt(2 * 9.81 * (apex - b.y)),
    t = up / 9.81 + Math.sqrt((2 * (apex - COURT.radius)) / 9.81);
  b.vx = ((target.x - b.x) / t) * 1.075;
  b.vz = ((target.z - b.z) / t) * 1.075;
  b.vy = up;
  b.spin = spin;
}
