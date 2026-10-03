// Create a consistent, separate SQLite snapshot for Turso. Never upload the
// live database file while the pharmacy app may still be writing to it.
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@libsql/client");

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must point to a local SQLite file");
  }

  const filePath = databaseUrl.slice("file:".length);
  const sourcePath = path.resolve(__dirname, "..", "prisma", filePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source database does not exist: ${sourcePath}`);
  }

  const outputDirectory = path.resolve(__dirname, "..", "tmp");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const snapshotPath = path.join(outputDirectory, `turso-import-${Date.now()}.db`);
  const source = createClient({ url: `file:${sourcePath.replaceAll("\\", "/")}` });
  try {
    await source.execute({ sql: "VACUUM INTO ?", args: [snapshotPath] });
  } finally {
    source.close();
  }

  const snapshot = createClient({ url: `file:${snapshotPath.replaceAll("\\", "/")}` });
  try {
    await snapshot.execute("PRAGMA journal_mode=WAL");
    await snapshot.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    const integrity = await snapshot.execute("PRAGMA integrity_check");
    if (integrity.rows[0]?.integrity_check !== "ok") {
      throw new Error("Snapshot integrity check failed");
    }
    const tables = await snapshot.execute("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    console.log(`Turso import snapshot: ${snapshotPath}`);
    console.log(`Integrity: ok; tables: ${tables.rows[0].count}`);
  } finally {
    snapshot.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
