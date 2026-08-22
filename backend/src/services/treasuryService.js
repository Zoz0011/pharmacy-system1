function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function ensureDefaultTreasury(tx) {
  let account = await tx.treasuryAccount.findFirst({
    where: { isDefault: true },
    orderBy: { id: "asc" }
  });
  if (!account) {
    account = await tx.treasuryAccount.findFirst({ orderBy: { id: "asc" } });
  }
  if (!account) {
    account = await tx.treasuryAccount.create({
      data: { name: "الخزينة الرئيسية", balance: 0, isDefault: true }
    });
  }
  return account;
}

async function recordTreasuryTransaction(tx, payload) {
  const amount = toMoney(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Treasury transaction amount must be positive");
  }
  const direction = String(payload.direction || "IN").toUpperCase();
  if (!['IN', 'OUT'].includes(direction)) {
    throw new Error("Treasury transaction direction must be IN or OUT");
  }

  const account = payload.treasuryAccountId
    ? await tx.treasuryAccount.findUnique({ where: { id: Number(payload.treasuryAccountId) } })
    : await ensureDefaultTreasury(tx);
  if (!account) throw new Error("Treasury account not found");

  const balanceAfter = toMoney(account.balance + (direction === "IN" ? amount : -amount));
  const updatedAccount = await tx.treasuryAccount.update({
    where: { id: account.id },
    data: { balance: balanceAfter }
  });
  const transaction = await tx.treasuryTransaction.create({
    data: {
      treasuryAccountId: account.id,
      type: String(payload.type || "ADJUSTMENT").toUpperCase(),
      direction,
      amount,
      balanceAfter,
      paymentMethod: payload.paymentMethod ? String(payload.paymentMethod).toUpperCase() : null,
      note: payload.note ? String(payload.note).trim() : null,
      referenceType: payload.referenceType ? String(payload.referenceType).toUpperCase() : null,
      referenceId: payload.referenceId ? Number(payload.referenceId) : null,
      referenceNumber: payload.referenceNumber ? String(payload.referenceNumber) : null,
      userId: payload.userId ? Number(payload.userId) : null,
      cashierShiftId: payload.cashierShiftId ? Number(payload.cashierShiftId) : null
    }
  });
  return { account: updatedAccount, transaction };
}

module.exports = { ensureDefaultTreasury, recordTreasuryTransaction, toMoney };
