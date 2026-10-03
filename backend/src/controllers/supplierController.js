const prisma = require("../config/prisma");
const { recordTreasuryTransaction, toMoney } = require("../services/treasuryService");

const supplierTextFields = [
  "name", "phone", "email", "supplierType", "businessName", "familyName", "middleName", "title",
  "alternatePhone", "telephone", "taxNumber", "paymentTermUnit", "contactCode", "addressLine1",
  "addressLine2", "district", "city", "state", "country", "postalCode", "shippingAddress"
];

function normalizeSupplierPayload(body = {}) {
  const data = {};
  for (const field of supplierTextFields) {
    if (body[field] !== undefined) data[field] = String(body[field] || "").trim() || null;
  }
  data.supplierType = String(body.supplierType || "BUSINESS").toUpperCase() === "PERSON" ? "PERSON" : "BUSINESS";
  if (body.openingBalance !== undefined) data.openingBalance = toMoney(body.openingBalance);
  if (body.paymentTermValue !== undefined) {
    const parsed = Number.parseInt(body.paymentTermValue, 10);
    data.paymentTermValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  if (body.customFields !== undefined) {
    data.customFields = JSON.stringify(body.customFields && typeof body.customFields === "object" ? body.customFields : {});
  }
  data.address = [data.addressLine1, data.addressLine2, data.district, data.city, data.state, data.country, data.postalCode].filter(Boolean).join("، ") || (body.address ? String(body.address).trim() : null);
  return data;
}

function normalizeContactRole(value, fallback = "SUPPLIER") {
  return String(value || fallback).toUpperCase() === "BOTH" ? "BOTH" : "SUPPLIER";
}

function customerProfileFromSupplier(data, body) {
  const openingBalance = toMoney(body.customerOpeningBalance || 0);
  return {
    data: {
      name: data.name || String(body.name || "").trim(),
      phone: data.phone,
      email: data.email,
      address: data.address,
      customerType: data.supplierType === "PERSON" ? "PERSON" : "BUSINESS",
      contactRole: "BOTH",
      businessName: data.businessName,
      familyName: data.familyName,
      middleName: data.middleName,
      title: data.title,
      alternatePhone: data.alternatePhone,
      telephone: data.telephone,
      taxNumber: data.taxNumber,
      openingBalance,
      accountBalance: openingBalance,
      creditLimit: toMoney(body.creditLimit || 0),
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
      customFields: data.customFields
    },
    openingBalance
  };
}

function parseCustomFields(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function supplierWithStats(supplier, paymentTotals) {
  const invoices = supplier.purchaseInvoices || [];
  const completed = invoices.filter((invoice) => invoice.status !== "RETURNED");
  const returned = invoices.filter((invoice) => invoice.status === "RETURNED");
  const totalPurchases = completed.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const unpaidPurchases = completed.filter((invoice) => invoice.paymentStatus !== "PAID").reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const totalPurchaseReturns = returned.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const supplierPayments = Number(paymentTotals.get(supplier.id) || 0);
  return {
    ...supplier,
    customFields: parseCustomFields(supplier.customFields),
    stats: {
      totalPurchases: toMoney(totalPurchases),
      unpaidPurchases: toMoney(unpaidPurchases),
      totalPurchaseReturns: toMoney(totalPurchaseReturns),
      supplierPayments: toMoney(supplierPayments),
      totalDue: toMoney(Math.max(0, Number(supplier.openingBalance || 0) + unpaidPurchases - supplierPayments))
    }
  };
}

exports.getSuppliers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const suppliers = await prisma.supplier.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { businessName: { contains: q } },
              { contactCode: { contains: q } },
              { taxNumber: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
              { address: { contains: q } }
            ]
          }
        : undefined,
      include: {
        linkedCustomer: { select: { id: true, name: true, openingBalance: true, accountBalance: true, creditLimit: true, contactCode: true } },
        medicines: {
          select: { id: true, name: true, quantity: true }
        },
        purchaseInvoices: { select: { id: true, invoiceNumber: true, totalAmount: true, paymentStatus: true, status: true, createdAt: true, returnedAt: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const payments = await prisma.treasuryTransaction.findMany({
      where: { type: "SUPPLIER_PAYMENT", referenceType: "SUPPLIER", referenceId: { not: null } },
      select: { referenceId: true, amount: true }
    });
    const paymentTotals = new Map();
    for (const payment of payments) paymentTotals.set(payment.referenceId, Number(paymentTotals.get(payment.referenceId) || 0) + Number(payment.amount || 0));
    res.json({ success: true, data: suppliers.map((supplier) => supplierWithStats(supplier, paymentTotals)) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "Supplier name is required" });
    }

    const data = normalizeSupplierPayload(req.body);
    const contactRole = normalizeContactRole(req.body.contactRole);
    if (!Number.isFinite(data.openingBalance || 0)) return res.status(400).json({ success: false, message: "Opening balance must be a valid number" });
    if (!data.contactCode) data.contactCode = `${contactRole === "BOTH" ? "CNT" : "SUP"}-${Date.now().toString(36).toUpperCase()}`;
    data.name = String(name).trim();
    const supplier = await prisma.$transaction(async (tx) => {
      let linkedCustomerId = null;
      if (contactRole === "BOTH") {
        const requestedCustomerId = Number(req.body.linkedCustomerId || 0);
        const existingCustomer = requestedCustomerId ? await tx.customer.findUnique({ where: { id: requestedCustomerId } }) : null;
        if (existingCustomer) {
          linkedCustomerId = existingCustomer.id;
          await tx.customer.update({ where: { id: existingCustomer.id }, data: { contactRole: "BOTH" } });
        } else {
          const customerProfile = customerProfileFromSupplier(data, req.body);
          const customer = await tx.customer.create({ data: customerProfile.data });
          linkedCustomerId = customer.id;
          if (customerProfile.openingBalance !== 0) {
            await tx.customerAccountTransaction.create({
              data: { customerId: customer.id, userId: req.user.id, type: "OPENING_BALANCE", amount: customerProfile.openingBalance, balanceAfter: customerProfile.openingBalance, note: "Opening customer balance" }
            });
          }
        }
      }
      return tx.supplier.create({ data: { ...data, contactRole, linkedCustomerId } });
    });

    res.status(201).json({ success: true, message: "Supplier created successfully", data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!String(req.body.name || "").trim()) return res.status(400).json({ success: false, message: "Supplier name is required" });
    const supplier = await prisma.$transaction(async (tx) => {
      const current = await tx.supplier.findUnique({ where: { id }, include: { linkedCustomer: true } });
      if (!current) throw Object.assign(new Error("Supplier not found"), { code: "P2025" });
      const data = normalizeSupplierPayload(req.body);
      const contactRole = normalizeContactRole(req.body.contactRole, current.contactRole);
      data.name = String(req.body.name).trim();
      let linkedCustomerId = current.linkedCustomerId;
      if (contactRole === "BOTH") {
        const customerProfile = customerProfileFromSupplier({ ...current, ...data }, req.body);
        if (current.linkedCustomer) {
          const customerData = { ...customerProfile.data };
          if (req.body.customerOpeningBalance === undefined) {
            delete customerData.openingBalance;
            delete customerData.accountBalance;
          } else {
            const delta = customerProfile.openingBalance - Number(current.linkedCustomer.openingBalance || 0);
            customerData.accountBalance = toMoney(Number(current.linkedCustomer.accountBalance || 0) + delta);
          }
          if (req.body.creditLimit === undefined) delete customerData.creditLimit;
          await tx.customer.update({ where: { id: current.linkedCustomer.id }, data: customerData });
        } else {
          const customer = await tx.customer.create({ data: customerProfile.data });
          linkedCustomerId = customer.id;
          if (customerProfile.openingBalance !== 0) {
            await tx.customerAccountTransaction.create({ data: { customerId: customer.id, userId: req.user.id, type: "OPENING_BALANCE", amount: customerProfile.openingBalance, balanceAfter: customerProfile.openingBalance, note: "Opening customer balance" } });
          }
        }
      } else if (current.linkedCustomer) {
        await tx.customer.update({ where: { id: current.linkedCustomer.id }, data: { contactRole: "CUSTOMER" } });
        linkedCustomerId = null;
      }
      return tx.supplier.update({ where: { id }, data: { ...data, contactRole, linkedCustomerId }, include: { linkedCustomer: true } });
    });

    res.json({ success: true, message: "Supplier updated successfully", data: supplier });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id }, include: { linkedCustomer: true } });
      if (!supplier) throw Object.assign(new Error("Supplier not found"), { code: "P2025" });
      await tx.medicine.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
      await tx.purchaseInvoice.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
      if (supplier.linkedCustomer) await tx.customer.update({ where: { id: supplier.linkedCustomer.id }, data: { contactRole: "CUSTOMER" } });
      await tx.supplier.delete({ where: { id } });
    });
    res.json({ success: true, message: "Supplier deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getSupplierProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        linkedCustomer: {
          include: {
            sales: {
              include: { items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } } },
              orderBy: { createdAt: "desc" }
            },
            accountTransactions: {
              include: { user: { select: { id: true, name: true, role: true } }, sale: { select: { id: true, invoiceNumber: true, finalAmount: true, status: true } } },
              orderBy: { createdAt: "desc" },
              take: 200
            }
          }
        },
        medicines: { select: { id: true, name: true, quantity: true, minStock: true, updatedAt: true } },
        purchaseInvoices: {
          include: { items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } } },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });

    const referenceFilters = [{ referenceType: "SUPPLIER", referenceId: supplier.id }];
    if (supplier.linkedCustomer) referenceFilters.push({ referenceType: "CUSTOMER", referenceId: supplier.linkedCustomer.id });
    const payments = await prisma.treasuryTransaction.findMany({
      where: { OR: referenceFilters },
      include: { treasuryAccount: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    const supplierPayments = payments.filter((row) => row.type === "SUPPLIER_PAYMENT").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const completedPurchases = supplier.purchaseInvoices.filter((row) => row.status !== "RETURNED");
    const unpaidPurchases = completedPurchases.filter((row) => row.paymentStatus !== "PAID").reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const supplierDue = toMoney(Math.max(0, Number(supplier.openingBalance || 0) + unpaidPurchases - supplierPayments));
    const customer = supplier.linkedCustomer;
    const sales = customer?.sales || [];
    const inventory = supplier.purchaseInvoices.flatMap((invoice) => invoice.items.map((item) => ({
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
      ...supplier.purchaseInvoices.map((row) => ({ id: `PURCHASE-${row.id}`, kind: "PURCHASE", title: row.status === "RETURNED" ? "مرتجع مشتريات" : "فاتورة مشتريات", reference: row.invoiceNumber, amount: row.totalAmount, createdAt: row.returnedAt || row.createdAt })),
      ...sales.map((row) => ({ id: `SALE-${row.id}`, kind: "SALE", title: row.status === "RETURNED" ? "مرتجع مبيعات" : "فاتورة مبيعات", reference: row.invoiceNumber, amount: row.refundedAmount || row.finalAmount, createdAt: row.returnedAt || row.createdAt })),
      ...(customer?.accountTransactions || []).map((row) => ({ id: `ACCOUNT-${row.id}`, kind: "ACCOUNT", title: row.type, reference: row.sale?.invoiceNumber || null, amount: row.amount, createdAt: row.createdAt })),
      ...payments.map((row) => ({ id: `TREASURY-${row.id}`, kind: "TREASURY", title: row.type, reference: row.referenceNumber, amount: row.amount, direction: row.direction, createdAt: row.createdAt }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: {
      role: customer ? "BOTH" : "SUPPLIER",
      supplier: { ...supplier, customFields: parseCustomFields(supplier.customFields) },
      customer,
      sales,
      purchases: supplier.purchaseInvoices,
      inventory,
      accountTransactions: customer?.accountTransactions || [],
      payments,
      activities,
      stats: { supplierDue, customerDue: toMoney(customer?.accountBalance || 0), totalSales: toMoney(sales.filter((row) => row.status !== "RETURNED").reduce((sum, row) => sum + Number(row.finalAmount || 0), 0)), totalPurchases: toMoney(completedPurchases.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)) }
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load supplier profile", error: error.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    const paymentMethod = String(req.body.paymentMethod || "CASH").trim().toUpperCase();
    const note = String(req.body.note || "").trim() || null;
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "A positive payment amount is required" });
    }
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Unsupported payment method" });
    }

    const data = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id } });
      if (!supplier) throw Object.assign(new Error("Supplier not found"), { code: "NOT_FOUND" });
      const openShift = await tx.cashierShift.findFirst({
        where: { userId: req.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" }
      });
      if (req.user.role === "CASHIER" && !openShift) {
        throw Object.assign(new Error("Open a cashier shift before recording a supplier payment"), { code: "SHIFT_REQUIRED" });
      }
      const expense = openShift ? await tx.shiftExpense.create({
        data: {
          cashierShiftId: openShift.id,
          userId: req.user.id,
          amount: toMoney(amount),
          category: "SUPPLIER_PAYMENT",
          paymentMethod,
          note: note || `سداد للمورد ${supplier.name}`
        }
      }) : null;
      const treasury = await recordTreasuryTransaction(tx, {
        type: "SUPPLIER_PAYMENT",
        direction: "OUT",
        amount,
        accountingAccountId: req.body.accountingAccountId,
        treasuryAccountId: req.body.treasuryAccountId,
        paymentMethod,
        note: note || `سداد للمورد ${supplier.name}`,
        referenceType: "SUPPLIER",
        referenceId: supplier.id,
        referenceNumber: supplier.name,
        userId: req.user.id,
        cashierShiftId: openShift?.id || null
      });
      return { supplier, expense, treasury };
    });
    res.status(201).json({ success: true, message: "Supplier payment recorded", data });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    if (error.code === "SHIFT_REQUIRED") return res.status(400).json({ success: false, message: "افتح وردية كاشير قبل تسجيل سداد المورد." });
    res.status(500).json({ success: false, message: "Failed to record supplier payment", error: error.message });
  }
};
