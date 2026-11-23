import {
  sqliteTable as defineTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  check,
  foreignKey,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
function sqliteTable(name, columns, extra) {
  return defineTable(name, columns, (t) => {
    const keys =
      {
        sessions: ["user_id"],
        friendships: ["requester", "recipient"],
        messages: ["sender", "recipient"],
        matches: ["player1", "player2", "winner", "loser"],
        seats: ["user_id"],
        match_shots: ["actor"],
        presence: ["user_id"],
        previews: ["actor"],
        events: ["user_id"],
      }[name] || [];
    return [
      ...(extra?.(t) || []),
      ...keys.map((k) =>
        foreignKey({
          columns: [t.generation, t[k]],
          foreignColumns: [users.generation, users.id],
        }).onDelete("cascade"),
      ),
      ...(["seats", "match_shots", "previews"].includes(name)
        ? [
            foreignKey({
              columns: [t.generation, t.match_id],
              foreignColumns: [matches.generation, matches.id],
            }).onDelete("cascade"),
          ]
        : []),
      ...(name === "events"
        ? [index("events_recipient_seq").on(t.generation, t.user_id, t.seq)]
        : []),
    ];
  });
}
export const control = sqliteTable("control", {
  id: integer("id").primaryKey(),
  generation: text("generation").notNull(),
  busy: text("busy"),
  lease: integer("lease").notNull().default(0),
});
export const guard = sqliteTable(
  "guard",
  { ok: integer("ok").notNull() },
  (t) => [check("guard_ok", sql`${t.ok}=1`)],
);
export const users = sqliteTable(
  "users",
  {
    generation: text("generation").notNull(),
    id: text("id").notNull(),
    username: text("username").notNull(),
    display_name: text("display_name").notNull(),
    password_hash: text("password_hash").notNull(),
    role: text("role").notNull().default("PLAYER"),
    bio: text("bio").notNull().default(""),
    avatar: text("avatar"),
    disabled: integer("disabled").notNull().default(0),
    must_change_password: integer("must_change_password").notNull().default(0),
    rp: integer("rp").notNull().default(1000),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    settings: text("settings").notNull().default("{}"),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.generation, t.id] }),
    uniqueIndex("username_unique").on(t.generation, sql`lower(${t.username})`),
    check("user_role", sql`${t.role} IN ('ADMIN','PLAYER')`),
    check(
      "nonnegative_stats",
      sql`${t.rp}>=0 AND ${t.wins}>=0 AND ${t.losses}>=0`,
    ),
  ],
);
export const sessions = sqliteTable("sessions", {
  token_hash: text("token_hash").primaryKey(),
  generation: text("generation").notNull(),
  user_id: text("user_id").notNull(),
  csrf: text("csrf").notNull(),
  expires_at: integer("expires_at").notNull(),
});
export const friendships = sqliteTable(
  "friendships",
  {
    generation: text("generation").notNull(),
    id: text("id").notNull(),
    requester: text("requester").notNull(),
    recipient: text("recipient").notNull(),
    status: text("status").notNull().default("PENDING"),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.generation, t.id] }),
    uniqueIndex("friend_pair").on(
      t.generation,
      sql`CASE WHEN ${t.requester}<${t.recipient} THEN ${t.requester} ELSE ${t.recipient} END`,
      sql`CASE WHEN ${t.requester}>${t.recipient} THEN ${t.requester} ELSE ${t.recipient} END`,
    ),
    check(
      "friend_status",
      sql`${t.requester}<>${t.recipient} AND ${t.status} IN ('PENDING','ACCEPTED')`,
    ),
  ],
);
export const messages = sqliteTable(
  "messages",
  {
    generation: text("generation").notNull(),
    id: text("id").notNull(),
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    body: text("body").notNull(),
    client_nonce: text("client_nonce").notNull(),
    created_at: text("created_at").notNull(),
    read_at: text("read_at"),
  },
  (t) => [
    primaryKey({ columns: [t.generation, t.id] }),
    uniqueIndex("message_nonce").on(t.generation, t.sender, t.client_nonce),
    check("message_body", sql`length(${t.body}) BETWEEN 1 AND 2000`),
  ],
);
export const matches = sqliteTable(
  "matches",
  {
    generation: text("generation").notNull(),
    id: text("id").notNull(),
    player1: text("player1").notNull(),
    player2: text("player2"),
    ranked: integer("ranked").notNull().default(0),
    status: text("status").notNull().default("WAITING"),
    state: text("state").notNull(),
    winner: text("winner"),
    loser: text("loser"),
    result_applied: integer("result_applied").notNull().default(0),
    reason: text("reason"),
    created_at: text("created_at").notNull(),
    finished_at: text("finished_at"),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.generation, t.id] }),
    check(
      "match_status",
      sql`${t.status} IN ('WAITING','ACTIVE','COMPLETED','ABANDONED')`,
    ),
  ],
);
export const seats = sqliteTable(
  "seats",
  {
    generation: text("generation").notNull(),
    user_id: text("user_id").notNull(),
    match_id: text("match_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generation, t.user_id] })],
);
export const shots = sqliteTable(
  "match_shots",
  {
    generation: text("generation").notNull(),
    match_id: text("match_id").notNull(),
    nonce: text("nonce").notNull(),
    actor: text("actor").notNull(),
    parameters: text("parameters").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generation, t.match_id, t.nonce] })],
);
export const events = sqliteTable("events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  generation: text("generation").notNull(),
  user_id: text("user_id").notNull(),
  name: text("name").notNull(),
  payload: text("payload").notNull(),
  created_at: integer("created_at").notNull(),
});
export const presence = sqliteTable(
  "presence",
  {
    generation: text("generation").notNull(),
    user_id: text("user_id").notNull(),
    seen: integer("seen").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generation, t.user_id] })],
);
export const previews = sqliteTable(
  "previews",
  {
    generation: text("generation").notNull(),
    match_id: text("match_id").notNull(),
    actor: text("actor").notNull(),
    payload: text("payload").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generation, t.match_id] })],
);
export const settings = sqliteTable(
  "app_settings",
  {
    generation: text("generation").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generation, t.key] })],
);
export const audit = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actor: text("actor"),
  action: text("action").notNull(),
  created_at: text("created_at").notNull(),
});
export const grants = sqliteTable("grants", {
  token: text("token").primaryKey(),
  generation: text("generation").notNull(),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  value: text("value"),
  expires: integer("expires").notNull(),
});
export const backups = sqliteTable("backups", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  created_at: text("created_at").notNull(),
  size: integer("size").notNull(),
  label: text("label").notNull(),
});
export const limits = sqliteTable("limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const garbage = sqliteTable("garbage", {
  generation: text("generation").primaryKey(),
  owner: text("owner"),
  created_at: integer("created_at").notNull(),
});
