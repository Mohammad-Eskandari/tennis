import { spawn } from "node:child_process";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(file, args, { windowsHide: true, stdio: "ignore" });
    p.once("error", reject);
    p.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(file)} exited ${code}`)),
    );
  });
const root = process.cwd(),
  dir = path.join(root, ".runtime"),
  data = path.join(dir, "postgres");
const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
await mkdir(dir, { recursive: true });
const exists = async (p) =>
  access(p).then(
    () => true,
    () => false,
  );
if (process.argv[2] === "stop") {
  await run(path.join(bin, "pg_ctl"), ["-D", data, "stop", "-m", "fast"], {
    windowsHide: true,
  });
  console.log("Local database stopped");
  process.exit(0);
}
const secretFile = path.join(dir, "db-password");
if (!(await exists(secretFile)))
  await writeFile(secretFile, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
if (!(await exists(path.join(data, "PG_VERSION"))))
  await run(
    path.join(bin, "initdb"),
    [
      "-D",
      data,
      "-U",
      "baseline",
      "--pwfile",
      secretFile,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ],
    { windowsHide: true },
  );
try {
  await run(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
    windowsHide: true,
  });
} catch {
  await run(
    path.join(bin, "pg_ctl"),
    [
      "-D",
      data,
      "-l",
      path.join(dir, "postgres.log"),
      "-o",
      "-h 127.0.0.1 -p 55432",
      "-w",
      "start",
    ],
    { windowsHide: true },
  );
}
const password = (await readFile(secretFile, "utf8")).trim();
const url = `postgresql://baseline:${password}@127.0.0.1:55432`;
const client = new pg.Client({ connectionString: url + "/postgres" });
await client.connect();
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname='baseline'"))
    .rowCount
)
  await client.query("CREATE DATABASE baseline");
await client.end();
if (!(await exists(path.join(root, ".env"))))
  await writeFile(
    path.join(root, ".env"),
    `DATABASE_URL=${url}/baseline\nDB_SCHEMA=baseline\nPORT=3001\nAPP_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:3001\n`,
    { mode: 0o600, flag: "wx" },
  );
console.log(
  "Isolated PostgreSQL ready on 127.0.0.1:55432; private local configuration saved in ignored files.",
);
