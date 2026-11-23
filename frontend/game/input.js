export class Input {
  constructor(onAction) {
    this.keys = new Set();
    this.shot = "flat";
    this.onAction = onAction;
    this.down = (e) => {
      if (e.target.closest("input,select,textarea,button")) return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        if (e.code === "KeyC") onAction("camera");
        if (e.code === "Escape") onAction("pause");
        if (e.code === "KeyJ") this.shot = "flat";
        if (e.code === "KeyK") this.shot = "topspin";
        if (e.code === "KeyL") this.shot = "slice";
      }
    };
    this.up = (e) => this.keys.delete(e.code);
    this.clear = () => this.keys.clear();
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
  }
  read(side = -1) {
    const k = this.keys;
    // Facing the net: forward and right reverse at the opposite baseline.
    // Convert human intent to world axes here; camera orientation is irrelevant.
    const forward =
      Number(k.has("KeyW") || k.has("ArrowUp")) -
      Number(k.has("KeyS") || k.has("ArrowDown"));
    const right =
      Number(k.has("KeyD") || k.has("ArrowRight")) -
      Number(k.has("KeyA") || k.has("ArrowLeft"));
    return {
      x: right * -side || 0,
      z: forward * -side || 0,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
      swing: k.has("Space") || k.has("KeyJ") || k.has("KeyK") || k.has("KeyL"),
      shot: this.shot,
      aim: Number(k.has("KeyE")) - Number(k.has("KeyQ")),
    };
  }
  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
  }
}
