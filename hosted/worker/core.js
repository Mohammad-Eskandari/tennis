import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
export const VERSION = "sites-tennis-1",
  SCHEMA = 1;
export const uuid = () => crypto.randomUUID(),
  iso = () => new Date().toISOString();
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
export const stmt = (db, sql, args = []) => db.prepare(sql).bind(...args);
export const first = (db, sql, args = []) => stmt(db, sql, args).first();
export const rows = async (db, sql, args = []) =>
  (await stmt(db, sql, args).all()).results;
export const run = (db, sql, args = []) => stmt(db, sql, args).run();
export const hex = (a) =>
  Array.from(new Uint8Array(a), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
export const digest = async (a) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof a === "string" ? new TextEncoder().encode(a) : a,
    ),
  );
export function encode(a) {
  let s = "";
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
}
export const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const text = (v, min, max, label = "Value") => {
  if (typeof v !== "string" || v.trim().length < min || v.length > max)
    fail(400, `${label} must have ${min}–${max} characters`);
  return v.trim();
};
export const name = (v) => {
  const s = text(v, 3, 24, "Username");
  if (!/^[a-z0-9_]+$/i.test(s))
    fail(400, "Use letters, numbers or underscores in usernames");
  return s;
};
export const password = (v) => {
  if (typeof v !== "string" || v.length < 12 || v.length > 128)
    fail(400, "Password must have 12?128 characters");
  return v;
};
export const id = (v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v))
    fail(400, "Invalid ID");
  return v;
};
export async function hashPassword(
  p,
  salt = crypto.getRandomValues(new Uint8Array(16)),
) {
  const hash = await pbkdf2Async(
    sha256,
    new TextEncoder().encode(password(p)),
    salt,
    { c: 600000, dkLen: 32, asyncTick: 10 },
  );
  return `pbkdf2-sha256$600000$${encode(salt)}$${encode(hash)}`;
}
export async function checkPassword(u, p) {
  try {
    const [algo, c, s, h] = u.password_hash.split("$");
    if (algo !== "pbkdf2-sha256" || c !== "600000") return false;
    const actual = (await hashPassword(p, decode(s))).split("$")[3];
    let diff = actual.length ^ h.length;
    for (let i = 0; i < h.length; i++)
      diff |= actual.charCodeAt(i) ^ h.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
export const rank = (rp) =>
  rp < 800
    ? "Bronze"
    : rp < 1100
      ? "Silver"
      : rp < 1400
        ? "Gold"
        : rp < 1700
          ? "Platinum"
          : rp < 2000
            ? "Diamond"
            : "Master";
export const profile = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  bio: u.bio,
  avatar: u.avatar ? "/api/avatars/" + u.avatar : null,
  createdAt: u.created_at,
  rating: u.rp,
  rp: u.rp,
  rank: rank(u.rp),
  wins: u.wins,
  losses: u.losses,
  totalMatches: u.wins + u.losses,
  winPercentage:
    u.wins + u.losses
      ? Math.round((u.wins / (u.wins + u.losses)) * 1000) / 10
      : 0,
  settings: JSON.parse(u.settings || "{}"),
});
export const match = (m) =>
  m
    ? {
        ...m,
        state: typeof m.state === "string" ? JSON.parse(m.state) : m.state,
        ranked: !!m.ranked,
        result_applied: !!m.result_applied,
      }
    : null;
