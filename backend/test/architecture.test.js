const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const backendRoot = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(backendRoot, ...parts), "utf8");

test("Firestore adapter covers every Prisma model", () => {
  const schema = read("prisma", "schema.prisma");
  const firestore = read("src", "config", "prismaFirestore.js");
  const schemaModels = [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]);
  const modelsBlock = firestore.match(/const MODELS\s*=\s*\[([\s\S]*?)\];/)[1];
  const firestoreModels = [...modelsBlock.matchAll(/"(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(schemaModels.filter((model) => !firestoreModels.includes(model)), []);
});

test("delivery agents are workspace-scoped everywhere", () => {
  const sqlite = read("src", "config", "prismaSqlite.js");
  const firestore = read("src", "config", "prismaFirestore.js");
  assert.match(sqlite, /"DeliveryAgent"/);
  assert.match(firestore, /DeliveryAgent: \{ workspace: belongsTo\("Workspace", "workspaceId"\) \}/);
  assert.match(firestore, /deliveryAgents: hasMany\("DeliveryAgent", "workspaceId"\)/);
});

test("delivery agent administration has an explicit permission", () => {
  const permissions = read("src", "config", "permissions.js");
  const routes = read("src", "routes", "salesRoutes.js");
  assert.match(permissions, /"sales\.delivery_agents"/);
  assert.match(routes, /requirePermissions\("sales\.delivery_agents"\)/);
});

test("public registration creates a separate pharmacy workspace", () => {
  const auth = read("src", "controllers", "authController.js");
  assert.match(auth, /const workspace = await tx\.workspace\.create/);
  assert.match(auth, /role: "ADMIN"/);
  assert.doesNotMatch(auth, /existingUsers > 0/);
});

test("cloud data reset is disabled until durable backup storage is configured", () => {
  const controller = read("src", "controllers", "dataResetController.js");
  assert.match(controller, /if \(isCloudRuntime\) return res\.status\(503\)/);
  assert.match(controller, /const workspaceId = currentWorkspaceId\(\)/);
});
