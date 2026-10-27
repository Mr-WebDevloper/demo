import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { config } from "./config.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

let pool = null;
let pglite = null;

function isEmbedded() {
  return config.databaseUrl.startsWith("pglite");
}

export async function query(text, params = []) {
  if (pglite) {
    const result = await pglite.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }
  if (!pool) {
    throw new Error("database not initialized");
  }
  return pool.query(text, params);
}

export async function applyMigrations() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    if (pglite) {
      await pglite.exec(sql);
    } else {
      await query(sql);
    }
    console.log(`applied ${file}`);
  }
}

export async function initDb() {
  if (isEmbedded()) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/pglite");
    fs.mkdirSync(dir, { recursive: true });
    pglite = new PGlite(dir);
    await pglite.waitReady;
    await applyMigrations();
    return { mode: "pglite", dir };
  }
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
  });
  return { mode: "postgres" };
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pglite) {
    await pglite.close();
    pglite = null;
  }
}
