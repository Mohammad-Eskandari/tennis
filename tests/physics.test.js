import { test } from "node:test";
import assert from "node:assert/strict";
import { ballStep, inCourt, validServe, launch } from "../shared/physics.js";
import { STEP, COURT } from "../shared/config.js";
const ball = (o = {}) => ({
  x: 0,
  y: 4,
  z: -5,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
  ...o,
});
test("gravity accelerates ball downward and ground rebounds", () => {
  const b = ball();
  let bounced = false;
  for (let i = 0; i < 180; i++) {
    for (const e of ballStep(b, STEP))
      if (e.type === "bounce") {
        bounced = true;
        assert.ok(b.vy > 0);
      }
  }
  assert.ok(bounced);
  assert.ok(Number.isFinite(b.y));
});
test("swept net collision catches a ball travelling 200 m/s", () => {
  const b = ball({ y: 0.5, z: -0.4, vz: 200 });
  const events = ballStep(b, STEP);
  assert.ok(events.some((e) => e.type === "net"));
  assert.ok(b.vz < 0);
});
test("high ball clears net", () => {
  const b = ball({ y: 3, z: -0.4, vz: 200 });
  assert.ok(!ballStep(b, STEP).some((e) => e.type === "net"));
});
test("topspin curves downward more than a flat ball", () => {
  const flat = ball({ vz: 15 }),
    top = ball({ vz: 15, spin: 5 });
  for (let i = 0; i < 50; i++) {
    ballStep(flat, STEP);
    ballStep(top, STEP);
  }
  assert.ok(top.y < flat.y);
});
test("line touches are in; outside ball is out", () => {
  assert.ok(inCourt(COURT.singles / 2 + 0.02, 10));
  assert.ok(!inCourt(4.5, 10));
  assert.ok(!inCourt(0, 12.5));
});
test("serve requires diagonal box on correct side of net", () => {
  assert.ok(validServe(-2, 4, -1, 1));
  assert.ok(validServe(2, -4, 1, 1));
  assert.ok(!validServe(2, 4, -1, 1));
  assert.ok(!validServe(-2, 8, -1, 1));
  assert.ok(!validServe(-2, -4, -1, 1));
});
test("launch produces continuous ballistic movement without teleport", () => {
  const b = ball({ y: 1 });
  launch(b, { x: 2, z: 9 });
  assert.equal(b.x, 0);
  assert.equal(b.z, -5);
  assert.ok(b.vz > 0);
  ballStep(b, STEP);
  assert.ok(b.z > -5 && b.z < -4);
});
test("all surfaces remain finite through 30 seconds", () => {
  for (const surface of ["hard", "clay", "grass"]) {
    const b = ball({ vx: 2, vz: 13, spin: 5 });
    for (let i = 0; i < 3600; i++) ballStep(b, STEP, surface);
    for (const key of ["x", "y", "z", "vx", "vy", "vz"])
      assert.ok(Number.isFinite(b[key]));
  }
});
