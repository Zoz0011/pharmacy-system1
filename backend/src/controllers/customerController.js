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
  data.customerType = String(body.customerType || "PERSON").toUpperCase() === "BUSINESS" ? "BUSINESS" : "PERSON";
  if (body.openingBalance !== undefined) data.openingBalance = customerMoney(body.openingBalance);
  if (body.creditLimit !== undefined) data.creditLimit = customerMoney(body.creditLimit);
  if (body.paymentTermValue !== undefined) {
    const parsed = Number.parseInt(body.paymentTermValue, 10);
    data.paymentTermValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  if (body.customFields !== undefined) data.customFields = JSON.stringify(body.customFields && typeof body.customFields === "object" ? body.customFields : {});
  data.address = [data.addressLine1, data.addressLine2, data.district, data.city, data.state, data.country, data.postalCode].filter(Boolean).join("، ") || (body.address ? String(body.address).trim() : null);
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
      if (amount > Number(customer.accountBalance || 0)) {
        throw Object.assign(new Error("Payment cannot exceed the current customer debt"), { code: "OVERPAYMENT" });
      }

      const balanceAfter = Number((customer.accountBalance - amount).toFixed(2));
      const updated = await tx.customer.update({ where: { id }, data: { accountBalance: balanceAfter } });
      const openShift = await tx.cashierShift.findFirst({
        where: { userId: req.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" }
      });
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
    res.status(500).json({ success: false, message: "Failed to record customer payment" });
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
