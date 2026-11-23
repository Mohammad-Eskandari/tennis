import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CameraRig, CAMERA_MODES } from "../frontend/game/camera.js";
import { createPlayer } from "../frontend/game/character.js";
import { createMatch, stepMatch } from "../shared/simulation.js";
test("broadcast is default; all camera modes cycle", () => {
  const rig = new CameraRig();
  assert.equal(rig.mode, 0);
  assert.equal(rig.cycle(), CAMERA_MODES[1]);
  assert.equal(rig.cycle(), CAMERA_MODES[2]);
  assert.equal(rig.cycle(), CAMERA_MODES[0]);
});
test("broadcast contains the whole doubles court at desktop and portrait aspects", () => {
  for (const aspect of [16 / 9, 4 / 3, 0.54]) {
    const c = new THREE.PerspectiveCamera(38, aspect, 0.1, 200),
      rig = new CameraRig(),
      s = createMatch();
    c.position.set(-30, 25, 17);
    for (let i = 0; i < 240; i++) rig.update(c, s, 1 / 60);
    c.updateMatrixWorld();
    for (const x of [-5.5, 5.5])
      for (const z of [-12.1, 12.1]) {
        const p = new THREE.Vector3(x, 0, z).project(c);
        assert.ok(
          Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1,
          `clipped corner at aspect ${aspect}: ${p.toArray()}`,
        );
      }
  }
});
test("dynamic camera damps rather than snapping to a new ball target", () => {
  const c = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200),
    rig = new CameraRig(),
    s = createMatch();
  rig.mode = 1;
  c.position.set(-30, 25, 17);
  rig.update(c, s, 1 / 60);
  const before = c.position.clone();
  s.ball.z = 12;
  rig.update(c, s, 1 / 60);
  assert.ok(before.distanceTo(c.position) < 1);
});
test("procedural player exposes articulated, finite simulation-driven transforms", () => {
  const model = createPlayer(0xffffff),
    s = createMatch();
  stepMatch(s, { swing: true });
  model.userData.update(s.players[0], s.time);
  assert.equal(model.position.z, s.players[0].z);
  let meshes = 0;
  model.traverse((o) => {
    if (o.isMesh) meshes++;
    for (const n of [...o.position.toArray(), ...o.quaternion.toArray()])
      assert.ok(Number.isFinite(n));
  });
  assert.ok(meshes > 10);
});
