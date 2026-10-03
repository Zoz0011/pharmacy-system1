const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const prisma = require("../config/prisma");

const BACKUP_DIR = path.join(__dirname, "../../data-reset-backups");
const SCOPES = new Set(["customers", "suppliers", "treasury", "accounts", "items", "purchases"]);
const isCloudRuntime = process.env.USE_FIRESTORE === "true" || Boolean(process.env.FUNCTION_TARGET);

function currentWorkspaceId() {
  const workspaceId = Number(prisma.getWorkspaceId?.());
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) throw new Error("Workspace context is required");
  return workspaceId;
}

function scopeFilters(workspaceId) {
  return {
    workspace: { workspaceId },
    customerTransaction: { customer: { workspaceId } },
    prescriptionItem: { prescription: { workspaceId } },
    inventoryCountItem: { inventoryCount: { workspaceId } },
    saleItem: { sale: { workspaceId } },
    purchaseItem: { purchaseInvoice: { workspaceId } },
    medicineBox: { medicine: { workspaceId } },
    boxAllocation: { medicineBox: { medicine: { workspaceId } } },
    accountingLine: { entry: { workspaceId } }
  };
}

async function readBackup(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id))) throw new Error("Invalid backup identifier");
  return JSON.parse(await fs.readFile(path.join(BACKUP_DIR, `${id}.json`), "utf8"));
}

async function snapshot(scope, workspaceId) {
  const filters = scopeFilters(workspaceId);
  if (scope === "customers") return {
    customers: await prisma.customer.findMany({ where: filters.workspace }),
    accountTransactions: await prisma.customerAccountTransaction.findMany({ where: filters.customerTransaction }),
    prescriptions: await prisma.prescription.findMany({ where: filters.workspace }),
    prescriptionItems: await prisma.prescriptionItem.findMany({ where: filters.prescriptionItem })
  };
  if (scope === "suppliers") return { suppliers: await prisma.supplier.findMany({ where: filters.workspace }) };
  if (scope === "treasury") return {
    accounts: await prisma.treasuryAccount.findMany({ where: filters.workspace }),
    transactions: await prisma.treasuryTransaction.findMany({ where: filters.workspace })
  };
  if (scope === "accounts") return {
    accounts: await prisma.accountingAccount.findMany({ where: filters.workspace }),
    entries: await prisma.accountingEntry.findMany({ where: filters.workspace }),
    lines: await prisma.accountingEntryLine.findMany({ where: filters.accountingLine })
  };
  if (scope === "purchases") return {
    invoices: await prisma.purchaseInvoice.findMany({ where: filters.workspace }),
    items: await prisma.purchaseInvoiceItem.findMany({ where: filters.purchaseItem })
  };
  return {
    medicines: await prisma.medicine.findMany({ where: filters.workspace }),
    movements: await prisma.stockMovement.findMany({ where: filters.workspace }),
    boxes: await prisma.medicineBox.findMany({ where: filters.medicineBox }),
    inventoryItems: await prisma.inventoryCountItem.findMany({ where: filters.inventoryCountItem }),
    prescriptionItems: await prisma.prescriptionItem.findMany({ where: filters.prescriptionItem })
  };
}

async function clear(scope, tx, workspaceId) {
  const filters = scopeFilters(workspaceId);
  if (scope === "customers") {
    await tx.customerAccountTransaction.deleteMany({ where: filters.customerTransaction });
    await tx.prescriptionItem.deleteMany({ where: filters.prescriptionItem });
    await tx.prescription.deleteMany({ where: filters.workspace });
    await tx.sale.updateMany({ where: filters.workspace, data: { customerId: null } });
    await tx.supplier.updateMany({ where: filters.workspace, data: { linkedCustomerId: null } });
    await tx.customer.deleteMany({ where: filters.workspace });
    return;
  }
  if (scope === "suppliers") {
    await tx.sale.updateMany({ where: filters.workspace, data: { supplierId: null } });
    await tx.purchaseInvoice.updateMany({ where: filters.workspace, data: { supplierId: null } });
    await tx.medicine.updateMany({ where: filters.workspace, data: { supplierId: null } });
    await tx.supplier.deleteMany({ where: filters.workspace });
    return;
  }
  if (scope === "treasury") {
    await tx.treasuryTransaction.deleteMany({ where: filters.workspace });
    await tx.treasuryAccount.updateMany({ where: filters.workspace, data: { balance: 0 } });
    return;
  }
  if (scope === "accounts") {
    await tx.accountingEntryLine.deleteMany({ where: filters.accountingLine });
    await tx.accountingEntry.deleteMany({ where: filters.workspace });
    await tx.accountingAccount.updateMany({ where: filters.workspace, data: { balance: 0, openingBalance: 0 } });
    return;
  }
  if (scope === "purchases") {
    await tx.boxSaleAllocation.deleteMany({ where: filters.boxAllocation });
    await tx.medicineBox.deleteMany({ where: filters.medicineBox });
    await tx.purchaseInvoiceItem.deleteMany({ where: filters.purchaseItem });
    await tx.purchaseInvoice.deleteMany({ where: filters.workspace });
    return;
  }

  const saleCount = await tx.sale.count({ where: filters.workspace });
  if (saleCount > 0) throw Object.assign(new Error("Cannot reset items while sales history exists"), { code: "SALES_HISTORY_EXISTS" });
  await tx.prescriptionItem.deleteMany({ where: filters.prescriptionItem });
  await tx.inventoryCountItem.deleteMany({ where: filters.inventoryCountItem });
  await tx.stockMovement.deleteMany({ where: filters.workspace });
  await tx.boxSaleAllocation.deleteMany({ where: filters.boxAllocation });
  await tx.medicineBox.deleteMany({ where: filters.medicineBox });
  await tx.purchaseInvoiceItem.deleteMany({ where: filters.purchaseItem });
  await tx.itemExchange.deleteMany({ where: filters.workspace });
  await tx.medicine.deleteMany({ where: filters.workspace });
}

