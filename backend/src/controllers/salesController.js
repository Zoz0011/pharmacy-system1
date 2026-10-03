const prisma = require("../config/prisma");
const { recordTreasuryTransaction } = require("../services/treasuryService");
const {
  isFractionalMedicine,
  getBaseUnitsPerBox,
  deductFromBoxes,
  restoreAllocationsToBoxes,
  resolveSaleUnitPrice
} = require("../utils/packaging");

function buildInvoiceNumber() {
  return `SI-${Date.now()}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

const SALE_PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "CREDIT"];

function activePromotionFilter(now = new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  return {
    active: true,
    AND: [
      // Date inputs are stored at midnight.  Treat the start and end dates as
      // whole calendar days so an offer never disappears during its last day.
      { OR: [{ startDate: null }, { startDate: { lte: dayEnd } }] },
      { OR: [{ endDate: null }, { endDate: { gte: dayStart } }] }
    ]
  };
}

function serializePromotion(promotion) {
  return {
    id: promotion.id,
    name: promotion.name,
    discountType: promotion.discountType === "FIXED" ? "FIXED" : "PERCENT",
    discountValue: Number(promotion.discountValue || 0),
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    active: Boolean(promotion.active)
  };
}

function normalizeSalePayments(rawPayments) {
  if (!Array.isArray(rawPayments)) return [];
  return rawPayments
    .map((payment) => ({
      paymentMethod: String(payment?.paymentMethod || payment?.method || "").trim().toUpperCase(),
      amount: Number(payment?.amount || 0)
    }))
    .filter((payment) => SALE_PAYMENT_METHODS.includes(payment.paymentMethod) && Number.isFinite(payment.amount) && payment.amount > 0)
    .map((payment) => ({ ...payment, amount: Number(payment.amount.toFixed(2)) }));
}

function saleUnitBaseUnits(medicine, saleUnit, quantity) {
  const unit = String(saleUnit || "BOX").toUpperCase();
  if (unit === "PILL") return quantity;
  if (unit === "STRIP") return quantity * Number(medicine.pillsPerStrip || 1);
  return quantity * getBaseUnitsPerBox(medicine);
}

async function restoreFreeReturnStock(tx, medicine, baseUnits) {
  if (!isFractionalMedicine(medicine)) return;
  const baseUnitsPerBox = getBaseUnitsPerBox(medicine);
  let remaining = baseUnits;
  const partialBoxes = await tx.medicineBox.findMany({
    where: { medicineId: medicine.id, status: "OPEN" },
    orderBy: { createdAt: "asc" }
  });
  for (const box of partialBoxes.filter((item) => Number(item.remainingPills) < Number(item.totalPills))) {
    if (remaining <= 0) break;
    const capacity = Number(box.totalPills) - Number(box.remainingPills);
    const restored = Math.min(capacity, remaining);
    await tx.medicineBox.update({ where: { id: box.id }, data: { remainingPills: Number(box.remainingPills) + restored, status: "OPEN", depletedAt: null } });
    remaining -= restored;
  }
  while (remaining > 0) {
    const restored = Math.min(baseUnitsPerBox, remaining);
    await tx.medicineBox.create({
      data: {
        medicineId: medicine.id,
        boxCode: `FR-${medicine.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        totalPills: baseUnitsPerBox,
        remainingPills: restored,
        stripsPerBox: Number(medicine.stripsPerBox || 1),
        pillsPerStrip: Number(medicine.pillsPerStrip || 1),
        batchNumber: medicine.batchNumber || null,
        expiryDate: medicine.expiryDate || null,
        status: "OPEN"
      }
    });
    remaining -= restored;
  }
}

