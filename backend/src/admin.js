import { Router, json } from "express";
import { fail, id, text } from "./security.js";
// Fixed identifiers only: backup content is always a parameter, never SQL text.
const tables = ["users", "friendships", "messages", "matches", "invitations"];
export function administration(db, sec) {
  const r = Router();
  r.use(sec.requireUser, sec.admin);
  r.get("/health", async (req, res) => {
    const counts = {};
    for (const name of ["users", "sessions", "matches", "messages"])
      counts[name] = (
        await db.query(`SELECT count(*)::int AS n FROM ${name}`)
      ).rows[0].n;
    res.json({ ok: true, counts, uptime: Math.floor(process.uptime()) });
  });
  r.get("/users", async (req, res) => {
    const q = text(req.query.q || "", 0, 50, "Search"),
      page = Math.max(
        0,
        Math.min(100000, Number.parseInt(req.query.page, 10) || 0),
      ),
      status = req.query.status || "all";
    if (!["all", "active", "suspended"].includes(status))
      fail(400, "Invalid user filter");
    const where =
      "WHERE username ILIKE $1 AND ($2='all' OR disabled=($2='suspended'))";
    const rows = (
      await db.query(
        `SELECT id,username,display_name,role,disabled,rating,wins,losses,created_at FROM users ${where} ORDER BY created_at DESC LIMIT 25 OFFSET $3`,
        ["%" + q + "%", status, page * 25],
      )
    ).rows;
    const count = (
      await db.query(`SELECT count(*)::int AS n FROM users ${where}`, [
        "%" + q + "%",
        status,
      ])
    ).rows[0].n;
    res.json({ users: rows, page, total: count });
  });
  r.patch("/users/:id", async (req, res) => {
    const uid = id(req.params.id);
    if (uid === req.user.id)
      fail(400, "Cannot change your own role or suspension");
    const { role, disabled } = req.body;
    if (role !== undefined && !["PLAYER", "ADMIN"].includes(role))
      fail(400, "Invalid role");
    if (disabled !== undefined && typeof disabled !== "boolean")
      fail(400, "Invalid suspension flag");
    await db.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(827334)");
      const actor = (
        await c.query("SELECT role,disabled FROM users WHERE id=$1", [
          req.user.id,
        ])
      ).rows[0];
      if (actor?.role !== "ADMIN" || actor.disabled)
        fail(403, "Administrator access required");
      const row = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [uid])
      ).rows[0];
      if (!row) fail(404, "User not found");
      await c.query(
        "UPDATE users SET role=COALESCE($1,role),disabled=COALESCE($2,disabled) WHERE id=$3",
        [role, disabled, uid],
      );
      await c.query("DELETE FROM sessions WHERE user_id=$1", [uid]);
      await c.query(
        "INSERT INTO audit_events(actor,action,details) VALUES($1,$2,$3)",
        [req.user.id, "user.updated", { userId: uid, role, disabled }],
      );
    });
    res.json({ ok: true });
  });
  r.get("/audit", async (req, res) =>
    res.json({
      events: (
        await db.query("SELECT * FROM audit_events ORDER BY id DESC LIMIT 100")
      ).rows,
    }),
  );
  r.get("/backup", async (req, res) => {
    const backup = await db.transaction(async (c) => {
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const data = {};
      for (const name of tables) {
        data[name] = (await c.query(`SELECT * FROM ${name}`)).rows;
        if (name === "users")
          for (const u of data.users)
            u.avatar = u.avatar ? u.avatar.toString("base64") : null;
      }
      return {
        format: "baseline-v1",
        createdAt: new Date().toISOString(),
        data,
      };
    });
    await sec.audit(req.user.id, "database.backup");
    res
      .set("Content-Disposition", 'attachment; filename="baseline-backup.json"')
      .json(backup);
  });
  r.post("/restore", async (req, res) => {
    const backup = req.body.backup;
    if (
      req.body.confirm !== "RESTORE" ||
      backup?.format !== "baseline-v1" ||
      !backup.data
    )
      fail(400, "A baseline-v1 backup and RESTORE confirmation are required");
    for (const name of tables)
      if (
        !Array.isArray(backup.data[name]) ||
        backup.data[name].length > 100000
      )
        fail(400, "Invalid backup tables");
    if (
      !backup.data.users.some(
        (u) => u.id === req.user.id && u.role === "ADMIN" && !u.disabled,
      )
    )
      fail(400, "Backup must retain your active administrator");
    for (const u of backup.data.users) {
      id(u.id);
      if (
        !/^\$argon2id\$/.test(u.password_hash) ||
        !["PLAYER", "ADMIN"].includes(u.role)
      )
        fail(400, "Invalid backup account");
      if (u.avatar) {
        if (typeof u.avatar !== "string" || u.avatar.length > 2000000)
          fail(400, "Invalid avatar");
        u.avatar = "\\x" + Buffer.from(u.avatar, "base64").toString("hex");
      }
    }
    await db.transaction(async (c) => {
      await c.query(
        "LOCK TABLE users,sessions,friendships,messages,matches,invitations IN ACCESS EXCLUSIVE MODE",
      );
      if (
        (await c.query("SELECT 1 FROM matches WHERE status='ACTIVE' LIMIT 1"))
          .rowCount
      )
        fail(409, "Finish active matches before restoring");
      await c.query(
        "TRUNCATE sessions,invitations,matches,messages,friendships,users CASCADE",
      );
      for (const name of tables)
        await c.query(
          `INSERT INTO ${name} SELECT * FROM json_populate_recordset(NULL::${name},$1)`,
          [JSON.stringify(backup.data[name])],
        );
      await c.query(
        "INSERT INTO audit_events(actor,action,details) VALUES($1,$2,$3)",
        [req.user.id, "database.restore", { createdAt: backup.createdAt }],
      );
    });
    res.clearCookie(sec.cookie, sec.cookieOptions);
    res.json({ ok: true, reauthenticate: true });
  });
  return r;
}
