import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Input } from "../frontend/game/input.js";
import { CameraRig, CAMERA_MODES } from "../frontend/game/camera.js";
import { createMatch, stepMatch } from "../shared/simulation.js";
import { STEP } from "../shared/config.js";

// Exercise the actual keyboard handlers/listeners without requiring a DOM/WebGL.
function keyboard(t) {
  const previousWindow = globalThis.window;
  const target = new EventTarget();
  target.closest = () => null;
  globalThis.window = target;
  const actions = [];
  const input = new Input((action) => actions.push(action));
  t.after(() => {
    input.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  function dispatch(type, code) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "code", { value: code });
    target.dispatchEvent(event);
  }
  return {
    input,
    actions,
    target,
    press: (...codes) => codes.forEach((code) => dispatch("keydown", code)),
    release: (...codes) => codes.forEach((code) => dispatch("keyup", code)),
  };
}

function rally(side) {
  const s = createMatch();
  s.phase = "rally";
  Object.assign(s.players[0], { side, x: 0, z: side * 7, vx: 0, vz: 0 });
  s.players[1].side = -side;
  s.players[1].z = -side * 10;
  // Keep the incoming ball away from contact/bounce during short movement tests.
  Object.assign(s.ball, { x: 0, y: 20, z: 0, vx: 0, vy: 0, vz: 0 });
  return s;
}

const directions = [
  ["KeyW", "ArrowUp", 0, 1],
  ["KeyS", "ArrowDown", 0, -1],
  ["KeyA", "ArrowLeft", -1, 0],
  ["KeyD", "ArrowRight", 1, 0],
];
for (const side of [-1, 1]) {
  for (const [key, arrow, right, forward] of directions) {
    test(`${key} and ${arrow} move correctly from side ${side}`, (t) => {
      const { input, press, release } = keyboard(t);
      for (const code of [key, arrow]) {
        press(code);
        const command = input.read(side);
        assert.equal(command.x, right);
        assert.equal(command.z, forward * -side || 0);
        const s = rally(side);
        const startZ = s.players[0].z;
        stepMatch(s, command);
        assert.equal(Math.sign(s.players[0].x), Math.sign(command.x));
        assert.equal(Math.sign(s.players[0].z - startZ), Math.sign(command.z));
        if (forward) {
          assert.equal(
            Math.sign(Math.abs(startZ) - Math.abs(s.players[0].z)),
            forward,
          );
        }
        release(code);
      }
    });
  }
}

test("a held key follows the current side immediately after changing ends", (t) => {
  const { input, press } = keyboard(t);
  press("KeyW", "KeyD");
  assert.deepEqual(input.read(-1), { ...input.read(1), x: 1, z: 1 });
  assert.equal(input.read(1).x, 1);
  assert.equal(input.read(1).z, -1);
});

test("all four diagonals match cardinal speed at both ends, walking and sprinting", (t) => {
  const { input, press } = keyboard(t);
  for (const side of [-1, 1]) {
    for (const sprint of [false, true]) {
      input.clear();
      press("KeyW", ...(sprint ? ["ShiftLeft"] : []));
      const cardinal = rally(side);
      for (let tick = 0; tick < 60; tick++)
        stepMatch(cardinal, input.read(side));
      const expectedSpeed = Math.hypot(
        cardinal.players[0].vx,
        cardinal.players[0].vz,
      );
      for (const forward of ["KeyW", "KeyS"]) {
        for (const strafe of ["KeyA", "KeyD"]) {
          input.clear();
          press(forward, strafe, ...(sprint ? ["ShiftLeft"] : []));
          const s = rally(side);
          for (let tick = 0; tick < 60; tick++) stepMatch(s, input.read(side));
          const p = s.players[0];
          assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - expectedSpeed) < 1e-10);
          assert.ok(Math.abs(Math.abs(p.vx) - Math.abs(p.vz)) < 1e-10);
          assert.ok(Math.hypot(p.vx, p.vz) <= (sprint ? 7 : 5.3));
        }
      }
    }
  }
});

