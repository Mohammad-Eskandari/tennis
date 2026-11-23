import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApplication } from "../src/server.js";
let a, base;
const schema = "test_" + randomBytes(8).toString("hex"),
  origin = "http://tennis.test";
before(async () => {
  a = await createApplication({ schema, origins: [origin] });
  const address = await a.listen(0);
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (a) {
    await a.db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await a.close();
  }
});
function client() {
  let cookie = "",
    csrf = "";
  return {
    get cookie() {
      return cookie;
    },
    get csrf() {
      return csrf;
    },
    async request(path, { method = "GET", body, headers = {}, form } = {}) {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: {
          origin,
          cookie,
          ...(body ? { "content-type": "application/json" } : {}),
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          ...headers,
        },
        body: form || (body ? JSON.stringify(body) : undefined),
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const data = await res.json();
      if (data.user?.csrf) csrf = data.user.csrf;
      return { status: res.status, data, headers: res.headers };
    },
  };
}
test("real PostgreSQL migrations are versioned and repeatable", async () => {
  await a.db.migrate();
  assert.equal(
    (await a.db.query("SELECT count(*)::int AS n FROM migrations")).rows[0].n,
    1,
  );
});
test("register, persist profile, login, CSRF, logout and expired sessions", async () => {
  const c = client();
  let r = await c.request("/auth/register", {
    method: "POST",
    body: { username: "alice", password: "long-test-password-123" },
  });
  assert.equal(r.status, 201);
  const uid = r.data.user.id;
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  const row = (await a.db.query("SELECT * FROM users WHERE id=$1", [uid]))
    .rows[0];
  assert.match(row.password_hash, /^\$argon2id\$/);
  assert.notEqual(
    (
      await a.db.query("SELECT token_hash FROM sessions WHERE user_id=$1", [
        uid,
      ])
    ).rows[0].token_hash,
    c.cookie.split("=")[1],
  );
  r = await c.request("/profile", {
    method: "PATCH",
    body: { displayName: "Alice Tennis", bio: "Ready to rally" },
  });
  assert.equal(r.data.profile.displayName, "Alice Tennis");
  assert.equal(
    (await a.db.query("SELECT bio FROM users WHERE id=$1", [uid])).rows[0].bio,
    "Ready to rally",
  );
  assert.equal(
    (
      await c.request("/profile", {
        method: "PATCH",
        body: { displayName: "Blocked" },
        headers: { "x-csrf-token": "wrong" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await c.request("/profile", {
        method: "PATCH",
        body: { displayName: "Blocked" },
        headers: { origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await c.request("/auth/logout", { method: "POST" })).status,
    200,
  );
  assert.equal((await c.request("/auth/me")).data.user, null);
  assert.equal(
    (
      await c.request("/auth/login", {
        method: "POST",
        body: { username: "alice", password: "wrong-password-123" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await c.request("/auth/login", {
        method: "POST",
        body: { username: "ALICE", password: "long-test-password-123" },
      })
    ).status,
    200,
  );
  await a.db.query(
    "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [uid],
  );
  assert.equal((await c.request("/auth/me")).data.user, null);
});
test("registration validates inputs and prevents case-insensitive duplicates", async () => {
  const c = client();
  assert.equal(
    (
      await c.request("/auth/register", {
        method: "POST",
        body: { username: "ab", password: "short" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await c.request("/auth/register", {
        method: "POST",
        body: { username: "Alice", password: "long-test-password-123" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await c.request("/profile", {
        method: "PATCH",
        body: { displayName: "No auth" },
      })
    ).status,
    401,
  );
});
test("avatars decode, resize, persist and reject disguised files", async () => {
  const c = client();
  await c.request("/auth/register", {
    method: "POST",
    body: { username: "avatar_user", password: "long-test-password-123" },
  });
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#c4df78" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("avatar", new Blob([png], { type: "image/png" }), "avatar.png");
  const r = await c.request("/profile/avatar", { method: "POST", form });
  assert.equal(r.status, 200);
  const res = await fetch(base + r.data.avatar);
  assert.equal(res.headers.get("content-type"), "image/webp");
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal((await sharp(bytes).metadata()).width, 256);
  const bad = new FormData();
  bad.append(
    "avatar",
    new Blob(["<script>"], { type: "image/png" }),
    "fake.png",
  );
  assert.equal(
    (await c.request("/profile/avatar", { method: "POST", form: bad })).status,
    400,
  );
});
test("password change invalidates every existing session", async () => {
  const c = client(),
    other = client();
  await c.request("/auth/register", {
    method: "POST",
    body: { username: "password_user", password: "long-test-password-123" },
  });
  await other.request("/auth/login", {
    method: "POST",
    body: { username: "password_user", password: "long-test-password-123" },
  });
  assert.equal(
    (
      await c.request("/profile/password", {
        method: "POST",
        body: {
          currentPassword: "long-test-password-123",
          newPassword: "replacement-password-123",
        },
      })
    ).status,
    200,
  );
  assert.equal((await other.request("/auth/me")).data.user, null);
});

test("friend requests, authorization and persistent messages", async () => {
  const c = client(),
    d = client(),
    stranger = client();
  const create = async (c, name) =>
    (
      await c.request("/auth/register", {
        method: "POST",
        body: { username: name, password: "long-test-password-123" },
      })
    ).data.user;
  const u = await create(c, "social_one"),
    v = await create(d, "social_two");
  await create(stranger, "social_stranger");
  assert.equal(
    (
      await c.request("/messages/" + v.id, {
        method: "POST",
        body: { body: "Before friendship" },
      })
    ).status,
    403,
  );
  const f = await c.request("/friends", {
    method: "POST",
    body: { userId: v.id },
  });
  assert.equal(f.status, 201);
  assert.equal(
    (
      await stranger.request("/friends/" + f.data.friendship.id, {
        method: "PATCH",
        body: { action: "accept" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await d.request("/friends/" + f.data.friendship.id, {
        method: "PATCH",
        body: { action: "accept" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await c.request("/messages/" + v.id, {
        method: "POST",
        body: { body: "Ready for tennis?" },
      })
    ).status,
    201,
  );
  assert.equal(
    (await d.request("/messages/" + u.id)).data.messages[0].body,
    "Ready for tennis?",
  );
  assert.equal(
    (await a.db.query("SELECT count(*)::int AS n FROM messages")).rows[0].n,
    1,
  );
  assert.equal(
    (await c.request("/friends")).data.friends[0].status,
    "ACCEPTED",
  );
});

test("admin APIs enforce roles, suspension revokes sessions, and backup restoration is transactional", async () => {
  const admin = client(),
    player = client();
  const register = async (c, name) =>
    (
      await c.request("/auth/register", {
        method: "POST",
        body: { username: name, password: "long-test-password-123" },
      })
    ).data.user;
  const u = await register(admin, "admin_test"),
    v = await register(player, "suspend_me");
  assert.equal((await player.request("/admin/users")).status, 403);
  await a.db.query("UPDATE users SET role='ADMIN' WHERE id=$1", [u.id]);
  assert.equal((await admin.request("/admin/users")).status, 200);
  assert.equal(
    (
      await admin.request("/admin/users/" + v.id, {
        method: "PATCH",
        body: { disabled: true },
      })
    ).status,
    200,
  );
  assert.equal((await player.request("/auth/me")).data.user, null);
  const backup = (await admin.request("/admin/backup")).data;
  assert.equal(backup.format, "baseline-v1");
  assert.equal(
    (
      await admin.request("/admin/restore", {
        method: "POST",
        body: { confirm: "NO", backup },
      })
    ).status,
    400,
  );
  const bad = structuredClone(backup);
  bad.data.friendships.push({ id: "invalid" });
  assert.equal(
    (
      await admin.request("/admin/restore", {
        method: "POST",
        body: { confirm: "RESTORE", backup: bad },
      })
    ).status,
    500,
  );
  assert.equal((await admin.request("/auth/me")).data.user.id, u.id);
  assert.equal(
    (
      await admin.request("/admin/restore", {
        method: "POST",
        body: { confirm: "RESTORE", backup },
      })
    ).status,
    200,
  );
  assert.equal((await admin.request("/auth/me")).data.user, null);
  assert.equal(
    (
      await a.db.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE action='database.restore'",
      )
    ).rows[0].n,
    1,
  );
});
