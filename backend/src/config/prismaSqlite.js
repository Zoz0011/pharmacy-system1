const { PrismaClient } = require("@prisma/client");
const { AsyncLocalStorage } = require("async_hooks");

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
if (Boolean(tursoUrl) !== Boolean(tursoToken)) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together");
}
if (process.env.REQUIRE_REMOTE_DATABASE === "true" && !tursoUrl) {
  throw new Error("Remote database is required but Turso credentials are missing");
}

const prismaOptions = tursoUrl
  ? { adapter: new (require("@prisma/adapter-libsql").PrismaLibSQL)({ url: tursoUrl, authToken: tursoToken }) }
  : undefined;

const workspaceContext = new AsyncLocalStorage();
const scopedModels = new Set([
  "User", "Supplier", "Customer", "Medicine", "Sale", "CashierShift",
  "InventoryCount", "StockMovement", "PurchaseInvoice", "ShiftExpense",
  "TreasuryAccount", "TreasuryTransaction", "AccountingAccount", "AccountingEntry", "Prescription",
  "Branch", "InventoryTransfer", "ProductType", "Manufacturer", "PriceGroup", "ItemWarranty", "ItemExchange", "Promotion", "DeliveryAgent", "TherapeuticGroup", "ItemVariant", "AuditLog", "Notification"
]);

const basePrisma = new PrismaClient(prismaOptions);
const prisma = basePrisma.$extends({
  name: "workspace-isolation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const workspaceId = workspaceContext.getStore();
        if (!workspaceId || !scopedModels.has(model)) return query(args);

        const nextArgs = { ...(args || {}) };
        const scopedWhereOperations = new Set([
          "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
          "count", "aggregate", "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert"
        ]);

        if (scopedWhereOperations.has(operation)) {
          nextArgs.where = { ...(nextArgs.where || {}), workspaceId };
        }

        if (operation === "create") {
          nextArgs.data = { ...(nextArgs.data || {}), workspaceId };
        } else if (operation === "createMany" || operation === "createManyAndReturn") {
          const rows = Array.isArray(nextArgs.data) ? nextArgs.data : [nextArgs.data];
          nextArgs.data = rows.map((row) => ({ ...(row || {}), workspaceId }));
        } else if (operation === "upsert") {
          nextArgs.create = { ...(nextArgs.create || {}), workspaceId };
        }

        return query(nextArgs);
      }
    }
  }
});

Object.defineProperties(prisma, {
  withWorkspace: {
    value: (workspaceId, callback) => workspaceContext.run(Number(workspaceId), async () => await callback())
  },
  getWorkspaceId: { value: () => workspaceContext.getStore() },
  unscoped: { value: basePrisma }
});

module.exports = prisma;
