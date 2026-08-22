const prisma = require("../config/prisma");
const { ensureDefaultTreasury, recordTreasuryTransaction } = require("../services/treasuryService");

exports.getTreasury = async (req, res) => {
  try {
    const take = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const type = String(req.query.type || "").trim().toUpperCase();
    const direction = String(req.query.direction || "").trim().toUpperCase();
    const result = await prisma.$transaction(async (tx) => {
      const account = await ensureDefaultTreasury(tx);
      const where = {
        treasuryAccountId: account.id,
        ...(type ? { type } : {}),
        ...(direction ? { direction } : {})
      };
      const [transactions, income, expenses] = await Promise.all([
        tx.treasuryTransaction.findMany({ where, orderBy: { createdAt: "desc" }, take }),
        tx.treasuryTransaction.aggregate({ where: { treasuryAccountId: account.id, direction: "IN" }, _sum: { amount: true } }),
        tx.treasuryTransaction.aggregate({ where: { treasuryAccountId: account.id, direction: "OUT" }, _sum: { amount: true } })
      ]);
      return {
        account,
        summary: {
          balance: Number(account.balance || 0),
          totalIncome: Number(income._sum.amount || 0),
          totalExpenses: Number(expenses._sum.amount || 0)
        },
        transactions
      };
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load treasury", error: error.message });
  }
};

exports.createAdjustment = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const direction = String(req.body.direction || "IN").trim().toUpperCase();
    const note = String(req.body.note || "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !["IN", "OUT"].includes(direction) || !note) {
      return res.status(400).json({ success: false, message: "Amount, direction, and note are required" });
    }
    const data = await prisma.$transaction((tx) => recordTreasuryTransaction(tx, {
      type: "ADJUSTMENT",
      direction,
      amount,
      paymentMethod: String(req.body.paymentMethod || "CASH"),
      note,
      userId: req.user.id
    }));
    res.status(201).json({ success: true, message: "Treasury balance updated", data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update treasury", error: error.message });
  }
};
