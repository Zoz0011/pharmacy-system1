const prisma = require("../config/prisma");
const { ensureSystemAccounts, postEntry, getSnapshot, dateRange, toMoney } = require("../services/accountingService");
const { ensurePaymentTreasuries, recordTreasuryTransaction } = require("../services/treasuryService");

const TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
const natureFor = (type) => ["ASSET", "EXPENSE"].includes(type) ? "DEBIT" : "CREDIT";
const parseDetails = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((row) => row && (row.label || row.value));
  try { return JSON.parse(value); } catch { return []; }
};

exports.listAccounts = async (req, res) => {
  try {
    const snapshot = await getSnapshot(req.query);
    const q = String(req.query.q || "").trim().toLowerCase();
    const active = req.query.active === undefined ? null : String(req.query.active) !== "false";
    const data = snapshot.accounts.filter((account) => {
      if (active !== null && account.active !== active) return false;
      return !q || `${account.name} ${account.accountNumber} ${account.accountType}`.toLowerCase().includes(q);
    }).map((account) => ({ ...account, details: parseDetails(account.details) }));
    res.json({ success: true, data, summary: snapshot.metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: "تعذر تحميل الحسابات", error: error.message });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const accountNumber = String(req.body.accountNumber || "").trim();
    const accountType = String(req.body.accountType || "").toUpperCase();
    const openingBalance = toMoney(req.body.openingBalance);
    if (!name || !accountNumber || !TYPES.has(accountType) || openingBalance < 0) return res.status(400).json({ success: false, message: "الاسم ورقم ونوع الحساب مطلوبة" });
    const created = await prisma.$transaction(async (tx) => {
      await ensureSystemAccounts(tx);
      const account = await tx.accountingAccount.create({ data: { name, accountNumber, accountType, subType: req.body.subType ? String(req.body.subType) : null, nature: natureFor(accountType), note: req.body.note ? String(req.body.note).trim() : null, details: JSON.stringify(parseDetails(req.body.details)), isPaymentAccount: accountType === "ASSET" && req.body.isPaymentAccount !== false, createdById: req.user.id } });
      if (openingBalance > 0) {
        const capital = await tx.accountingAccount.findFirst({ where: { systemKey: "OWNER_EQUITY" } });
        const accountDebit = account.nature === "DEBIT";
        await postEntry(tx, { entryType: "OPENING_BALANCE", description: `رصيد افتتاحي - ${account.name}`, createdById: req.user.id, lines: [
          { accountId: account.id, debit: accountDebit ? openingBalance : 0, credit: accountDebit ? 0 : openingBalance },
          { accountId: capital.id, debit: accountDebit ? 0 : openingBalance, credit: accountDebit ? openingBalance : 0 }
        ] });
        await tx.accountingAccount.update({ where: { id: account.id }, data: { openingBalance } });
      }
      if (account.isPaymentAccount) await ensurePaymentTreasuries(tx);
      return tx.accountingAccount.findUnique({ where: { id: account.id }, include: { treasuryAccount: true } });
    });
    res.status(201).json({ success: true, message: "تمت إضافة الحساب", data: created });
  } catch (error) {
    const status = error.code === "P2002" ? 400 : 500;
    res.status(status).json({ success: false, message: error.code === "P2002" ? "رقم الحساب مستخدم من قبل" : "تعذر إضافة الحساب", error: error.message });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.accountingAccount.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ success: false, message: "الحساب غير موجود" });
    const accountType = String(req.body.accountType || current.accountType).toUpperCase();
    if (!TYPES.has(accountType)) return res.status(400).json({ success: false, message: "نوع الحساب غير صحيح" });
    const account = await prisma.accountingAccount.update({ where: { id }, data: {
      name: String(req.body.name ?? current.name).trim(),
      accountNumber: String(req.body.accountNumber ?? current.accountNumber).trim(),
      accountType,
      subType: req.body.subType === undefined ? current.subType : (req.body.subType ? String(req.body.subType) : null),
      nature: natureFor(accountType),
      note: req.body.note === undefined ? current.note : (req.body.note ? String(req.body.note).trim() : null),
      details: req.body.details === undefined ? current.details : JSON.stringify(parseDetails(req.body.details)),
      active: req.body.active === undefined ? current.active : Boolean(req.body.active),
      isPaymentAccount: accountType === "ASSET" && (req.body.isPaymentAccount === undefined ? current.isPaymentAccount : Boolean(req.body.isPaymentAccount))
    } });
    if (account.isPaymentAccount && account.name !== current.name) {
      const treasuryAccount = await prisma.treasuryAccount.findFirst({ where: { accountingAccountId: account.id } });
      if (treasuryAccount && !treasuryAccount.isDefault) await prisma.treasuryAccount.update({ where: { id: treasuryAccount.id }, data: { name: account.name } });
    }
    if (account.active && account.isPaymentAccount) await prisma.$transaction((tx) => ensurePaymentTreasuries(tx));
    res.json({ success: true, message: "تم تعديل الحساب", data: account });
  } catch (error) {
    res.status(error.code === "P2002" ? 400 : 500).json({ success: false, message: error.code === "P2002" ? "رقم الحساب مستخدم" : "تعذر تعديل الحساب", error: error.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const account = await prisma.accountingAccount.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
    if (!account) return res.status(404).json({ success: false, message: "الحساب غير موجود" });
    if (account.systemKey || account._count.lines) {
      const closed = await prisma.accountingAccount.update({ where: { id }, data: { active: false } });
      return res.json({ success: true, message: "تم إغلاق الحساب مع الاحتفاظ بحركته", data: closed });
    }
    await prisma.accountingAccount.delete({ where: { id } });
    res.json({ success: true, message: "تم حذف الحساب" });
  } catch (error) {
    res.status(500).json({ success: false, message: "تعذر حذف الحساب", error: error.message });
  }
};

exports.addOpeningBalance = async (req, res) => {
  try {
    const amount = toMoney(req.body.amount);
    if (amount <= 0) return res.status(400).json({ success: false, message: "أدخل مبلغًا صحيحًا" });
    const entry = await prisma.$transaction(async (tx) => {
      await ensureSystemAccounts(tx);
      const account = await tx.accountingAccount.findUnique({ where: { id: Number(req.params.id) } });
      const capital = await tx.accountingAccount.findFirst({ where: { systemKey: "OWNER_EQUITY" } });
      if (!account) throw Object.assign(new Error("Account not found"), { code: "NOT_FOUND" });
      const accountDebit = account.nature === "DEBIT";
      const posted = await postEntry(tx, { entryType: "OPENING_DEPOSIT", description: req.body.note || `إيداع افتتاحي - ${account.name}`, createdById: req.user.id, lines: [
        { accountId: account.id, debit: accountDebit ? amount : 0, credit: accountDebit ? 0 : amount },
        { accountId: capital.id, debit: accountDebit ? 0 : amount, credit: accountDebit ? amount : 0 }
      ] });
      await tx.accountingAccount.update({ where: { id: account.id }, data: { openingBalance: { increment: amount } } });
      return posted;
    });
    res.status(201).json({ success: true, message: "تم تسجيل الإيداع", data: entry });
  } catch (error) {
    res.status(error.code === "NOT_FOUND" ? 404 : 500).json({ success: false, message: error.code === "NOT_FOUND" ? "الحساب غير موجود" : "تعذر تسجيل الإيداع", error: error.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const amount = toMoney(req.body.amount);
    const fromAccountId = Number(req.body.fromAccountId);
    const toAccountId = Number(req.body.toAccountId);
    if (amount <= 0 || !fromAccountId || !toAccountId || fromAccountId === toAccountId) return res.status(400).json({ success: false, message: "اختر حسابين مختلفين ومبلغًا صحيحًا" });
    const transfer = await prisma.$transaction(async (tx) => {
      await ensurePaymentTreasuries(tx);
      const accounts = await tx.accountingAccount.findMany({ where: { id: { in: [fromAccountId, toAccountId] }, active: true, isPaymentAccount: true }, include: { treasuryAccount: true } });
      if (accounts.length !== 2) throw Object.assign(new Error("Account not found"), { code: "NOT_FOUND" });
      const from = accounts.find((account) => account.id === fromAccountId);
      const to = accounts.find((account) => account.id === toAccountId);
      if (from.accountType !== "ASSET" || to.accountType !== "ASSET" || !from.treasuryAccount || !to.treasuryAccount) throw Object.assign(new Error("Transfers are available between linked payment accounts"), { code: "INVALID_TRANSFER" });
      const availableBalance = toMoney(Number(from.balance || 0) + Number(from.treasuryAccount.balance || 0));
      if (amount > availableBalance) throw Object.assign(new Error("Insufficient source account balance"), { code: "INSUFFICIENT_BALANCE" });
      const referenceNumber = `TRF-${Date.now()}`;
      const description = String(req.body.note || `تحويل من ${from.name} إلى ${to.name}`).trim();
      const paymentMethod = String(req.body.paymentMethod || "TRANSFER").toUpperCase();
      const outgoing = await recordTreasuryTransaction(tx, { type: "ACCOUNT_TRANSFER", direction: "OUT", amount, accountingAccountId: from.id, paymentMethod, note: description, referenceType: "ACCOUNT_TRANSFER", referenceNumber, userId: req.user.id });
      const incoming = await recordTreasuryTransaction(tx, { type: "ACCOUNT_TRANSFER", direction: "IN", amount, accountingAccountId: to.id, paymentMethod, note: description, referenceType: "ACCOUNT_TRANSFER", referenceNumber, userId: req.user.id });
      return { referenceNumber, from: { id: from.id, name: from.name, balanceAfter: outgoing.transaction.balanceAfter }, to: { id: to.id, name: to.name, balanceAfter: incoming.transaction.balanceAfter }, outgoing: outgoing.transaction, incoming: incoming.transaction };
    });
    res.status(201).json({ success: true, message: "تم التحويل بين الخزنتين وتسجيل الحركة في الحسابين", data: transfer });
  } catch (error) {
    const status = error.code === "NOT_FOUND" ? 404 : ["INVALID_TRANSFER", "INSUFFICIENT_BALANCE"].includes(error.code) ? 400 : 500;
    res.status(status).json({ success: false, message: error.code === "NOT_FOUND" ? "أحد الحسابات غير موجود أو غير مفعّل للدفع" : error.code === "INVALID_TRANSFER" ? "التحويل متاح بين الخزائن وحسابات الدفع المرتبطة فقط" : error.code === "INSUFFICIENT_BALANCE" ? "رصيد الخزينة المحوّل منها غير كافٍ" : "تعذر تنفيذ التحويل", error: error.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const account = await prisma.accountingAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ success: false, message: "الحساب غير موجود" });
    const range = dateRange(req.query);
    const lines = await prisma.accountingEntryLine.findMany({ where: { accountId: id, entry: { workspaceId: Number(prisma.getWorkspaceId()), entryDate: { gte: range.from, lte: range.to } } }, include: { entry: { include: { createdBy: { select: { name: true } } } } }, orderBy: { entry: { entryDate: "desc" } } });
    const snapshot = await getSnapshot(req.query);
    const operational = snapshot.treasuryTransactions.filter((row) => row.treasuryAccount?.accountingAccountId === id || (account.systemKey === "MAIN_CASH" && !row.treasuryAccount?.accountingAccountId)).map((row) => ({ id: `T-${row.id}`, entryNumber: row.referenceNumber || `TR-${row.id}`, entryDate: row.createdAt, description: row.note || row.type, debit: row.direction === "IN" ? row.amount : 0, credit: row.direction === "OUT" ? row.amount : 0, source: "TREASURY" }));
    const manual = lines.map((line) => ({ id: `J-${line.id}`, entryNumber: line.entry.entryNumber, entryDate: line.entry.entryDate, description: line.entry.description || line.note, debit: line.debit, credit: line.credit, createdBy: line.entry.createdBy?.name, source: "JOURNAL" }));
    res.json({ success: true, data: { account: { ...account, effectiveBalance: snapshot.accounts.find((row) => row.id === id)?.effectiveBalance || account.balance }, entries: [...operational, ...manual].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "تعذر تحميل دفتر الأستاذ", error: error.message });
  }
};

exports.getProfitLoss = async (req, res) => {
  try { const { metrics, accounts } = await getSnapshot(req.query); res.json({ success: true, data: { metrics, customIncome: accounts.filter((a) => a.accountType === "INCOME" && !a.systemKey), customExpenses: accounts.filter((a) => a.accountType === "EXPENSE" && !a.systemKey) } }); }
  catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل تقرير الأرباح والخسائر", error: error.message }); }
};

exports.getTrading = async (req, res) => {
  try { const { metrics } = await getSnapshot(req.query); res.json({ success: true, data: { sales: { gross: metrics.grossSales, returns: metrics.salesReturns, net: metrics.netSales, customerDebt: metrics.receivables }, purchases: { gross: metrics.grossPurchases, returns: metrics.purchaseReturns, net: metrics.netPurchases, supplierDebt: metrics.purchaseDue }, difference: toMoney(metrics.netSales - metrics.netPurchases), amountDue: toMoney(metrics.receivables - metrics.purchaseDue) } }); }
  catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل تقرير المتاجرة", error: error.message }); }
};

exports.getTrialBalance = async (req, res) => {
  try {
    const snapshot = await getSnapshot(req.query);
    let rows = snapshot.accounts.filter((a) => a.active).map((account) => ({ id: account.id, name: account.name, accountNumber: account.accountNumber, debit: account.nature === "DEBIT" ? Math.max(0, account.effectiveBalance) : Math.max(0, -account.effectiveBalance), credit: account.nature === "CREDIT" ? Math.max(0, account.effectiveBalance) : Math.max(0, -account.effectiveBalance) }));
    let debit = toMoney(rows.reduce((sum, row) => sum + row.debit, 0));
    let credit = toMoney(rows.reduce((sum, row) => sum + row.credit, 0));
    if (debit !== credit) {
      const equity = rows.find((row) => row.accountNumber === "3001");
      if (equity) { if (debit > credit) equity.credit = toMoney(equity.credit + debit - credit); else equity.debit = toMoney(equity.debit + credit - debit); }
    }
    debit = toMoney(rows.reduce((sum, row) => sum + row.debit, 0)); credit = toMoney(rows.reduce((sum, row) => sum + row.credit, 0));
    res.json({ success: true, data: { rows, totals: { debit, credit, balanced: debit === credit } } });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل ميزان المراجعة", error: error.message }); }
};

exports.getCashFlow = async (req, res) => {
  try { const snapshot = await getSnapshot(req.query); const transactions = snapshot.treasuryTransactions.map((row) => ({ ...row, debit: row.direction === "OUT" ? row.amount : 0, credit: row.direction === "IN" ? row.amount : 0 })); res.json({ success: true, data: { transactions, totals: { income: toMoney(transactions.reduce((s, r) => s + r.credit, 0)), expense: toMoney(transactions.reduce((s, r) => s + r.debit, 0)), balance: snapshot.metrics.cash } } }); }
  catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل التدفق النقدي", error: error.message }); }
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const snapshot = await getSnapshot(req.query);
    const assets = snapshot.accounts.filter((a) => a.accountType === "ASSET" && a.active).map((a) => ({ id: a.id, name: a.name, amount: a.effectiveBalance }));
    const liabilities = snapshot.accounts.filter((a) => a.accountType === "LIABILITY" && a.active).map((a) => ({ id: a.id, name: a.name, amount: a.effectiveBalance }));
    const equity = snapshot.accounts.filter((a) => a.accountType === "EQUITY" && a.active).map((a) => ({ id: a.id, name: a.name, amount: a.effectiveBalance }));
    const assetTotal = toMoney(assets.reduce((s, a) => s + a.amount, 0));
    const liabilityTotal = toMoney(liabilities.reduce((s, a) => s + a.amount, 0));
    const equityTotal = toMoney(assetTotal - liabilityTotal);
    const capital = equity.find((a) => a.name.includes("رأس المال")); if (capital) capital.amount = toMoney(capital.amount + equityTotal - equity.reduce((s, a) => s + a.amount, 0));
    res.json({ success: true, data: { assets, liabilities, equity, totals: { assets: assetTotal, liabilities: liabilityTotal, equity: equityTotal, balanced: assetTotal === toMoney(liabilityTotal + equityTotal) }, netProfit: snapshot.metrics.netProfit } });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل الميزانية العمومية", error: error.message }); }
};

exports.getMovements = async (req, res) => {
  try {
    const range = dateRange(req.query);
    const [entries, snapshot] = await Promise.all([prisma.accountingEntry.findMany({ where: { entryDate: { gte: range.from, lte: range.to } }, include: { lines: { include: { account: { select: { id: true, name: true, accountNumber: true } } } }, createdBy: { select: { name: true } } }, orderBy: { entryDate: "desc" } }), getSnapshot(req.query)]);
    const treasury = snapshot.treasuryTransactions.map((row) => ({ id: `T-${row.id}`, date: row.createdAt, reference: row.referenceNumber || `TR-${row.id}`, description: row.note || row.type, paymentMethod: row.paymentMethod, amount: row.amount, debit: row.direction === "OUT" ? row.amount : 0, credit: row.direction === "IN" ? row.amount : 0, account: row.treasuryAccount?.accountingAccount?.name || row.treasuryAccount?.name || "الخزينة الرئيسية", accountNumber: row.treasuryAccount?.accountingAccount?.accountNumber || null, source: "TREASURY" }));
    const journal = entries.flatMap((entry) => entry.lines.map((line) => ({ id: `J-${line.id}`, date: entry.entryDate, reference: entry.entryNumber, description: entry.description, paymentMethod: entry.paymentMethod, amount: Math.max(line.debit, line.credit), debit: line.debit, credit: line.credit, account: line.account.name, accountNumber: line.account.accountNumber, createdBy: entry.createdBy?.name, source: "JOURNAL" })));
    res.json({ success: true, data: [...treasury, ...journal].sort((a, b) => new Date(b.date) - new Date(a.date)) });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل سجل حركة الحسابات", error: error.message }); }
};
