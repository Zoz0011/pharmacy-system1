const prisma = require("../config/prisma");
const { toMoney } = require("./treasuryService");

const SYSTEM_ACCOUNTS = [
  { systemKey: "MAIN_CASH", accountNumber: "1001", name: "الصندوق الرئيسي", accountType: "ASSET", subType: "CURRENT_ASSET", nature: "DEBIT" },
  { systemKey: "BANK", accountNumber: "1002", name: "حساب البنك", accountType: "ASSET", subType: "CURRENT_ASSET", nature: "DEBIT" },
  { systemKey: "RECEIVABLES", accountNumber: "1101", name: "المدينون (العملاء)", accountType: "ASSET", subType: "CURRENT_ASSET", nature: "DEBIT" },
  { systemKey: "INVENTORY", accountNumber: "1201", name: "مخزون آخر المدة", accountType: "ASSET", subType: "CURRENT_ASSET", nature: "DEBIT" },
  { systemKey: "PAYABLES", accountNumber: "2001", name: "الدائنون (الموردون)", accountType: "LIABILITY", subType: "CURRENT_LIABILITY", nature: "CREDIT" },
  { systemKey: "OWNER_EQUITY", accountNumber: "3001", name: "رأس المال وصافي الأرباح", accountType: "EQUITY", subType: "OWNER_EQUITY", nature: "CREDIT" },
  { systemKey: "PERSONAL_DRAWINGS", accountNumber: "3002", name: "مسحوبات شخصية", accountType: "EQUITY", subType: "DRAWINGS", nature: "DEBIT" },
  { systemKey: "SALES_REVENUE", accountNumber: "4001", name: "إيرادات المبيعات", accountType: "INCOME", subType: "OPERATING_INCOME", nature: "CREDIT" },
  { systemKey: "SALES_RETURNS", accountNumber: "4002", name: "مرتجع المبيعات", accountType: "INCOME", subType: "CONTRA_INCOME", nature: "DEBIT" },
  { systemKey: "COGS", accountNumber: "5001", name: "تكلفة البضاعة المباعة", accountType: "EXPENSE", subType: "COST_OF_SALES", nature: "DEBIT" },
  { systemKey: "OPERATING_EXPENSES", accountNumber: "5101", name: "المصروفات التشغيلية", accountType: "EXPENSE", subType: "OPERATING_EXPENSE", nature: "DEBIT" },
  { systemKey: "PURCHASE_RETURNS", accountNumber: "5201", name: "مرتجع المشتريات", accountType: "EXPENSE", subType: "CONTRA_EXPENSE", nature: "CREDIT" }
];

