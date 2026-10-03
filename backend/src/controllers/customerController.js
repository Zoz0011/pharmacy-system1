const prisma = require("../config/prisma");
const { recordTreasuryTransaction } = require("../services/treasuryService");

const customerTextFields = [
  "name", "phone", "email", "customerType", "businessName", "familyName", "middleName", "title",
  "alternatePhone", "telephone", "taxNumber", "paymentTermUnit", "contactCode", "addressLine1",
  "addressLine2", "district", "city", "state", "country", "postalCode", "shippingAddress"
];
const customerMoney = (value) => Number(Number(value || 0).toFixed(2));

function normalizeCustomerPayload(body = {}) {
  const data = {};
  for (const field of customerTextFields) if (body[field] !== undefined) data[field] = String(body[field] || "").trim() || null;
  if (body.customerType !== undefined) data.customerType = String(body.customerType || "PERSON").toUpperCase() === "BUSINESS" ? "BUSINESS" : "PERSON";
  if (body.openingBalance !== undefined) data.openingBalance = customerMoney(body.openingBalance);
  if (body.creditLimit !== undefined) data.creditLimit = customerMoney(body.creditLimit);
  if (body.paymentTermValue !== undefined) {
    const parsed = Number.parseInt(body.paymentTermValue, 10);
    data.paymentTermValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  if (body.customFields !== undefined) data.customFields = JSON.stringify(body.customFields && typeof body.customFields === "object" ? body.customFields : {});
  const suppliedAddressFields = ["address", "addressLine1", "addressLine2", "district", "city", "state", "country", "postalCode"];
  if (suppliedAddressFields.some((field) => body[field] !== undefined)) {
    data.address = [data.addressLine1, data.addressLine2, data.district, data.city, data.state, data.country, data.postalCode].filter(Boolean).join("، ") || (body.address ? String(body.address).trim() : null);
  }
  return data;
}

function normalizeContactRole(value, fallback = "CUSTOMER") {
  return String(value || fallback).toUpperCase() === "BOTH" ? "BOTH" : "CUSTOMER";
}

function supplierProfileFromCustomer(data, body, customerId) {
  return {
    name: data.name || String(body.name || "").trim(),
    phone: data.phone,
    email: data.email,
    address: data.address,
    supplierType: data.customerType === "BUSINESS" ? "BUSINESS" : "PERSON",
    contactRole: "BOTH",
    businessName: data.businessName,
    familyName: data.familyName,
    middleName: data.middleName,
    title: data.title,
    alternatePhone: data.alternatePhone,
    telephone: data.telephone,
    taxNumber: data.taxNumber,
    openingBalance: customerMoney(body.supplierOpeningBalance || 0),
    paymentTermValue: data.paymentTermValue,
    paymentTermUnit: data.paymentTermUnit,
    contactCode: data.contactCode,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2,
    district: data.district,
    city: data.city,
    state: data.state,
    country: data.country,
    postalCode: data.postalCode,
    shippingAddress: data.shippingAddress,
    customFields: data.customFields,
    linkedCustomerId: customerId
  };
}

function parseCustomer(customer) {
  let customFields = {};
  try { customFields = customer.customFields ? JSON.parse(customer.customFields) : {}; } catch {}
  const sales = customer.sales || [];
  const completedSales = sales.filter((sale) => sale.status !== "RETURNED");
  const returnedSales = sales.filter((sale) => sale.status === "RETURNED");
  return {
    ...customer,
    customFields,
    stats: {
      totalSales: customerMoney(completedSales.reduce((sum, sale) => sum + Number(sale.finalAmount || 0), 0)),
      totalReturns: customerMoney(returnedSales.reduce((sum, sale) => sum + Number(sale.refundedAmount || sale.finalAmount || 0), 0)),
      totalDue: customerMoney(customer.accountBalance || 0)
    }
  };
}

exports.getCustomers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const customers = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { businessName: { contains: q } },
              { contactCode: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { address: { contains: q } }
            ]
          }
        : undefined,
      include: {
        supplierProfile: { select: { id: true, name: true, openingBalance: true, contactCode: true } },
        sales: {
          select: {
            id: true,
            invoiceNumber: true,
            finalAmount: true,
            refundedAmount: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: "desc" }
        },
        accountTransactions: {
          select: { id: true, type: true, amount: true, balanceAfter: true, note: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: customers.map(parseCustomer) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const { name } = req.body;
    const creditLimit = Number(req.body.creditLimit || 0);
    const openingBalance = Number(req.body.openingBalance || 0);
    if (!name) {
      return res.status(400).json({ success: false, message: "Customer name is required" });
    }

    if (!Number.isFinite(creditLimit) || creditLimit < 0 || !Number.isFinite(openingBalance)) {
      return res.status(400).json({ success: false, message: "Credit limit and opening balance must be valid numbers" });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const data = normalizeCustomerPayload(req.body);
      const contactRole = normalizeContactRole(req.body.contactRole);
      if (!data.contactCode) data.contactCode = `${contactRole === "BOTH" ? "CNT" : "CUS"}-${Date.now().toString(36).toUpperCase()}`;
      data.name = String(name).trim();
      const created = await tx.customer.create({ data: { ...data, contactRole, creditLimit, openingBalance, accountBalance: openingBalance } });

      if (contactRole === "BOTH") {
        const requestedSupplierId = Number(req.body.linkedSupplierId || 0);
        const existingSupplier = requestedSupplierId ? await tx.supplier.findUnique({ where: { id: requestedSupplierId } }) : null;
        if (existingSupplier) {
          await tx.supplier.update({ where: { id: existingSupplier.id }, data: { contactRole: "BOTH", linkedCustomerId: created.id } });
        } else {
          await tx.supplier.create({ data: supplierProfileFromCustomer(data, req.body, created.id) });
        }
      }

      if (openingBalance !== 0) {
        await tx.customerAccountTransaction.create({
          data: {
            customerId: created.id,
            userId: req.user.id,
            type: "OPENING_BALANCE",
            amount: openingBalance,
            balanceAfter: openingBalance,
            note: "Opening customer balance"
          }
        });
      }
      return created;
    });

    res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;
    const creditLimit = req.body.creditLimit === undefined ? undefined : Number(req.body.creditLimit);

    if (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      return res.status(400).json({ success: false, message: "Credit limit must be zero or more" });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id }, include: { supplierProfile: true } });
      if (!current) throw Object.assign(new Error("Customer not found"), { code: "P2025" });
      const data = normalizeCustomerPayload(req.body);
      const openingDelta = data.openingBalance === undefined ? 0 : Number(data.openingBalance) - Number(current.openingBalance || 0);
      const accountBalance = Number((Number(current.accountBalance || 0) + openingDelta).toFixed(2));
      const contactRole = normalizeContactRole(req.body.contactRole, current.contactRole);
      const updated = await tx.customer.update({
        where: { id },
        data: { ...data, name, contactRole, ...(creditLimit === undefined ? {} : { creditLimit }), ...(openingDelta ? { accountBalance } : {}) }
      });
      if (contactRole === "BOTH") {
        const profileData = supplierProfileFromCustomer({ ...current, ...data, name }, req.body, id);
        if (current.supplierProfile) {
          if (req.body.supplierOpeningBalance === undefined) delete profileData.openingBalance;
          await tx.supplier.update({ where: { id: current.supplierProfile.id }, data: profileData });
        } else {
          await tx.supplier.create({ data: profileData });
        }
      } else if (current.supplierProfile) {
        await tx.supplier.update({ where: { id: current.supplierProfile.id }, data: { linkedCustomerId: null, contactRole: "SUPPLIER" } });
      }
      if (openingDelta) {
        await tx.customerAccountTransaction.create({
          data: { customerId: id, userId: req.user.id, type: "OPENING_BALANCE_ADJUSTMENT", amount: openingDelta, balanceAfter: accountBalance, note: "Opening balance updated" }
        });
      }
      return tx.customer.findUnique({ where: { id }, include: { supplierProfile: true } });
    });

    res.json({ success: true, message: "Customer updated successfully", data: customer });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getCustomerProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        supplierProfile: {
          include: {
            medicines: { select: { id: true, name: true, quantity: true, minStock: true, updatedAt: true } },
            purchaseInvoices: {
              include: { items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } } },
              orderBy: { createdAt: "desc" }
            }
          }
        },
        sales: {
          include: { items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } } },
          orderBy: { createdAt: "desc" }
        },
        accountTransactions: {
          include: {
            user: { select: { id: true, name: true, role: true } },
            sale: { select: { id: true, invoiceNumber: true, finalAmount: true, status: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 200
        }
      }
    });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    const referenceFilters = [{ referenceType: "CUSTOMER", referenceId: customer.id }];
    if (customer.supplierProfile) referenceFilters.push({ referenceType: "SUPPLIER", referenceId: customer.supplierProfile.id });
    const payments = await prisma.treasuryTransaction.findMany({
      where: { OR: referenceFilters },
      include: { treasuryAccount: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    const parsed = parseCustomer(customer);
    const supplier = customer.supplierProfile;
    const purchases = supplier?.purchaseInvoices || [];
    const supplierPayments = payments.filter((row) => row.type === "SUPPLIER_PAYMENT").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const unpaidPurchases = purchases.filter((row) => row.status !== "RETURNED" && row.paymentStatus !== "PAID").reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const supplierDue = customerMoney(Math.max(0, Number(supplier?.openingBalance || 0) + unpaidPurchases - supplierPayments));
    const inventory = purchases.flatMap((invoice) => invoice.items.map((item) => ({
      id: `PURCHASE-${invoice.id}-${item.id}`,
      type: invoice.status === "RETURNED" ? "PURCHASE_RETURN" : "PURCHASE",
      medicineId: item.medicineId,
      medicineName: item.medicine?.name,
      quantityChange: invoice.status === "RETURNED" ? -Number(item.quantity || 0) : Number(item.quantity || 0),
      quantityAfter: item.medicine?.quantity,
      referenceNumber: invoice.invoiceNumber,
      createdAt: invoice.returnedAt || invoice.createdAt
    })));
    const activities = [
      ...customer.sales.map((row) => ({ id: `SALE-${row.id}`, kind: "SALE", title: row.status === "RETURNED" ? "مرتجع مبيعات" : "فاتورة مبيعات", reference: row.invoiceNumber, amount: row.refundedAmount || row.finalAmount, createdAt: row.returnedAt || row.createdAt })),
      ...purchases.map((row) => ({ id: `PURCHASE-${row.id}`, kind: "PURCHASE", title: row.status === "RETURNED" ? "مرتجع مشتريات" : "فاتورة مشتريات", reference: row.invoiceNumber, amount: row.totalAmount, createdAt: row.returnedAt || row.createdAt })),
      ...customer.accountTransactions.map((row) => ({ id: `ACCOUNT-${row.id}`, kind: "ACCOUNT", title: row.type, reference: row.sale?.invoiceNumber || null, amount: row.amount, createdAt: row.createdAt })),
      ...payments.map((row) => ({ id: `TREASURY-${row.id}`, kind: "TREASURY", title: row.type, reference: row.referenceNumber, amount: row.amount, direction: row.direction, createdAt: row.createdAt }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: {
      role: supplier ? "BOTH" : "CUSTOMER",
      customer: parsed,
      supplier,
      sales: customer.sales,
      purchases,
      inventory,
      accountTransactions: customer.accountTransactions,
      payments,
      activities,
      stats: { customerDue: parsed.stats.totalDue, supplierDue, totalSales: parsed.stats.totalSales, totalPurchases: customerMoney(purchases.filter((row) => row.status !== "RETURNED").reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)) }
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load customer profile", error: error.message });
  }
};

exports.getCustomerAccount = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        accountTransactions: {
          include: {
            user: { select: { id: true, name: true, role: true } },
            sale: { select: { id: true, invoiceNumber: true, finalAmount: true, status: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 100
        }
      }
    });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load customer account" });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    const note = String(req.body.note || "").trim() || null;
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "A valid payment amount is required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id }, include: { supplierProfile: true } });
      if (!customer) throw Object.assign(new Error("Customer not found"), { code: "NOT_FOUND" });
      const openShift = await tx.cashierShift.findFirst({
        where: { userId: req.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" }
      });
      if (req.user.role === "CASHIER" && !openShift) {
        throw Object.assign(new Error("Open a cashier shift before collecting a customer payment"), { code: "SHIFT_REQUIRED" });
      }
      if (amount > Number(customer.accountBalance || 0)) {
        throw Object.assign(new Error("Payment cannot exceed the current customer debt"), { code: "OVERPAYMENT" });
      }

      const balanceAfter = Number((customer.accountBalance - amount).toFixed(2));
      const updated = await tx.customer.update({ where: { id }, data: { accountBalance: balanceAfter } });
      const transaction = await tx.customerAccountTransaction.create({
        data: {
          customerId: id,
          userId: req.user.id,
          type: "PAYMENT",
          amount: -amount,
          balanceAfter,
          cashierShiftId: openShift?.id || null,
          note: note || "Customer payment"
        }
      });
      const treasury = await recordTreasuryTransaction(tx, {
        type: "CUSTOMER_PAYMENT",
        direction: "IN",
        amount,
        accountingAccountId: req.body.accountingAccountId,
        treasuryAccountId: req.body.treasuryAccountId,
        paymentMethod: String(req.body.paymentMethod || "CASH"),
        note: note || `تحصيل من العميل ${customer.name}`,
        referenceType: "CUSTOMER",
        referenceId: customer.id,
        referenceNumber: customer.name,
        userId: req.user.id,
        cashierShiftId: openShift?.id || null
      });
      return { customer: updated, transaction, treasury };
    });

    res.json({ success: true, message: "Customer payment recorded", data: result });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    if (error.code === "OVERPAYMENT") return res.status(400).json({ success: false, message: error.message });
    if (error.code === "SHIFT_REQUIRED") return res.status(400).json({ success: false, message: "افتح وردية كاشير قبل تحصيل دفعة من العميل." });
    res.status(500).json({ success: false, message: "Failed to record customer payment" });
  }
};

exports.recordAdvance = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = customerMoney(req.body.amount);
    const paymentMethod = String(req.body.paymentMethod || "CASH").trim().toUpperCase();
    const note = String(req.body.note || "").trim() || null;
    if (!id || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: "A positive advance amount is required" });
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) return res.status(400).json({ success: false, message: "Unsupported payment method" });

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw Object.assign(new Error("Customer not found"), { code: "NOT_FOUND" });
      const balanceAfter = customerMoney(Number(customer.accountBalance || 0) - amount);
      const updated = await tx.customer.update({ where: { id }, data: { accountBalance: balanceAfter } });
      const openShift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      const transaction = await tx.customerAccountTransaction.create({ data: { customerId: id, userId: req.user.id, type: "ADVANCE", amount: -amount, balanceAfter, cashierShiftId: openShift?.id || null, note: note || "Customer advance" } });
      const expense = openShift ? await tx.shiftExpense.create({ data: { cashierShiftId: openShift.id, userId: req.user.id, amount, category: "CUSTOMER_ADVANCE", paymentMethod, note: note || `سلفة للعميل ${customer.name}` } }) : null;
      const treasury = await recordTreasuryTransaction(tx, { type: "CUSTOMER_ADVANCE", direction: "OUT", amount, accountingAccountId: req.body.accountingAccountId, treasuryAccountId: req.body.treasuryAccountId, paymentMethod, note: note || `سلفة للعميل ${customer.name}`, referenceType: "CUSTOMER", referenceId: customer.id, referenceNumber: customer.name, userId: req.user.id, cashierShiftId: openShift?.id || null });
      return { customer: updated, transaction, expense, treasury };
    });
    res.status(201).json({ success: true, message: "Customer advance recorded", data: result });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to record customer advance", error: error.message });
  }
};

