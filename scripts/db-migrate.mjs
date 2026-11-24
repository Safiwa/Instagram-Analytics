// Applies db/migrations/*.sql in file-name order, once each.
//
//   DATABASE_URL=postgres://... npm run db:migrate
//
// Vercel deployments run it automatically (see "vercel-build" in package.json).
//
// Each file runs inside one transaction together with its schema_migrations
// row, so a failed migration leaves nothing half-applied. Already-applied
// files are skipped, so the command is safe to run on every deploy.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

// On Vercel, `vercel-build` runs this with --if-configured before `next build`,
// so every deployment applies new migrations to its own database first.
const ifConfigured = process.argv.includes("--if-configured");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  if (ifConfigured) {
    console.log("DATABASE_URL is not set; skipping migrations.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set. Copy it from the Neon dashboard (or Vercel > Storage).");
  process.exit(1);
}

const migrationsDir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select version from schema_migrations");
  const applied = new Set(rows.map((row) => row.version));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
      count += 1;
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${file} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(count === 0 ? "database is up to date" : `${count} migration(s) applied`);
} finally {
  client.release();
  await pool.end();
}