function dateRange(query = {}) {
  const from = query.from ? new Date(`${query.from}T00:00:00`) : new Date(2000, 0, 1);
  const to = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date(2100, 0, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("Invalid date range");
  return { from, to };
}

function normalBalanceDelta(account, debit, credit) {
  return account.nature === "CREDIT" ? credit - debit : debit - credit;
}

async function ensureSystemAccounts(tx = prisma) {
  for (const definition of SYSTEM_ACCOUNTS) {
    const existing = await tx.accountingAccount.findFirst({ where: { systemKey: definition.systemKey } });
    if (!existing) await tx.accountingAccount.create({ data: definition });
  }
  return tx.accountingAccount.findMany({ orderBy: [{ accountNumber: "asc" }, { id: "asc" }] });
}

async function nextEntryNumber(tx) {
  const workspaceId = Number(prisma.getWorkspaceId() || 1);
  return `JE-${workspaceId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function postEntry(tx, payload) {
  const lines = (payload.lines || []).map((line) => ({
    accountId: Number(line.accountId),
    debit: toMoney(line.debit),
    credit: toMoney(line.credit),
    note: line.note ? String(line.note).trim() : null
  })).filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
  const debit = toMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = toMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  if (!lines.length || debit !== credit) throw new Error("Accounting entry must have equal debit and credit totals");

  const accounts = await tx.accountingAccount.findMany({ where: { id: { in: lines.map((line) => line.accountId) } } });
  if (accounts.length !== new Set(lines.map((line) => line.accountId)).size) throw new Error("One of the accounts was not found");
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const entry = await tx.accountingEntry.create({
    data: {
      entryNumber: payload.entryNumber || await nextEntryNumber(tx),
      entryType: String(payload.entryType || "MANUAL").toUpperCase(),
      entryDate: payload.entryDate ? new Date(payload.entryDate) : new Date(),
      description: payload.description ? String(payload.description).trim() : null,
      referenceType: payload.referenceType ? String(payload.referenceType).toUpperCase() : null,
      referenceId: payload.referenceId ? Number(payload.referenceId) : null,
      referenceNumber: payload.referenceNumber ? String(payload.referenceNumber) : null,
      paymentMethod: payload.paymentMethod ? String(payload.paymentMethod).toUpperCase() : null,
      createdById: payload.createdById ? Number(payload.createdById) : null,
      lines: { create: lines }
    },
    include: { lines: { include: { account: true } }, createdBy: { select: { id: true, name: true } } }
  });
  for (const line of lines) {
    const account = accountMap.get(line.accountId);
    await tx.accountingAccount.update({
      where: { id: account.id },
      data: { balance: toMoney(account.balance + normalBalanceDelta(account, line.debit, line.credit)) }
    });
  }
  return entry;
}

function medicineStockValue(medicine) {
  const packageUnits = Math.max(1, Number(medicine.stripsPerBox || 1) * Number(medicine.pillsPerStrip || 1));
  const fractional = packageUnits > 1;
  return (Number(medicine.quantity || 0) / (fractional ? packageUnits : 1)) * Number(medicine.purchasePrice || 0);
}

function soldItemCost(item) {
  const packageUnits = Math.max(1, Number(item.medicine?.stripsPerBox || 1) * Number(item.medicine?.pillsPerStrip || 1));
  const baseUnits = Math.max(0, Number(item.baseUnits || item.quantity || 0));
  return (baseUnits / packageUnits) * Number(item.medicine?.purchasePrice || 0);
}

async function getSnapshot(query = {}) {
  const range = dateRange(query);
  await ensureSystemAccounts();
  const [sales, purchases, medicines, customers, suppliers, expenses, treasuryAccounts, treasuryTransactions, accounts] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: { items: { include: { medicine: { select: { purchasePrice: true, stripsPerBox: true, pillsPerStrip: true } } } } }
    }),
    prisma.purchaseInvoice.findMany({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.medicine.findMany({ select: { quantity: true, purchasePrice: true, stripsPerBox: true, pillsPerStrip: true } }),
    prisma.customer.findMany({ select: { accountBalance: true } }),
    prisma.supplier.findMany({ select: { openingBalance: true } }),
    prisma.shiftExpense.findMany({ where: { createdAt: { gte: range.from, lte: range.to }, NOT: { category: "SUPPLIER_PAYMENT" } } }),
    prisma.treasuryAccount.findMany(),
    prisma.treasuryTransaction.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: "desc" } }),
    prisma.accountingAccount.findMany({ orderBy: [{ accountNumber: "asc" }, { id: "asc" }] })
  ]);

  const grossSales = toMoney(sales.reduce((sum, sale) => sum + Number(sale.finalAmount || 0), 0));
  const salesReturns = toMoney(sales.reduce((sum, sale) => sum + Math.max(Number(sale.refundedAmount || 0), sale.status === "RETURNED" ? Number(sale.finalAmount || 0) : 0), 0));
  const netSales = toMoney(Math.max(0, grossSales - salesReturns));
  const grossPurchases = toMoney(purchases.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0));
  const purchaseReturns = toMoney(purchases.filter((invoice) => invoice.status === "RETURNED").reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0));
  const netPurchases = toMoney(Math.max(0, grossPurchases - purchaseReturns));
  const purchaseDue = toMoney(purchases.filter((invoice) => invoice.status !== "RETURNED" && invoice.paymentStatus !== "PAID").reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0) + suppliers.reduce((sum, supplier) => sum + Math.max(0, Number(supplier.openingBalance || 0)), 0));
  const receivables = toMoney(customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.accountBalance || 0)), 0));
  const inventory = toMoney(medicines.reduce((sum, medicine) => sum + medicineStockValue(medicine), 0));
  const cash = toMoney(treasuryAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0));
  const operatingExpenses = toMoney(expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
  const costOfGoodsSold = toMoney(sales.reduce((sum, sale) => {
    const original = Number(sale.finalAmount || 0);
    const returned = Math.max(Number(sale.refundedAmount || 0), sale.status === "RETURNED" ? original : 0);
    const keptRatio = original > 0 ? Math.max(0, (original - returned) / original) : 0;
    return sum + sale.items.reduce((itemSum, item) => itemSum + soldItemCost(item), 0) * keptRatio;
  }, 0));
  const grossProfit = toMoney(netSales - costOfGoodsSold);
  const netProfit = toMoney(grossProfit - operatingExpenses);
  const operationalBalances = {
    MAIN_CASH: cash,
    BANK: 0,
    RECEIVABLES: receivables,
    INVENTORY: inventory,
    PAYABLES: purchaseDue,
    OWNER_EQUITY: toMoney(cash + receivables + inventory - purchaseDue - netProfit),
    PERSONAL_DRAWINGS: 0,
    SALES_REVENUE: grossSales,
    SALES_RETURNS: salesReturns,
    COGS: costOfGoodsSold,
    OPERATING_EXPENSES: operatingExpenses,
    PURCHASE_RETURNS: purchaseReturns
  };
  const decoratedAccounts = accounts.map((account) => ({
    ...account,
    effectiveBalance: toMoney(Number(account.balance || 0) + Number(operationalBalances[account.systemKey] || 0))
  }));
  return {
    range,
    accounts: decoratedAccounts,
    operationalBalances,
    treasuryTransactions,
    metrics: { grossSales, salesReturns, netSales, grossPurchases, purchaseReturns, netPurchases, purchaseDue, receivables, inventory, cash, operatingExpenses, costOfGoodsSold, grossProfit, netProfit }
  };
}

module.exports = { SYSTEM_ACCOUNTS, ensureSystemAccounts, postEntry, getSnapshot, dateRange, toMoney };
