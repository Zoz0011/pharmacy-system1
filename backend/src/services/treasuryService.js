function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function ensureDefaultTreasury(tx) {
  const mainAccountingAccount = await tx.accountingAccount.findFirst({
    where: { systemKey: "MAIN_CASH", active: true }
  });
  let account = await tx.treasuryAccount.findFirst({
    where: { isDefault: true },
    orderBy: { id: "asc" }
  });
  if (!account) {
    account = await tx.treasuryAccount.findFirst({ orderBy: { id: "asc" } });
  }
  if (!account) {
    account = await tx.treasuryAccount.create({
      data: { name: "الخزينة الرئيسية", balance: 0, isDefault: true, accountingAccountId: mainAccountingAccount?.id || null }
    });
  } else if (mainAccountingAccount && !account.accountingAccountId) {
    const alreadyLinked = await tx.treasuryAccount.findFirst({ where: { accountingAccountId: mainAccountingAccount.id } });
    if (!alreadyLinked) account = await tx.treasuryAccount.update({ where: { id: account.id }, data: { accountingAccountId: mainAccountingAccount.id } });
  }
  return account;
}

async function ensurePaymentTreasuries(tx) {
  const defaultTreasury = await ensureDefaultTreasury(tx);
  const paymentAccounts = await tx.accountingAccount.findMany({
    where: { active: true, accountType: "ASSET", isPaymentAccount: true },
    include: { treasuryAccount: true },
    orderBy: [{ accountNumber: "asc" }, { id: "asc" }]
  });
  const result = [];
  for (const accountingAccount of paymentAccounts) {
    let treasuryAccount = accountingAccount.treasuryAccount;
    if (!treasuryAccount) {
      if (accountingAccount.systemKey === "MAIN_CASH" && !defaultTreasury.accountingAccountId) {
        treasuryAccount = await tx.treasuryAccount.update({ where: { id: defaultTreasury.id }, data: { accountingAccountId: accountingAccount.id } });
      } else {
        const sameName = await tx.treasuryAccount.findFirst({ where: { name: accountingAccount.name, accountingAccountId: null } });
        treasuryAccount = sameName
          ? await tx.treasuryAccount.update({ where: { id: sameName.id }, data: { accountingAccountId: accountingAccount.id } })
          : await tx.treasuryAccount.create({ data: { name: accountingAccount.name, accountingAccountId: accountingAccount.id, isDefault: accountingAccount.systemKey === "MAIN_CASH" } });
      }
    }
    result.push({
      id: accountingAccount.id,
      accountingAccountId: accountingAccount.id,
      treasuryAccountId: treasuryAccount.id,
      name: treasuryAccount.isDefault ? "الخزينة الرئيسية" : accountingAccount.name,
      accountNumber: accountingAccount.accountNumber,
      balance: toMoney(Number(accountingAccount.balance || 0) + Number(treasuryAccount.balance || 0)),
      isDefault: treasuryAccount.isDefault,
      systemKey: accountingAccount.systemKey
    });
  }
  return result;
}

async function resolveTreasuryAccount(tx, payload = {}) {
  if (payload.accountingAccountId) {
    const accountingAccount = await tx.accountingAccount.findFirst({
      where: { id: Number(payload.accountingAccountId), active: true, accountType: "ASSET", isPaymentAccount: true },
      include: { treasuryAccount: true }
    });
    if (!accountingAccount) throw new Error("Payment account not found or is not enabled for payments");
    if (accountingAccount.treasuryAccount) return accountingAccount.treasuryAccount;
    await ensurePaymentTreasuries(tx);
    const linked = await tx.treasuryAccount.findFirst({ where: { accountingAccountId: accountingAccount.id } });
    if (!linked) throw new Error("Unable to link the selected payment account");
    return linked;
  }
  if (payload.treasuryAccountId) {
    return tx.treasuryAccount.findUnique({ where: { id: Number(payload.treasuryAccountId) } });
  }
  return ensureDefaultTreasury(tx);
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

  const account = await resolveTreasuryAccount(tx, payload);
  if (!account) throw new Error("Treasury account not found");

  const accountingAccount = account.accountingAccountId
    ? await tx.accountingAccount.findUnique({ where: { id: account.accountingAccountId }, select: { balance: true } })
    : null;
  const operationalBalanceAfter = toMoney(account.balance + (direction === "IN" ? amount : -amount));
  const balanceAfter = toMoney(operationalBalanceAfter + Number(accountingAccount?.balance || 0));
  const updatedAccount = await tx.treasuryAccount.update({
    where: { id: account.id },
    data: { balance: operationalBalanceAfter }
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

module.exports = { ensureDefaultTreasury, ensurePaymentTreasuries, resolveTreasuryAccount, recordTreasuryTransaction, toMoney };
