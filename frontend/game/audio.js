export class Audio {
  constructor() {
    this.enabled = true;
    this.volume = 0.3;
  }
  activate() {
    if (!this.context) this.context = new AudioContext();
    this.context.resume();
  }
  play(type) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    o.type = type === "hit" ? "triangle" : "sine";
    o.frequency.setValueAtTime(
      type === "hit" ? 460 : type === "bounce" ? 155 : 680,
      t,
    );
    o.frequency.exponentialRampToValueAtTime(65, t + 0.12);
    g.gain.setValueAtTime(this.volume * (type === "hit" ? 0.45 : 0.2), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.start(t);
    o.stop(t + 0.16);
  }
}
