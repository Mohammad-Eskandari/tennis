import { movePlayer } from "../../shared/movement.js";
import { api } from "./api.js";
export class OnlineMatch {
  constructor(room, user, socket) {
    this.room = room;
    this.index = room.players.indexOf(user.id);
    this.socket = socket;
    this.seq = room.ack[this.index] + 1;
    this.pending = [];
    this.buffer = [];
    this.acc = 0;
    this.revision = -1;
    this.latest = room.state;
    this.predicted = { ...room.state.players[this.index] };
    this.receive = (msg) => {
      if (msg.id !== this.room.id || msg.revision <= this.revision) return;
      this.revision = msg.revision;
      this.room = msg;
      this.latest = msg.state;
      this.seq = Math.max(this.seq, msg.ack[this.index] + 1);
      this.pending = this.pending.filter((c) => c.seq > msg.ack[this.index]);
      Object.assign(this.predicted, msg.state.players[this.index]);
      for (const c of this.pending) {
        movePlayer(this.predicted, c, 1 / 120, msg.state.phase === "rally");
        movePlayer(this.predicted, c, 1 / 120, msg.state.phase === "rally");
      }
      this.buffer.push({ time: performance.now(), state: msg.state });
      if (this.buffer.length > 8) this.buffer.shift();
    };
    this.reconnect = () =>
      socket.emit("match:watch", room.id, (result) => {
        if (result.room) this.receive(result.room);
      });
    socket.on("match:state", this.receive);
    socket.on("connect", this.reconnect);
    this.receive(room);
    this.reconnect();
  }
  advance(command, dt) {
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      if (this.room.status !== "ACTIVE" || !this.socket.connected) continue;
      const c = { ...command, seq: this.seq++ };
      this.pending.push(c);
      if (this.pending.length > 120) this.pending.shift();
      movePlayer(this.predicted, c, 1 / 120, this.latest.phase === "rally");
      movePlayer(this.predicted, c, 1 / 120, this.latest.phase === "rally");
      this.socket.emit("match:input", { matchId: this.room.id, input: c });
    }
  }
  sample() {
    const now = performance.now() - 100;
    let a = this.buffer[0],
      b = a;
    for (const frame of this.buffer) {
      if (frame.time <= now) a = frame;
      else {
        b = frame;
        break;
      }
      b = frame;
    }
    const s = structuredClone(this.latest);
    if (a && b) {
      const alpha =
        a === b
          ? 1
          : Math.max(0, Math.min(1, (now - a.time) / (b.time - a.time)));
      for (const key of ["x", "y", "z"])
        s.ball[key] =
          a.state.ball[key] + (b.state.ball[key] - a.state.ball[key]) * alpha;
      const i = 1 - this.index;
      for (const key of ["x", "z"])
        s.players[i][key] =
          a.state.players[i][key] +
          (b.state.players[i][key] - a.state.players[i][key]) * alpha;
    }
    Object.assign(s.players[this.index], this.predicted);
    if (this.index === 1) {
      s.players.reverse();
      for (const key of ["points", "games", "sets"]) s.score[key].reverse();
      s.score.server = 1 - s.score.server;
      if (s.score.winner !== null) s.score.winner = 1 - s.score.winner;
    }
    s.difficulty = "online";
    return s;
  }
  async leave() {
    await api("/rooms/" + this.room.id + "/leave", {
      method: "POST",
      body: {},
    });
    this.dispose();
  }
  dispose() {
    this.socket.off("match:state", this.receive);
    this.socket.off("connect", this.reconnect);
  }
}
