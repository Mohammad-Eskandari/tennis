import * as C from "./core.js";
import { accounts } from "./accounts.js";
import { social } from "./social.js";
import { maintenance, cleanup } from "./maintenance.js";
import { tennis } from "./tennis.js";
import { assets } from "../../.runtime/hosted-assets.js";
async function parseBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return {};
  const max = request.headers
    .get("content-type")
    ?.startsWith("multipart/form-data")
    ? 23 * 1024 * 1024
    : 65536;
  if (Number(request.headers.get("content-length")) > max)
    C.fail(413, "Request too large");
  let size = 0,
    chunks = [];
  const reader = request.body?.getReader();
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        C.fail(413, "Request too large");
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (request.headers.get("content-type")?.startsWith("multipart/form-data"))
    return new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") },
    }).formData();
  try {
    return size ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  } catch {
    C.fail(400, "Invalid JSON");
  }
}
async function adapted(c, path, method, b, url) {
  if (path === "/history") {
    C.requireUser(c);
    return C.json({
      matches: await C.rows(
        c.db,
        "SELECT m.id,m.ranked,m.winner,m.reason,m.finished_at,a.username AS player1,b.username AS player2 FROM matches m JOIN users a ON a.generation=m.generation AND a.id=m.player1 LEFT JOIN users b ON b.generation=m.generation AND b.id=m.player2 WHERE m.generation=? AND m.status IN('COMPLETED','ABANDONED') AND (m.player1=? OR m.player2=?) ORDER BY m.finished_at DESC LIMIT 50",
        [c.g, c.user.id, c.user.id],
      ),
    });
  }
  if (path === "/profile/settings" && method === "PATCH") {
    C.requireUser(c);
    const settings = {
      sound: b.sound !== false,
      quality: b.quality === "low" ? "low" : "high",
      surface: ["hard", "clay", "grass"].includes(b.surface)
        ? b.surface
        : "hard",
    };
    await C.atomic(c, [
      [
        "UPDATE users SET settings=? WHERE generation=? AND id=?",
        [JSON.stringify(settings), c.g, c.user.id],
      ],
    ]);
    return C.json({ settings });
  }
  if (path === "/admin/health") {
    C.requireUser(c, "ADMIN");
    const counts = {};
    for (const table of ["users", "sessions", "matches", "messages"])
      counts[table] = (
        await C.first(
          c.db,
          `SELECT count(*) AS n FROM ${table} WHERE generation=?`,
          [c.g],
        )
      ).n;
    return C.json({ ok: true, counts, uptime: 0 });
  }
  if (path === "/admin/audit") {
    C.requireUser(c, "ADMIN");
    return C.json({
      events: await C.rows(
        c.db,
        "SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100",
      ),
    });
  }
  if (path === "/admin/users" && method === "GET") {
    C.requireUser(c, "ADMIN");
    const search = "%" + (url.searchParams.get("q") || "").slice(0, 50) + "%",
      page = Math.max(0, Number(url.searchParams.get("page")) || 0);
    const users = await C.rows(
      c.db,
      "SELECT id,username,display_name,role,disabled,rp AS rating,wins,losses,created_at FROM users WHERE generation=? AND username LIKE ? ORDER BY created_at DESC LIMIT 25 OFFSET ?",
      [c.g, search, page * 25],
    );
    return C.json({
      users,
      page,
      total: (
        await C.first(
          c.db,
          "SELECT count(*) AS n FROM users WHERE generation=? AND username LIKE ?",
          [c.g, search],
        )
      ).n,
    });
  }
  const admin = path.match(/^\/admin\/users\/([^/]+)$/);
  if (admin && method === "PATCH") {
    C.requireUser(c, "ADMIN");
    const uid = C.id(admin[1]);
    if (uid === c.user.id)
      C.fail(400, "Cannot change your own role or suspension");
    if (b.role !== undefined && !["ADMIN", "PLAYER"].includes(b.role))
      C.fail(400, "Invalid role");
    if (b.disabled !== undefined && typeof b.disabled !== "boolean")
      C.fail(400, "Invalid suspension");
    const target = await C.first(
      c.db,
      "SELECT * FROM users WHERE generation=? AND id=?",
      [c.g, uid],
    );
    if (!target) C.fail(404, "User not found");
    await C.atomic(c, [
      [
        "UPDATE users SET role=?,disabled=? WHERE generation=? AND id=?",
        [
          b.role || target.role,
          b.disabled === undefined ? target.disabled : Number(b.disabled),
          c.g,
          uid,
        ],
      ],
      ["DELETE FROM sessions WHERE generation=? AND user_id=?", [c.g, uid]],
    ]);
    await C.audit(c, "user.updated");
    return C.json({ ok: true });
  }
  return null;
}
async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/health")
      return C.json({
        ok: !!env.DB && !!env.BUCKET,
        hosting: "Sites",
        version: C.VERSION,
      });
    const c = await C.context(request, env);
    let path = url.pathname.slice(4),
      method = request.method,
      b = await parseBody(request);
    if (c.ctl.busy && c.ctl.lease < Date.now()) {
      await C.run(
        c.db,
        "UPDATE control SET busy=NULL,lease=0 WHERE id=1 AND lease<?",
        [Date.now()],
      );
      c.ctl = await C.first(c.db, "SELECT * FROM control WHERE id=1");
    }
    if (
      c.ctl.busy &&
      !path.startsWith("/admin/database") &&
      !["/auth/me", "/auth/login"].includes(path)
    )
      C.fail(503, "Database maintenance in progress");
    if (path === "/config") {
      await C.bootstrap(c);
      return C.json({
        transport: "sites-poll",
        avatarFormats: ["image/png", "image/jpeg"],
        backupFormat: ".tennis.enc",
      });
    }
    const avatar = path.match(/^\/avatars\/([0-9a-f-]{36}\.png)$/);
    if (avatar) {
      C.requireUser(c);
      const row = await C.first(
        c.db,
        "SELECT id FROM users WHERE generation=? AND avatar=?",
        [c.g, avatar[1]],
      );
      const file = row
        ? await env.BUCKET.get(`uploads/${c.g}/${avatar[1]}`)
        : null;
      if (!file) C.fail(404, "Avatar not found");
      return new Response(file.body, {
        headers: {
          "content-type": "image/png",
          "cache-control": "private,max-age=60",
        },
      });
    }
    let result =
      (await adapted(c, path, method, b, url)) ||
      (await maintenance(c, path, method, b)) ||
      (await tennis(c, path, method, b, url));
    if (result) return result;
    const friend = path.match(/^\/friends\/([^/]+)$/);
    if (friend && method === "PATCH") {
      if (!["accept", "reject"].includes(b.action))
        C.fail(400, "Choose accept or reject");
      const row = await C.first(
        c.db,
        "SELECT id FROM friendships WHERE generation=? AND id=? AND recipient=? AND status='PENDING'",
        [c.g, C.id(friend[1]), c.user?.id || ""],
      );
      if (!row) C.fail(404, "Pending request not found");
      if (b.action === "accept") {
        path += "/accept";
        method = "POST";
      } else method = "DELETE";
    }
    if (path.startsWith("/messages/") && method === "POST" && !b.nonce)
      b.nonce = C.uuid();
    if (path === "/players")
      url.searchParams.set("search", url.searchParams.get("q") || "");
    result =
      (await accounts(c, path, method, b, url)) ||
      (await social(c, path, method, b, url));
    if (result && path === "/friends" && method === "GET") {
      const data = await result.json();
      data.friends = data.friends.map((f) => ({
        ...f,
        other_id: f.person.id,
        display_name: f.person.displayName,
        username: f.person.username,
        online: f.person.online,
      }));
      return C.json(data);
    }
    return result || C.json({ error: "Endpoint not found" }, 404);
  }
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405 });
  const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : C.decode(asset.data), {
    headers: {
      "content-type": asset.type,
      "x-content-type-options": "nosniff",
      "cache-control": url.pathname.startsWith("/assets/")
        ? "public,max-age=31536000,immutable"
        : "no-cache",
      "content-security-policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'",
    },
  });
}
export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (e) {
      if (!e.status) console.error("Sites request failed", e.name);
      return C.json(
        {
          error: e.status
            ? e.message
            : /UNIQUE constraint/.test(e.message)
              ? "Already exists"
              : "Request failed; retry shortly",
        },
        e.status || (/UNIQUE constraint/.test(e.message) ? 409 : 500),
      );
    }
  },
};
