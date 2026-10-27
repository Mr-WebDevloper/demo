import { config } from "./config.js";
import { createApp } from "./app.js";
import { initDb, closeDb } from "./db.js";

const app = createApp();

const info = await initDb();
if (info.mode === "postgres") {
  try {
    const { applyMigrations } = await import("./db.js");
    await applyMigrations();
  } catch (err) {
    console.warn("auto-migrate skipped", err.message);
  }
}

const server = app.listen(config.port, () => {
  console.log(`analytics api listening on ${config.port} (${info.mode})`);
});

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
