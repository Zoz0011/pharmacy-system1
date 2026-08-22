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
    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const counterpartyType = String(req.body.counterpartyType || (customerId ? "CUSTOMER" : "CASH")).toUpperCase();
    const discount = Number(req.body.discount || 0);
    const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();

    if (!items.length) {
      return res.status(400).json({ success: false, message: "At least one sale item is required" });
    }
    if (!Number.isFinite(discount) || discount < 0) {
      return res.status(400).json({ success: false, message: "Discount must be zero or more" });
    }
    if (!["CASH", "CARD", "TRANSFER", "CREDIT"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Unsupported payment method" });
    }
    if (!["CASH", "CUSTOMER", "SUPPLIER", "BOTH"].includes(counterpartyType)) {
      return res.status(400).json({ success: false, message: "Unsupported counterparty type" });
    }
    if (counterpartyType === "CUSTOMER" && !customerId) return res.status(400).json({ success: false, message: "Choose a customer" });
    if (counterpartyType === "SUPPLIER" && !supplierId) return res.status(400).json({ success: false, message: "Choose a supplier" });
    if (counterpartyType === "BOTH" && (!customerId || !supplierId)) return res.status(400).json({ success: false, message: "Choose a linked customer and supplier account" });
    if (paymentMethod === "CREDIT" && !customerId) {
      return res.status(400).json({ success: false, message: "Credit sales require a customer" });
    }

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
      if (counterpartyType === "BOTH" && accountSupplier.linkedCustomerId !== customerId) {
        throw Object.assign(new Error("Customer and supplier accounts are not linked"), { code: "COUNTERPARTY_MISMATCH" });
      }
      if (paymentMethod === "CREDIT") {
        const nextBalance = Number((accountCustomer.accountBalance + finalAmount).toFixed(2));
        if (accountCustomer.creditLimit > 0 && nextBalance > accountCustomer.creditLimit) {
          throw Object.assign(new Error("Customer credit limit would be exceeded"), { code: "CREDIT_LIMIT" });
        }
      }

      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber: buildInvoiceNumber(),
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

      if (paymentMethod === "CREDIT") {
        const balanceAfter = Number((accountCustomer.accountBalance + finalAmount).toFixed(2));
        await tx.customer.update({ where: { id: customerId }, data: { accountBalance: balanceAfter } });
        await tx.customerAccountTransaction.create({
          data: {
            customerId,
            userId: req.user.id,
            saleId: createdSale.id,
            type: "CREDIT_SALE",
            amount: finalAmount,
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

      if (paymentMethod !== "CREDIT") {
        await recordTreasuryTransaction(tx, {
          type: "SALE",
          direction: "IN",
          amount: finalAmount,
          paymentMethod,
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
    if (["INVALID_ITEM", "INVALID_SALE_UNIT", "MEDICINE_NOT_FOUND", "INSUFFICIENT_STOCK", "INSUFFICIENT_BOXES", "INSUFFICIENT_STRIPS", "INSUFFICIENT_PILLS", "SHIFT_REQUIRED", "CUSTOMER_NOT_FOUND", "SUPPLIER_NOT_FOUND", "COUNTERPARTY_MISMATCH", "CREDIT_LIMIT"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createFreeReturn = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
    if (!items.length) return res.status(400).json({ success: false, message: "At least one returned item is required" });
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Unsupported refund method" });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const openShift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (!openShift) throw Object.assign(new Error("Open a cashier shift before recording a free return"), { code: "SHIFT_REQUIRED" });
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
        const unitPrice = resolveSaleUnitPrice(medicine, saleUnit);
        const totalPrice = Number((unitPrice * quantity).toFixed(2));
        refundAmount += totalPrice;
        prepared.push({ medicine, quantity, saleUnit, baseUnits, unitPrice, totalPrice });
      }

      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber: `FR-${Date.now()}`,
          totalAmount: Number(refundAmount.toFixed(2)),
          discount: 0,
          finalAmount: Number(refundAmount.toFixed(2)),
          refundedAmount: Number(refundAmount.toFixed(2)),
          status: "RETURNED",
          paymentMethod,
          userId: req.user.id,
          cashierShiftId: openShift.id,
          returnedAt: new Date()
        }
      });

      for (const item of prepared) {
        await restoreFreeReturnStock(tx, item.medicine, item.baseUnits);
        const updated = await tx.medicine.update({ where: { id: item.medicine.id }, data: { quantity: { increment: item.baseUnits } } });
        await tx.saleItem.create({ data: { saleId: createdSale.id, medicineId: item.medicine.id, quantity: item.quantity, saleUnit: item.saleUnit, baseUnits: item.baseUnits, unitPrice: item.unitPrice, totalPrice: item.totalPrice } });
        await tx.stockMovement.create({ data: { medicineId: item.medicine.id, userId: req.user.id, type: "FREE_SALE_RETURN", quantityChange: item.baseUnits, quantityAfter: updated.quantity, reason: "Free sale return", note: `Free return ${createdSale.invoiceNumber}` } });
      }

      await recordTreasuryTransaction(tx, { type: "FREE_SALE_RETURN", direction: "OUT", amount: refundAmount, paymentMethod, note: `مرتجع مبيعات حر ${createdSale.invoiceNumber}`, referenceType: "SALE", referenceId: createdSale.id, referenceNumber: createdSale.invoiceNumber, userId: req.user.id, cashierShiftId: openShift.id });
      return tx.sale.findUnique({ where: { id: createdSale.id }, include: { items: { include: { medicine: true } }, user: true, cashierShift: true } });
    });
    res.status(201).json({ success: true, message: "Free sale return recorded", data: sale });
  } catch (error) {
    if (["SHIFT_REQUIRED", "INVALID_ITEM", "MEDICINE_NOT_FOUND"].includes(error.code)) return res.status(400).json({ success: false, message: error.message });
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

      if (existingSale.paymentMethod === "CREDIT" && existingSale.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: existingSale.customerId } });
        if (customer) {
          const balanceAfter = Number((customer.accountBalance - existingSale.finalAmount).toFixed(2));
          await tx.customer.update({ where: { id: customer.id }, data: { accountBalance: balanceAfter } });
          await tx.customerAccountTransaction.create({
            data: {
              customerId: customer.id,
              userId: req.user.id,
              saleId: existingSale.id,
              type: "SALE_RETURN",
              amount: -existingSale.finalAmount,
              balanceAfter,
              note: `Returned credit sale ${existingSale.invoiceNumber}`
            }
          });
        }
      }

      if (existingSale.paymentMethod !== "CREDIT") {
        await recordTreasuryTransaction(tx, {
          type: "SALE_RETURN",
          direction: "OUT",
          amount: existingSale.finalAmount,
          paymentMethod: existingSale.paymentMethod,
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
