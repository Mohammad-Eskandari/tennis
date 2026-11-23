import * as C from "./core.js";
const {
  first,
  rows,
  run,
  stmt,
  atomic,
  json,
  fail,
  uuid,
  iso,
  digest,
  encode,
  decode,
  requireUser,
  checkPassword,
  rate,
  audit,
} = C;
const TABLES = {
  users: [
    "id",
    "username",
    "display_name",
    "password_hash",
    "role",
    "bio",
    "avatar",
    "disabled",
    "must_change_password",
    "rp",
    "wins",
    "losses",
    "settings",
    "created_at",
  ],
  friendships: ["id", "requester", "recipient", "status", "created_at"],
  messages: [
    "id",
    "sender",
    "recipient",
    "body",
    "client_nonce",
    "created_at",
    "read_at",
  ],
  matches: [
    "id",
    "player1",
    "player2",
    "ranked",
    "status",
    "state",
    "winner",
    "loser",
    "result_applied",
    "reason",
    "created_at",
    "finished_at",
    "version",
  ],
  match_shots: ["match_id", "nonce", "actor", "parameters", "created_at"],
  seats: ["user_id", "match_id"],
  app_settings: ["key", "value"],
};
const MAX = 16 * 1024 * 1024;
async function key(c) {
  const k = c.env.BACKUP_KEY;
  if (!/^[0-9a-f]{64}$/i.test(k || ""))
    fail(503, "Sites BACKUP_KEY must be configured");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(k.match(/../g), (v) => parseInt(v, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(c, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    raw = new TextEncoder().encode(JSON.stringify(data));
  if (raw.length > MAX)
    fail(413, "This Sites deployment supports backup packages up to 16 MB");
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(c),
    raw,
  );
  return new TextEncoder().encode(
    JSON.stringify({
      format: "tennis-sites-encrypted-1",
      iv: encode(iv),
      data: encode(new Uint8Array(bytes)),
    }),
  );
}
async function decrypt(c, bytes) {
  if (bytes.byteLength > MAX * 1.4) fail(413, "Backup is too large");
  try {
    const wrapper = JSON.parse(new TextDecoder().decode(bytes));
    if (
      wrapper.format !== "tennis-sites-encrypted-1" ||
      typeof wrapper.data !== "string"
    )
      throw Error();
    const iv = decode(wrapper.iv);
    if (iv.length !== 12) throw Error();
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await key(c),
      decode(wrapper.data),
    );
    if (raw.byteLength > MAX) throw Error();
    return JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    if (e.status) throw e;
    fail(
      400,
      "Backup is corrupted, incompatible, or encrypted with a different key",
    );
  }
}
async function lock(c) {
  const token = uuid(),
    result = await run(
      c.db,
      "UPDATE control SET busy=?,lease=? WHERE id=1 AND generation=? AND busy IS NULL",
      [token, Date.now() + 180000, c.g],
    );
  if (!result.meta.changes) fail(409, "Another database operation is running");
  return token;
}
async function unlock(c, token) {
  await run(
    c.db,
    "UPDATE control SET busy=NULL,lease=0 WHERE id=1 AND busy=?",
    [token],
  );
}
async function lease(c, token) {
  const r = await run(
    c.db,
    "UPDATE control SET lease=? WHERE id=1 AND generation=? AND busy=? AND lease>?",
    [Date.now() + 180000, c.g, token, Date.now()],
  );
  if (!r.meta.changes) fail(409, "Maintenance lease expired");
}
export async function createBackup(c, label = "Manual", token = null) {
  const own = !token;
  token = token || (await lock(c));
  try {
    await lease(c, token);
    const snapshot = await c.db.batch(
        Object.entries(TABLES).map(([table, cols]) =>
          stmt(
            c.db,
            `SELECT ${cols.join(",")} FROM ${table} WHERE generation=?`,
            [c.g],
          ),
        ),
      ),
      data = {},
      files = [];
    Object.keys(TABLES).forEach(
      (table, i) => (data[table] = snapshot[i].results),
    );
    let uploadedBytes = 0;
    for (const u of data.users) {
      if (!u.avatar) continue;
      if (files.some((f) => f.name === u.avatar)) continue;
      const obj = await c.env.BUCKET.get(`uploads/${c.g}/${u.avatar}`);
      if (!obj) fail(409, "A referenced avatar is missing; backup aborted");
      const bytes = new Uint8Array(await obj.arrayBuffer());
      uploadedBytes += bytes.length;
      if (uploadedBytes > 8 * 1024 * 1024)
        fail(413, "Avatar data exceeds this Sites backup limit");
      files.push({
        name: u.avatar,
        data: encode(bytes),
        sha256: await digest(bytes),
      });
    }
    const manifest = {
      createdAt: iso(),
      applicationVersion: C.VERSION,
      schemaVersion: C.SCHEMA,
      format: "tennis-sites-1",
      counts: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v.length]),
      ),
      uploadedBytes,
      recordsHash: await digest(JSON.stringify(data)),
    };
    const archive = await encrypt(c, { manifest, data, files }),
      id = uuid(),
      filename = `tennis-backup-${manifest.createdAt.replace(/[:.]/g, "-")}.tennis.enc`;
    await c.env.BUCKET.put("backups/" + id, archive, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    // Re-read and authenticate the stored bytes before allowing destructive maintenance.
    const stored = await c.env.BUCKET.get("backups/" + id),
      verified = await decrypt(c, await stored.arrayBuffer());
    if (verified.manifest.recordsHash !== manifest.recordsHash)
      fail(500, "Safety backup verification failed");
    await run(
      c.db,
      "INSERT INTO backups(id,filename,created_at,size,label) VALUES(?,?,?,?,?)",
      [id, filename, manifest.createdAt, archive.byteLength, label],
    );
    await audit(c, "backup.created");
    const old = await rows(
      c.db,
      "SELECT id FROM backups ORDER BY created_at DESC LIMIT 100 OFFSET 20",
    );
    for (const o of old) {
      await c.env.BUCKET.delete("backups/" + o.id);
      await run(c.db, "DELETE FROM backups WHERE id=?", [o.id]);
    }
    return {
      id,
      filename,
      createdAt: manifest.createdAt,
      size: archive.byteLength,
      label,
      encrypted: true,
    };
  } finally {
    if (own) await unlock(c, token);
  }
}
export async function validateBackup(c, data) {
  const { manifest: m, data: d, files } = data || {};
  if (
    !m ||
    m.format !== "tennis-sites-1" ||
    m.schemaVersion !== C.SCHEMA ||
    m.applicationVersion !== C.VERSION
  )
    fail(400, "Incompatible backup schema or application version");
  if (
    !d ||
    !Array.isArray(files) ||
    Object.keys(d).length !== Object.keys(TABLES).length ||
    (await digest(JSON.stringify(d))) !== m.recordsHash
  )
    fail(400, "Invalid backup records or checksum");
  for (const [table, cols] of Object.entries(TABLES)) {
    if (
      !Array.isArray(d[table]) ||
      d[table].length > 10000 ||
      m.counts?.[table] !== d[table].length
    )
      fail(400, "Invalid backup record counts");
    for (const row of d[table]) {
      if (
        Object.keys(row).length !== cols.length ||
        cols.some((col) => !Object.hasOwn(row, col)) ||
        Object.values(row).some(
          (v) => v !== null && !["string", "number"].includes(typeof v),
        )
      )
        fail(400, "Invalid backup record structure");
    }
  }
  const names = new Set();
  for (const f of files) {
    if (
      !/^[0-9a-f-]{36}\.png$/.test(f.name) ||
      names.has(f.name) ||
      typeof f.data !== "string"
    )
      fail(400, "Invalid avatar filename");
    names.add(f.name);
    const bytes = decode(f.data);
    if (
      bytes.length > 1024 * 1024 ||
      bytes.length < 24 ||
      (await digest(bytes)) !== f.sha256 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) ||
      new DataView(bytes.buffer).getUint32(16) !== 256 ||
      new DataView(bytes.buffer).getUint32(20) !== 256
    )
      fail(400, "Invalid avatar content or checksum");
  }
  if (
    !d.users.some(
      (u) => u.role === "ADMIN" && !u.disabled && !u.must_change_password,
    )
  )
    fail(
      400,
      "Backup must contain an enabled administrator with usable credentials",
    );
  for (const u of d.users) {
    C.id(u.id);
    C.name(u.username);
    textField(u.display_name, 50);
    textField(u.bio, 500);
    if (
      !["PLAYER", "ADMIN"].includes(u.role) ||
      !/^pbkdf2-sha256\$600000\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/.test(
        u.password_hash,
      ) ||
      ![u.wins, u.losses, u.rp].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      ![0, 1].includes(u.disabled) ||
      ![0, 1].includes(u.must_change_password)
    )
      fail(400, "Invalid account in backup");
    if (u.avatar && !names.has(u.avatar)) fail(400, "Missing avatar");
    try {
      JSON.parse(u.settings);
    } catch {
      fail(400, "Invalid account settings");
    }
  }
  for (const f of d.friendships) {
    C.id(f.id);
    if (
      f.requester === f.recipient ||
      !["PENDING", "ACCEPTED"].includes(f.status)
    )
      fail(400, "Invalid friendship");
  }
  for (const msg of d.messages) {
    C.id(msg.id);
    C.id(msg.client_nonce);
    C.text(msg.body, 1, 2000, "Message");
  }
  for (const room of d.matches) {
    C.id(room.id);
    if (
      !["WAITING", "ACTIVE", "COMPLETED", "ABANDONED"].includes(room.status) ||
      room.player1 === room.player2
    )
      fail(400, "Invalid match");
    let game;
    try {
      game = JSON.parse(room.state);
    } catch {
      fail(400, "Invalid game state");
    }
    if (
      !game.game ||
      !Array.isArray(game.game.players) ||
      game.game.players.length !== 2 ||
      !game.game.ball ||
      !["x", "y", "z", "vx", "vy", "vz"].every((k) =>
        Number.isFinite(game.game.ball[k]),
      ) ||
      !Array.isArray(game.game.score?.points)
    )
      fail(400, "Invalid tennis state");
  }
  return data;
}
function textField(s, n) {
  if (typeof s !== "string" || s.length > n) fail(400, "Invalid profile field");
}
export async function integrity(c, g) {
  const queries = [
    ["friendships", "requester"],
    ["friendships", "recipient"],
    ["messages", "sender"],
    ["messages", "recipient"],
    ["matches", "player1"],
    ["matches", "player2"],
    ["matches", "winner"],
    ["matches", "loser"],
    ["seats", "user_id"],
    ["match_shots", "actor"],
  ];
  for (const [table, col] of queries)
    if (
      await first(
        c.db,
        `SELECT 1 AS invalid FROM ${table} t LEFT JOIN users u ON u.generation=t.generation AND u.id=t.${col} WHERE t.generation=? AND t.${col} IS NOT NULL AND u.id IS NULL LIMIT 1`,
        [g],
      )
    )
      fail(400, "Backup contains broken user relationships");
  for (const table of ["seats", "match_shots"])
    if (
      await first(
        c.db,
        `SELECT 1 AS invalid FROM ${table} t LEFT JOIN matches m ON m.generation=t.generation AND m.id=t.match_id WHERE t.generation=? AND m.id IS NULL LIMIT 1`,
        [g],
      )
    )
      fail(400, "Backup contains broken match relationships");
}
async function stage(c, backup, token) {
  const g = uuid();
  await run(
    c.db,
    "INSERT INTO garbage(generation,owner,created_at) VALUES(?,?,?)",
    [g, token, Date.now()],
  );
  for (const f of backup.files)
    await c.env.BUCKET.put(`uploads/${g}/${f.name}`, decode(f.data), {
      httpMetadata: { contentType: "image/png" },
    });
  for (const [table, cols] of Object.entries(TABLES)) {
    const list = backup.data[table];
    for (let start = 0; start < list.length; start += 40) {
      await lease(c, token);
      await c.db.batch(
        list.slice(start, start + 40).map((row) =>
          stmt(
            c.db,
            `INSERT INTO ${table}(generation,${cols.join(",")}) VALUES(${Array(
              cols.length + 1,
            )
              .fill("?")
              .join(",")})`,
            [g, ...cols.map((k) => row[k])],
          ),
        ),
      );
    }
  }
  await integrity(c, g);
  for (const f of backup.files) {
    const stored = await c.env.BUCKET.get(`uploads/${g}/${f.name}`);
    if (!stored || (await digest(await stored.arrayBuffer())) !== f.sha256)
      fail(500, "Staged avatar verification failed");
  }
  return g;
}
async function switchGeneration(c, g, token, action) {
  await atomic(
    c,
    [
      ["UPDATE control SET generation=?,busy=NULL,lease=0 WHERE id=1", [g]],
      ["DELETE FROM sessions", []],
      ["DELETE FROM grants", []],
      ["DELETE FROM garbage WHERE generation=?", [g]],
      [
        "INSERT OR REPLACE INTO garbage(generation,owner,created_at) VALUES(?,NULL,?)",
        [c.g, Date.now()],
      ],
      [
        "INSERT INTO audit_events(id,actor,action,created_at) VALUES(?,?,?,?)",
        [uuid(), c.user.id, action, iso()],
      ],
    ],
    "1",
    [],
    token,
  );
}
export async function cleanup(c) {
  const stale = await rows(
    c.db,
    "SELECT g.generation FROM garbage g,control c WHERE c.id=1 AND g.generation<>c.generation AND (c.busy IS NULL OR g.owner IS NOT c.busy) LIMIT 3",
  );
  for (const row of stale) {
    const g = row.generation;
    // These names are application constants; archive contents never select tables or paths.
    await c.db.batch(
      [
        "events",
        "previews",
        "presence",
        "seats",
        "match_shots",
        "messages",
        "friendships",
        "matches",
        "users",
        "app_settings",
      ].map((t) =>
        stmt(
          c.db,
          `DELETE FROM ${t} WHERE generation=? AND NOT EXISTS(SELECT 1 FROM control WHERE generation=?)`,
          [g, g],
        ),
      ),
    );
    for (const dir of ["uploads", "replays"]) {
      let cursor;
      do {
        const listed = await c.env.BUCKET.list({
          prefix: `${dir}/${g}/`,
          cursor,
        });
        if (listed.objects.length)
          await c.env.BUCKET.delete(listed.objects.map((o) => o.key));
        cursor = listed.truncated ? listed.cursor : null;
      } while (cursor);
    }
    await run(c.db, "DELETE FROM garbage WHERE generation=?", [g]);
  }
  const expired = await rows(
    c.db,
    "SELECT token,value FROM grants WHERE kind='restore' AND expires<? LIMIT 10",
    [Date.now()],
  );
  for (const item of expired) {
    await c.env.BUCKET.delete("imports/" + item.value);
    await run(c.db, "DELETE FROM grants WHERE token=?", [item.token]);
  }
  await run(c.db, "DELETE FROM limits WHERE expires<?", [Date.now()]);
  await run(c.db, "DELETE FROM events WHERE created_at<?", [
    Date.now() - 86400000,
  ]);
}
async function grant(c, kind, value) {
  const token = uuid();
  await atomic(c, [
    [
      "INSERT INTO grants(token,generation,actor,kind,value,expires) VALUES(?,?,?,?,?,?)",
      [await digest(token), c.g, c.user.id, kind, value, Date.now() + 300000],
    ],
  ]);
  return token;
}
async function getGrant(c, token, kind) {
  const g = await first(
    c.db,
    "SELECT * FROM grants WHERE token=? AND generation=? AND actor=? AND kind=? AND expires>?",
    [await digest(token || ""), c.g, c.user.id, kind, Date.now()],
  );
  if (!g) fail(403, "Confirmation expired; start again");
  return g;
}
export async function maintenance(c, path, method, b) {
  if (!path.startsWith("/admin/database")) return null;
  requireUser(c, "ADMIN");
  await rate(c, "maintenance:" + c.user.id, 60, 3600000);
  if (path === "/admin/database/backups" && method === "GET") {
    const backups = await rows(
      c.db,
      "SELECT * FROM backups ORDER BY created_at DESC LIMIT 20",
    );
    return json({
      backups: backups.map((b) => ({
        ...b,
        createdAt: b.created_at,
        encrypted: true,
      })),
    });
  }
  if (path === "/admin/database/backups" && method === "POST")
    return json({ backup: await createBackup(c) }, 201);
  let m = path.match(/^\/admin\/database\/backups\/([^/]+)\/download$/);
  if (m && method === "GET") {
    const saved = await first(c.db, "SELECT * FROM backups WHERE id=?", [
      C.id(m[1]),
    ]);
    if (!saved) fail(404, "Backup not found");
    const file = await c.env.BUCKET.get("backups/" + saved.id);
    if (!file) fail(404, "Backup unavailable");
    await audit(c, "backup.downloaded");
    return new Response(file.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${saved.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (path === "/admin/database/imports" && method === "POST") {
    const file = b.get("backup");
    if (!file || file.size > MAX * 1.4)
      fail(413, "Choose a Sites .tennis.enc backup up to 22 MB");
    const bytes = await file.arrayBuffer(),
      backup = await validateBackup(c, await decrypt(c, bytes)),
      key = uuid();
    await c.env.BUCKET.put("imports/" + key, bytes);
    return json({
      ticket: await grant(c, "restore", key),
      manifest: backup.manifest,
    });
  }
  if (path === "/admin/database/restore" && method === "POST") {
    if (
      b.confirmation !== "RESTORE BACKUP" ||
      !(await checkPassword(c.user, b.password))
    )
      fail(
        403,
        "Administrator password and RESTORE BACKUP confirmation required",
      );
    const authorized = await getGrant(c, b.ticket, "restore"),
      file = await c.env.BUCKET.get("imports/" + authorized.value);
    if (!file) fail(404, "Import expired");
    const backup = await validateBackup(
        c,
        await decrypt(c, await file.arrayBuffer()),
      ),
      token = await lock(c);
    try {
      await createBackup(c, "Pre-restore safety", token);
      const g = await stage(c, backup, token);
      await switchGeneration(c, g, token, "database.restored");
      await c.env.BUCKET.delete("imports/" + authorized.value);
      await cleanup(c);
      return json({
        ok: true,
        reauthenticate: true,
        counts: backup.manifest.counts,
      });
    } finally {
      await unlock(c, token);
    }
  }
  if (path === "/admin/database/reset/authorize" && method === "POST") {
    if (
      b.confirmation !== "RESET ALL DATA" ||
      !(await checkPassword(c.user, b.password))
    )
      fail(
        403,
        "Administrator password and RESET ALL DATA confirmation required",
      );
    return json({ token: await grant(c, "reset", null) });
  }
  if (path === "/admin/database/reset" && method === "POST") {
    if (b.confirmation !== "RESET ALL DATA") fail(400, "Type RESET ALL DATA");
    await getGrant(c, b.token, "reset");
    const token = await lock(c);
    try {
      await createBackup(c, "Pre-reset safety", token);
      const backup = {
        files: [],
        data: Object.fromEntries(Object.keys(TABLES).map((t) => [t, []])),
      };
      backup.data.users = [
        Object.fromEntries(
          TABLES.users.map((k) => [k, k === "avatar" ? null : c.user[k]]),
        ),
      ];
      backup.data.app_settings = await rows(
        c.db,
        "SELECT key,value FROM app_settings WHERE generation=?",
        [c.g],
      );
      const g = await stage(c, backup, token);
      await switchGeneration(c, g, token, "database.reset");
      await cleanup(c);
      return json({ ok: true, reauthenticate: true });
    } finally {
      await unlock(c, token);
    }
  }
  return null;
}