test("A/D visibly move left/right and W/S remain net-relative in every camera and end", (t) => {
  const { input, press } = keyboard(t);
  for (const side of [-1, 1]) {
    for (const [key] of directions) {
      input.clear();
      press(key, "ShiftLeft");
      CAMERA_MODES.forEach((_, mode) => {
        const s = rally(side);
        const rig = new CameraRig();
        rig.mode = mode;
        const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
        camera.position.set(-30, 25, 17);
        for (let tick = 0; tick < 360; tick++) rig.update(camera, s, STEP);
        camera.updateMatrixWorld();
        const start = s.players[0],
          before = new THREE.Vector3(start.x, 0, start.z).project(camera);
        const oldDistance = Math.abs(start.z);
        for (let tick = 0; tick < 30; tick++)
          stepMatch(
            s,
            input.read(side, rig.horizontalSign(camera, s.players[0])),
          );
        const p = s.players[0],
          after = new THREE.Vector3(p.x, 0, p.z).project(camera);
        if (key === "KeyA")
          assert.ok(
            after.x < before.x,
            `A reversed in ${CAMERA_MODES[mode]} / side ${side}`,
          );
        if (key === "KeyD")
          assert.ok(
            after.x > before.x,
            `D reversed in ${CAMERA_MODES[mode]} / side ${side}`,
          );
        if (key === "KeyW") assert.ok(Math.abs(p.z) < oldDistance);
        if (key === "KeyS") assert.ok(Math.abs(p.z) > oldDistance);
      });
    }
  }
});

test("horizontal mapping follows the rendered view during camera transitions", (t) => {
  const { input, press } = keyboard(t);
  press("KeyD");
  const rig = new CameraRig(),
    c = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200),
    s = rally(-1);
  for (const z of [-25, -10, 10, 25]) {
    c.position.set(-30, 25, z);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    const p = s.players[0],
      before = new THREE.Vector3(p.x, 0, p.z).project(c);
    const cmd = input.read(p.side, rig.horizontalSign(c, p));
    const after = new THREE.Vector3(p.x + cmd.x * 0.1, 0, p.z).project(c);
    assert.ok(after.x > before.x);
  }
});

test("acceleration and release remain smooth; opposite keys cancel", (t) => {
  const { input, press, release } = keyboard(t);
  const s = rally(-1);
  press("KeyW");
  stepMatch(s, input.read(-1));
  const firstSpeed = s.players[0].vz;
  assert.ok(firstSpeed > 0 && firstSpeed < 5.3);
  stepMatch(s, input.read(-1));
  const secondSpeed = s.players[0].vz;
  assert.ok(secondSpeed > firstSpeed && secondSpeed < 5.3);
  release("KeyW");
  stepMatch(s, input.read(-1));
  assert.ok(s.players[0].vz > 0 && s.players[0].vz < secondSpeed);
  press("KeyW", "KeyS", "KeyA", "KeyD");
  assert.equal(input.read(-1).x, 0);
  assert.equal(input.read(-1).z, 0);
});

test("sprint, shots, targeting and camera actions remain compatible with movement", (t) => {
  const { input, press, release, actions, target } = keyboard(t);
  press("KeyW", "KeyD", "ShiftRight", "KeyK", "KeyE");
  assert.deepEqual(input.read(-1), {
    x: 1,
    z: 1,
    sprint: true,
    swing: true,
    shot: "topspin",
    aim: 1,
  });
  release("KeyK");
  press("KeyL");
  assert.equal(input.read(1).shot, "slice");
  press("KeyC");
  assert.deepEqual(actions, ["camera"]);
  target.dispatchEvent(new Event("blur"));
  assert.equal(input.read(-1).x, 0);
  assert.equal(input.read(-1).z, 0);
  assert.equal(input.read(-1).sprint, false);
  assert.equal(input.read(-1).swing, false);
});
