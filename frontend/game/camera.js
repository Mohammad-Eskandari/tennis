import * as THREE from "three";
export const CAMERA_MODES = ["Broadcast side", "Dynamic side", "Behind player"];
export class CameraRig {
  constructor() {
    this.mode = 0;
    this.look = new THREE.Vector3();
    this.dest = new THREE.Vector3();
    this.target = new THREE.Vector3();
  }
  cycle() {
    this.mode = (this.mode + 1) % 3;
    return CAMERA_MODES[this.mode];
  }
  update(camera, s, dt, menu = false) {
    const b = s.ball,
      aspect = camera.aspect,
      scale = Math.max(1, 1.65 / aspect);
    if (this.mode === 2 && !menu) {
      this.dest.set(s.players[0].x * 0.5, 8, -23 * scale);
      this.target.set(0, 1, 0);
    } else {
      const dynamic = this.mode === 1 && !menu;
      const zoom = dynamic ? 1 + Math.min(0.06, Math.abs(b.z) * 0.004) : 1;
      this.dest.set(-30 * scale * zoom, 25 * scale * zoom, 17 * scale * zoom);
      this.target.set(
        menu ? 0 : dynamic ? b.x * 0.12 : 0,
        0,
        dynamic ? b.z * 0.12 : 0,
      );
      if (menu) this.target.z = -2;
    }
    const a = 1 - Math.exp(-3 * dt);
    camera.position.lerp(this.dest, a);
    this.look.lerp(this.target, a);
    camera.lookAt(this.look);
  }
}
