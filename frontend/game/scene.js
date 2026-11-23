import * as THREE from "three";
import { COURT, SURFACES } from "../../shared/config.js";
import { createPlayer } from "./character.js";
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8ced0);
  scene.fog = new THREE.Fog(0xb8ced0, 65, 145);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(-30, 25, 17);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x758979, 2.4));
  const sun = new THREE.DirectionalLight(0xffe3b4, 3.2);
  sun.position.set(-15, 30, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -30,
    right: 30,
    top: 32,
    bottom: -32,
    near: 1,
    far: 100,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const material = (c, r = 0.85) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const floor = material(SURFACES.hard.color),
    outer = material(SURFACES.hard.outer),
    cream = material(0xebe8d7),
    dark = material(0x203e43);
  const box = (w, h, d, x, y, z, m, shadow = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    scene.add(mesh);
    return mesh;
  };
  box(170, 0.2, 170, 0, -0.35, 0, material(0x849b8b));
  box(22, 0.22, 40, 0, -0.16, 0, outer);
  box(COURT.doubles, 0.025, COURT.length, 0, -0.03, 0, floor);
  const line = (w, d, x, z) => box(w, 0.012, d, x, 0.005, z, cream);
  for (const x of [
    -COURT.doubles / 2,
    COURT.doubles / 2,
    -COURT.singles / 2,
    COURT.singles / 2,
  ])
    line(0.045, COURT.length, x, 0);
  for (const z of [-COURT.length / 2, COURT.length / 2]) {
    line(COURT.doubles, 0.06, 0, z);
    line(0.045, 0.3, 0, z - Math.sign(z) * 0.15);
  }
  for (const z of [-COURT.service, COURT.service])
    line(COURT.singles, 0.045, 0, z);
  line(0.045, COURT.service * 2, 0, 0);
  // Actual open net grid, rather than an opaque sheet.
  const verts = [];
  for (let x = -5.55; x <= 5.56; x += 0.12) verts.push(x, 0.12, 0, x, 0.94, 0);
  for (let y = 0.12; y <= 0.94; y += 0.1) verts.push(-5.55, y, 0, 5.55, y, 0);
  const net = new THREE.BufferGeometry();
  net.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  scene.add(
    new THREE.LineSegments(
      net,
      new THREE.LineBasicMaterial({
        color: 0x193134,
        transparent: true,
        opacity: 0.7,
      }),
    ),
  );
  box(11.2, 0.05, 0.055, 0, COURT.net, 0, cream);
  for (const x of [-5.6, 5.6]) box(0.12, 1.08, 0.12, x, 0.54, 0, dark, true);
  // Terraced stands; seats and spectators use instancing.
  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.65, 0.12, 0.55),
    material(0xcbd3c5),
    240,
  );
  let seat = 0;
  const dummy = new THREE.Object3D();
  for (const side of [-1, 1]) {
    box(0.25, 1.9, 37, side * 10, 0.95, 0, dark);
    for (let row = 0; row < 4; row++) {
      box(
        1.05,
        0.65,
        39,
        side * (11 + row),
        row * 0.65 + 0.15,
        0,
        material(row % 2 ? 0x667e77 : 0x71877c),
      );
      for (let j = 0; j < 30; j++) {
        dummy.position.set(
          side * (10.9 + row),
          row * 0.65 + 0.53,
          -18.5 + j * 1.27,
        );
        dummy.updateMatrix();
        seats.setMatrixAt(seat++, dummy.matrix);
      }
    }
  }
  scene.add(seats);
  const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.105, 7, 6),
      material(0xb99b7f),
      120,
    ),
    bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.17, 0.36, 6),
      material(0x44595a),
      120,
    );
  let crowd = 0;
  for (let i = 0; i < 120; i++) {
    const side = i % 2 ? 1 : -1,
      row = Math.floor(i / 30) % 4,
      z = -17 + (i % 30) * 1.15;
    dummy.position.set(side * (10.9 + row), row * 0.65 + 0.84, z);
    dummy.updateMatrix();
    bodies.setMatrixAt(crowd, dummy.matrix);
    dummy.position.y += 0.27;
    dummy.updateMatrix();
    heads.setMatrixAt(crowd++, dummy.matrix);
  }
  scene.add(heads, bodies);
  for (const z of [-19, 19]) {
    box(21, 1.9, 0.2, 0, 0.95, z, dark);
    for (const x of [-8, 8]) {
      box(0.12, 8, 0.12, x, 4, z, dark);
      box(2, 0.24, 0.6, x, 8, z, cream);
    }
  }
  // Court furniture and distant trees.
  for (const z of [-6, 6]) {
    box(0.6, 0.15, 2.5, -8, 0.6, z, cream, true);
    for (const dz of [-0.8, 0.8]) box(0.12, 0.6, 0.15, -8, 0.3, z + dz, dark);
  }
  for (let i = 0; i < 28; i++) {
    const x = -40 + i * 3,
      z = i % 2 ? 27 : -27;
    const trunk = box(0.22, 3, 0.22, x, 1.5, z, material(0x6b6951));
    const tree = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2 + (i % 3) * 0.4, 1),
      material(i % 2 ? 0x52776a : 0x648274),
    );
    tree.position.set(trunk.position.x, 4, z);
    scene.add(tree);
  }
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 16, 12),
    material(0xd9f35a, 0.5),
  );
  ball.castShadow = true;
  scene.add(ball); // presentation radius enlarged for broadcast readability
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 20),
    new THREE.MeshBasicMaterial({
      color: 0x102c31,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);
  const players = [createPlayer(0xecf0e2), createPlayer(0xd99d70)];
  players.forEach((p) => scene.add(p));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.45, 40),
    new THREE.MeshBasicMaterial({
      color: 0xc4df78,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  scene.add(ring);
  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  resize();
  return {
    renderer,
    scene,
    camera,
    resize,
    setSurface(name) {
      floor.color.set(SURFACES[name].color);
      outer.color.set(SURFACES[name].outer);
    },
    setQuality(low) {
      renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.75));
      renderer.shadowMap.enabled = !low;
      resize();
    },
    render(s) {
      // Keep portrait camera pullback from placing the whole court inside fog.
      const distance = camera.position.length();
      scene.fog.near = Math.max(65, distance * 1.25);
      scene.fog.far = Math.max(145, distance * 3);
      ball.position.set(s.ball.x, s.ball.y, s.ball.z);
      ball.rotation.x += 0.08;
      shadow.position.set(s.ball.x, 0.02, s.ball.z);
      shadow.scale.setScalar(1 + s.ball.y * 0.12);
      players.forEach((p, i) => p.userData.update(s.players[i], s.time));
      ring.position.x = s.players[0].x;
      ring.position.z = s.players[0].z;
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