exports.settleAccount = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const paymentMethod = String(req.body.paymentMethod || "CASH").trim().toUpperCase();
    const note = String(req.body.note || "").trim() || null;
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) return res.status(400).json({ success: false, message: "Unsupported payment method" });

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw Object.assign(new Error("Customer not found"), { code: "NOT_FOUND" });
      const currentBalance = customerMoney(customer.accountBalance);
      if (currentBalance === 0) throw Object.assign(new Error("Customer account is already settled"), { code: "ALREADY_SETTLED" });
      const amount = Math.abs(currentBalance);
      const direction = currentBalance > 0 ? "IN" : "OUT";
      const updated = await tx.customer.update({ where: { id }, data: { accountBalance: 0 } });
      const openShift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      const transaction = await tx.customerAccountTransaction.create({ data: { customerId: id, userId: req.user.id, type: "SETTLEMENT", amount: -currentBalance, balanceAfter: 0, cashierShiftId: openShift?.id || null, note: note || "Account settlement" } });
      const expense = direction === "OUT" && openShift ? await tx.shiftExpense.create({ data: { cashierShiftId: openShift.id, userId: req.user.id, amount, category: "CUSTOMER_SETTLEMENT", paymentMethod, note: note || `تصفية حساب العميل ${customer.name}` } }) : null;
      const treasury = await recordTreasuryTransaction(tx, { type: "CUSTOMER_SETTLEMENT", direction, amount, accountingAccountId: req.body.accountingAccountId, treasuryAccountId: req.body.treasuryAccountId, paymentMethod, note: note || `تصفية حساب العميل ${customer.name}`, referenceType: "CUSTOMER", referenceId: customer.id, referenceNumber: customer.name, userId: req.user.id, cashierShiftId: openShift?.id || null });
      return { customer: updated, transaction, expense, treasury };
    });
    res.json({ success: true, message: "Customer account settled", data: result });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    if (error.code === "ALREADY_SETTLED") return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to settle customer account", error: error.message });
  }
};

