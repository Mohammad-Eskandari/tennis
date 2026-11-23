import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { configuration } from "./config.js";
import { database } from "./db.js";
import { security } from "./security.js";
import { accounts } from "./accounts.js";
import { social } from "./social.js";
import { administration } from "./admin.js";
import { multiplayer } from "./multiplayer.js";
export async function createApplication(options = {}) {
  const config = configuration(options),
    db = await database(config);
  await db.migrate();
  const sec = security(db, config),
    app = express(),
    server = createServer(app);
  const network = await multiplayer(server, db, sec, config);
  if (config.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60e3,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !config.origins.includes(origin))
      return res.status(403).json({ error: "Invalid request origin" });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token");
      res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE");
      return res.sendStatus(204);
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  const smallJson = express.json({ limit: "64kb" }),
    restoreJson = express.json({ limit: "20mb" });
  app.use(
    (req, res, next) =>
      (req.path === "/api/admin/restore" ? restoreJson : smallJson)(
        req,
        res,
        next,
      ),
    cookieParser(),
  );
  app.use("/api", async (req, res, next) => {
    req.user = await sec.sessionFor(req.cookies[sec.cookie]);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!config.origins.includes(req.get("origin")))
        return res.status(403).json({ error: "Invalid request origin" });
      if (req.user && req.get("x-csrf-token") !== req.user.csrf)
        return res
          .status(403)
          .json({ error: "Session protection token required" });
    }
    next();
  });
  app.get("/api/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });
  app.use("/api", accounts(db, sec));
  app.use("/api", social(db, sec, network.online));
  app.use("/api", network.router);
  app.use("/api/admin", administration(db, sec));
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(
    express.static(fileURLToPath(new URL("../../dist/", import.meta.url))),
  );
  app.get("/", (req, res) =>
    res.sendFile(
      fileURLToPath(new URL("../../dist/index.html", import.meta.url)),
    ),
  );
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    const status =
      e.code === "23505"
        ? 409
        : e.status || (e.code === "LIMIT_FILE_SIZE" ? 413 : 500);
    if (status === 500) console.error("Request failed:", e.code || e.name);
    res.status(status).json({
      error:
        status === 500
          ? "Internal server error"
          : e.code === "23505"
            ? "Already exists"
            : e.message,
    });
  });
  return {
    app,
    server,
    db,
    sec,
    config,
    network,
    async listen(port = config.port) {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, config.host, resolve);
      });
      return server.address();
    },
    async close() {
      await network.close();
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = await createApplication();
  const address = await a.listen();
  console.log(`Baseline server: http://${a.config.host}:${address.port}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await a.close();
      process.exit(0);
    });
}
