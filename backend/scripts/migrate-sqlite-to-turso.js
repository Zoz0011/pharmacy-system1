// Copy a prepared SQLite snapshot to an EMPTY Turso database. This deliberately
// refuses to touch a non-empty destination, so a failed run cannot overwrite
// live pharmacy data or silently create duplicates on retry.
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@libsql/client");

const quote = (identifier) => `"${String(identifier).replaceAll('"', '""')}"`;

async function tableCount(client, name) {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${quote(name)}`);
  return Number(result.rows[0].count);
}

async function main() {
  const snapshotPath = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || !fs.existsSync(snapshotPath)) {
    throw new Error("Pass the existing snapshot path from npm run snapshot:turso");
  }
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!databaseUrl || !authToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  }

  const source = createClient({ url: `file:${snapshotPath.replaceAll("\\", "/")}` });
  const target = createClient({ url: databaseUrl, authToken });
  try {
    const existing = await target.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    if (existing.rows.length) {
      throw new Error("Turso destination is not empty; no data was changed");
    }

    const tableResult = await source.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name");
    const tables = tableResult.rows.map((row) => ({ name: String(row.name), sql: String(row.sql) }));
    for (const table of tables) await target.execute(table.sql);

    const tableByName = new Map(tables.map((table) => [table.name, table]));
    const dependencies = new Map();
    for (const table of tables) {
      const rows = await source.execute(`PRAGMA foreign_key_list(${quote(table.name)})`);
      dependencies.set(table.name, new Set(rows.rows.map((row) => String(row.table)).filter((name) => name !== table.name && tableByName.has(name))));
    }

    const ordered = [];
    const remaining = new Set(tables.map((table) => table.name));
    while (remaining.size) {
      const ready = [...remaining].filter((name) => [...dependencies.get(name)].every((dependency) => !remaining.has(dependency)));
      if (!ready.length) throw new Error("Cyclic foreign keys require a manual migration plan");
      for (const name of ready) {
        ordered.push(name);
        remaining.delete(name);
      }
    }

    let totalRows = 0;
    for (const name of ordered) {
      const expected = await tableCount(source, name);
      const columnsResult = await source.execute(`PRAGMA table_info(${quote(name)})`);
      const columns = columnsResult.rows.map((row) => String(row.name));
      const rowsPerInsert = Math.max(1, Math.min(50, Math.floor(900 / Math.max(columns.length, 1))));
      for (let offset = 0; offset < expected; offset += rowsPerInsert) {
        const result = await source.execute({
          sql: `SELECT ${columns.map(quote).join(", ")} FROM ${quote(name)} LIMIT ? OFFSET ?`,
          args: [rowsPerInsert, offset]
        });
        const values = result.rows.map((row) => columns.map((column) => row[column]));
        if (!values.length) throw new Error(`Source changed during migration: ${name}`);
        const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`;
        const sql = `INSERT INTO ${quote(name)} (${columns.map(quote).join(", ")}) VALUES ${values.map(() => rowPlaceholder).join(", ")}`;
        await target.execute({ sql, args: values.flat() });
      }
      const actual = await tableCount(target, name);
      if (actual !== expected) throw new Error(`Row count mismatch in ${name}: ${actual} != ${expected}`);
      totalRows += actual;
      console.log(`${name}: ${actual}`);
    }

    const objects = await source.execute("SELECT type, name, sql FROM sqlite_master WHERE type IN ('index', 'view', 'trigger') AND sql IS NOT NULL ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name");
    for (const object of objects.rows) await target.execute(String(object.sql));

    const foreignKeyErrors = await target.execute("PRAGMA foreign_key_check");
    if (foreignKeyErrors.rows.length) throw new Error(`Foreign key violations: ${foreignKeyErrors.rows.length}`);
    const integrity = await target.execute("PRAGMA integrity_check");
    if (integrity.rows[0]?.integrity_check !== "ok") throw new Error("Remote integrity check failed");
    console.log(`Migration verified: ${tables.length} tables, ${totalRows} rows`);
  } finally {
    source.close();
    target.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
