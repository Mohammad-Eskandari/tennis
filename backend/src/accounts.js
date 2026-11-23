import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import argon2 from "argon2";
import multer from "multer";
import sharp from "sharp";
import {
  fail,
  text,
  username,
  password,
  id,
  publicUser,
  hashPassword,
} from "./security.js";
export function accounts(db, sec) {
  const r = Router();
  const limit = rateLimit({
    windowMs: 15 * 60e3,
    limit: 35,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  r.get("/auth/me", (req, res) =>
    res.json({
      user: req.user
        ? {
            ...publicUser(req.user),
            role: req.user.role,
            settings: req.user.settings,
            csrf: req.user.csrf,
          }
        : null,
    }),
  );
  r.post("/auth/register", limit, async (req, res) => {
    const name = username(req.body.username),
      hash = await hashPassword(req.body.password);
    const u = (
      await db.query(
        "INSERT INTO users(username,display_name,password_hash) VALUES($1,$1,$2) RETURNING *",
        [name, hash],
      )
    ).rows[0];
    res.status(201).json({ user: await sec.newSession(res, u) });
  });
  r.post("/auth/login", limit, async (req, res) => {
    const name = text(req.body.username, 1, 24, "Username"),
      pw = password(req.body.password),
      u = (
        await db.query(
          "SELECT *,avatar IS NOT NULL AS has_avatar FROM users WHERE lower(username)=lower($1)",
          [name],
        )
      ).rows[0];
    if (!u || u.disabled || !(await argon2.verify(u.password_hash, pw)))
      fail(401, "Invalid username or password");
    res.json({ user: await sec.newSession(res, u) });
  });
  r.post("/auth/logout", sec.requireUser, async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      req.user.token_hash,
    ]);
    res.clearCookie(sec.cookie, sec.cookieOptions);
    res.json({ ok: true });
  });
  r.patch("/profile", sec.requireUser, async (req, res) => {
    const display = text(req.body.displayName, 1, 50, "Display name"),
      bio = text(req.body.bio ?? "", 0, 500, "Bio");
    const u = (
      await db.query(
        "UPDATE users SET display_name=$1,bio=$2 WHERE id=$3 RETURNING *,avatar IS NOT NULL AS has_avatar",
        [display, bio, req.user.id],
      )
    ).rows[0];
    res.json({ profile: publicUser(u) });
  });
  r.patch("/profile/settings", sec.requireUser, async (req, res) => {
    const settings = {
      sound: req.body.sound !== false,
      quality: req.body.quality === "low" ? "low" : "high",
      surface: ["hard", "clay", "grass"].includes(req.body.surface)
        ? req.body.surface
        : "hard",
    };
    await db.query("UPDATE users SET settings=$1 WHERE id=$2", [
      settings,
      req.user.id,
    ]);
    res.json({ settings });
  });
  r.post("/profile/password", sec.requireUser, limit, async (req, res) => {
    if (
      typeof req.body.currentPassword !== "string" ||
      !(await argon2.verify(req.user.password_hash, req.body.currentPassword))
    )
      fail(401, "Current password is incorrect");
    const hash = await hashPassword(req.body.newPassword);
    await db.transaction(async (c) => {
      await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hash,
        req.user.id,
      ]);
      await c.query("DELETE FROM sessions WHERE user_id=$1", [req.user.id]);
    });
    await sec.audit(req.user.id, "password.changed");
    res.clearCookie(sec.cookie, sec.cookieOptions);
    res.json({ ok: true, reauthenticate: true });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
  }).single("avatar");
  r.post("/profile/avatar", sec.requireUser, upload, async (req, res) => {
    if (
      !req.file ||
      !["image/png", "image/jpeg", "image/webp"].includes(req.file.mimetype)
    )
      fail(400, "Choose a PNG, JPEG or WebP image under 3 MB");
    let bytes;
    try {
      const img = sharp(req.file.buffer, {
          limitInputPixels: 16e6,
          animated: false,
        }),
        meta = await img.metadata();
      if (
        !["png", "jpeg", "webp"].includes(meta.format) ||
        meta.pages > 1 ||
        `image/${meta.format}` !== req.file.mimetype
      )
        fail(400, "Invalid image type");
      bytes = await img
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      fail(400, "Invalid or oversized image");
    }
    await db.query("UPDATE users SET avatar=$1 WHERE id=$2", [
      bytes,
      req.user.id,
    ]);
    res.json({ avatar: `/api/avatars/${req.user.id}` });
  });
  r.get("/avatars/:id", async (req, res) => {
    const row = (
      await db.query("SELECT avatar FROM users WHERE id=$1 AND NOT disabled", [
        id(req.params.id),
      ])
    ).rows[0];
    if (!row?.avatar) fail(404, "Avatar not found");
    res
      .set("Cache-Control", "public, max-age=60")
      .type("webp")
      .send(row.avatar);
  });
  r.get("/profiles/:id", sec.requireUser, async (req, res) => {
    const u = (
      await db.query(
        "SELECT *,avatar IS NOT NULL AS has_avatar FROM users WHERE id=$1 AND NOT disabled",
        [id(req.params.id)],
      )
    ).rows[0];
    if (!u) fail(404, "Player not found");
    res.json({ profile: publicUser(u) });
  });
  r.get("/players", sec.requireUser, async (req, res) => {
    const q = text(req.query.q || "", 0, 24, "Search");
    res.json({
      players: (
        await db.query(
          "SELECT id,username,display_name,rating,wins,losses,bio,avatar IS NOT NULL AS has_avatar FROM users WHERE NOT disabled AND role='PLAYER' AND username ILIKE $1 ORDER BY rating DESC,username LIMIT 50",
          ["%" + q + "%"],
        )
      ).rows.map(publicUser),
    });
  });
  r.get("/leaderboard", sec.requireUser, async (req, res) =>
    res.json({
      players: (
        await db.query(
          "SELECT *,avatar IS NOT NULL AS has_avatar FROM users WHERE NOT disabled AND role='PLAYER' ORDER BY rating DESC,wins DESC,username LIMIT 100",
        )
      ).rows.map(publicUser),
    }),
  );
  r.get("/history", sec.requireUser, async (req, res) =>
    res.json({
      matches: (
        await db.query(
          "SELECT m.id,m.ranked,m.status,m.winner,m.reason,m.finished_at,m.state->'score' AS score,a.username AS player1,b.username AS player2 FROM matches m JOIN users a ON a.id=m.player1 LEFT JOIN users b ON b.id=m.player2 WHERE (m.player1=$1 OR m.player2=$1) AND m.status IN('COMPLETED','ABANDONED') ORDER BY m.created_at DESC LIMIT 50",
          [req.user.id],
        )
      ).rows,
    }),
  );
  return r;
}
