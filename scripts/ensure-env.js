const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const backendDirectory = path.join(projectRoot, "backend");
const environmentPath = path.join(backendDirectory, ".env");

function normalizeValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed.split(/\s+#/, 1)[0].trim();
}

function ensureSetting(contents, key, value) {
  const settingPattern = new RegExp(`^[\\t ]*${key}[\\t ]*=[\\t ]*([^\\r\\n]*)`, "m");
  const match = contents.match(settingPattern);
  if (match && normalizeValue(match[1])) return { contents, changed: false };

  const line = `${key}=${value}`;
  if (match) {
    return { contents: contents.replace(settingPattern, line), changed: true };
  }

  const separator = contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return { contents: `${contents}${separator}${line}\n`, changed: true };
}

function ensureBackendEnv() {
  const jwtSecret = crypto.randomBytes(48).toString("hex");
  const created = !fs.existsSync(environmentPath);
  let contents = created ? "" : fs.readFileSync(environmentPath, "utf8");
  let changed = false;

  for (const [key, value] of [
    ["DATABASE_URL", '"file:./dev.db"'],
    ["JWT_SECRET", `"${jwtSecret}"`],
    ["PORT", "5000"]
  ]) {
    const result = ensureSetting(contents, key, value);
    contents = result.contents;
    changed ||= result.changed;
  }

  if (changed) {
    fs.writeFileSync(environmentPath, contents, { encoding: "utf8" });
    console.log(
      created
        ? "Created backend/.env with safe local settings."
        : "Completed the missing settings in backend/.env."
    );
  }

  return { created, changed, path: environmentPath };
}

if (require.main === module) {
  ensureBackendEnv();
}

module.exports = { ensureBackendEnv, ensureSetting, environmentPath, projectRoot };
