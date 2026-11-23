import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
export async function database(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    options: `-c search_path=${config.schema},public`,
    connectionTimeoutMillis: 5000,
  });
  async function transaction(fn) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${config.schema}"`);
  async function migrate() {
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        config.schema,
      ]);
      await c.query(
        "CREATE TABLE IF NOT EXISTS migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const file of (
        await readdir(new URL("../migrations/", import.meta.url))
      )
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        if (
          !(await c.query("SELECT 1 FROM migrations WHERE version=$1", [file]))
            .rowCount
        ) {
          await c.query(
            await readFile(
              new URL("../migrations/" + file, import.meta.url),
              "utf8",
            ),
          );
          await c.query("INSERT INTO migrations(version) VALUES($1)", [file]);
        }
      }
    });
  }
  return {
    pool,
    query: (...args) => pool.query(...args),
    transaction,
    migrate,
    close: () => pool.end(),
  };
}
