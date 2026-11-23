import "dotenv/config";
export function configuration(overrides = {}) {
  const c = {
    databaseUrl: process.env.DATABASE_URL,
    schema: process.env.DB_SCHEMA || "baseline",
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || "127.0.0.1",
    production: process.env.NODE_ENV === "production",
    origins: (
      process.env.APP_ORIGINS || "http://127.0.0.1:5173,http://127.0.0.1:3001"
    ).split(","),
    trustProxy: process.env.TRUST_PROXY === "1",
    ...overrides,
  };
  if (!c.databaseUrl)
    throw new Error("DATABASE_URL is required; see .env.example");
  if (!/^(baseline|test_[a-f0-9]+)$/.test(c.schema))
    throw new Error("Invalid database schema");
  return c;
}
