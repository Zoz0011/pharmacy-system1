const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ensureBackendEnv, projectRoot } = require("./ensure-env");

const backendDirectory = path.join(projectRoot, "backend");
const frontendDirectory = path.join(projectRoot, "frontend");
const prismaCli = path.join(backendDirectory, "node_modules", "prisma", "build", "index.js");
const skipInstall = process.argv.includes("--skip-install");
const skipSeed = process.argv.includes("--skip-seed");
const skipBuild = process.argv.includes("--skip-build");
const npmCli = process.env.npm_execpath;

function run(command, args, cwd, label, extraEnv = {}, shell = false) {
  console.log(`\n[setup] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell,
    env: { ...process.env, ...extraEnv }
  });

  if (result.error) {
    console.error(`[setup] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[setup] ${label} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

function runNpm(args, cwd, label) {
  if (npmCli && fs.existsSync(npmCli)) {
    run(process.execPath, [npmCli, ...args], cwd, label);
    return;
  }

  run("npm", args, cwd, label, {}, process.platform === "win32");
}

function installDependencies() {
  runNpm(["install"], projectRoot, "Installing workspace dependencies");
  runNpm(["install"], backendDirectory, "Installing backend dependencies");
  runNpm(["install"], frontendDirectory, "Installing frontend dependencies");
}

function runPrisma(args, label) {
  if (!fs.existsSync(prismaCli)) {
    console.error("Prisma is not installed. Run npm run setup again after checking the npm install error above.");
    process.exit(1);
  }

  run(process.execPath, [prismaCli, ...args], backendDirectory, label, {
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    PRISMA_GENERATE_SKIP_AUTOINSTALL: "1"
  });
}

ensureBackendEnv();

if (!skipInstall) {
  installDependencies();
}

runPrisma(["generate"], "Generating Prisma Client");
runPrisma(["db", "push", "--skip-generate"], "Synchronizing the local database");

if (!skipSeed) {
  run(process.execPath, [path.join("prisma", "seed.js")], backendDirectory, "Seeding default local data");
}

if (!skipBuild) {
  runNpm(["run", "build"], frontendDirectory, "Verifying the frontend build");
}

console.log("\nSetup completed successfully.");
console.log("Run: npm run dev");
