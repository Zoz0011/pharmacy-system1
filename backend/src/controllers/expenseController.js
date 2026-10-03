const prisma = require("../config/prisma");
const { recordTreasuryTransaction } = require("../services/treasuryService");

const META_PREFIX = "__PHARMACORE_EXPENSE__:";
const paymentMethods = { CASH: "CASH", CARD: "CARD", TRANSFER: "TRANSFER", "نقدا": "CASH", "نقدي": "CASH", "بطاقة": "CARD", "تحويل بنكي": "TRANSFER" };
const DEFAULT_CATEGORIES = ["إيجار", "مرافق", "رواتب", "نقل", "صيانة", "مصروف عام"];

function money(value) { return Number(Number(value || 0).toFixed(2)); }
function parseMeta(note) {
  if (!String(note || "").startsWith(META_PREFIX)) return {};
  try { return JSON.parse(String(note).slice(META_PREFIX.length)); } catch { return {}; }
}
function expenseRow(transaction) {
  const meta = parseMeta(transaction.note);
  return {
    id: transaction.id,
    date: transaction.createdAt,
    referenceNumber: transaction.referenceNumber || `EXP-${transaction.id}`,
    expenseCategory: meta.category || "مصروف عام",
    categoryId: meta.categoryId || null,
    branch: meta.branch || "",
    source: meta.source || "TREASURY",
    paidBy: meta.paidBy || "",
    vendor: meta.vendor || "",
    reason: meta.reason || "",
    account: transaction.treasuryAccount?.name || "الخزينة الرئيسية",
    paymentMethod: transaction.paymentMethod || "CASH",
    amount: Number(transaction.amount || 0),
    addedBy: meta.addedBy || ""
  };
}

exports.listCategories = async (req, res) => {
  try {
    let data = await prisma.expenseCategory.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    if (!data.length) {
      await prisma.$transaction(async (tx) => {
        for (const name of DEFAULT_CATEGORIES) await tx.expenseCategory.create({ data: { name, code: `EXP-${DEFAULT_CATEGORIES.indexOf(name) + 1}`, cycle: "GENERAL", active: true } });
      });
      data = await prisma.expenseCategory.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    }
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل فئات المصروفات", error: error.message }); }
};

exports.createCategory = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "اسم الفئة مطلوب" });
    const data = await prisma.expenseCategory.create({ data: { name, code: String(req.body.code || "").trim().toUpperCase() || null, cycle: String(req.body.cycle || "عامة"), active: req.body.active !== false } });
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(409).json({ success: false, message: "تعذر حفظ الفئة؛ قد يكون الاسم مكررًا", error: error.message }); }
};

exports.updateCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    if (!id || !name) return res.status(400).json({ success: false, message: "بيانات الفئة غير مكتملة" });
    const data = await prisma.expenseCategory.update({ where: { id }, data: { name, code: String(req.body.code || "").trim().toUpperCase() || null, cycle: String(req.body.cycle || "عامة"), active: req.body.active !== false } });
    res.json({ success: true, data });
  } catch (error) { res.status(404).json({ success: false, message: "فئة المصروف غير موجودة", error: error.message }); }
};

exports.deleteCategory = async (req, res) => {
  try {
    await prisma.expenseCategory.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) { res.status(404).json({ success: false, message: "فئة المصروف غير موجودة", error: error.message }); }
};

exports.listExpenses = async (req, res) => {
  try {
    const rows = await prisma.treasuryTransaction.findMany({
      where: { type: "EXPENSE", referenceType: "GENERAL_EXPENSE" },
      include: { treasuryAccount: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Math.max(1, Number(req.query.limit || 250)))
    });
    res.json({ success: true, data: rows.map(expenseRow) });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل المصروفات", error: error.message }); }
};

exports.createExpense = async (req, res) => {
  try {
    const amount = money(req.body.amount);
    const source = String(req.body.source || "TREASURY").toUpperCase();
    const paymentMethod = paymentMethods[String(req.body.paymentMethod || "CASH").trim()] || String(req.body.paymentMethod || "CASH").toUpperCase();
    if (!amount || amount <= 0 || !["TREASURY", "CASHIER"].includes(source) || !["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "بيانات المصروف أو طريقة الدفع غير صحيحة" });
    }
    const category = String(req.body.expenseCategory || "مصروف عام").trim();
    const result = await prisma.$transaction(async (tx) => {
      let cashierShiftId = null;
      let shiftExpenseId = null;
      if (source === "CASHIER") {
        const shift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
        if (!shift) throw new Error("يلزم فتح وردية كاشير قبل تسجيل مصروف من الدرج");
        cashierShiftId = shift.id;
        const shiftExpense = await tx.shiftExpense.create({ data: { cashierShiftId, userId: req.user.id, amount, category, paymentMethod, note: String(req.body.reason || "").trim() || null } });
        shiftExpenseId = shiftExpense.id;
      }
      const metadata = {
        category,
        categoryId: req.body.categoryId ? Number(req.body.categoryId) : null,
        source,
        branch: String(req.body.branch || "").trim(),
        paidBy: String(req.body.paidBy || req.user.name || "").trim(),
        vendor: String(req.body.vendor || "").trim(),
        reason: String(req.body.reason || "").trim(),
        addedBy: req.user.name || ""
      };
      const recorded = await recordTreasuryTransaction(tx, {
        type: "EXPENSE", direction: "OUT", amount, paymentMethod,
        accountingAccountId: req.body.accountingAccountId,
        treasuryAccountId: req.body.treasuryAccountId,
        note: `${META_PREFIX}${JSON.stringify(metadata)}`,
        referenceType: "GENERAL_EXPENSE",
        referenceNumber: String(req.body.referenceNumber || "").trim() || undefined,
        userId: req.user.id, cashierShiftId, referenceId: shiftExpenseId
      });
      return recorded.transaction;
    });
    const transaction = await prisma.treasuryTransaction.findUnique({ where: { id: result.id }, include: { treasuryAccount: { select: { name: true } } } });
    res.status(201).json({ success: true, data: expenseRow(transaction) });
  } catch (error) { res.status(400).json({ success: false, message: error.message || "تعذر تسجيل المصروف" }); }
};

exports.deleteExpense = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.treasuryTransaction.findFirst({ where: { id, type: "EXPENSE", referenceType: "GENERAL_EXPENSE" } });
      if (!expense) throw new Error("سجل المصروف غير موجود");
      await recordTreasuryTransaction(tx, { type: "EXPENSE_REVERSAL", direction: "IN", amount: expense.amount, treasuryAccountId: expense.treasuryAccountId, paymentMethod: expense.paymentMethod, note: `عكس المصروف ${expense.referenceNumber || expense.id}`, referenceType: "EXPENSE_REVERSAL", referenceId: expense.id, userId: req.user.id });
      await tx.treasuryTransaction.delete({ where: { id: expense.id } });
      return expense;
    });
    res.json({ success: true, data: { id: result.id } });
  } catch (error) { res.status(404).json({ success: false, message: error.message || "تعذر حذف المصروف" }); }
};
