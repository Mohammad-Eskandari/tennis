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
const appSecretFile = path.join(dir, "app-password");
if (!(await exists(appSecretFile)))
  await writeFile(appSecretFile, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
const appPassword = (await readFile(appSecretFile, "utf8")).trim();
if (
  !(await client.query("SELECT 1 FROM pg_roles WHERE rolname='baseline_app'"))
    .rowCount
) {
  const sql = (
    await client.query(
      "SELECT format('CREATE ROLE baseline_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', $1::text) AS sql",
      [appPassword],
    )
  ).rows[0].sql;
  await client.query(sql);
}
await client.query("ALTER DATABASE baseline OWNER TO baseline_app");
await client.end();
const owner = new pg.Client({ connectionString: url + "/baseline" });
await owner.connect();
if (
  (await owner.query("SELECT 1 FROM pg_namespace WHERE nspname='baseline'"))
    .rowCount
) {
  await owner.query("ALTER SCHEMA baseline OWNER TO baseline_app");
  await owner.query(
    "GRANT ALL ON ALL TABLES IN SCHEMA baseline TO baseline_app",
  );
  await owner.query(
    "GRANT ALL ON ALL SEQUENCES IN SCHEMA baseline TO baseline_app",
  );
}
await owner.end();
const appUrl = `postgresql://baseline_app:${appPassword}@127.0.0.1:55432/baseline`;
if (!(await exists(path.join(root, ".env"))))
  await writeFile(
    path.join(root, ".env"),
    `DATABASE_URL=${appUrl}\nDB_SCHEMA=baseline\nPORT=3001\nAPP_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:3001\n`,
    { mode: 0o600, flag: "wx" },
  );
else {
  const envPath = path.join(root, ".env"),
    current = await readFile(envPath, "utf8");
  if (
    /^DATABASE_URL=postgresql:\/\/baseline:[^\r\n]+@127\.0\.0\.1:55432\/baseline$/m.test(
      current,
    )
  )
    await writeFile(
      envPath,
      current.replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=" + appUrl),
      { mode: 0o600 },
    );
}
console.log(
  "Isolated PostgreSQL ready on 127.0.0.1:55432; private local configuration saved in ignored files.",
);
