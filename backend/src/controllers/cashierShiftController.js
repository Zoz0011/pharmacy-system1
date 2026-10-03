const prisma = require("../config/prisma");
const { recordTreasuryTransaction } = require("../services/treasuryService");

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function shiftInclude() {
  return {
    user: { select: { id: true, name: true, email: true, role: true } },
    expenses: {
      select: { id: true, category: true, amount: true, paymentMethod: true, note: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    },
    customerTransactions: {
      where: { type: "PAYMENT" },
      select: { id: true, amount: true, note: true, createdAt: true, customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    },
    sales: {
      select: {
        id: true,
        invoiceNumber: true,
        finalAmount: true,
        refundedAmount: true,
        paymentMethod: true,
        payments: { select: { paymentMethod: true, amount: true }, orderBy: { id: "asc" } },
        status: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            saleUnit: true,
            unitPrice: true,
            totalPrice: true,
            medicine: {
              select: {
                id: true,
                name: true,
                nameAr: true,
                nameEn: true,
                barcode: true,
                manufacturer: true,
                itemType: true,
                packageNameAr: true,
                packageNameEn: true,
                pieceNameAr: true,
                pieceNameEn: true,
                batchNumber: true
              }
            },
            allocations: {
              select: {
                medicineBox: { select: { boxCode: true, batchNumber: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }
  };
}

function summarizeShift(shift) {
  if (!shift) return null;

  const soldItemsMap = new Map();
  const summary = shift.sales.reduce(
    (result, sale) => {
      result.invoiceCount += 1;
      result.grossSales += Number(sale.finalAmount || 0);
      result.refunds += Number(sale.refundedAmount || 0);
      const paymentParts = sale.payments?.length
        ? sale.payments
        : [{ paymentMethod: sale.paymentMethod, amount: sale.finalAmount }];
      const refundRatio = Number(sale.finalAmount || 0) > 0
        ? Math.min(1, Number(sale.refundedAmount || 0) / Number(sale.finalAmount || 0))
        : 0;
      paymentParts.forEach((payment) => {
        const amount = Number(payment.amount || 0);
        const refunded = amount * refundRatio;
        if (payment.paymentMethod === "CASH") {
          result.cashSales += amount;
          result.cashRefunds += refunded;
        } else if (payment.paymentMethod === "CARD") {
          result.cardSales += amount;
          result.cardRefunds += refunded;
        } else if (payment.paymentMethod === "CREDIT") {
          result.creditSales += amount;
          result.creditRefunds += refunded;
        } else {
          result.otherSales += amount;
          result.otherRefunds += refunded;
        }
      });

      sale.items.forEach((item) => {
        const key = `${item.medicine.id}:${item.saleUnit}`;
        const current = soldItemsMap.get(key) || {
          medicineId: item.medicine.id,
          name: item.medicine.name,
          nameAr: item.medicine.nameAr,
          nameEn: item.medicine.nameEn,
          barcode: item.medicine.barcode,
          manufacturer: item.medicine.manufacturer,
          itemType: item.medicine.itemType,
          packageNameAr: item.medicine.packageNameAr,
          packageNameEn: item.medicine.packageNameEn,
          pieceNameAr: item.medicine.pieceNameAr,
          pieceNameEn: item.medicine.pieceNameEn,
          batchNumber: item.medicine.batchNumber,
          saleUnit: item.saleUnit,
          quantity: 0,
          returnedQuantity: 0,
          total: 0,
          serials: []
        };
        if (sale.status === "RETURNED") {
          current.returnedQuantity += Number(item.quantity || 0);
        } else {
          current.quantity += Number(item.quantity || 0);
          current.total += Number(item.totalPrice || 0);
        }
        current.serials.push(...item.allocations.map((allocation) => allocation.medicineBox?.batchNumber || allocation.medicineBox?.boxCode).filter(Boolean));
        soldItemsMap.set(key, current);
      });
      return result;
    },
    {
      invoiceCount: 0,
      grossSales: 0,
      refunds: 0,
      cashSales: 0,
      cashRefunds: 0,
      cardSales: 0,
      cardRefunds: 0,
      creditSales: 0,
      creditRefunds: 0,
      otherSales: 0,
      otherRefunds: 0
    }
  );

  Object.keys(summary).forEach((key) => {
    if (key !== "invoiceCount") summary[key] = toMoney(summary[key]);
  });
  summary.netSales = toMoney(summary.grossSales - summary.refunds);
  summary.netCashSales = toMoney(summary.cashSales - summary.cashRefunds);
  summary.netCardSales = toMoney(summary.cardSales - summary.cardRefunds);
  summary.netCreditSales = toMoney(summary.creditSales - summary.creditRefunds);
  summary.netOtherSales = toMoney(summary.otherSales - summary.otherRefunds);
  const expenses = shift.expenses || [];
  summary.totalExpenses = toMoney(expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.cashExpenses = toMoney(expenses.filter((expense) => expense.paymentMethod === "CASH").reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.cardExpenses = toMoney(expenses.filter((expense) => expense.paymentMethod === "CARD").reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.transferExpenses = toMoney(expenses.filter((expense) => expense.paymentMethod === "TRANSFER").reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.customerPayments = toMoney((shift.customerTransactions || []).reduce((total, transaction) => total + Math.abs(Number(transaction.amount || 0)), 0));
  summary.supplierPayments = toMoney(expenses.filter((expense) => expense.category === "SUPPLIER_PAYMENT").reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.cashSupplierPayments = toMoney(expenses.filter((expense) => expense.category === "SUPPLIER_PAYMENT" && expense.paymentMethod === "CASH").reduce((total, expense) => total + Number(expense.amount || 0), 0));
  summary.cashOperatingExpenses = toMoney(summary.cashExpenses - summary.cashSupplierPayments);
  summary.expectedCash = toMoney(Number(shift.openingCash || 0) + summary.cashSales - summary.cashRefunds + summary.customerPayments - summary.cashOperatingExpenses - summary.cashSupplierPayments);
  summary.soldItems = Array.from(soldItemsMap.values()).map((item) => ({
    ...item,
    total: toMoney(item.total),
    serials: Array.from(new Set(item.serials))
  }));

  return { ...shift, summary };
}

exports.getCurrentShift = async (req, res) => {
  try {
    const shift = await prisma.cashierShift.findFirst({
      where: { userId: req.user.id, status: "OPEN" },
      include: shiftInclude(),
      orderBy: { openedAt: "desc" }
    });

    res.json({ success: true, data: summarizeShift(shift) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load cashier shift" });
  }
};

exports.addExpense = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    const category = String(req.body.category || "GENERAL").trim().toUpperCase();
    const paymentMethod = String(req.body.paymentMethod || "CASH").trim().toUpperCase();
    const note = String(req.body.note || "").trim() || null;
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "A positive expense amount is required" });
    }
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Unsupported expense payment method" });
    }

    const shift = await prisma.cashierShift.findUnique({ where: { id } });
    if (!shift) return res.status(404).json({ success: false, message: "Shift not found" });
    if (shift.status !== "OPEN") return res.status(409).json({ success: false, message: "Expenses can only be added to an open shift" });
    if (shift.userId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Only the shift owner or an admin can add expenses" });
    }

    await prisma.$transaction(async (tx) => {
      const expense = await tx.shiftExpense.create({
        data: { cashierShiftId: id, userId: req.user.id, amount: toMoney(amount), category, paymentMethod, note }
      });
      await recordTreasuryTransaction(tx, {
        type: category === "SUPPLIER_PAYMENT" ? "SUPPLIER_PAYMENT" : "EXPENSE",
        direction: "OUT",
        amount,
        accountingAccountId: req.body.accountingAccountId,
        treasuryAccountId: req.body.treasuryAccountId,
        paymentMethod,
        note: note || `مصروف ${category}`,
        referenceType: "SHIFT_EXPENSE",
        referenceId: expense.id,
        referenceNumber: `EXP-${expense.id}`,
        userId: req.user.id,
        cashierShiftId: id
      });
    });
    const refreshed = await prisma.cashierShift.findUnique({ where: { id }, include: shiftInclude() });
    res.status(201).json({ success: true, message: "Expense added", data: summarizeShift(refreshed) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to add shift expense", error: error.message });
  }
};

exports.getShifts = async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const status = String(req.query.status || "").trim().toUpperCase();
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const canReviewAll = ["ADMIN", "PHARMACIST"].includes(req.user.role);
    const shifts = await prisma.cashierShift.findMany({
      where: {
        ...(!canReviewAll ? { userId: req.user.id } : userId ? { userId } : {}),
        ...(status ? { status } : {})
      },
      include: shiftInclude(),
      orderBy: { openedAt: "desc" },
      take
    });

    res.json({ success: true, data: shifts.map(summarizeShift) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load cashier shifts" });
  }
};

exports.openShift = async (req, res) => {
  try {
    const openingCash = Number(req.body.openingCash || 0);
    const notes = String(req.body.notes || "").trim() || null;

    if (!Number.isFinite(openingCash) || openingCash < 0) {
      return res.status(400).json({ success: false, message: "Opening cash must be zero or more" });
    }

    const existing = await prisma.cashierShift.findFirst({
      where: { userId: req.user.id, status: "OPEN" },
      include: shiftInclude()
    });
    if (existing) {
      return res.status(409).json({ success: false, message: "An open shift already exists", data: summarizeShift(existing) });
    }

    const shift = await prisma.cashierShift.create({
      data: { userId: req.user.id, openingCash: toMoney(openingCash), notes },
      include: shiftInclude()
    });

    res.status(201).json({ success: true, message: "Cashier shift opened", data: summarizeShift(shift) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to open cashier shift" });
  }
};

exports.closeShift = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const countedCash = Number(req.body.countedCash);
    const notes = String(req.body.notes || "").trim() || null;

    if (!id || !Number.isFinite(countedCash) || countedCash < 0) {
      return res.status(400).json({ success: false, message: "A valid counted cash amount is required" });
    }

    const existing = await prisma.cashierShift.findUnique({
      where: { id },
      include: shiftInclude()
    });
    if (!existing) return res.status(404).json({ success: false, message: "Shift not found" });
    if (existing.status !== "OPEN") return res.status(409).json({ success: false, message: "Shift is already closed" });
    if (existing.userId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Only the shift owner or an admin can close it" });
    }

    const summary = summarizeShift(existing).summary;
    const shift = await prisma.cashierShift.update({
      where: { id },
      data: {
        status: "CLOSED",
        expectedCash: summary.expectedCash,
        countedCash: toMoney(countedCash),
        difference: toMoney(countedCash - summary.expectedCash),
        notes: notes || existing.notes,
        closedAt: new Date()
      },
      include: shiftInclude()
    });

    res.json({ success: true, message: "Cashier shift closed", data: summarizeShift(shift) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to close cashier shift" });
  }
};
