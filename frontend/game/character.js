import * as THREE from "three";
export function createPlayer(color) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const mat = (c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const skin = mat(0xc99470),
    shirt = mat(color),
    shorts = mat(0xe7ece6),
    shoe = mat(0xf6f6ed),
    hair = mat(0x292724);
  function part(g, m, x, y, z, parent = body) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  part(new THREE.CylinderGeometry(0.22, 0.19, 0.6, 10), shirt, 0, 1.15, 0);
  part(new THREE.SphereGeometry(0.18, 16, 12), skin, 0, 1.68, 0);
  part(
    new THREE.SphereGeometry(0.185, 16, 8, 0, Math.PI * 2, 0, 1.5),
    hair,
    0,
    1.72,
    0,
  );
  part(new THREE.CylinderGeometry(0.21, 0.23, 0.26, 10), shorts, 0, 0.76, 0);
  const legs = [];
  for (const x of [-0.13, 0.13]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.73, 0);
    body.add(pivot);
    part(
      new THREE.CylinderGeometry(0.075, 0.055, 0.55, 8),
      skin,
      0,
      -0.27,
      0,
      pivot,
    );
    part(new THREE.BoxGeometry(0.14, 0.12, 0.28), shoe, 0, -0.6, 0.06, pivot);
    legs.push(pivot);
  }
  const arm = new THREE.Group();
  arm.position.set(-0.27, 1.4, 0);
  body.add(arm);
  part(
    new THREE.CylinderGeometry(0.06, 0.048, 0.52, 8),
    skin,
    0,
    -0.25,
    0,
    arm,
  );
  arm.rotation.z = -0.3;
  const swing = new THREE.Group();
  swing.position.set(0.27, 1.4, 0);
  body.add(swing);
  part(
    new THREE.CylinderGeometry(0.06, 0.045, 0.5, 8),
    skin,
    0,
    -0.23,
    0,
    swing,
  );
  const racket = new THREE.Group();
  racket.position.set(0, -0.6, 0);
  swing.add(racket);
  part(
    new THREE.CylinderGeometry(0.024, 0.024, 0.3, 8),
    mat(0x26373a),
    0,
    0,
    0,
    racket,
  );
  const rim = part(
    new THREE.TorusGeometry(0.19, 0.018, 7, 24),
    mat(0xbad85a),
    0,
    -0.28,
    0,
    racket,
  );
  rim.scale.y = 1.3;
  const strings = new THREE.LineBasicMaterial({
    color: 0xdddcc9,
    transparent: true,
    opacity: 0.6,
  });
  for (let v = -0.12; v <= 0.12; v += 0.06) {
    for (let j = 0; j < 2; j++) {
      const a = j ? [v, -0.49, 0] : [-0.15, -0.28 + v, 0],
        b = j ? [v, -0.08, 0] : [0.15, -0.28 + v, 0];
      racket.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...a),
            new THREE.Vector3(...b),
          ]),
          strings,
        ),
      );
    }
  }
  root.userData.update = (p, time) => {
    root.position.set(p.x, 0, p.z);
    root.rotation.y = p.side < 0 ? 0 : Math.PI;
    const speed = Math.hypot(p.vx, p.vz);
    legs.forEach(
      (l, i) =>
        (l.rotation.x =
          Math.sin(time * 13 + i * Math.PI) * Math.min(0.65, speed * 0.11)),
    );
    body.position.y = Math.abs(Math.sin(time * 13)) * 0.025 * speed;
    swing.rotation.z =
      p.swing > 0 ? -1.6 * Math.sin((p.swing / 0.32) * Math.PI) : 0.25;
    swing.rotation.x = p.swing > 0 ? -1.5 + (3 * p.swing) / 0.32 : -0.3;
  };
  return root;
}
