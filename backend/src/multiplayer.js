import { Server } from "socket.io";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createMatch, stepMatch } from "../../shared/simulation.js";
import { STEP } from "../../shared/config.js";
import { fail, id } from "./security.js";
import { applyResult } from "./results.js";
export async function multiplayer(server, db, sec, config) {
  const io = new Server(server, {
    maxHttpBufferSize: 4096,
    cors: { origin: config.origins, credentials: true },
    allowRequest: (req, cb) =>
      cb(null, config.origins.includes(req.headers.origin)),
  });
  const rooms = new Map(),
    presence = new Map();
  const changingUsers = new Set();
  async function changeUser(uid, fn) {
    if (changingUsers.has(uid)) fail(409, "Room change already in progress");
    changingUsers.add(uid);
    try {
      return await fn();
    } finally {
      changingUsers.delete(uid);
    }
  }
  let closed = false,
    last = performance.now(),
    acc = 0,
    revision = 0;
  // A process restart cannot resume a live simulation from a stale persisted frame.
  await db.query(
    "UPDATE matches SET status='ABANDONED',reason='Server restarted',finished_at=now() WHERE status IN('WAITING','ACTIVE')",
  );
  const online = (uid) => (presence.get(uid)?.size || 0) > 0;
  const roomFor = (rid, uid) => {
    const r = rooms.get(id(rid));
    if (!r || ![r.match.player1, r.match.player2].includes(uid))
      fail(403, "Room participant required");
    return r;
  };
  const snapshot = (r) => ({
    id: r.match.id,
    code: r.match.code,
    ranked: r.match.ranked,
    status: r.match.status,
    players: [r.match.player1, r.match.player2],
    names: r.names,
    ready: [r.ready.has(r.match.player1), r.ready.has(r.match.player2)],
    state: r.state,
    ack: r.seq,
    revision: ++revision,
  });
  const emit = (r) =>
    io.to("match:" + r.match.id).emit("match:state", snapshot(r));
  async function available(uid) {
    const existing = (
      await db.query(
        "SELECT id FROM matches WHERE (player1=$1 OR player2=$1) AND status IN('WAITING','ACTIVE')",
        [uid],
      )
    ).rows[0];
    if (existing) fail(409, "Leave your current room first");
  }
  async function create(uid, ranked = false) {
    return changeUser(uid, () => createUnlocked(uid, ranked));
  }
  async function createUnlocked(uid, ranked = false) {
    await available(uid);
    const state = createMatch({ mode: "online" }),
      m = (
        await db.query(
          "INSERT INTO matches(player1,code,ranked,state) VALUES($1,$2,$3,$4) RETURNING *",
          [uid, randomBytes(4).toString("hex").toUpperCase(), ranked, state],
        )
      ).rows[0];
    const name = (
      await db.query("SELECT username FROM users WHERE id=$1", [uid])
    ).rows[0].username;
    const r = {
      match: m,
      state,
      names: [name, null],
      ready: new Set(),
      seq: [-1, -1],
      inputs: [{}, {}],
      lastInput: [0, 0],
      missing: [0, 0],
      busy: false,
      created: Date.now(),
    };
    rooms.set(m.id, r);
    return r;
  }
  async function join(code, uid) {
    return changeUser(uid, () => joinUnlocked(code, uid));
  }
  async function joinUnlocked(code, uid) {
    const r = [...rooms.values()].find((r) => r.match.code === code);
    if (!r || r.match.status !== "WAITING") fail(404, "Waiting room not found");
    if (r.match.player1 === uid || r.match.player2 === uid) return r;
    if (r.match.player2) fail(409, "Room is full");
    await available(uid);
    const row = (
      await db.query(
        "UPDATE matches SET player2=$1 WHERE id=$2 AND player2 IS NULL RETURNING *",
        [uid, r.match.id],
      )
    ).rows[0];
    if (!row) fail(409, "Room is full");
    r.match = row;
    r.names[1] = (
      await db.query("SELECT username FROM users WHERE id=$1", [uid])
    ).rows[0].username;
    emit(r);
    return r;
  }
  async function finish(r, winner, reason) {
    if (r.busy || r.match.status === "COMPLETED") return;
    r.busy = true;
    try {
      r.state.score.winner = winner;
      r.state.phase = "complete";
      r.state.message = reason;
      await applyResult(
        db,
        r.match.id,
        [r.match.player1, r.match.player2][winner],
        r.state,
        reason,
      );
      r.match.status = "COMPLETED";
      r.finished = Date.now();
      emit(r);
    } finally {
      r.busy = false;
    }
  }
  const router = Router();
  router.use(sec.requireUser);
  router.get("/rooms", async (req, res) =>
    res.json({
      rooms: [...rooms.values()]
        .filter((r) => r.match.status === "WAITING" && !r.match.ranked)
        .map((r) => ({
          id: r.match.id,
          code: r.match.code,
          host: r.names[0],
          full: !!r.match.player2,
        })),
      current: [...rooms.values()]
        .filter(
          (r) =>
            [r.match.player1, r.match.player2].includes(req.user.id) &&
            ["WAITING", "ACTIVE"].includes(r.match.status),
        )
        .map(snapshot),
    }),
  );
  router.get("/rooms/:id", async (req, res) =>
    res.json({ room: snapshot(roomFor(req.params.id, req.user.id)) }),
  );
  router.post("/rooms", async (req, res) => {
    if (req.user.role !== "PLAYER") fail(403, "Player account required");
    const r = await create(req.user.id, false);
    res.status(201).json({ room: snapshot(r) });
  });
  router.post("/rooms/join", async (req, res) => {
    if (
      typeof req.body.code !== "string" ||
      !/^[A-F0-9]{8}$/.test(req.body.code)
    )
      fail(400, "Use an eight-character room code");
    const r = await join(req.body.code, req.user.id);
    res.json({ room: snapshot(r) });
  });
  router.post("/matchmaking", async (req, res) => {
    if (req.user.role !== "PLAYER") fail(403, "Player account required");
    await available(req.user.id);
    const row = (
      await db.query(
        "SELECT m.code FROM matches m JOIN users u ON u.id=m.player1 JOIN users me ON me.id=$1 WHERE m.status='WAITING' AND m.ranked AND m.player2 IS NULL AND ABS(u.rating-me.rating)<=300 ORDER BY m.created_at LIMIT 1",
        [req.user.id],
      )
    ).rows[0];
    const r = row
      ? await join(row.code, req.user.id)
      : await create(req.user.id, true);
    res.json({ room: snapshot(r) });
  });
  router.post("/rooms/:id/ready", async (req, res) => {
    const r = roomFor(req.params.id, req.user.id);
    if (r.match.status !== "WAITING") fail(409, "Match already started");
    r.ready.add(req.user.id);
    if (r.match.player2 && r.ready.size === 2) {
      r.match.status = "ACTIVE";
      r.started = Date.now();
      await db.query("UPDATE matches SET status='ACTIVE' WHERE id=$1", [
        r.match.id,
      ]);
    }
    emit(r);
    res.json({ room: snapshot(r) });
  });
  router.post("/rooms/:id/leave", async (req, res) => {
    const r = roomFor(req.params.id, req.user.id);
    if (r.match.status === "ACTIVE")
      await finish(
        r,
        req.user.id === r.match.player1 ? 1 : 0,
        "Opponent forfeited",
      );
    else if (r.match.status === "WAITING") {
      r.match.status = "ABANDONED";
      r.finished = Date.now();
      await db.query(
        "UPDATE matches SET status='ABANDONED',reason='Room closed',finished_at=now() WHERE id=$1",
        [r.match.id],
      );
      emit(r);
    }
    res.json({ ok: true });
  });
  router.post("/rooms/:id/invite", async (req, res) => {
    const r = roomFor(req.params.id, req.user.id),
      recipient = id(req.body.userId);
    if (r.match.status !== "WAITING") fail(409, "Room is no longer waiting");
    if (
      !(
        await db.query(
          "SELECT 1 FROM friendships WHERE status='ACCEPTED' AND ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1))",
          [req.user.id, recipient],
        )
      ).rowCount
    )
      fail(403, "Invite an accepted friend");
    const invitation = (
      await db.query(
        "INSERT INTO invitations(sender,recipient,match_id) VALUES($1,$2,$3) RETURNING *",
        [req.user.id, recipient, r.match.id],
      )
    ).rows[0];
    io.to(recipient).emit("invite", invitation);
    res.status(201).json({ invitation });
  });
  router.get("/invitations", async (req, res) =>
    res.json({
      invitations: (
        await db.query(
          "SELECT i.*,m.code,u.username FROM invitations i JOIN matches m ON m.id=i.match_id JOIN users u ON u.id=i.sender WHERE i.recipient=$1 AND i.status='PENDING' AND m.status='WAITING' ORDER BY i.created_at DESC",
          [req.user.id],
        )
      ).rows,
    }),
  );
  router.post("/invitations/:id", async (req, res) => {
    if (!["accept", "decline"].includes(req.body.action))
      fail(400, "Choose accept or decline");
    const inv = (
      await db.query(
        "SELECT i.*,m.code FROM invitations i JOIN matches m ON m.id=i.match_id WHERE i.id=$1 AND i.recipient=$2 AND i.status='PENDING'",
        [id(req.params.id), req.user.id],
      )
    ).rows[0];
    if (!inv) fail(404, "Invitation not found");
    const r =
      req.body.action === "accept" ? await join(inv.code, req.user.id) : null;
    await db.query("UPDATE invitations SET status=$1 WHERE id=$2", [
      r ? "ACCEPTED" : "DECLINED",
      inv.id,
    ]);
    res.json({ room: r ? snapshot(r) : null });
  });
  io.use(async (socket, next) => {
    try {
      if (!config.origins.includes(socket.handshake.headers.origin))
        fail(403, "Invalid origin");
      const token = socket.handshake.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(sec.cookie + "="))
        ?.slice(sec.cookie.length + 1);
      const user = await sec.sessionFor(token);
      if (!user || user.csrf !== socket.handshake.auth.csrf)
        fail(401, "Authentication required");
      socket.data = {
        user,
        token,
        lastAuth: Date.now(),
        window: Date.now(),
        count: 0,
      };
      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });
  io.on("connection", (socket) => {
    const uid = socket.data.user.id;
    if (!presence.has(uid)) presence.set(uid, new Set());
    presence.get(uid).add(socket.id);
    socket.join(uid);
    socket.use(async (packet, next) => {
      try {
        if (Date.now() - socket.data.lastAuth > 1000) {
          const u = await sec.sessionFor(socket.data.token);
          if (!u) throw new Error();
          socket.data.user = u;
          socket.data.lastAuth = Date.now();
        }
        if (Date.now() - socket.data.window > 1000) {
          socket.data.window = Date.now();
          socket.data.count = 0;
        }
        if (++socket.data.count > 180) throw new Error();
        next();
      } catch {
        socket.disconnect(true);
      }
    });
    socket.on("match:watch", (rid, ack = () => {}) => {
      if (typeof ack !== "function") ack = () => {};
      try {
        const r = roomFor(rid, uid);
        socket.join("match:" + rid);
        ack({ room: snapshot(r) });
      } catch (e) {
        ack({ error: e.message });
      }
    });
    socket.on("match:input", (packet, ack = () => {}) => {
      if (typeof ack !== "function") ack = () => {};
      try {
        const r = roomFor(packet?.matchId, uid),
          i = uid === r.match.player1 ? 0 : 1,
          c = packet.input;
        if (r.match.status !== "ACTIVE") fail(409, "Match is not active");
        if (
          !c ||
          !Number.isSafeInteger(c.seq) ||
          c.seq <= r.seq[i] ||
          c.seq > r.seq[i] + 600
        )
          fail(400, "Stale or invalid sequence");
        if (
          !Number.isFinite(c.x) ||
          !Number.isFinite(c.z) ||
          Math.abs(c.x) > 1 ||
          Math.abs(c.z) > 1 ||
          !Number.isFinite(c.aim) ||
          Math.abs(c.aim) > 1 ||
          typeof c.swing !== "boolean" ||
          typeof c.sprint !== "boolean" ||
          !["flat", "slice", "topspin"].includes(c.shot) ||
          Object.keys(c).some(
            (k) =>
              !["seq", "x", "z", "aim", "swing", "sprint", "shot"].includes(k),
          )
        )
          fail(400, "Invalid input");
        r.seq[i] = c.seq;
        r.inputs[i] = c;
        r.lastInput[i] = Date.now();
        ack({ ok: true });
      } catch (e) {
        ack({ error: e.message });
      }
    });
    socket.on("disconnect", () => {
      presence.get(uid)?.delete(socket.id);
      if (!presence.get(uid)?.size) presence.delete(uid);
    });
  });
  const grace = config.disconnectGraceMs ?? 30000;
  async function maintain() {
    if (closed) return;
    for (const socket of io.sockets.sockets.values()) {
      if (Date.now() - socket.data.lastAuth > 1000) {
        const u = await sec.sessionFor(socket.data.token);
        if (!u) socket.disconnect(true);
        else {
          socket.data.user = u;
          socket.data.lastAuth = Date.now();
        }
      }
    }
    for (const r of rooms.values()) {
      if (r.match.status === "ACTIVE" && !r.busy) {
        if (!online(r.match.player1) && !online(r.match.player2)) {
          r.bothMissingAt ||= Date.now();
          if (Date.now() - r.bothMissingAt > grace) {
            r.match.status = "ABANDONED";
            r.finished = Date.now();
            await db.query(
              "UPDATE matches SET status='ABANDONED',reason='Both players disconnected',finished_at=now() WHERE id=$1",
              [r.match.id],
            );
            emit(r);
          }
          continue;
        }
        r.bothMissingAt = 0;
        for (let i = 0; i < 2; i++) {
          const uid = [r.match.player1, r.match.player2][i];
          if (online(uid)) r.missing[i] = 0;
          else if (!r.missing[i]) r.missing[i] = Date.now();
          else if (Date.now() - r.missing[i] > grace) {
            await finish(r, 1 - i, "Opponent disconnected");
            break;
          }
        }
      }
      if (r.finished && Date.now() - r.finished > 60000)
        rooms.delete(r.match.id);
      else if (
        r.match.status === "WAITING" &&
        Date.now() - r.created > 15 * 60e3
      ) {
        r.match.status = "ABANDONED";
        r.finished = Date.now();
        await db.query(
          "UPDATE matches SET status='ABANDONED',reason='Room expired',finished_at=now() WHERE id=$1",
          [r.match.id],
        );
        emit(r);
      }
    }
  }
  const timer = setInterval(() => {
    if (closed) return;
    const now = performance.now();
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      for (const r of rooms.values())
        if (r.match.status === "ACTIVE" && !r.busy) {
          const inputs = r.inputs.map((c, i) =>
            Date.now() - r.lastInput[i] > 250 ? {} : c,
          );
          stepMatch(r.state, inputs);
          if (r.state.phase === "complete")
            finish(r, r.state.score.winner, "Match completed").catch((e) =>
              console.error("Result persistence failed", e.code || e.name),
            );
        }
      acc -= STEP;
    }
  }, 4);
  const snapshots = setInterval(() => {
    for (const r of rooms.values()) if (r.match.status === "ACTIVE") emit(r);
  }, 50);
  let maintaining = false;
  const maintenance = setInterval(
    () => {
      if (maintaining) return;
      maintaining = true;
      maintain()
        .catch((e) =>
          console.error("Room maintenance failed", e.code || e.name),
        )
        .finally(() => (maintaining = false));
    },
    Math.min(1000, grace / 2),
  );
  return {
    router,
    online,
    io,
    rooms,
    finish,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(snapshots);
      clearInterval(maintenance);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
