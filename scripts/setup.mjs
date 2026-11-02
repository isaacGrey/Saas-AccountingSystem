import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  console.log("Existing .env retained.");
} else {
  const db = randomBytes(24).toString("hex"),
    app = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `POSTGRES_PASSWORD=${db}\nAPP_DB_PASSWORD=${app}\nMIGRATION_DATABASE_URL=postgres://postgres:${db}@127.0.0.1:54329/tala\nDATABASE_URL=postgres://tala_app:${app}@127.0.0.1:54329/tala\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nAPP_ORIGIN=http://localhost:3000\nPORT=4000\n`,
    { mode: 0o600 },
  );
  console.log("Generated local credentials in ignored .env.");
}
