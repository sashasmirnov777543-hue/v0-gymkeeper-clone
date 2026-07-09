import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
 await client.query("BEGIN");
 await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
 const dir=path.join(process.cwd(),"migrations");
 for (const name of (await fs.readdir(dir)).filter(x=>x.endsWith(".sql")).sort()) {
  const done=await client.query("SELECT 1 FROM schema_migrations WHERE name=$1",[name]);
  if (done.rowCount) continue;
  await client.query(await fs.readFile(path.join(dir,name),"utf8"));
  await client.query("INSERT INTO schema_migrations(name) VALUES($1)",[name]);
  console.log(`Applied ${name}`);
 }
 await client.query("COMMIT");
} catch(e){ await client.query("ROLLBACK"); throw e } finally { client.release(); await pool.end() }
