import { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { ForbiddenException } from "@nestjs/common";
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
});
export async function transaction<T>(
  user: string,
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.user',$1,true)", [user]);
    const value = await work(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function scoped<T>(
  user: string,
  company: string,
  write: boolean,
  work: (db: PoolClient, tenant: string) => Promise<T>,
): Promise<T> {
  return transaction(user, async (db) => {
    const result = await db.query(
      "SELECT tenant_id,role FROM memberships WHERE user_id=$1 AND company_id=$2",
      [user, company],
    );
    if (
      !result.rowCount ||
      (write && !["owner", "accountant"].includes(result.rows[0].role))
    )
      throw new ForbiddenException("Company access denied");
    const tenant = result.rows[0].tenant_id;
    await db.query(
      "SELECT set_config('app.tenant',$1,true),set_config('app.company',$2,true)",
      [tenant, company],
    );
    return work(db, tenant);
  });
}
export async function accounts(db: PoolClient) {
  return drizzle(db).execute(
    sql`SELECT id,code,name,kind FROM accounts ORDER BY code`,
  );
}
