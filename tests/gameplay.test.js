import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, stepMatch } from "../shared/simulation.js";
import { STEP } from "../shared/config.js";
test("space serves and ball travels continuously to a legal box", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  assert.equal(s.phase, "rally");
  let bounce;
  for (let i = 0; i < 300; i++) {
    stepMatch(s, {});
    bounce = s.events.find((e) => e.type === "bounce");
    if (bounce) break;
  }
  assert.ok(bounce);
  assert.equal(s.faults, 0);
  assert.ok(bounce.z > 0 && bounce.z < 6.5);
});
test("movement normalizes diagonals and respects court half", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  for (let i = 0; i < 180; i++) stepMatch(s, { x: 1, z: 1, sprint: true });
  assert.ok(s.players[0].z < 0);
  assert.ok(Math.hypot(s.players[0].vx, s.players[0].vz) <= 7.001);
  assert.ok(s.players[0].x <= 6.6);
});
test("distant swing cannot hit ball", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  s.lastHit = 1;
  s.ball.x = -5;
  s.ball.z = -3;
  s.ball.y = 1;
  s.players[0].x = 5;
  const n = s.stats.shots;
  stepMatch(s, { swing: true });
  assert.equal(s.stats.shots, n);
});
test("double faults award receiver point", () => {
  const s = createMatch();
  for (let j = 0; j < 2; j++) {
    stepMatch(s, { swing: true });
    Object.assign(s.ball, { x: 10, y: 0.04, z: 4, vy: -2, vx: 0, vz: 0 });
    stepMatch(s, {});
  }
  assert.equal(s.score.points[1], 1);
  assert.equal(s.phase, "point");
});
test("net let preserves serve count and point score", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  s.netTouch = true;
  Object.assign(s.ball, { x: -2, y: 0.04, z: 4, vy: -2, vx: 0, vz: 0 });
  stepMatch(s, {});
  assert.equal(s.phase, "serve");
  assert.equal(s.message, "Let · serve again");
  assert.equal(s.faults, 0);
  assert.deepEqual(s.score.points, [0, 0]);
});
test("practice continues without competitive score", () => {
  const s = createMatch({ mode: "practice" });
  stepMatch(s, { swing: true });
  Object.assign(s.ball, { x: 0, y: 0.04, z: 4, vy: -2, vx: 0, vz: 0 });
  s.bounces = 1;
  s.serveFlight = false;
  stepMatch(s, {});
  assert.equal(s.phase, "point");
  assert.deepEqual(s.score.points, [0, 0]);
  for (let i = 0; i < 250; i++) stepMatch(s, {});
  assert.equal(s.phase, "serve");
});
test("AI can serve and complete points without user input", () => {
  const s = createMatch({ mode: "demo" });
  for (let i = 0; i < 120 * 90; i++) stepMatch(s, {});
  assert.ok(s.stats.shots > 10);
  assert.ok(s.stats.points > 2);
  assert.ok(s.bestRally >= 2, `best rally ${s.bestRally}`);
});
test("fixed accumulator gives same state at 30 and 144 render FPS", () => {
  function run(fps) {
    const s = createMatch({ mode: "demo" });
    let acc = 0;
    for (let frame = 0; frame < fps * 10; frame++) {
      acc += 1 / fps;
      while (acc + 1e-10 >= STEP) {
        stepMatch(s, {});
        acc -= STEP;
      }
    }
    return s;
  }
  assert.deepEqual(run(30), run(144));
});

test("all nine AI/surface combinations complete quick matches", () => {
  for (const surface of ["hard", "clay", "grass"])
    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
      const s = createMatch({ mode: "demo", surface, difficulty });
      for (let i = 0; i < 120 * 900 && s.phase !== "complete"; i++)
        stepMatch(s, {});
      assert.equal(
        s.phase,
        "complete",
        `${surface}/${difficulty} did not finish`,
      );
      assert.ok(s.score.winner === 0 || s.score.winner === 1);
      assert.ok(s.bestRally >= 2);
    }
});
test("reachable ball reverses direction when human returns it", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  s.serveFlight = false;
  s.lastHit = 1;
  s.bounces = 1;
  s.players[0].cooldown = 0;
  Object.assign(s.ball, {
    x: s.players[0].x,
    y: 1.2,
    z: s.players[0].z + 0.5,
    vx: 0,
    vy: 0,
    vz: -10,
  });
  stepMatch(s, { swing: true, shot: "topspin", aim: 1 });
  assert.equal(s.lastHit, 0);
  assert.ok(s.ball.vz > 0);
  assert.ok(s.ball.spin > 0);
  assert.ok(s.events.some((e) => e.type === "hit"));
});
test("returning a serve before its first bounce awards the server", () => {
  const s = createMatch();
  stepMatch(s, { swing: true });
  s.score.server = 1;
  s.lastHit = 1;
  s.serveFlight = true;
  s.bounces = 0;
  s.players[0].cooldown = 0;
  Object.assign(s.ball, {
    x: s.players[0].x,
    y: 1.2,
    z: s.players[0].z + 0.5,
    vx: 0,
    vy: 0,
    vz: -10,
  });
  stepMatch(s, { swing: true });
  assert.equal(s.phase, "point");
  assert.equal(s.score.points[1], 1);
});
