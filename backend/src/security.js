import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const digest = (s) => createHash("sha256").update(s).digest("hex");
export function text(s, min, max, label = "Value") {
  if (
    typeof s !== "string" ||
    s.trim().length < min ||
    s.length > max ||
    s.includes("\0")
  )
    fail(400, `${label} must contain ${min}–${max} characters`);
  return s.trim();
}
export function username(s) {
  if (typeof s !== "string" || !/^[a-zA-Z0-9_]{3,24}$/.test(s))
    fail(400, "Username must be 3–24 letters, digits or underscores");
  return s;
}
export function password(s) {
  if (typeof s !== "string" || s.length < 12 || s.length > 128)
    fail(400, "Password must contain 12–128 characters");
  return s;
}
export function id(s) {
  if (
    typeof s !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      s,
    )
  )
    fail(400, "Invalid identifier");
  return s;
}
export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  bio: u.bio,
  avatar: u.has_avatar ? `/api/avatars/${u.id}` : null,
  rating: u.rating,
  wins: u.wins,
  losses: u.losses,
  createdAt: u.created_at,
});
export const hashPassword = (p) =>
  argon2.hash(password(p), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export function security(db, config) {
  const cookie = "baseline_session",
    cookieOptions = {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/",
    };
  async function sessionFor(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      (
        await db.query(
          "SELECT u.*,u.avatar IS NOT NULL AS has_avatar,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled",
          [digest(token)],
        )
      ).rows[0] || null
    );
  }
  async function newSession(res, u) {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
      [digest(token), u.id, csrf],
    );
    res.cookie(cookie, token, { ...cookieOptions, maxAge: 7 * 86400000 });
    return { ...publicUser(u), role: u.role, settings: u.settings, csrf };
  }
  const requireUser = (req, res, next) => {
    if (!req.user)
      return next(Object.assign(new Error("Please sign in"), { status: 401 }));
    next();
  };
  const admin = (req, res, next) => {
    if (req.user?.role !== "ADMIN")
      return next(
        Object.assign(new Error("Administrator access required"), {
          status: 403,
        }),
      );
    next();
  };
  const audit = (actor, action, details = {}) =>
    db.query(
      "INSERT INTO audit_events(actor,action,details) VALUES($1,$2,$3)",
      [actor, action, details],
    );
  return {
    cookie,
    cookieOptions,
    sessionFor,
    newSession,
    requireUser,
    admin,
    audit,
  };
}
