const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ensureBackendEnv, projectRoot } = require("./ensure-env");

const backendDirectory = path.join(projectRoot, "backend");
const generatedSchema = path.join(backendDirectory, "node_modules", ".prisma", "client", "schema.prisma");
const sourceSchema = path.join(backendDirectory, "prisma", "schema.prisma");
const databasePath = path.join(backendDirectory, "prisma", "dev.db");
const setupScript = path.join(__dirname, "setup.js");

ensureBackendEnv();

const requiredFiles = [
  path.join(projectRoot, "node_modules", "concurrently", "package.json"),
  path.join(backendDirectory, "node_modules", "prisma", "package.json"),
  path.join(backendDirectory, "node_modules", "@prisma", "client", "package.json"),
  path.join(projectRoot, "frontend", "node_modules", "vite", "package.json"),
  generatedSchema,
  databasePath
];

let setupArgs = null;
if (requiredFiles.some((file) => !fs.existsSync(file))) {
  console.log("Project preparation is incomplete. Running the one-time setup now...");
  setupArgs = [];
} else {
  const sourceModifiedAt = fs.statSync(sourceSchema).mtimeMs;
  const clientModifiedAt = fs.statSync(generatedSchema).mtimeMs;
  if (sourceModifiedAt > clientModifiedAt) {
    console.log("Database schema changed. Refreshing Prisma before startup...");
    setupArgs = ["--skip-install", "--skip-seed", "--skip-build"];
  }
}

if (setupArgs) {
  const result = spawnSync(process.execPath, [setupScript, ...setupArgs], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
