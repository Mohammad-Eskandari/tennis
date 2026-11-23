import * as C from "./core.js";
const {
  first,
  rows,
  atomic,
  json,
  fail,
  text,
  id,
  uuid,
  iso,
  profile,
  requireUser,
  eventCommands,
  rate,
} = C;
export const friend = async (c, other) => {
  if (
    !(await first(
      c.db,
      "SELECT id FROM friendships WHERE generation=? AND status='ACCEPTED' AND ((requester=? AND recipient=?) OR (requester=? AND recipient=?))",
      [c.g, c.user.id, other, other, c.user.id],
    ))
  )
    fail(403, "Only confirmed friends may chat");
};
export async function sendMessage(c, to, body, nonce) {
  requireUser(c, "PLAYER");
  id(to);
  id(nonce);
  body = text(body, 1, 2000, "Message");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))
    fail(400, "Unsupported control characters");
  await friend(c, to);
  const old = await first(
    c.db,
    "SELECT * FROM messages WHERE generation=? AND sender=? AND client_nonce=?",
    [c.g, c.user.id, nonce],
  );
  if (old) return old;
  await rate(c, "chat:" + c.user.id, 30);
  const m = {
    generation: c.g,
    id: uuid(),
    sender: c.user.id,
    recipient: to,
    body,
    client_nonce: nonce,
    created_at: iso(),
    read_at: null,
  };
  await atomic(
    c,
    [
      [
        "INSERT INTO messages(generation,id,sender,recipient,body,client_nonce,created_at) VALUES(?,?,?,?,?,?,?)",
        [c.g, m.id, m.sender, to, body, nonce, m.created_at],
      ],
      ...(await eventCommands(c, [m.sender, to], "chat:message", m)),
    ],
    "EXISTS(SELECT 1 FROM friendships WHERE generation=? AND status='ACCEPTED' AND ((requester=? AND recipient=?) OR (requester=? AND recipient=?)))",
    [c.g, m.sender, to, to, m.sender],
  );
  return m;
}
export async function social(c, path, method, b, url) {
  const db = c.db,
    g = c.g,
    u = c.user;
  if (!/^\/(players|friends|messages|leaderboard)(\/|$)/.test(path))
    return null;
  requireUser(c, "PLAYER");
  if (path === "/players" && method === "GET") {
    const s = "%" + (url.searchParams.get("search") || "").slice(0, 50) + "%";
    const players = await rows(
      db,
      "SELECT u.*,EXISTS(SELECT 1 FROM presence p WHERE p.generation=u.generation AND p.user_id=u.id AND p.seen>?) AS online FROM users u WHERE u.generation=? AND u.role='PLAYER' AND u.disabled=0 AND u.id<>? AND (u.username LIKE ? OR u.display_name LIKE ?) ORDER BY u.username LIMIT 30",
      [Date.now() - 20000, g, u.id, s, s],
    );
    return json({
      players: players.map((p) => ({ ...profile(p), online: !!p.online })),
    });
  }
  if (path === "/friends" && method === "GET") {
    const list = await rows(
      db,
      "SELECT * FROM friendships WHERE generation=? AND (requester=? OR recipient=?) ORDER BY created_at DESC",
      [g, u.id, u.id],
    );
    const friends = await Promise.all(
      list.map(async (f) => {
        const uid = f.requester === u.id ? f.recipient : f.requester;
        const p = await first(
            db,
            "SELECT * FROM users WHERE generation=? AND id=?",
            [g, uid],
          ),
          presence = await first(
            db,
            "SELECT seen FROM presence WHERE generation=? AND user_id=?",
            [g, uid],
          ),
          unread = await first(
            db,
            "SELECT count(*) AS n FROM messages WHERE generation=? AND sender=? AND recipient=? AND read_at IS NULL",
            [g, uid, u.id],
          );
        return {
          ...f,
          person: {
            ...profile(p),
            online: (presence?.seen || 0) > Date.now() - 20000,
          },
          unread: unread.n,
        };
      }),
    );
    return json({ friends });
  }
  if (path === "/friends" && method === "POST") {
    const to = id(b.userId);
    if (to === u.id) fail(400, "You cannot add yourself");
    if (
      !(await first(
        db,
        "SELECT id FROM users WHERE generation=? AND id=? AND role='PLAYER' AND disabled=0",
        [g, to],
      ))
    )
      fail(404, "Player not found");
    const f = {
      id: uuid(),
      requester: u.id,
      recipient: to,
      status: "PENDING",
      created_at: iso(),
    };
    await atomic(c, [
      [
        "INSERT INTO friendships(generation,id,requester,recipient,status,created_at) VALUES(?,?,?,?,?,?)",
        [g, f.id, u.id, to, f.status, f.created_at],
      ],
      ...(await eventCommands(c, [u.id, to], "friends:changed", {})),
    ]);
    return json({ friendship: f }, 201);
  }
  let m = path.match(/^\/friends\/([^/]+)(\/accept)?$/);
  if (m) {
    const f = await first(
      db,
      "SELECT * FROM friendships WHERE generation=? AND id=? AND (requester=? OR recipient=?)",
      [g, id(m[1]), u.id, u.id],
    );
    if (!f) fail(404, "Friend request not found");
    if (m[2] && method === "POST") {
      if (f.recipient !== u.id || f.status !== "PENDING")
        fail(403, "Incoming request required");
      await atomic(c, [
        [
          "UPDATE friendships SET status='ACCEPTED' WHERE generation=? AND id=?",
          [g, f.id],
        ],
        ...(await eventCommands(
          c,
          [f.requester, f.recipient],
          "friends:changed",
          {},
        )),
      ]);
      return json({ friendship: { ...f, status: "ACCEPTED" } });
    }
    if (method === "DELETE") {
      await atomic(c, [
        ["DELETE FROM friendships WHERE generation=? AND id=?", [g, f.id]],
        ...(await eventCommands(
          c,
          [f.requester, f.recipient],
          "friends:changed",
          {},
        )),
      ]);
      return json({ ok: true });
    }
  }
  m = path.match(/^\/messages\/([^/]+)(\/read)?$/);
  if (m) {
    const to = id(m[1]);
    await friend(c, to);
    if (m[2] && method === "POST") {
      await atomic(c, [
        [
          "UPDATE messages SET read_at=? WHERE generation=? AND sender=? AND recipient=? AND read_at IS NULL",
          [iso(), g, to, u.id],
        ],
      ]);
      return json({ ok: true });
    }
    if (method === "POST")
      return json({ message: await sendMessage(c, to, b.body, b.nonce) }, 201);
    if (method === "GET") {
      const before = url.searchParams.get("before");
      let cursor = null;
      if (before) {
        cursor = await first(
          db,
          "SELECT * FROM messages WHERE generation=? AND id=? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",
          [g, id(before), u.id, to, to, u.id],
        );
        if (!cursor) fail(400, "Invalid cursor");
      }
      const list = await rows(
        db,
        "SELECT * FROM messages WHERE generation=? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))" +
          (cursor ? " AND (created_at<? OR (created_at=? AND id<?))" : "") +
          " ORDER BY created_at DESC,id DESC LIMIT 51",
        [
          g,
          u.id,
          to,
          to,
          u.id,
          ...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []),
        ],
      );
      return json({
        messages: list.slice(0, 50).reverse(),
        next: list.length > 50 ? list[49].id : null,
      });
    }
  }
  if (path === "/leaderboard" && method === "GET") {
    const sort =
        url.searchParams.get("sort") === "wins"
          ? "wins DESC,rp DESC,id"
          : "rp DESC,wins DESC,id",
      search = "%" + (url.searchParams.get("search") || "").slice(0, 50) + "%",
      page = Math.max(
        1,
        Math.min(100000, Number(url.searchParams.get("page")) || 1),
      ),
      friends = url.searchParams.get("friends") === "true";
    const filter = friends
      ? " AND (id=? OR EXISTS(SELECT 1 FROM friendships f WHERE f.generation=users.generation AND f.status='ACCEPTED' AND ((f.requester=? AND f.recipient=users.id) OR (f.recipient=? AND f.requester=users.id))))"
      : "";
    const data = await rows(
      db,
      `WITH ranked AS(SELECT *,row_number() OVER(ORDER BY ${sort}) AS position FROM users WHERE generation=? AND role='PLAYER' AND disabled=0${filter}) SELECT *,count(*) OVER() AS total FROM ranked WHERE username LIKE ? OR display_name LIKE ? ORDER BY position LIMIT 20 OFFSET ?`,
      [
        g,
        ...(friends ? [u.id, u.id, u.id] : []),
        search,
        search,
        (page - 1) * 20,
      ],
    );
    const mine = await first(
      db,
      "SELECT position FROM(SELECT id,row_number() OVER(ORDER BY rp DESC,wins DESC,id) AS position FROM users WHERE generation=? AND role='PLAYER' AND disabled=0) WHERE id=?",
      [g, u.id],
    );
    return json({
      players: data.map((p) => ({ ...profile(p), position: p.position })),
      total: data[0]?.total || 0,
      myPosition: mine?.position,
      page,
    });
  }
  return null;
}
