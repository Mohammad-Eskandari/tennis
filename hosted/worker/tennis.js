import * as C from "./core.js";
import { createMatch, stepMatch } from "../../shared/simulation.js";
import { STEP } from "../../shared/config.js";
const { first, rows, atomic, uuid, iso, json, fail, requireUser, id } = C;
const read = async (c, rid) => {
  const m = await first(
    c.db,
    "SELECT * FROM matches WHERE generation=? AND id=?",
    [c.g, id(rid)],
  );
  if (!m || ![m.player1, m.player2].includes(c.user.id))
    fail(403, "Room participant required");
  m.rt = JSON.parse(m.state);
  return m;
};
const snap = (m) => ({
  id: m.id,
  code: m.id.slice(0, 8).toUpperCase(),
  ranked: !!m.ranked,
  status: m.status,
  players: [m.player1, m.player2],
  names: m.rt.names,
  ready: m.rt.ready,
  state: m.rt.game,
  ack: m.rt.ack,
  revision: m.version,
});
async function save(c, m, extra = []) {
  await atomic(
    c,
    [
      [
        "UPDATE matches SET state=?,version=version+1,status=?,winner=?,finished_at=?,result_applied=? WHERE generation=? AND id=?",
        [
          JSON.stringify(m.rt),
          m.status,
          m.winner || null,
          m.finished_at || null,
          m.result_applied || 0,
          c.g,
          m.id,
        ],
      ],
      ...extra,
    ],
    "EXISTS(SELECT 1 FROM matches WHERE generation=? AND id=? AND version=?)",
    [c.g, m.id, m.version],
  );
  m.version++;
  return m;
}
async function finish(c, m, w, reason) {
  m.rt.game.score.winner = w;
  m.rt.game.phase = "complete";
  m.rt.game.message = reason;
  m.status = "COMPLETED";
  m.winner = [m.player1, m.player2][w];
  m.finished_at = iso();
  m.result_applied = 1;
  const loser = [m.player1, m.player2][1 - w],
    users = await rows(
      c.db,
      "SELECT id,rp FROM users WHERE generation=? AND id IN(?,?)",
      [c.g, m.winner, loser],
    );
  const winnerRating = users.find((u) => u.id === m.winner).rp,
    loserRating = users.find((u) => u.id === loser).rp,
    delta = m.ranked
      ? Math.round(
          24 * (1 - 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))),
        )
      : 0;
  await save(c, m, [
    [
      "UPDATE users SET wins=wins+1,rp=rp+? WHERE generation=? AND id=?",
      [delta, c.g, m.winner],
    ],
    [
      "UPDATE users SET losses=losses+1,rp=max(0,rp-?) WHERE generation=? AND id=?",
      [delta, c.g, loser],
    ],
    [
      "UPDATE matches SET reason=? WHERE generation=? AND id=?",
      [reason, c.g, m.id],
    ],
    ["DELETE FROM seats WHERE generation=? AND match_id=?", [c.g, m.id]],
  ]);
  return m;
}
async function advance(c, m, input) {
  if (m.status !== "ACTIVE") return m;
  const now = Date.now(),
    i = c.user.id === m.player1 ? 0 : 1,
    rt = m.rt;
  rt.seen[i] = now;
  const other = 1 - i;
  if (now - rt.seen[other] > 30000)
    return finish(c, m, i, "Opponent disconnected");
  // Requests advance the persisted authoritative clock, never a client timestamp.
  const ticks = Math.min(
    60,
    Math.max(0, Math.floor((now - rt.updated) / 1000 / STEP)),
  );
  const controls = rt.inputs.map((v, j) =>
    now - rt.inputAt[j] > 250 ? {} : v,
  );
  for (let tick = 0; tick < ticks && rt.game.phase !== "complete"; tick++)
    stepMatch(rt.game, controls);
  rt.updated = ticks === 60 ? now : rt.updated + ticks * STEP * 1000;
  if (rt.game.phase === "complete")
    return finish(c, m, rt.game.score.winner, "Match completed");
  if (input) {
    if (
      !Number.isSafeInteger(input.seq) ||
      input.seq <= rt.ack[i] ||
      input.seq > rt.ack[i] + 600
    )
      fail(400, "Stale or invalid sequence");
    if (
      !["x", "z", "aim"].every(
        (k) => Number.isFinite(input[k]) && Math.abs(input[k]) <= 1,
      ) ||
      typeof input.swing !== "boolean" ||
      typeof input.sprint !== "boolean" ||
      !["flat", "topspin", "slice"].includes(input.shot) ||
      Object.keys(input).some(
        (k) => !["seq", "x", "z", "aim", "swing", "sprint", "shot"].includes(k),
      )
    )
      fail(400, "Invalid input");
    rt.inputs[i] = input;
    rt.inputAt[i] = now;
    rt.ack[i] = input.seq;
  }
  return save(c, m);
}
async function create(c, ranked) {
  const rid = uuid(),
    rt = {
      game: createMatch({ mode: "online" }),
      ready: [false, false],
      ack: [-1, -1],
      inputs: [{}, {}],
      inputAt: [0, 0],
      seen: [Date.now(), Date.now()],
      updated: Date.now(),
      names: [c.user.username, null],
    };
  await atomic(c, [
    [
      "INSERT INTO matches(generation,id,player1,ranked,state,created_at) VALUES(?,?,?,?,?,?)",
      [c.g, rid, c.user.id, ranked ? 1 : 0, JSON.stringify(rt), iso()],
    ],
    [
      "INSERT INTO seats(generation,user_id,match_id) VALUES(?,?,?)",
      [c.g, c.user.id, rid],
    ],
  ]);
  return read(c, rid);
}
async function join(c, code) {
  const m = await first(
    c.db,
    "SELECT * FROM matches WHERE generation=? AND upper(substr(id,1,8))=? AND status='WAITING'",
    [c.g, code],
  );
  if (!m) fail(404, "Waiting room not found");
  if (m.player1 === c.user.id || m.player2 === c.user.id) return read(c, m.id);
  if (m.player2) fail(409, "Room is full");
  m.rt = JSON.parse(m.state);
  m.rt.names[1] = c.user.username;
  await atomic(
    c,
    [
      [
        "UPDATE matches SET player2=?,state=?,version=version+1 WHERE generation=? AND id=?",
        [c.user.id, JSON.stringify(m.rt), c.g, m.id],
      ],
      [
        "INSERT INTO seats(generation,user_id,match_id) VALUES(?,?,?)",
        [c.g, c.user.id, m.id],
      ],
    ],
    "EXISTS(SELECT 1 FROM matches WHERE generation=? AND id=? AND version=? AND player2 IS NULL)",
    [c.g, m.id, m.version],
  );
  return read(c, m.id);
}
export async function tennis(c, path, method, b, url) {
  if (!/^\/(rooms|matchmaking|invitations|events)(\/|$)/.test(path))
    return null;
  requireUser(c, "PLAYER");
  if (path.startsWith("/events")) {
    const seen = await first(
      c.db,
      "SELECT seen FROM presence WHERE generation=? AND user_id=?",
      [c.g, c.user.id],
    );
    if (!seen || seen.seen < Date.now() - 10000)
      await atomic(c, [
        [
          "INSERT INTO presence(generation,user_id,seen) VALUES(?,?,?) ON CONFLICT(generation,user_id) DO UPDATE SET seen=excluded.seen",
          [c.g, c.user.id, Date.now()],
        ],
      ]);
  }
  if (path === "/events" && method === "GET") {
    await atomic(c, [
      [
        "INSERT INTO presence(generation,user_id,seen) VALUES(?,?,?) ON CONFLICT(generation,user_id) DO UPDATE SET seen=excluded.seen",
        [c.g, c.user.id, Date.now()],
      ],
    ]);
    const mine = await rows(
      c.db,
      "SELECT * FROM matches WHERE generation=? AND status IN('WAITING','ACTIVE') AND (player1=? OR player2=?)",
      [c.g, c.user.id, c.user.id],
    );
    return json({
      rooms: mine.map((m) => {
        m.rt = JSON.parse(m.state);
        return snap(m);
      }),
    });
  }
  if (path === "/events/emit" && method === "POST") {
    if (b.type === "match:watch") {
      return json({
        room: snap(await advance(c, await read(c, b.data), null)),
      });
    }
    if (b.type === "match:input") {
      await C.rate(c, "input:" + c.user.id, 1800);
      const m = await advance(c, await read(c, b.data.matchId), b.data.input);
      return json({ ok: true, room: snap(m) });
    }
    fail(400, "Unsupported event");
  }
  if (path === "/rooms" && method === "GET") {
    const mine = await rows(
      c.db,
      "SELECT * FROM matches WHERE generation=? AND status IN('WAITING','ACTIVE') AND (player1=? OR player2=?)",
      [c.g, c.user.id, c.user.id],
    );
    return json({
      rooms: [],
      current: mine.map((m) => {
        m.rt = JSON.parse(m.state);
        return snap(m);
      }),
    });
  }
  if (path === "/rooms" && method === "POST")
    return json({ room: snap(await create(c, false)) }, 201);
  if (path === "/rooms/join" && method === "POST") {
    if (typeof b.code !== "string" || !/^[A-F0-9]{8}$/.test(b.code))
      fail(400, "Use an eight-character room code");
    return json({ room: snap(await join(c, b.code)) });
  }
  if (path === "/matchmaking" && method === "POST") {
    const m = await first(
      c.db,
      "SELECT m.id FROM matches m JOIN users u ON u.generation=m.generation AND u.id=m.player1 WHERE m.generation=? AND m.status='WAITING' AND m.ranked=1 AND m.player2 IS NULL AND m.player1<>? AND abs(u.rp-?)<=300 ORDER BY m.created_at LIMIT 1",
      [c.g, c.user.id, c.user.rp],
    );
    return json({
      room: snap(
        m
          ? await join(c, m.id.slice(0, 8).toUpperCase())
          : await create(c, true),
      ),
    });
  }
  if (path === "/invitations" && method === "GET") {
    const list = await rows(
      c.db,
      "SELECT key,value FROM app_settings WHERE generation=? AND key LIKE 'invite:%'",
      [c.g],
    );
    return json({
      invitations: list
        .map((x) => JSON.parse(x.value))
        .filter((i) => i.recipient === c.user.id && i.status === "PENDING"),
    });
  }
  let m = path.match(/^\/invitations\/([^/]+)$/);
  if (m && method === "POST") {
    const key = "invite:" + id(m[1]),
      row = await first(
        c.db,
        "SELECT value FROM app_settings WHERE generation=? AND key=?",
        [c.g, key],
      ),
      inv = row ? JSON.parse(row.value) : null;
    if (!inv || inv.recipient !== c.user.id || inv.status !== "PENDING")
      fail(404, "Invitation not found");
    if (!["accept", "decline"].includes(b.action))
      fail(400, "Choose accept or decline");
    const room = b.action === "accept" ? await join(c, inv.code) : null;
    inv.status = room ? "ACCEPTED" : "DECLINED";
    await atomic(c, [
      [
        "UPDATE app_settings SET value=? WHERE generation=? AND key=?",
        [JSON.stringify(inv), c.g, key],
      ],
    ]);
    return json({ room: room ? snap(room) : null });
  }
  m = path.match(/^\/rooms\/([^/]+)(?:\/(ready|leave|invite))?$/);
  if (m) {
    const room = await read(c, m[1]),
      i = room.player1 === c.user.id ? 0 : 1;
    if (!m[2] && method === "GET")
      return json({ room: snap(await advance(c, room, null)) });
    if (m[2] === "ready" && method === "POST") {
      if (room.status !== "WAITING") fail(409, "Match already started");
      room.rt.ready[i] = true;
      if (room.player2 && room.rt.ready.every(Boolean)) {
        room.status = "ACTIVE";
        room.rt.updated = Date.now();
        room.rt.seen = [Date.now(), Date.now()];
      }
      await save(c, room);
      return json({ room: snap(room) });
    }
    if (m[2] === "leave" && method === "POST") {
      if (room.status === "ACTIVE")
        await finish(c, room, 1 - i, "Opponent forfeited");
      else if (room.status === "WAITING") {
        room.status = "ABANDONED";
        await save(c, room, [
          [
            "DELETE FROM seats WHERE generation=? AND match_id=?",
            [c.g, room.id],
          ],
        ]);
      }
      return json({ ok: true });
    }
    if (m[2] === "invite" && method === "POST") {
      const recipient = id(b.userId);
      if (
        !(await first(
          c.db,
          "SELECT id FROM friendships WHERE generation=? AND status='ACCEPTED' AND ((requester=? AND recipient=?) OR (requester=? AND recipient=?))",
          [c.g, c.user.id, recipient, recipient, c.user.id],
        ))
      )
        fail(403, "Invite an accepted friend");
      const inv = {
        id: uuid(),
        sender: c.user.id,
        username: c.user.username,
        recipient,
        match_id: room.id,
        code: room.id.slice(0, 8).toUpperCase(),
        status: "PENDING",
      };
      await atomic(c, [
        [
          "INSERT INTO app_settings(generation,key,value) VALUES(?,?,?)",
          [c.g, "invite:" + inv.id, JSON.stringify(inv)],
        ],
      ]);
      return json({ invitation: inv }, 201);
    }
  }
  return null;
}
