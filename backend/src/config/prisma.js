const { PrismaClient } = require("@prisma/client");
const { AsyncLocalStorage } = require("async_hooks");

const workspaceContext = new AsyncLocalStorage();
const scopedModels = new Set([
  "User",
  "Supplier",
  "Customer",
  "Medicine",
  "Sale",
  "CashierShift",
  "InventoryCount",
  "StockMovement",
  "PurchaseInvoice",
  "ShiftExpense",
  "TreasuryAccount",
  "TreasuryTransaction",
  "AccountingAccount",
  "AccountingEntry"
]);

const basePrisma = new PrismaClient();
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
