import { test } from "node:test";
import assert from "node:assert/strict";
import { OnlineMatch } from "../frontend/platform/online-match.js";
import { createMatch } from "../shared/simulation.js";
function setup(index = 0) {
  const state = createMatch({ mode: "online" });
  state.phase = "rally";
  const room = {
    id: "room",
    players: ["one", "two"],
    ack: [-1, -1],
    state,
    revision: 1,
    status: "ACTIVE",
  };
  const handlers = new Map(),
    sent = [];
  const socket = {
    connected: true,
    on: (name, fn) => handlers.set(name, fn),
    off: (name) => handlers.delete(name),
    emit: (name, payload, callback) => {
      if (name === "match:watch") callback({ room });
      else sent.push(payload);
    },
  };
  return {
    client: new OnlineMatch(room, { id: room.players[index] }, socket),
    room,
    sent,
    handlers,
  };
}
test("online movement predicts immediately and reconciles acknowledged inputs", () => {
  const { client, room, sent } = setup();
  const start = client.predicted.x;
  client.advance(
    { x: 1, z: 0, aim: 0, swing: false, sprint: false, shot: "flat" },
    1 / 60,
  );
  assert.ok(client.predicted.x > start);
  assert.equal(sent.length, 1);
  assert.equal(client.pending.length, 1);
  const incoming = structuredClone(room);
  incoming.revision = 2;
  incoming.ack = [0, -1];
  incoming.state.players[0].x = 3;
  client.receive(incoming);
  assert.equal(client.pending.length, 0);
  assert.equal(client.predicted.x, 3);
  client.receive(room);
  assert.equal(client.predicted.x, 3);
  client.dispose();
});
test("remote participant becomes the controlled player and score labels remain correct", () => {
  const { client, room } = setup(1);
  room.state.score.points = [1, 3];
  room.state.score.server = 1;
  client.receive({ ...room, revision: 2 });
  const display = client.sample();
  assert.equal(display.players[0].side, 1);
  assert.deepEqual(display.score.points, [3, 1]);
  assert.equal(display.score.server, 0);
  client.dispose();
});
test("offline clients do not advance input sequence or accumulate runaway predictions", () => {
  const { client, sent } = setup();
  client.socket.connected = false;
  client.advance({ x: 1, z: 0 }, 10);
  assert.equal(sent.length, 0);
  assert.equal(client.pending.length, 0);
  assert.equal(client.seq, 0);
  client.dispose();
});
