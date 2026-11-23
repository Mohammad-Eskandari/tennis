import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { createServer } from "node:http";
export async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of (await readdir(new URL("../../drizzle/", import.meta.url)))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(
      await readFile(new URL("../../drizzle/" + file, import.meta.url), "utf8"),
    );
  const DB = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...this.args) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.args) };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...this.args);
          return { meta: { changes: Number(r.changes) } };
        },
        sql,
      };
    },
    async batch(commands) {
      sqlite.exec("BEGIN");
      try {
        const r = [];
        for (const s of commands) {
          const query = sqlite.prepare(s.sql);
          if (query.columns().length)
            r.push({ results: query.all(...s.args), meta: { changes: 0 } });
          else
            r.push({
              results: [],
              meta: { changes: Number(query.run(...s.args).changes) },
            });
        }
        sqlite.exec("COMMIT");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const objects = new Map();
  const BUCKET = {
    async put(key, body) {
      objects.set(
        key,
        new Uint8Array(
          body instanceof ArrayBuffer
            ? body
            : typeof body === "string"
              ? new TextEncoder().encode(body)
              : body,
        ),
      );
    },
    async get(key) {
      const bytes = objects.get(key);
      return bytes
        ? { body: bytes.slice(), arrayBuffer: async () => bytes.slice().buffer }
        : null;
    },
    async delete(key) {
      for (const k of Array.isArray(key) ? key : [key]) objects.delete(k);
    },
    async list({ prefix = "", cursor } = {}) {
      const keys = [...objects.keys()]
        .filter((k) => k.startsWith(prefix) && (!cursor || k > cursor))
        .sort();
      return {
        objects: keys.slice(0, 1000).map((key) => ({ key })),
        truncated: keys.length > 1000,
        cursor: keys[999],
      };
    },
  };
  const env = {
    DB,
    BUCKET,
    ADMIN_PASSWORD: "private-test-admin",
    BACKUP_KEY: "12".repeat(32),
    LOCAL_TEST: true,
  };
  const worker = (await import("../../dist/server/index.js?qa=" + Date.now()))
    .default;
  const request = (path, options = {}) =>
    worker.fetch(new Request("https://tennis.test" + path, options), env, {
      waitUntil: (p) => p.catch(() => {}),
    });
  const client = () => {
    let cookie = "",
      csrf = "";
    return {
      get cookie() {
        return cookie;
      },
      get csrf() {
        return csrf;
      },
      async call(path, method = "GET", body) {
        const headers = {
          cookie,
          origin: "https://tennis.test",
          "x-csrf-token": csrf,
        };
        if (body && !(body instanceof FormData))
          headers["content-type"] = "application/json";
        const r = await request("/api" + path, {
          method,
          headers,
          body:
            body instanceof FormData
              ? body
              : body
                ? JSON.stringify(body)
                : undefined,
        });
        const type = r.headers.get("content-type");
        const data = type?.includes("application/json")
          ? await r.json()
          : new Uint8Array(await r.arrayBuffer());
        if (r.headers.get("set-cookie"))
          cookie = r.headers.get("set-cookie").split(";")[0];
        if (data.user?.csrf) csrf = data.user.csrf;
        return { status: r.status, data };
      },
    };
  };
  return { sqlite, DB, BUCKET, env, worker, request, client, objects };
}
export async function preview(f, port = 8086) {
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = { ...req.headers };
      if (headers.origin)
        headers.origin = headers.origin.replace(
          "http://127.0.0.1:" + port,
          "http://localhost:" + port,
        );
      const request = new Request("http://localhost:" + port + req.url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      });
      const response = await f.worker.fetch(request, f.env, {
        waitUntil: (p) => p.catch(() => {}),
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
    } catch (e) {
      res.writeHead(500);
      res.end("Preview failure");
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
