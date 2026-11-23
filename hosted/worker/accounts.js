import * as C from "./core.js";
import { decode as pngDecode, encode as pngEncode } from "fast-png";
import jpeg from "jpeg-js";
const {
  first,
  rows,
  run,
  atomic,
  json,
  fail,
  text,
  name,
  password,
  uuid,
  iso,
  profile,
  requireUser,
  hashPassword,
  checkPassword,
  newSession,
  rate,
  audit,
} = C;
export async function accounts(c, path, method, b, url) {
  const g = c.g,
    u = c.user,
    db = c.db;
  if (path === "/auth/me" && method === "GET")
    return json({
      user: u
        ? {
            ...profile(u),
            role: u.role,
            mustChangePassword: !!u.must_change_password,
            csrf: u.csrf,
          }
        : null,
    });
  if (path === "/auth/register" && method === "POST") {
    await rate(
      c,
      "auth:" + c.request.headers.get("cf-connecting-ip"),
      20,
      900000,
    );
    const username = name(b.username),
      hash = await hashPassword(password(b.password)),
      id = uuid();
    if (username.toLowerCase() === "admin")
      fail(409, "This username is reserved");
    await atomic(c, [
      [
        "INSERT INTO users(generation,id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?,?)",
        [g, id, username, username, hash, iso()],
      ],
    ]);
    return newSession(
      c,
      await first(db, "SELECT * FROM users WHERE generation=? AND id=?", [
        g,
        id,
      ]),
    );
  }
  if (path === "/auth/login" && method === "POST") {
    await rate(
      c,
      "auth:" + c.request.headers.get("cf-connecting-ip"),
      35,
      900000,
    );
    const username = text(b.username, 1, 24, "Username"),
      found = await first(
        db,
        "SELECT * FROM users WHERE generation=? AND lower(username)=lower(?)",
        [g, username],
      );
    if (!found || found.disabled || !(await checkPassword(found, b.password)))
      fail(401, "Invalid username or password");
    return newSession(c, found);
  }
  if (path === "/auth/logout" && method === "POST") {
    requireUser(c);
    await atomic(c, [
      ["DELETE FROM sessions WHERE token_hash=?", [c.tokenHash]],
    ]);
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "baseline_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
    });
  }
  if (path === "/profile/password" && method === "POST") {
    requireUser(c);
    await rate(c, "password:" + u.id, 10, 900000);
    if (!(await checkPassword(u, b.currentPassword)))
      fail(401, "Current password is incorrect");
    const hash = await hashPassword(password(b.newPassword));
    await atomic(c, [
      [
        "UPDATE users SET password_hash=?,must_change_password=0 WHERE generation=? AND id=?",
        [hash, g, u.id],
      ],
      ["DELETE FROM sessions WHERE generation=? AND user_id=?", [g, u.id]],
    ]);
    await audit(c, "password.changed");
    return json({ ok: true, reauthenticate: true });
  }
  if (path === "/profile" && method === "PATCH") {
    requireUser(c, "PLAYER");
    const username = name(b.username || u.username),
      display = text(b.displayName, 1, 50, "Display name"),
      bio = text(b.bio || "", 0, 500, "Biography"),
      settings = {
        sound: b.settings?.sound !== false,
        quality: b.settings?.quality === "low" ? "low" : "high",
      };
    if (username.toLowerCase() === "admin")
      fail(409, "This username is reserved");
    await atomic(c, [
      [
        "UPDATE users SET username=?,display_name=?,bio=?,settings=? WHERE generation=? AND id=?",
        [username, display, bio, JSON.stringify(settings), g, u.id],
      ],
    ]);
    return json({
      profile: profile(
        await first(db, "SELECT * FROM users WHERE generation=? AND id=?", [
          g,
          u.id,
        ]),
      ),
    });
  }
  if (path === "/profile/avatar" && method === "POST") {
    requireUser(c, "PLAYER");
    await rate(c, "avatar:" + u.id, 10, 3600000);
    const f = b.get("avatar");
    if (
      !f ||
      f.size > 3 * 1024 * 1024 ||
      !["image/png", "image/jpeg"].includes(f.type)
    )
      fail(400, "Choose a JPEG or PNG, at most 3 MB");
    const bytes = new Uint8Array(await f.arrayBuffer());
    let image;
    try {
      if (f.type === "image/png") {
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
          throw Error();
        const view = new DataView(bytes.buffer);
        if (view.getUint32(16) > 1024 || view.getUint32(20) > 1024)
          throw Error();
        image = pngDecode(bytes, { checkCrc: true });
      } else {
        if (bytes[0] !== 255 || bytes[1] !== 216) throw Error();
        image = jpeg.decode(bytes, {
          useTArray: true,
          maxResolutionInMP: 1,
          maxMemoryUsageInMB: 20,
        });
      }
      if (
        !image.width ||
        !image.height ||
        image.width > 1024 ||
        image.height > 1024
      )
        throw Error();
    } catch {
      fail(400, "Invalid image; use a JPEG or PNG up to 1024 × 1024 pixels");
    }
    const data = new Uint8Array(256 * 256 * 4),
      channels = image.channels || 4,
      side = Math.min(image.width, image.height),
      ox = (image.width - side) / 2,
      oy = (image.height - side) / 2;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const src =
            (Math.floor(oy + (y * side) / 256) * image.width +
              Math.floor(ox + (x * side) / 256)) *
            channels,
          at = (y * 256 + x) * 4;
        for (let k = 0; k < 3; k++)
          data[at + k] = image.data[src + (channels <= 2 ? 0 : k)];
        data[at + 3] =
          channels === 4
            ? image.data[src + 3]
            : channels === 2
              ? image.data[src + 1]
              : 255;
      }
    const encoded = pngEncode({ width: 256, height: 256, data, channels: 4 }),
      filename = uuid() + ".png";
    await c.env.BUCKET.put(`uploads/${g}/${filename}`, encoded, {
      httpMetadata: { contentType: "image/png" },
    });
    try {
      await atomic(c, [
        [
          "UPDATE users SET avatar=? WHERE generation=? AND id=?",
          [filename, g, u.id],
        ],
      ]);
    } catch (e) {
      await c.env.BUCKET.delete(`uploads/${g}/${filename}`);
      throw e;
    }
    // Keep immutable old versions until generation cleanup, so a concurrent backup's snapshot remains valid.
    return json({ avatar: "/api/avatars/" + filename });
  }
  let m = path.match(/^\/profiles\/([^/]+)$/);
  if (m && method === "GET") {
    requireUser(c, "PLAYER");
    const target = await first(
      db,
      "SELECT * FROM users WHERE generation=? AND id=? AND role='PLAYER' AND disabled=0",
      [g, C.id(m[1])],
    );
    if (!target) fail(404, "Player not found");
    const friendship = await first(
      db,
      "SELECT * FROM friendships WHERE generation=? AND ((requester=? AND recipient=?) OR (requester=? AND recipient=?))",
      [g, u.id, target.id, target.id, u.id],
    );
    const history = await rows(
      db,
      "SELECT m.id,m.ranked,m.winner,m.reason,m.finished_at,a.username AS player1,b.username AS player2 FROM matches m JOIN users a ON a.generation=m.generation AND a.id=m.player1 JOIN users b ON b.generation=m.generation AND b.id=m.player2 WHERE m.generation=? AND m.status='COMPLETED' AND (m.player1=? OR m.player2=?) ORDER BY m.finished_at DESC LIMIT 30",
      [g, target.id, target.id],
    );
    return json({ profile: profile(target), friendship, history });
  }
  if (path === "/admin/users" && method === "GET") {
    requireUser(c, "ADMIN");
    const search =
        "%" + (url.searchParams.get("search") || "").slice(0, 50) + "%",
      page = Math.max(
        1,
        Math.min(100000, Number(url.searchParams.get("page")) || 1),
      ),
      status = url.searchParams.get("status");
    const filter =
      status === "disabled"
        ? " AND disabled=1"
        : status === "active"
          ? " AND disabled=0"
          : "";
    const users = await rows(
      db,
      `SELECT id,username,display_name,role,disabled,must_change_password,created_at,count(*) OVER() AS total FROM users WHERE generation=? AND (username LIKE ? OR display_name LIKE ?)${filter} ORDER BY created_at DESC LIMIT 30 OFFSET ?`,
      [g, search, search, (page - 1) * 30],
    );
    return json({ users, total: users[0]?.total || 0, page });
  }
  m = path.match(/^\/admin\/users\/([^/]+)(\/password)?$/);
  if (m) {
    requireUser(c, "ADMIN");
    const target = C.id(m[1]);
    if (m[2] && method === "POST") {
      await rate(c, "adminpw:" + u.id, 10, 900000);
      if (!(await checkPassword(u, b.adminPassword)))
        fail(401, "Administrator password is incorrect");
      const hash = await hashPassword(password(b.newPassword));
      await atomic(c, [
        [
          "UPDATE users SET password_hash=?,must_change_password=1 WHERE generation=? AND id=?",
          [hash, g, target],
        ],
        ["DELETE FROM sessions WHERE generation=? AND user_id=?", [g, target]],
      ]);
      await audit(c, "user.password.reset");
      return json({ ok: true });
    }
    if (!m[2] && method === "PATCH") {
      if (target === u.id && b.disabled)
        fail(400, "Cannot disable your active administrator");
      await atomic(c, [
        [
          "UPDATE users SET username=?,disabled=? WHERE generation=? AND id=?",
          [name(b.username), b.disabled ? 1 : 0, g, target],
        ],
        ...(b.disabled
          ? [
              [
                "DELETE FROM sessions WHERE generation=? AND user_id=?",
                [g, target],
              ],
              [
                "UPDATE matches SET status='ABANDONED',reason='Account disabled',finished_at=? WHERE generation=? AND status IN ('WAITING','ACTIVE') AND (player1=? OR player2=?)",
                [iso(), g, target, target],
              ],
              [
                "DELETE FROM seats WHERE generation=? AND match_id IN (SELECT id FROM matches WHERE generation=? AND status='ABANDONED')",
                [g, g],
              ],
            ]
          : []),
      ]);
      await audit(c, "user.updated");
      return json({ ok: true });
    }
  }
  return null;
}