exports.adjustBalance = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    const note = String(req.body.note || "").trim();
    if (!id || !Number.isFinite(amount) || amount === 0 || !note) {
      return res.status(400).json({ success: false, message: "A non-zero amount and note are required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw Object.assign(new Error("Customer not found"), { code: "NOT_FOUND" });
      const balanceAfter = Number((customer.accountBalance + amount).toFixed(2));
      const updated = await tx.customer.update({ where: { id }, data: { accountBalance: balanceAfter } });
      const transaction = await tx.customerAccountTransaction.create({
        data: {
          customerId: id,
          userId: req.user.id,
          type: "ADJUSTMENT",
          amount,
          balanceAfter,
          note
        }
      });
      return { customer: updated, transaction };
    });

    res.json({ success: true, message: "Customer balance adjusted", data: result });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to adjust customer balance" });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw Object.assign(new Error("Customer not found"), { code: "P2025" });
      await tx.customerAccountTransaction.deleteMany({ where: { customerId: id } });
      await tx.sale.updateMany({ where: { customerId: id }, data: { customerId: null } });
      if (customer.supplierProfile) {
        await tx.supplier.update({ where: { id: customer.supplierProfile.id }, data: { linkedCustomerId: null, contactRole: "SUPPLIER" } });
      }
      await tx.customer.delete({ where: { id } });
    });
    res.json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