export async function atomic(
  c,
  commands,
  guardSql = "1",
  guardArgs = [],
  lock = null,
) {
  const checks = [c.g, lock, lock, Date.now()];
  let auth = "";
  if (c.user) {
    auth =
      " AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.generation=s.generation AND u.id=s.user_id WHERE s.token_hash=? AND s.generation=? AND s.user_id=? AND s.expires_at>? AND u.disabled=0)";
    checks.push(c.tokenHash, c.g, c.user.id, Date.now());
  }
  try {
    return await c.db.batch([
      stmt(
        c.db,
        `INSERT INTO guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM control WHERE id=1 AND generation=? AND busy IS ? AND (? IS NULL OR lease>?))${auth} AND (${guardSql}) THEN 1 ELSE 0 END`,
        [...checks, ...guardArgs],
      ),
      ...commands.map(([sql, args]) => stmt(c.db, sql, args)),
      stmt(c.db, "DELETE FROM guard"),
    ]);
  } catch (e) {
    if (/guard_ok|CHECK constraint/.test(e.message))
      fail(409, "State changed or maintenance started; refresh and retry");
    if (/UNIQUE constraint/.test(e.message))
      fail(409, "This username, request or room is already in use");
    throw e;
  }
}
export async function eventCommands(c, ids, name, payload) {
  return [...new Set(ids.filter(Boolean))].map((user) => [
    "INSERT INTO events(generation,user_id,name,payload,created_at) VALUES(?,?,?,?,?)",
    [c.g, user, name, JSON.stringify(payload), Date.now()],
  ]);
}
export async function audit(c, action) {
  await run(
    c.db,
    "INSERT INTO audit_events(id,actor,action,created_at) VALUES(?,?,?,?)",
    [uuid(), c.user?.id || null, action, iso()],
  );
}
export async function rate(c, key, limit, window = 60000) {
  const k = key + ":" + Math.floor(Date.now() / window);
  const r = await stmt(
    c.db,
    "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    [k, Date.now() + window],
  ).first();
  if (r.count > limit) fail(429, "Too many requests; please wait");
}
export async function context(request, env) {
  if (!env.DB || !env.BUCKET)
    fail(503, "Sites database and file storage are not configured");
  const db = env.DB.withSession ? env.DB.withSession("first-primary") : env.DB;
  await run(
    db,
    "INSERT OR IGNORE INTO control(id,generation,lease) VALUES(1,'initial',0)",
  );
  const ctl = await first(db, "SELECT * FROM control WHERE id=1");
  const c = { db, g: ctl.generation, ctl, env, request, user: null };
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)baseline_session=([0-9a-f-]{36}\.[0-9a-f-]{36})/)?.[1];
  c.tokenHash = token ? await digest(token) : null;
  if (c.tokenHash)
    c.user = await first(
      db,
      "SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.generation=s.generation AND u.id=s.user_id WHERE s.token_hash=? AND s.generation=? AND s.expires_at>? AND u.disabled=0",
      [c.tokenHash, c.g, Date.now()],
    );
  if (!["GET", "HEAD"].includes(request.method)) {
    const source = request.headers.get("origin");
    if (source && source !== new URL(request.url).origin)
      fail(403, "Invalid request origin");
    if (c.user && request.headers.get("x-csrf-token") !== c.user.csrf)
      fail(403, "Invalid security token; reload the page");
    if (
      !source &&
      request.headers.get("sec-fetch-site") !== "same-origin" &&
      !env.LOCAL_TEST
    )
      fail(403, "Same-origin request required");
  }
  return c;
}
export function requireUser(c, role) {
  if (!c.user) fail(401, "Please sign in");
  if (role && c.user.role !== role)
    fail(
      403,
      role === "ADMIN" ? "Administrator required" : "Player account required",
    );
  if (
    c.user.must_change_password &&
    !new URL(c.request.url).pathname.match(/auth\/|profile\/password/)
  )
    fail(403, "Change your password first");
}
export async function newSession(c, u) {
  const token = uuid() + "." + uuid(),
    csrf = uuid();
  await atomic(c, [
    [
      "INSERT INTO sessions(token_hash,generation,user_id,csrf,expires_at) VALUES(?,?,?,?,?)",
      [await digest(token), c.g, u.id, csrf, Date.now() + 7 * 86400000],
    ],
  ]);
  return json(
    {
      user: {
        ...profile(u),
        role: u.role,
        mustChangePassword: !!u.must_change_password,
        csrf,
      },
    },
    200,
    {
      "Set-Cookie": `baseline_session=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800`,
    },
  );
}
export async function bootstrap(c) {
  if (
    await first(
      c.db,
      "SELECT id FROM users WHERE generation=? AND role='ADMIN'",
      [c.g],
    )
  )
    return;
  if (!c.env.ADMIN_PASSWORD || c.env.ADMIN_PASSWORD === "admin")
    fail(503, "A secure Sites administrator password must be configured");
  const hash = await hashPassword(c.env.ADMIN_PASSWORD);
  await atomic(c, [
    [
      "INSERT OR IGNORE INTO users(generation,id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)",
      [c.g, uuid(), "admin", "Administrator", hash, "ADMIN", iso()],
    ],
  ]);
}
