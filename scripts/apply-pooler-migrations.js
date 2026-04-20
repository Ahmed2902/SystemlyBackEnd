#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const crypto = require("crypto");
const dotenv = require("dotenv");

// Load .env.local first, fallback to .env
const envPathLocal = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPathLocal)) {
  dotenv.config({ path: envPathLocal });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set in environment (.env or .env.local)");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Connected to DB (via DATABASE_URL)");

  // Ensure _prisma_migrations table exists
  const createMigrationsTable = `
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  finished_at TIMESTAMP(3),
  migration_name TEXT NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMP(3),
  applied_steps_count INTEGER NOT NULL
);
`;
  await client.query(createMigrationsTable);

  const res = await client.query(
    "SELECT migration_name FROM _prisma_migrations"
  );
  const applied = new Set(res.rows.map((r) => r.migration_name));

  const folders = fs
    .readdirSync(migrationsDir)
    .filter((f) => {
      try {
        return fs.statSync(path.join(migrationsDir, f)).isDirectory();
      } catch (e) {
        return false;
      }
    })
    .sort();

  for (const folder of folders) {
    if (applied.has(folder)) {
      console.log(`Skipping already applied migration: ${folder}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(`No migration.sql in ${folder}, skipping.`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf8").trim();
    if (!sql) {
      console.log(`Empty SQL for ${folder}, skipping.`);
      continue;
    }

    console.log(`Applying migration: ${folder}`);
    try {
      // Execute migration SQL directly (avoid wrapping in transaction since some DDL
      // statements might be incompatible)
      await client.query(sql);
    } catch (e) {
      console.error(`Failed applying migration ${folder}:`, e.message || e);
      await client.end();
      process.exit(1);
    }

    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();
    const finishedAt = new Date();
    await client.query(
      "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, applied_steps_count) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id, checksum, finishedAt, folder, null, null, 1]
    );
    console.log(`Applied and recorded migration: ${folder}`);
  }

  console.log("All migrations processed.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
