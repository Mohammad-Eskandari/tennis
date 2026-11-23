import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./harness.mjs";
import sharp from "sharp";
test("Sites D1 adapter: authentication, social, two-player authority, rankings and encrypted restore", async () => {
  const f = await fixture();
  try {
    const a = f.client(),
      b = f.client(),
      admin = f.client();
    assert.equal((await a.call("/config")).data.transport, "sites-poll");
    let one = await a.call("/auth/register", "POST", {
      username: "tennis_one",
      password: "long-test-password-123",
    });
    assert.equal(one.status, 200);
    const u = one.data.user;
    assert.equal(
      (
        await f.request("/api/profile", {
          method: "PATCH",
          headers: {
            cookie: a.cookie,
            origin: "https://evil.test",
            "content-type": "application/json",
            "x-csrf-token": a.csrf,
          },
          body: JSON.stringify({ displayName: "Forged" }),
        })
      ).status,
      403,
    );
    const avatar = new FormData();
    avatar.set(
      "avatar",
      new File(
        [
          await sharp({
            create: {
              width: 16,
              height: 16,
              channels: 3,
              background: "#c4df78",
            },
          })
            .png()
            .toBuffer(),
        ],
        "avatar.png",
        { type: "image/png" },
      ),
    );
    const upload = await a.call("/profile/avatar", "POST", avatar);
    assert.equal(upload.status, 200);
    assert.equal((await a.call(upload.data.avatar.slice(4))).status, 200);
    const v = (
      await b.call("/auth/register", "POST", {
        username: "tennis_two",
        password: "long-test-password-123",
      })
    ).data.user;
    assert.equal(u.rating, 1000);
    assert.equal(
      (
        await a.call("/profile", "PATCH", {
          displayName: "Tennis One",
          bio: "On court",
        })
      ).status,
      200,
    );
    assert.equal((await a.call("/admin/users")).status, 403);
    const friendship = (await a.call("/friends", "POST", { userId: v.id })).data
      .friendship;
    assert.equal(
      (await b.call("/friends/" + friendship.id, "PATCH", { action: "accept" }))
        .status,
      200,
    );
    assert.equal((await a.call("/friends")).data.friends[0].other_id, v.id);
    assert.equal(
      (await a.call("/messages/" + v.id, "POST", { body: "Let us play" }))
        .status,
      201,
    );
    assert.equal(
      (await b.call("/messages/" + u.id)).data.messages[0].body,
      "Let us play",
    );
    const room = (await a.call("/matchmaking", "POST", {})).data.room;
    assert.ok(room?.id);
    assert.equal(
      (await b.call("/matchmaking", "POST", {})).data.room.id,
      room.id,
    );
    await a.call("/rooms/" + room.id + "/ready", "POST", {});
    const ready = await b.call("/rooms/" + room.id + "/ready", "POST", {});
    assert.equal(ready.data.room.status, "ACTIVE");
    const input = {
      seq: 0,
      x: 0,
      z: 0,
      aim: 0,
      swing: true,
      sprint: false,
      shot: "flat",
    };
    assert.equal(
      (
        await a.call("/events/emit", "POST", {
          type: "match:input",
          data: { matchId: room.id, input },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await a.call("/events/emit", "POST", {
          type: "match:input",
          data: { matchId: room.id, input },
        })
      ).status,
      400,
    );
    await new Promise((r) => setTimeout(r, 60));
    const state = await a.call("/rooms/" + room.id);
    assert.equal(state.data.room.state.phase, "rally");
    assert.ok(state.data.room.state.ball.z > -12.1);
    await b.call("/rooms/" + room.id + "/leave", "POST", {});
    const ranked = await a.call("/leaderboard");
    assert.equal(ranked.data.players.find((p) => p.id === u.id).rating, 1012);
    await b.call("/rooms/" + room.id + "/leave", "POST", {});
    assert.equal(
      (await a.call("/leaderboard")).data.players.find((p) => p.id === u.id)
        .wins,
      1,
    );
    assert.equal((await a.call("/history")).data.matches.length, 1);
    assert.equal(
      (
        await admin.call("/auth/login", "POST", {
          username: "admin",
          password: f.env.ADMIN_PASSWORD,
        })
      ).status,
      200,
    );
    const backup = await admin.call("/admin/database/backups", "POST", {});
    assert.equal(backup.status, 201);
    const download = await admin.call(
      "/admin/database/backups/" + backup.data.backup.id + "/download",
    );
    assert.ok(download.data.byteLength > 100);
    const form = new FormData();
    form.set("backup", new File([download.data], "test.tennis.enc"));
    const preview = await admin.call("/admin/database/imports", "POST", form);
    assert.equal(preview.status, 200);
    assert.equal(
      (
        await admin.call("/admin/database/restore", "POST", {
          ticket: preview.data.ticket,
          password: f.env.ADMIN_PASSWORD,
          confirmation: "RESTORE BACKUP",
        })
      ).status,
      200,
    );
    assert.equal((await a.call("/auth/me")).data.user, null);
    const relogin = await a.call("/auth/login", "POST", {
      username: "tennis_one",
      password: "long-test-password-123",
    });
    assert.equal(relogin.data.user.wins, 1);
  } finally {
    f.sqlite.close();
  }
});
