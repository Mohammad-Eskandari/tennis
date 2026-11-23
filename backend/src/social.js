import { Router } from "express";
import { fail, id, text } from "./security.js";
export function social(db, sec, presence = () => false) {
  const r = Router();
  r.use(sec.requireUser);
  r.get("/friends", async (req, res) => {
    const rows = (
      await db.query(
        "SELECT f.*,u.id AS other_id,u.username,u.display_name FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester=$1 THEN f.recipient ELSE f.requester END WHERE (f.requester=$1 OR f.recipient=$1) AND NOT u.disabled ORDER BY u.username",
        [req.user.id],
      )
    ).rows;
    res.json({
      friends: rows.map((f) => ({ ...f, online: presence(f.other_id) })),
    });
  });
  r.post("/friends", async (req, res) => {
    const other = id(req.body.userId);
    if (other === req.user.id) fail(400, "Cannot add yourself");
    if (
      !(
        await db.query("SELECT 1 FROM users WHERE id=$1 AND NOT disabled", [
          other,
        ])
      ).rowCount
    )
      fail(404, "Player not found");
    const row = (
      await db.query(
        "INSERT INTO friendships(requester,recipient) VALUES($1,$2) RETURNING *",
        [req.user.id, other],
      )
    ).rows[0];
    res.status(201).json({ friendship: row });
  });
  r.patch("/friends/:id", async (req, res) => {
    const action = req.body.action;
    if (!["accept", "reject"].includes(action))
      fail(400, "Choose accept or reject");
    const q =
      action === "accept"
        ? "UPDATE friendships SET status='ACCEPTED' WHERE id=$1 AND recipient=$2 AND status='PENDING' RETURNING *"
        : "DELETE FROM friendships WHERE id=$1 AND recipient=$2 AND status='PENDING' RETURNING *";
    const result = await db.query(q, [id(req.params.id), req.user.id]);
    if (!result.rowCount) fail(404, "Pending request not found");
    res.json({ ok: true });
  });
  r.delete("/friends/:id", async (req, res) => {
    const row = await db.query(
      "DELETE FROM friendships WHERE id=$1 AND (requester=$2 OR recipient=$2) RETURNING id",
      [id(req.params.id), req.user.id],
    );
    if (!row.rowCount) fail(404, "Friendship not found");
    res.json({ ok: true });
  });
  async function accepted(a, b) {
    if (
      !(
        await db.query(
          "SELECT 1 FROM friendships WHERE LEAST(requester,recipient)=LEAST($1::uuid,$2::uuid) AND GREATEST(requester,recipient)=GREATEST($1::uuid,$2::uuid) AND status='ACCEPTED'",
          [a, b],
        )
      ).rowCount
    )
      fail(403, "An accepted friendship is required");
  }
  r.get("/messages/:user", async (req, res) => {
    const other = id(req.params.user);
    await accepted(req.user.id, other);
    const rows = (
      await db.query(
        "SELECT id,sender,recipient,body,created_at,read_at FROM messages WHERE (sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1) ORDER BY created_at DESC LIMIT 100",
        [req.user.id, other],
      )
    ).rows.reverse();
    await db.query(
      "UPDATE messages SET read_at=now() WHERE recipient=$1 AND sender=$2 AND read_at IS NULL",
      [req.user.id, other],
    );
    res.json({ messages: rows });
  });
  r.post("/messages/:user", async (req, res) => {
    const other = id(req.params.user),
      body = text(req.body.body, 1, 2000, "Message");
    await accepted(req.user.id, other);
    const row = (
      await db.query(
        "INSERT INTO messages(sender,recipient,body) VALUES($1,$2,$3) RETURNING *",
        [req.user.id, other, body],
      )
    ).rows[0];
    res.status(201).json({ message: row });
  });
  return r;
}
