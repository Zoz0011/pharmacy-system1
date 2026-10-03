const prisma = require("../config/prisma");
const salesController = require("./salesController");

function creditAmount(sale) {
  return Number((sale.payments || []).filter((payment) => payment.paymentMethod === "CREDIT").reduce((sum, payment) => sum + Number(payment.amount || 0), 0).toFixed(2));
}

function serializeSale(sale) {
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt,
    status: sale.status,
    creditAmount: creditAmount(sale),
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone, accountBalance: Number(sale.customer.accountBalance || 0), creditLimit: Number(sale.customer.creditLimit || 0) } : null,
    cashierShift: sale.cashierShift ? { id: sale.cashierShift.id, openedAt: sale.cashierShift.openedAt, closedAt: sale.cashierShift.closedAt, status: sale.cashierShift.status } : null,
    user: sale.user ? { id: sale.user.id, name: sale.user.name } : null,
    items: (sale.items || []).map((item) => ({
      id: item.id, quantity: item.quantity, saleUnit: item.saleUnit, totalPrice: Number(item.totalPrice || 0),
      medicine: item.medicine ? { id: item.medicine.id, name: item.medicine.name, nameAr: item.medicine.nameAr, nameEn: item.medicine.nameEn } : null
    }))
  };
}

const creditSaleInclude = {
  customer: { select: { id: true, name: true, phone: true, accountBalance: true, creditLimit: true } },
  user: { select: { id: true, name: true } },
  cashierShift: { select: { id: true, openedAt: true, closedAt: true, status: true } },
  payments: { select: { paymentMethod: true, amount: true } },
  items: { include: { medicine: { select: { id: true, name: true, nameAr: true, nameEn: true } } } }
};

exports.list = async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const shiftId = Number(req.query.shiftId || 0);
    const where = { payments: { some: { paymentMethod: "CREDIT" } } };
    if (shiftId) where.cashierShiftId = shiftId;
    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      if (Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: "تاريخ غير صحيح" });
      where.createdAt = { gte: start, lt: end };
    }
    const sales = await prisma.sale.findMany({ where, include: creditSaleInclude, orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ success: true, data: sales.map(serializeSale) });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل خزنة البيع الآجل" }); }
};

exports.customerStatement = async (req, res) => {
  try {
    const customerId = Number(req.params.customerId);
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true, accountBalance: true, creditLimit: true } });
    if (!customer) return res.status(404).json({ success: false, message: "العميل غير موجود" });
    const sales = await prisma.sale.findMany({ where: { customerId, payments: { some: { paymentMethod: "CREDIT" } } }, include: creditSaleInclude, orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ success: true, data: { customer, sales: sales.map(serializeSale) } });
  } catch (error) { res.status(500).json({ success: false, message: "تعذر تحميل كشف حساب العميل" }); }
};

exports.cancel = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sale = await prisma.sale.findUnique({ where: { id }, include: { payments: true } });
    if (!sale || !sale.payments.some((payment) => payment.paymentMethod === "CREDIT")) return res.status(404).json({ success: false, message: "عملية البيع الآجل غير موجودة" });
    const outcome = await new Promise((resolve) => {
      const proxyResponse = { status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode || 200, payload }); } };
      salesController.returnSale({ user: req.user, params: { id: String(id) }, body: {} }, proxyResponse);
    });
    res.status(outcome.status).json(outcome.payload);
  } catch (error) { res.status(500).json({ success: false, message: "تعذر إلغاء البيع الآجل" }); }
};
