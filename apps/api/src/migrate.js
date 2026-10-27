import { initDb, applyMigrations, closeDb } from "./db.js";
import { config } from "./config.js";

async function migrate() {
  const info = await initDb();
  if (info.mode === "postgres") {
    await applyMigrations();
  }
  console.log(`database ready (${info.mode}) ${config.databaseUrl}`);
  await closeDb();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