async function loadSales() {
  return prisma.sale.findMany({
    include: {
      user: { select: { id: true, name: true, role: true } },
      customer: { select: { id: true, name: true, phone: true } },
      supplier: { select: { id: true, name: true, phone: true, linkedCustomerId: true } },
      payments: { orderBy: { id: "asc" } },
      cashierShift: { select: { id: true, status: true, openedAt: true, closedAt: true } },
      items: {
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              nameEn: true,
              itemType: true,
              packageNameAr: true,
              packageNameEn: true,
              pieceNameAr: true,
              pieceNameEn: true,
              batchNumber: true,
              barcode: true,
              category: true,
              manufacturer: true,
              stripsPerBox: true,
              pillsPerStrip: true
            }
          },
          allocations: {
            include: {
              medicineBox: {
                select: {
                  id: true,
                  boxCode: true,
                  batchNumber: true,
                  expiryDate: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

exports.getSales = async (req, res) => {
  try {
    const sales = await loadSales();
    res.json({ success: true, data: sales });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getDailySummary = async (req, res) => {
  try {
    const from = req.query.date ? new Date(req.query.date) : startOfToday();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const sales = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: from,
          lt: to
        }
      },
      include: {
        items: true
      },
      orderBy: { createdAt: "desc" }
    });

    const totalRevenue = sales.filter((sale) => sale.status !== "RETURNED").reduce((sum, sale) => sum + sale.finalAmount, 0);
    const totalRefunded = sales.reduce((sum, sale) => sum + sale.refundedAmount, 0);
    const invoiceCount = sales.length;
    const itemsSold = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.baseUnits, 0), 0);

    res.json({
      success: true,
      data: {
        date: from,
        invoiceCount,
        itemsSold,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalRefunded: Number(totalRefunded.toFixed(2)),
        netRevenue: Number((totalRevenue - totalRefunded).toFixed(2))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getSaleById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        customer: { select: { id: true, name: true, phone: true, address: true } },
        supplier: { select: { id: true, name: true, phone: true, address: true, linkedCustomerId: true } },
        payments: { orderBy: { id: "asc" } },
        cashierShift: { select: { id: true, status: true, openedAt: true, closedAt: true } },
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                nameAr: true,
                nameEn: true,
                itemType: true,
                packageNameAr: true,
                packageNameEn: true,
                pieceNameAr: true,
                pieceNameEn: true,
                batchNumber: true,
                barcode: true,
                stripsPerBox: true,
                pillsPerStrip: true
              }
            },
            allocations: {
              include: {
                medicineBox: {
                  select: {
                    id: true,
                    boxCode: true,
                    batchNumber: true,
                    expiryDate: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createSale = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    let customerId = req.body.customerId ? Number(req.body.customerId) : null;
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const counterpartyType = String(req.body.counterpartyType || (customerId ? "CUSTOMER" : "CASH")).toUpperCase();
    const discount = Number(req.body.discount || 0);
    const requestedPaymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
    const requestedPayments = normalizeSalePayments(req.body.payments);

    if (!items.length) {
      return res.status(400).json({ success: false, message: "At least one sale item is required" });
    }
    if (!Number.isFinite(discount)) {
      return res.status(400).json({ success: false, message: "Price adjustment must be a valid number" });
    }
    if (!SALE_PAYMENT_METHODS.includes(requestedPaymentMethod) && requestedPaymentMethod !== "MIXED") {
      return res.status(400).json({ success: false, message: "Unsupported payment method" });
    }
    if (Array.isArray(req.body.payments) && req.body.payments.length && !requestedPayments.length) {
      return res.status(400).json({ success: false, message: "Enter at least one valid payment amount" });
    }
    if (!["CASH", "CUSTOMER", "SUPPLIER", "BOTH"].includes(counterpartyType)) {
      return res.status(400).json({ success: false, message: "Unsupported counterparty type" });
    }
    if (counterpartyType === "CUSTOMER" && !customerId) return res.status(400).json({ success: false, message: "Choose a customer" });
    if (counterpartyType === "SUPPLIER" && !supplierId) return res.status(400).json({ success: false, message: "Choose a supplier" });
    if (counterpartyType === "BOTH" && (!customerId || !supplierId)) return res.status(400).json({ success: false, message: "Choose a linked customer and supplier account" });
    const sale = await prisma.$transaction(async (tx) => {
      const preparedItems = [];
      const reservedBaseUnits = new Map();
      const normalizedPackagedMedicines = new Set();
      let totalAmount = 0;
      const openShift = await tx.cashierShift.findFirst({
        where: { userId: req.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" }
      });
      if (req.user.role === "CASHIER" && !openShift) {
        throw Object.assign(new Error("Open a cashier shift before completing sales"), { code: "SHIFT_REQUIRED" });
      }

      for (const item of items) {
        const medicineId = Number(item.medicineId);
        const saleQuantity = Number(item.quantity);
        const saleUnit = String(item.saleUnit || "BOX").toUpperCase();

        if (!medicineId || !Number.isInteger(saleQuantity) || saleQuantity <= 0) {
          throw Object.assign(new Error("Each sale item needs valid medicineId and quantity"), { code: "INVALID_ITEM" });
        }

        const medicine = await tx.medicine.findUnique({
          where: { id: medicineId },
          include: { medicineBoxes: { where: { status: "OPEN" }, orderBy: { createdAt: "asc" } } }
        });

        if (!medicine) {
          throw Object.assign(new Error("Medicine not found"), { code: "MEDICINE_NOT_FOUND" });
        }

        if (isFractionalMedicine(medicine) && !normalizedPackagedMedicines.has(medicineId)) {
          const packagedBaseUnits = medicine.medicineBoxes.reduce(
            (sum, box) => sum + Number(box.remainingPills || 0),
            0
          );

          if (Number(medicine.quantity || 0) !== packagedBaseUnits) {
            await tx.medicine.update({
              where: { id: medicineId },
              data: { quantity: packagedBaseUnits }
            });
            medicine.quantity = packagedBaseUnits;
          }
          normalizedPackagedMedicines.add(medicineId);
        }

        let allocationResult = {
          saleUnit,
          saleQuantity,
          baseUnits: saleQuantity,
          allocations: []
        };

        if (!["BOX", "STRIP", "PILL"].includes(saleUnit)) {
          throw Object.assign(new Error(`Unsupported sale unit for ${medicine.name}`), { code: "INVALID_SALE_UNIT" });
        }

        if (isFractionalMedicine(medicine)) {
          allocationResult = await deductFromBoxes(tx, medicine, saleUnit, saleQuantity);
        } else if (saleUnit !== "BOX") {
          throw Object.assign(new Error(`${medicine.name} is not configured for strip or pill sales`), { code: "INVALID_SALE_UNIT" });
        }

        const requestedBaseUnits = (reservedBaseUnits.get(medicineId) || 0) + allocationResult.baseUnits;
        if (medicine.quantity < requestedBaseUnits) {
          throw Object.assign(new Error(`Insufficient stock for ${medicine.name}`), { code: "INSUFFICIENT_STOCK" });
        }
        reservedBaseUnits.set(medicineId, requestedBaseUnits);

        const catalogUnitPrice = resolveSaleUnitPrice(medicine, saleUnit);
        const requestedBaseUnitPrice = item.baseUnitPrice === undefined || item.baseUnitPrice === null || item.baseUnitPrice === ""
          ? catalogUnitPrice
          : Number(item.baseUnitPrice);
        const discountType = String(item.discountType || "FIXED").toUpperCase() === "PERCENT" ? "PERCENT" : "FIXED";
        const rawDiscountValue = Number(item.discountValue || 0);
        if (!Number.isFinite(requestedBaseUnitPrice) || requestedBaseUnitPrice < 0 || !Number.isFinite(rawDiscountValue) || rawDiscountValue < 0) {
          throw Object.assign(new Error(`Invalid price or discount for ${medicine.name}`), { code: "INVALID_ITEM_PRICE" });
        }
        const discountValue = discountType === "PERCENT" ? Math.min(100, rawDiscountValue) : rawDiscountValue;
        const unitPrice = Number((discountType === "PERCENT"
          ? Math.max(0, requestedBaseUnitPrice * (1 - discountValue / 100))
          : Math.max(0, requestedBaseUnitPrice - discountValue)).toFixed(2));
        const totalPrice = Number((unitPrice * saleQuantity).toFixed(2));
        totalAmount += totalPrice;

        preparedItems.push({
          medicine,
          medicineId,
          saleQuantity,
          saleUnit,
          baseUnits: allocationResult.baseUnits,
          baseUnitPrice: Number(requestedBaseUnitPrice.toFixed(2)),
          unitPrice,
          discountType,
          discountValue: Number(discountValue.toFixed(2)),
          note: String(item.note || "").trim() || null,
          totalPrice,
          allocations: allocationResult.allocations
        });
      }

      const finalAmount = Math.max(0, Number((totalAmount - discount).toFixed(2)));
      const payments = requestedPayments.length
        ? requestedPayments
        : [{ paymentMethod: requestedPaymentMethod, amount: finalAmount }];
      const paymentsTotal = Number(payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
      if (Math.abs(paymentsTotal - finalAmount) > 0.009) {
        throw Object.assign(new Error(`Payment total must equal invoice total (${finalAmount.toFixed(2)})`), { code: "INVALID_PAYMENT_TOTAL" });
      }
      const paymentMethod = payments.length > 1 ? "MIXED" : payments[0].paymentMethod;
      const creditAmount = Number(payments.filter((payment) => payment.paymentMethod === "CREDIT").reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
      let accountCustomer = null;
      if (customerId) {
        accountCustomer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!accountCustomer) {
          throw Object.assign(new Error("Customer not found"), { code: "CUSTOMER_NOT_FOUND" });
        }
      }
      let accountSupplier = null;
      if (supplierId) {
        accountSupplier = await tx.supplier.findUnique({ where: { id: supplierId } });
        if (!accountSupplier) throw Object.assign(new Error("Supplier not found"), { code: "SUPPLIER_NOT_FOUND" });
      }
      if (creditAmount > 0 && !accountCustomer && accountSupplier) {
        accountCustomer = accountSupplier.linkedCustomerId
          ? await tx.customer.findUnique({ where: { id: accountSupplier.linkedCustomerId } })
          : null;
        if (!accountCustomer) {
          accountCustomer = await tx.customer.create({
            data: {
              name: accountSupplier.name,
              phone: accountSupplier.phone,
              email: accountSupplier.email,
              address: accountSupplier.address,
              customerType: accountSupplier.supplierType === "PERSON" ? "PERSON" : "BUSINESS",
              contactRole: "BOTH",
              businessName: accountSupplier.businessName,
              familyName: accountSupplier.familyName,
              middleName: accountSupplier.middleName,
              title: accountSupplier.title,
              alternatePhone: accountSupplier.alternatePhone,
              telephone: accountSupplier.telephone,
              taxNumber: accountSupplier.taxNumber,
              openingBalance: 0,
              accountBalance: 0,
              creditLimit: 0,
              paymentTermValue: accountSupplier.paymentTermValue,
              paymentTermUnit: accountSupplier.paymentTermUnit,
              contactCode: accountSupplier.contactCode,
              addressLine1: accountSupplier.addressLine1,
              addressLine2: accountSupplier.addressLine2,
              district: accountSupplier.district,
              city: accountSupplier.city,
              state: accountSupplier.state,
              country: accountSupplier.country,
              postalCode: accountSupplier.postalCode,
              shippingAddress: accountSupplier.shippingAddress,
              customFields: accountSupplier.customFields
            }
          });
          await tx.supplier.update({
            where: { id: accountSupplier.id },
            data: { linkedCustomerId: accountCustomer.id, contactRole: "BOTH" }
          });
        }
        customerId = accountCustomer.id;
      }
      if (creditAmount > 0 && !accountCustomer) {
        throw Object.assign(new Error("Choose a customer or supplier account for credit sales"), { code: "CREDIT_ACCOUNT_REQUIRED" });
      }
      if (counterpartyType === "BOTH" && accountSupplier.linkedCustomerId !== customerId) {
        throw Object.assign(new Error("Customer and supplier accounts are not linked"), { code: "COUNTERPARTY_MISMATCH" });
      }
      if (creditAmount > 0) {
        const nextBalance = Number((accountCustomer.accountBalance + creditAmount).toFixed(2));
        if (accountCustomer.creditLimit > 0 && nextBalance > accountCustomer.creditLimit) {
          throw Object.assign(new Error("Customer credit limit would be exceeded"), { code: "CREDIT_LIMIT" });
        }
      }

      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber: String(req.body.invoiceNumber || "").trim() || buildInvoiceNumber(),
          totalAmount: Number(totalAmount.toFixed(2)),
          discount,
          finalAmount,
          refundedAmount: 0,
          status: "COMPLETED",
          paymentMethod,
          counterpartyType,
          userId: req.user.id,
          customerId,
          supplierId,
          cashierShiftId: openShift?.id || null
        }
      });

      await tx.salePayment.createMany({
        data: payments.map((payment) => ({
          saleId: createdSale.id,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount
        }))
      });

      if (creditAmount > 0) {
        const balanceAfter = Number((accountCustomer.accountBalance + creditAmount).toFixed(2));
        await tx.customer.update({ where: { id: customerId }, data: { accountBalance: balanceAfter } });
        await tx.customerAccountTransaction.create({
          data: {
            customerId,
            userId: req.user.id,
            saleId: createdSale.id,
            type: "CREDIT_SALE",
            amount: creditAmount,
            balanceAfter,
            note: `Credit sale ${createdSale.invoiceNumber}`
          }
        });
      }

      for (const item of preparedItems) {
        const updatedMedicine = await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            quantity: { decrement: item.baseUnits }
          }
        });

        const createdSaleItem = await tx.saleItem.create({
          data: {
            saleId: createdSale.id,
            medicineId: item.medicineId,
            quantity: item.saleQuantity,
            saleUnit: item.saleUnit,
            baseUnits: item.baseUnits,
            baseUnitPrice: item.baseUnitPrice,
            unitPrice: item.unitPrice,
            discountType: item.discountType,
            discountValue: item.discountValue,
            note: item.note,
            totalPrice: item.totalPrice
          }
        });

        if (item.allocations.length) {
          await tx.boxSaleAllocation.createMany({
            data: item.allocations.map((allocation) => ({
              saleItemId: createdSaleItem.id,
              medicineBoxId: allocation.medicineBoxId,
              saleUnit: allocation.saleUnit,
              saleQuantity: allocation.saleQuantity,
              baseUnits: allocation.baseUnits
            }))
          });
        }

        await tx.stockMovement.create({
          data: {
            medicineId: item.medicineId,
            userId: req.user.id,
            type: "SALE",
            quantityChange: -item.baseUnits,
            quantityAfter: updatedMedicine.quantity,
            reason: "POS sale",
            note: `${item.saleQuantity} ${item.saleUnit.toLowerCase()} sold in invoice ${createdSale.invoiceNumber}`
          }
        });
      }

      for (const payment of payments.filter((entry) => entry.paymentMethod !== "CREDIT")) {
        await recordTreasuryTransaction(tx, {
          type: "SALE",
          direction: "IN",
          amount: payment.amount,
          accountingAccountId: req.body.accountingAccountId,
          treasuryAccountId: req.body.treasuryAccountId,
          paymentMethod: payment.paymentMethod,
          note: `بيع فاتورة ${createdSale.invoiceNumber}`,
          referenceType: "SALE",
          referenceId: createdSale.id,
          referenceNumber: createdSale.invoiceNumber,
          userId: req.user.id,
          cashierShiftId: openShift?.id || null
        });
      }

      return tx.sale.findUnique({
        where: { id: createdSale.id },
        include: {
          user: { select: { id: true, name: true, role: true } },
          customer: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { id: "asc" } },
          cashierShift: { select: { id: true, status: true, openedAt: true } },
          items: {
            include: {
              medicine: { select: { id: true, name: true, nameAr: true, nameEn: true, itemType: true, packageNameAr: true, packageNameEn: true, pieceNameAr: true, pieceNameEn: true, batchNumber: true, barcode: true, stripsPerBox: true, pillsPerStrip: true } },
              allocations: {
                include: {
                  medicineBox: { select: { id: true, boxCode: true, batchNumber: true, expiryDate: true } }
                }
              }
            }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      message: "Sale created successfully",
      data: sale
    });
  } catch (error) {
    if (["INVALID_ITEM", "INVALID_SALE_UNIT", "MEDICINE_NOT_FOUND", "INSUFFICIENT_STOCK", "INSUFFICIENT_BOXES", "INSUFFICIENT_STRIPS", "INSUFFICIENT_PILLS", "SHIFT_REQUIRED", "CUSTOMER_NOT_FOUND", "SUPPLIER_NOT_FOUND", "COUNTERPARTY_MISMATCH", "CREDIT_ACCOUNT_REQUIRED", "CREDIT_LIMIT", "INVALID_PAYMENT_TOTAL", "P2002"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Imported invoices reuse the normal checkout path so stock, packages,
// customer balances and treasury movements are always recorded consistently.
exports.importSales = async (req, res) => {
  const invoices = Array.isArray(req.body.invoices) ? req.body.invoices.slice(0, 50) : [];
  if (!invoices.length) return res.status(400).json({ success: false, message: "لا توجد فواتير صالحة للاستيراد" });
  const results = [];
  for (let index = 0; index < invoices.length; index += 1) {
    const invoice = invoices[index] || {};
    const body = {
      invoiceNumber: String(invoice.invoiceNumber || "").trim(),
      customerId: invoice.customerId || undefined,
      counterpartyType: invoice.customerId ? "CUSTOMER" : "CASH",
      paymentMethod: String(invoice.paymentMethod || "CASH").toUpperCase(),
      discount: Number(invoice.discount || 0),
      items: Array.isArray(invoice.items) ? invoice.items : []
    };
    const outcome = await new Promise((resolve) => {
      const proxyResponse = {
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode || 200, payload }); }
      };
      exports.createSale({ user: req.user, body }, proxyResponse);
    });
    if (outcome.status >= 400 || !outcome.payload?.success) {
      return res.status(409).json({ success: false, message: `توقف الاستيراد عند الفاتورة ${index + 1}: ${outcome.payload?.message || "بيانات غير صحيحة"}`, data: { imported: results, failedIndex: index } });
    }
    results.push(outcome.payload.data);
  }
  res.status(201).json({ success: true, message: `تم استيراد ${results.length} فاتورة`, data: results });
};

// POS-specific read endpoint.  A cashier has sales.pos but must not need
// catalog management/view access simply to receive the offers at checkout.
exports.getActivePromotions = async (req, res) => {
  try {
    const promotions = await prisma.promotion.findMany({
      where: activePromotionFilter(),
      orderBy: [{ discountValue: "desc" }, { id: "desc" }]
    });
    res.json({ success: true, data: promotions.map(serializePromotion) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load active promotions" });
  }
};

exports.createFreeReturn = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
    const counterpartyType = ["CASH", "CUSTOMER", "BOTH"].includes(String(req.body.counterpartyType || "CASH").toUpperCase()) ? String(req.body.counterpartyType || "CASH").toUpperCase() : "CASH";
    const customerId = Number(req.body.customerId || 0) || null;
    const supplierId = Number(req.body.supplierId || 0) || null;
    const requestedDiscount = Number(req.body.discount || 0);
    const totalDiscount = Number.isFinite(requestedDiscount) ? Math.max(0, requestedDiscount) : 0;
    const returnNote = String(req.body.note || "").trim() || null;
    if (!items.length) return res.status(400).json({ success: false, message: "At least one returned item is required" });
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Unsupported refund method" });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const openShift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (!openShift) throw Object.assign(new Error("Open a cashier shift before recording a free return"), { code: "SHIFT_REQUIRED" });
      if (counterpartyType === "CUSTOMER" && !customerId) throw Object.assign(new Error("Select a customer for this return"), { code: "CUSTOMER_REQUIRED" });
      if (counterpartyType === "BOTH" && (!customerId || !supplierId)) throw Object.assign(new Error("Select the linked supplier and customer for this return"), { code: "COUNTERPARTY_REQUIRED" });
      if (customerId && !await tx.customer.findUnique({ where: { id: customerId } })) throw Object.assign(new Error("Customer not found"), { code: "CUSTOMER_NOT_FOUND" });
      if (supplierId && !await tx.supplier.findUnique({ where: { id: supplierId } })) throw Object.assign(new Error("Supplier not found"), { code: "SUPPLIER_NOT_FOUND" });
      const prepared = [];
      let refundAmount = 0;
      for (const raw of items) {
        const medicineId = Number(raw.medicineId);
        const quantity = Number(raw.quantity);
        const saleUnit = String(raw.saleUnit || "BOX").toUpperCase();
        if (!medicineId || !Number.isInteger(quantity) || quantity <= 0 || !["BOX", "STRIP", "PILL"].includes(saleUnit)) {
          throw Object.assign(new Error("Each returned item needs medicine, unit, and positive quantity"), { code: "INVALID_ITEM" });
        }
        const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
        if (!medicine) throw Object.assign(new Error("Medicine not found"), { code: "MEDICINE_NOT_FOUND" });
        if (!isFractionalMedicine(medicine) && saleUnit !== "BOX") throw Object.assign(new Error(`${medicine.name} only supports unit returns`), { code: "INVALID_ITEM" });
        const baseUnits = isFractionalMedicine(medicine) ? saleUnitBaseUnits(medicine, saleUnit, quantity) : quantity;
        const catalogUnitPrice = resolveSaleUnitPrice(medicine, saleUnit);
        const requestedUnitPrice = raw.unitPrice === undefined || raw.unitPrice === null || raw.unitPrice === ""
          ? catalogUnitPrice
          : Number(raw.unitPrice);
        if (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice < 0) {
          throw Object.assign(new Error("Returned item price must be zero or more"), { code: "INVALID_ITEM" });
        }
        const unitPrice = Number(requestedUnitPrice.toFixed(2));
        const totalPrice = Number((unitPrice * quantity).toFixed(2));
        refundAmount += totalPrice;
        prepared.push({ medicine, quantity, saleUnit, baseUnits, unitPrice, totalPrice });
      }
      const appliedDiscount = Math.min(refundAmount, totalDiscount);
      const finalRefundAmount = Number((refundAmount - appliedDiscount).toFixed(2));

      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber: `FR-${Date.now()}`,
          totalAmount: Number(refundAmount.toFixed(2)),
          discount: Number(appliedDiscount.toFixed(2)),
          finalAmount: finalRefundAmount,
          refundedAmount: finalRefundAmount,
          status: "RETURNED",
          paymentMethod,
          counterpartyType,
          customerId,
          supplierId,
          userId: req.user.id,
          cashierShiftId: openShift.id,
          returnedAt: new Date()
        }
      });

      for (const item of prepared) {
        await restoreFreeReturnStock(tx, item.medicine, item.baseUnits);
        const updated = await tx.medicine.update({ where: { id: item.medicine.id }, data: { quantity: { increment: item.baseUnits } } });
        await tx.saleItem.create({ data: { saleId: createdSale.id, medicineId: item.medicine.id, quantity: item.quantity, saleUnit: item.saleUnit, baseUnits: item.baseUnits, unitPrice: item.unitPrice, note: String(item.note || "").trim() || null, totalPrice: item.totalPrice } });
        await tx.stockMovement.create({ data: { medicineId: item.medicine.id, userId: req.user.id, type: "FREE_SALE_RETURN", quantityChange: item.baseUnits, quantityAfter: updated.quantity, reason: "Free sale return", note: String(item.note || returnNote || `Free return ${createdSale.invoiceNumber}`).trim() } });
      }

      await recordTreasuryTransaction(tx, { type: "FREE_SALE_RETURN", direction: "OUT", amount: finalRefundAmount, accountingAccountId: req.body.accountingAccountId, treasuryAccountId: req.body.treasuryAccountId, paymentMethod, note: ["مرتجع مبيعات حر", createdSale.invoiceNumber, returnNote].filter(Boolean).join(" — "), referenceType: "SALE", referenceId: createdSale.id, referenceNumber: createdSale.invoiceNumber, userId: req.user.id, cashierShiftId: openShift.id });
      return tx.sale.findUnique({ where: { id: createdSale.id }, include: { items: { include: { medicine: true } }, user: true, cashierShift: true } });
    });
    res.status(201).json({ success: true, message: "Free sale return recorded", data: sale });
  } catch (error) {
    if (["SHIFT_REQUIRED", "INVALID_ITEM", "MEDICINE_NOT_FOUND", "CUSTOMER_REQUIRED", "COUNTERPARTY_REQUIRED", "CUSTOMER_NOT_FOUND", "SUPPLIER_NOT_FOUND"].includes(error.code)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to record free sale return", error: error.message });
  }
};

exports.returnSale = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const sale = await prisma.$transaction(async (tx) => {
      const existingSale = await tx.sale.findUnique({
        where: { id },
        include: {
          payments: { orderBy: { id: "asc" } },
          items: {
            include: {
              allocations: {
                include: {
                  medicineBox: true
                }
              }
            }
          }
        }
      });

      if (!existingSale) {
        throw Object.assign(new Error("Sale not found"), { code: "NOT_FOUND" });
      }

      if (existingSale.status === "RETURNED") {
        throw Object.assign(new Error("Sale already returned"), { code: "ALREADY_RETURNED" });
      }

      for (const item of existingSale.items) {
        if (item.allocations.length) {
          await restoreAllocationsToBoxes(tx, item.allocations);
        }

        const updatedMedicine = await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            quantity: {
              increment: item.baseUnits
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            medicineId: item.medicineId,
            userId: req.user.id,
            type: "SALE_RETURN",
            quantityChange: item.baseUnits,
            quantityAfter: updatedMedicine.quantity,
            reason: "Sale return",
            note: `Returned sale ${existingSale.invoiceNumber}`
          }
        });
      }

      const originalPayments = existingSale.payments?.length
        ? existingSale.payments
        : [{ paymentMethod: existingSale.paymentMethod, amount: existingSale.finalAmount }];
      const creditRefund = Number(originalPayments.filter((payment) => payment.paymentMethod === "CREDIT").reduce((sum, payment) => sum + Number(payment.amount || 0), 0).toFixed(2));

      if (creditRefund > 0 && existingSale.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: existingSale.customerId } });
        if (customer) {
          const balanceAfter = Number((customer.accountBalance - creditRefund).toFixed(2));
          await tx.customer.update({ where: { id: customer.id }, data: { accountBalance: balanceAfter } });
          await tx.customerAccountTransaction.create({
            data: {
              customerId: customer.id,
              userId: req.user.id,
              saleId: existingSale.id,
              type: "SALE_RETURN",
              amount: -creditRefund,
              balanceAfter,
              note: `Returned credit sale ${existingSale.invoiceNumber}`
            }
          });
        }
      }

      for (const payment of originalPayments.filter((entry) => entry.paymentMethod !== "CREDIT")) {
        await recordTreasuryTransaction(tx, {
          type: "SALE_RETURN",
          direction: "OUT",
          amount: payment.amount,
          accountingAccountId: req.body.accountingAccountId,
          treasuryAccountId: req.body.treasuryAccountId,
          paymentMethod: payment.paymentMethod,
          note: `مرتجع فاتورة بيع ${existingSale.invoiceNumber}`,
          referenceType: "SALE",
          referenceId: existingSale.id,
          referenceNumber: existingSale.invoiceNumber,
          userId: req.user.id,
          cashierShiftId: existingSale.cashierShiftId || null
        });
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: "RETURNED",
          refundedAmount: existingSale.finalAmount,
          returnedAt: new Date()
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
          customer: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { id: "asc" } },
          cashierShift: { select: { id: true, status: true, openedAt: true, closedAt: true } },
          items: {
            include: {
              medicine: { select: { id: true, name: true, nameAr: true, nameEn: true, itemType: true, packageNameAr: true, packageNameEn: true, pieceNameAr: true, pieceNameEn: true, batchNumber: true, barcode: true, stripsPerBox: true, pillsPerStrip: true } },
              allocations: {
                include: {
                  medicineBox: { select: { id: true, boxCode: true, batchNumber: true, expiryDate: true } }
                }
              }
            }
          }
        }
      });
    });

    res.json({
      success: true,
      message: "Sale returned successfully",
      data: sale
    });
  } catch (error) {
    if (["NOT_FOUND", "ALREADY_RETURNED"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