async function restore(scope, data, tx) {
  if (scope === "customers") { if (data.customers?.length) await tx.customer.createMany({ data: data.customers }); if (data.prescriptions?.length) await tx.prescription.createMany({ data: data.prescriptions }); if (data.prescriptionItems?.length) await tx.prescriptionItem.createMany({ data: data.prescriptionItems }); if (data.accountTransactions?.length) await tx.customerAccountTransaction.createMany({ data: data.accountTransactions }); return; }
  if (scope === "suppliers") { if (data.suppliers?.length) await tx.supplier.createMany({ data: data.suppliers }); return; }
  if (scope === "treasury") { for (const account of data.accounts || []) await tx.treasuryAccount.update({ where: { id: account.id }, data: { balance: account.balance, name: account.name, isDefault: account.isDefault } }).catch(() => null); if (data.transactions?.length) await tx.treasuryTransaction.createMany({ data: data.transactions }); return; }
  if (scope === "accounts") { for (const account of data.accounts || []) await tx.accountingAccount.update({ where: { id: account.id }, data: { balance: account.balance, openingBalance: account.openingBalance, active: account.active } }).catch(() => null); if (data.entries?.length) await tx.accountingEntry.createMany({ data: data.entries }); if (data.lines?.length) await tx.accountingEntryLine.createMany({ data: data.lines }); return; }
  if (scope === "purchases") { if (data.invoices?.length) await tx.purchaseInvoice.createMany({ data: data.invoices }); if (data.items?.length) await tx.purchaseInvoiceItem.createMany({ data: data.items }); return; }
  if (data.medicines?.length) await tx.medicine.createMany({ data: data.medicines }); if (data.movements?.length) await tx.stockMovement.createMany({ data: data.movements }); if (data.boxes?.length) await tx.medicineBox.createMany({ data: data.boxes }); if (data.inventoryItems?.length) await tx.inventoryCountItem.createMany({ data: data.inventoryItems }); if (data.prescriptionItems?.length) await tx.prescriptionItem.createMany({ data: data.prescriptionItems });
}

exports.listBackups = async (_req, res) => {
  try {
    if (isCloudRuntime) return res.json({ success: true, data: [] });
    const workspaceId = currentWorkspaceId();
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const entries = await fs.readdir(BACKUP_DIR);
    const data = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const backup = JSON.parse(await fs.readFile(path.join(BACKUP_DIR, entry), "utf8"));
      if (Number(backup.workspaceId) !== workspaceId) continue;
      data.push({ id: backup.id, createdAt: backup.createdAt, scopes: backup.scopes, createdBy: backup.createdBy });
    }
    res.json({ success: true, data: data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
  } catch {
    res.status(500).json({ success: false, message: "تعذر تحميل النسخ الاحتياطية" });
  }
};

exports.reset = async (req, res) => {
  const scope = String(req.params.scope || "");
  if (!SCOPES.has(scope) || req.body.confirmation !== "DELETE") return res.status(400).json({ success: false, message: "تأكيد الحذف غير صحيح" });
  if (isCloudRuntime) return res.status(503).json({ success: false, message: "الحذف الشامل متوقف على النسخة السحابية لحماية النسخ الاحتياطية. استخدمه من الخادم المحلي المخصص." });
  try {
    const workspaceId = currentWorkspaceId();
    const data = await snapshot(scope, workspaceId);
    const backup = { id: crypto.randomUUID(), workspaceId, createdAt: new Date().toISOString(), createdBy: req.user.username || req.user.name, scopes: [scope], data: { [scope]: data } };
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.writeFile(path.join(BACKUP_DIR, `${backup.id}.json`), JSON.stringify(backup));
    await prisma.$transaction((tx) => clear(scope, tx, workspaceId));
    res.json({ success: true, message: "تم الحذف وإنشاء نسخة احتياطية", data: { id: backup.id, scope } });
  } catch (error) {
    const message = error.code === "SALES_HISTORY_EXISTS" ? "لا يمكن حذف الأصناف لأن لها فواتير مبيعات محفوظة." : "تعذر تنفيذ الحذف الآمن";
    res.status(error.code === "SALES_HISTORY_EXISTS" ? 409 : 500).json({ success: false, message });
  }
};

exports.restore = async (req, res) => {
  const scopes = (Array.isArray(req.body.scopes) ? req.body.scopes : []).filter((scope) => SCOPES.has(scope));
  if (!scopes.length || req.body.confirmation !== "RESTORE") return res.status(400).json({ success: false, message: "اختر قسمًا واحدًا على الأقل وأكد الاستعادة" });
  if (isCloudRuntime) return res.status(503).json({ success: false, message: "الاستعادة الشاملة متوقفة على النسخة السحابية لحماية النسخ الاحتياطية." });
  try {
    const workspaceId = currentWorkspaceId();
    const backup = await readBackup(req.params.id);
    if (Number(backup.workspaceId) !== workspaceId) return res.status(404).json({ success: false, message: "النسخة الاحتياطية غير موجودة" });
    await prisma.$transaction(async (tx) => {
      for (const scope of scopes) {
        if (!backup.data?.[scope]) continue;
        await clear(scope, tx, workspaceId);
        await restore(scope, backup.data[scope], tx);
      }
    });
    res.json({ success: true, message: "تمت الاستعادة بنجاح" });
  } catch {
    res.status(500).json({ success: false, message: "تعذرت الاستعادة" });
  }
};
