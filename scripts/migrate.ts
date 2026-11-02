import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
async function migrate() {
  const db = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await db.connect();
  try {
    await db.query("SELECT pg_advisory_lock(420001)");
    const password = process.env.APP_DB_PASSWORD;
    if (!password || !/^[a-f0-9]{48}$/.test(password))
      throw new Error("Run npm run setup for a valid generated password");
    const role = await db.query(
      "SELECT 1 FROM pg_roles WHERE rolname='tala_app'",
    );
    if (!role.rowCount)
      await db.query(
        `CREATE ROLE tala_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
      );
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz DEFAULT now())",
    );
    for (const file of readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(`db/migrations/${file}`, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const previous = await db.query(
        "SELECT hash FROM schema_migrations WHERE name=$1",
        [file],
      );
      if (previous.rowCount) {
        if (previous.rows[0].hash !== hash)
          throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query(
          "INSERT INTO schema_migrations(name,hash) VALUES($1,$2)",
          [file, hash],
        );
        await db.query("COMMIT");
        console.log(`Applied ${file}`);
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await db.end();
  }
}
migrate().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
