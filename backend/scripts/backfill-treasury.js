require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const money = (value) => Number(Number(value || 0).toFixed(2));

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  for (const workspace of workspaces) {
    const existing = await prisma.treasuryAccount.findFirst({ where: { workspaceId: workspace.id } });
    if (existing) continue;

    const [sales, expenses, customerPayments, paidPurchases] = await Promise.all([
      prisma.sale.findMany({
        where: { workspaceId: workspace.id, paymentMethod: { not: "CREDIT" } },
        select: { finalAmount: true, refundedAmount: true }
      }),
      prisma.shiftExpense.aggregate({ where: { workspaceId: workspace.id }, _sum: { amount: true } }),
      prisma.customerAccountTransaction.aggregate({
        where: { customer: { workspaceId: workspace.id }, type: "PAYMENT" },
        _sum: { amount: true }
      }),
      prisma.purchaseInvoice.findMany({
        where: { workspaceId: workspace.id, paymentStatus: "PAID", status: { not: "RETURNED" } },
        select: { totalAmount: true }
      })
    ]);

    const salesNet = sales.reduce((sum, sale) => sum + Number(sale.finalAmount || 0) - Number(sale.refundedAmount || 0), 0);
    const customerPaymentTotal = Math.abs(Number(customerPayments._sum.amount || 0));
    const purchaseTotal = paidPurchases.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
    const openingBalance = money(salesNet + customerPaymentTotal - Number(expenses._sum.amount || 0) - purchaseTotal);

    await prisma.$transaction(async (tx) => {
      const account = await tx.treasuryAccount.create({
        data: {
          workspaceId: workspace.id,
          name: "الخزينة الرئيسية",
          balance: openingBalance,
          isDefault: true
        }
      });
      if (openingBalance !== 0) {
        await tx.treasuryTransaction.create({
          data: {
            workspaceId: workspace.id,
            treasuryAccountId: account.id,
            type: "OPENING_BALANCE",
            direction: openingBalance >= 0 ? "IN" : "OUT",
            amount: Math.abs(openingBalance),
            balanceAfter: openingBalance,
            note: "رصيد افتتاحي محسوب من الحركات السابقة"
          }
        });
      }
    });
    console.log(`${workspace.id}\t${workspace.name}\t${openingBalance}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
