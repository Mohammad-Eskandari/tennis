import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";
import { createApplication } from "../src/server.js";
import { applyResult, ratingDelta } from "../src/results.js";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("two real clients: auth, rooms, live authority, reconnect, forfeits and idempotent Elo", async () => {
  const schema = "test_" + randomBytes(8).toString("hex"),
    origin = "http://tennis.test";
  const a = await createApplication({
    schema,
    origins: [origin],
    disconnectGraceMs: 1500,
  });
  const address = await a.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  const sockets = [];
  async function register(name) {
    const response = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: name,
        password: "long-test-password-123",
      }),
    });
    const data = await response.json();
    return {
      user: data.user,
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  }
  async function api(c, path, body) {
    const r = await fetch(base + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        origin,
        cookie: c.cookie,
        "content-type": "application/json",
        "x-csrf-token": c.user.csrf,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  }
  async function connect(c) {
    const socket = io(base, {
      transports: ["websocket"],
      extraHeaders: { origin, cookie: c.cookie },
      auth: { csrf: c.user.csrf },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  }
  const emit = (s, event, payload) =>
    new Promise((resolve, reject) => {
      s.timeout(3000).emit(event, payload, (err, data) =>
        err ? reject(err) : resolve(data),
      );
    });
  try {
    const c = await register("net_one"),
      d = await register("net_two"),
      outsider = await register("outsider");
    const bad = io(base, {
      transports: ["websocket"],
      extraHeaders: { origin },
      auth: { csrf: "invalid" },
      reconnection: false,
    });
    sockets.push(bad);
    assert.match(
      await new Promise((resolve) =>
        bad.once("connect_error", (e) => resolve(e.message)),
      ),
      /Authentication/,
    );
    let s1 = await connect(c),
      s2 = await connect(d),
      s3 = await connect(outsider);
    let r = (await api(c, "/rooms", {})).data.room;
    assert.equal((await api(d, "/rooms/join", { code: r.code })).status, 200);
    assert.ok((await emit(s3, "match:watch", r.id)).error);
    assert.equal((await api(outsider, "/rooms/" + r.id)).status, 403);
    await emit(s1, "match:watch", r.id);
    await emit(s2, "match:watch", r.id);
    await api(c, `/rooms/${r.id}/ready`, {});
    await api(d, `/rooms/${r.id}/ready`, {});
    const baseInput = {
      seq: 0,
      x: 0,
      z: 0,
      aim: 0,
      sprint: false,
      swing: true,
      shot: "flat",
    };
    assert.equal(
      (await emit(s1, "match:input", { matchId: r.id, input: baseInput })).ok,
      true,
    );
    assert.ok(
      (await emit(s1, "match:input", { matchId: r.id, input: baseInput }))
        .error,
    );
    assert.ok(
      (
        await emit(s2, "match:input", {
          matchId: r.id,
          input: { ...baseInput, x: 100 },
        })
      ).error,
    );
    assert.ok(
      (
        await emit(s2, "match:input", {
          matchId: r.id,
          input: { ...baseInput, winner: d.user.id },
        })
      ).error,
    );
    await delay(200);
    r = (await api(c, "/rooms/" + r.id)).data.room;
    assert.equal(r.state.phase, "rally");
    assert.ok(r.state.ball.z > -12);
    assert.equal(r.ack[0], 0);
    assert.equal(
      (
        await emit(s1, "match:input", {
          matchId: r.id,
          input: { ...baseInput, seq: 1, x: 1, swing: false },
        })
      ).ok,
      true,
    );
    await delay(100);
    assert.ok(
      (await api(c, "/rooms/" + r.id)).data.room.state.players[0].x >
        r.state.players[0].x,
    );
    s2.disconnect();
    await delay(300);
    s2 = await connect(d);
    assert.equal((await emit(s2, "match:watch", r.id)).room.id, r.id);
    await delay(300);
    assert.equal((await api(c, "/rooms/" + r.id)).data.room.status, "ACTIVE");
    s2.disconnect();
    await delay(2300);
    const completed = (await api(c, "/rooms/" + r.id)).data.room;
    assert.equal(completed.status, "COMPLETED");
    assert.equal(
      (await a.db.query("SELECT wins FROM users WHERE id=$1", [c.user.id]))
        .rows[0].wins,
      1,
    );
    assert.equal(
      await applyResult(a.db, r.id, c.user.id, completed.state),
      false,
    );
    const ranked = (await api(c, "/matchmaking", {})).data.room;
    assert.equal((await api(d, "/matchmaking", {})).data.room.id, ranked.id);
    s2 = await connect(d);
    await emit(s1, "match:watch", ranked.id);
    await emit(s2, "match:watch", ranked.id);
    await api(c, `/rooms/${ranked.id}/ready`, {});
    await api(d, `/rooms/${ranked.id}/ready`, {});
    await api(d, `/rooms/${ranked.id}/leave`, {});
    const ratings = (
      await a.db.query("SELECT id,rating FROM users WHERE id=ANY($1::uuid[])", [
        [c.user.id, d.user.id],
      ])
    ).rows;
    assert.equal(ratings.find((u) => u.id === c.user.id).rating, 1012);
    assert.equal(ratings.find((u) => u.id === d.user.id).rating, 988);
    assert.equal(ratingDelta(1000, 1000), 12);
    assert.equal((await api(c, "/history")).data.matches.length, 2);
    assert.equal((await api(c, "/leaderboard")).data.players[0].id, c.user.id);
  } finally {
    for (const s of sockets) s.disconnect();
    await a.network.close();
    await a.db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await a.db.close();
  }
});
