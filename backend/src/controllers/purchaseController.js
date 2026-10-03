const prisma = require("../config/prisma");
const { recordTreasuryTransaction } = require("../services/treasuryService");
const {
  parseInteger,
  parseNumber,
  isFractionalMedicine,
  getBaseUnitsPerBox,
  deductFromBoxes,
  createMedicineBoxes,
  convertInputQuantityToBaseUnits
} = require("../utils/packaging");

function buildPurchaseInvoiceNumber() {
  return `PI-${Date.now()}`;
}

function normalizeInvoiceNumber(value) {
  const trimmed = String(value || "").trim();
  return trimmed || buildPurchaseInvoiceNumber();
}

async function createStockMovement(client, payload) {
  return client.stockMovement.create({
    data: {
      medicineId: payload.medicineId,
      userId: payload.userId || null,
      type: payload.type,
      quantityChange: payload.quantityChange,
      quantityAfter: payload.quantityAfter,
      reason: payload.reason || null,
      note: payload.note || null
    }
  });
}

function normalizePurchaseItem(raw = {}) {
  return {
    name: String(raw.name || "").trim(),
    barcode: raw.barcode ? String(raw.barcode).trim() : null,
    category: raw.category ? String(raw.category).trim() : null,
    manufacturer: raw.manufacturer ? String(raw.manufacturer).trim() : null,
    description: raw.description ? String(raw.description).trim() : null,
    purchasePrice: parseNumber(raw.purchasePrice),
    sellingPrice: parseNumber(raw.sellingPrice),
    stripSellingPrice: raw.stripSellingPrice === "" || raw.stripSellingPrice === undefined ? null : parseNumber(raw.stripSellingPrice),
    pillSellingPrice: raw.pillSellingPrice === "" || raw.pillSellingPrice === undefined ? null : parseNumber(raw.pillSellingPrice),
    stripsPerBox: Math.max(1, parseInteger(raw.stripsPerBox, 1)),
    pillsPerStrip: Math.max(1, parseInteger(raw.pillsPerStrip, 1)),
    quantity: Math.max(0, parseInteger(raw.quantity, 0)),
    baseUnits: Math.max(0, convertInputQuantityToBaseUnits(raw)),
    minStock: Math.max(1, parseInteger(raw.minStock, 5)),
    expiryDate: raw.expiryDate ? new Date(raw.expiryDate) : null,
    batchNumber: raw.batchNumber ? String(raw.batchNumber).trim() : null,
    supplierId: raw.supplierId ? Number(raw.supplierId) : null
  };
}

function purchaseReturnMetrics(medicine, saleUnit, quantity) {
  const unit = String(saleUnit || "BOX").toUpperCase();
  const strips = Math.max(1, Number(medicine.stripsPerBox || 1));
  const pills = Math.max(1, Number(medicine.pillsPerStrip || 1));
  if (unit === "PILL") return { baseUnits: quantity, unitPrice: Number(medicine.purchasePrice || 0) / (strips * pills) };
  if (unit === "STRIP") return { baseUnits: quantity * pills, unitPrice: Number(medicine.purchasePrice || 0) / strips };
  return { baseUnits: isFractionalMedicine(medicine) ? quantity * getBaseUnitsPerBox(medicine) : quantity, unitPrice: Number(medicine.purchasePrice || 0) };
}

exports.getPurchaseInvoices = async (req, res) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true, barcode: true } },
            medicineBoxes: { select: { id: true, boxCode: true, status: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getPurchaseInvoiceById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            medicine: true,
            medicineBoxes: true
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getPurchaseInvoiceByNumber = async (req, res) => {
  try {
    const invoiceNumber = String(req.params.invoiceNumber || "").trim();
    if (!invoiceNumber) {
      return res.status(400).json({ success: false, message: "Invoice number is required" });
    }

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { invoiceNumber },
      include: {
        supplier: true,
        items: {
          include: {
            medicine: true,
            medicineBoxes: true
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createPurchaseInvoice = async (req, res) => {
  try {
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentStatus = String(req.body.paymentStatus || "PENDING").toUpperCase();
    const notes = req.body.notes || null;
    const invoiceNumber = normalizeInvoiceNumber(req.body.invoiceNumber);

    if (!rawItems.length) {
      return res.status(400).json({ success: false, message: "Invoice items are required" });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierId,
          totalAmount: 0,
          paymentStatus,
          status: "COMPLETED",
          notes
        }
      });

      let totalAmount = 0;

      for (const rawItem of rawItems) {
        const item = normalizePurchaseItem(rawItem);
        if (!item.name || rawItem.purchasePrice === undefined || rawItem.sellingPrice === undefined) {
          throw Object.assign(new Error("Each invoice item needs name, purchasePrice and sellingPrice"), { code: "INVALID_ITEM" });
        }

        let medicine = item.barcode ? await tx.medicine.findFirst({ where: { barcode: item.barcode } }) : null;
        if (!medicine) {
          medicine = await tx.medicine.findFirst({ where: { name: item.name } });
        }

        if (medicine) {
          medicine = await tx.medicine.update({
            where: { id: medicine.id },
            data: {
              name: item.name,
              barcode: item.barcode || medicine.barcode,
              category: item.category ?? medicine.category,
              manufacturer: item.manufacturer ?? medicine.manufacturer,
              description: item.description ?? medicine.description,
              purchasePrice: item.purchasePrice,
              sellingPrice: item.sellingPrice,
              stripSellingPrice: item.stripSellingPrice,
              pillSellingPrice: item.pillSellingPrice,
              stripsPerBox: item.stripsPerBox,
              pillsPerStrip: item.pillsPerStrip,
              // فاتورة المورد تضيف إلى الرصيد الحالي ولا تستبدله بالكمية الواردة.
              quantity: { increment: item.baseUnits },
              minStock: item.minStock,
              expiryDate: item.expiryDate || medicine.expiryDate,
              batchNumber: item.batchNumber ?? medicine.batchNumber,
              supplierId: supplierId ?? item.supplierId ?? medicine.supplierId
            }
          });
        } else {
          medicine = await tx.medicine.create({
            data: {
              name: item.name,
              barcode: item.barcode,
              category: item.category,
              manufacturer: item.manufacturer,
              description: item.description,
              purchasePrice: item.purchasePrice,
              sellingPrice: item.sellingPrice,
              stripSellingPrice: item.stripSellingPrice,
              pillSellingPrice: item.pillSellingPrice,
              stripsPerBox: item.stripsPerBox,
              pillsPerStrip: item.pillsPerStrip,
              quantity: item.baseUnits,
              minStock: item.minStock,
              expiryDate: item.expiryDate,
              batchNumber: item.batchNumber,
              supplierId: supplierId ?? item.supplierId
            }
          });
        }

        const totalPrice = Number((item.quantity * item.purchasePrice).toFixed(2));
        totalAmount += totalPrice;

        const createdItem = await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: createdInvoice.id,
            medicineId: medicine.id,
            quantity: item.quantity,
            baseUnits: item.baseUnits,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice,
            totalPrice
          }
        });

        if (isFractionalMedicine(item) && item.quantity > 0) {
          await createMedicineBoxes(tx, {
            medicineId: medicine.id,
            purchaseInvoiceItemId: createdItem.id,
            boxesCount: item.quantity,
            stripsPerBox: item.stripsPerBox,
            pillsPerStrip: item.pillsPerStrip,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate
          });
        }

        await createStockMovement(tx, {
          medicineId: medicine.id,
          userId: req.user?.id,
          type: "PURCHASE",
          quantityChange: item.baseUnits,
          quantityAfter: medicine.quantity,
          reason: "Purchase invoice",
          note: isFractionalMedicine(item)
            ? `${item.quantity} boxes entered in invoice ${createdInvoice.invoiceNumber}`
            : `Supplier invoice ${createdInvoice.invoiceNumber}`
        });
      }

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: createdInvoice.id },
        data: { totalAmount: Number(totalAmount.toFixed(2)) },
        include: {
          supplier: true,
          items: {
            include: {
              medicine: true,
              medicineBoxes: true
            }
          }
        }
      });
      if (paymentStatus === "PAID" && updatedInvoice.totalAmount > 0) {
        await recordTreasuryTransaction(tx, {
          type: "PURCHASE",
          direction: "OUT",
          amount: updatedInvoice.totalAmount,
          accountingAccountId: req.body.accountingAccountId,
          treasuryAccountId: req.body.treasuryAccountId,
          paymentMethod: String(req.body.paymentMethod || "CASH"),
          note: `سداد فاتورة مشتريات ${updatedInvoice.invoiceNumber}`,
          referenceType: "PURCHASE",
          referenceId: updatedInvoice.id,
          referenceNumber: updatedInvoice.invoiceNumber,
          userId: req.user?.id || null
        });
      }
      return updatedInvoice;
    });

    res.status(201).json({
      success: true,
      message: "Purchase invoice applied and stock updated",
      data: invoice
    });
  } catch (error) {
    if (error.code === "INVALID_ITEM") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.code === "P2002") {
      return res.status(400).json({ success: false, message: "Invoice number or one of the barcodes already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updatePurchaseInvoice = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoiceNumber = String(req.body.invoiceNumber || "").trim();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!id || !invoiceNumber) return res.status(400).json({ success: false, message: "Invoice number is required" });
    if (!rawItems.length) return res.status(400).json({ success: false, message: "Invoice items are required" });

    const invoice = await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: { items: { include: { medicine: true, medicineBoxes: true } } }
      });
      if (!current) throw Object.assign(new Error("Purchase invoice not found"), { code: "NOT_FOUND" });
      if (current.status === "RETURNED") throw Object.assign(new Error("Returned purchase invoices cannot be edited"), { code: "RETURNED_INVOICE" });

      const requestedIds = rawItems.map((row) => Number(row.id));
      if (requestedIds.some((itemId) => !itemId) || requestedIds.length !== current.items.length || current.items.some((item) => !requestedIds.includes(item.id))) {
        throw Object.assign(new Error("The invoice item list cannot be replaced during editing"), { code: "INVALID_ITEM" });
      }

      let totalAmount = 0;
      for (const raw of rawItems) {
        const item = current.items.find((row) => row.id === Number(raw.id));
        const quantity = Number(raw.quantity);
        const purchasePrice = Number(raw.purchasePrice);
        const sellingPrice = Number(raw.sellingPrice);
        if (!item || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
          throw Object.assign(new Error("Each item needs a positive whole quantity and valid prices"), { code: "INVALID_ITEM" });
        }

        const liveMedicine = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        if (!liveMedicine) throw Object.assign(new Error("Medicine not found"), { code: "INVALID_ITEM" });
        const unitsPerBox = isFractionalMedicine(liveMedicine) ? getBaseUnitsPerBox(liveMedicine) : 1;
        const nextBaseUnits = quantity * unitsPerBox;
        const previousBaseUnits = Number(item.baseUnits || item.quantity * unitsPerBox);
        const baseUnitDelta = nextBaseUnits - previousBaseUnits;
        const quantityDelta = quantity - Number(item.quantity || 0);

        if (baseUnitDelta < 0 && Number(liveMedicine.quantity || 0) < Math.abs(baseUnitDelta)) {
          throw Object.assign(new Error(`Cannot reduce ${liveMedicine.name}; part of this purchase has already left stock`), { code: "INVALID_STOCK" });
        }

        if (isFractionalMedicine(liveMedicine) && quantityDelta < 0) {
          const removableBoxes = item.medicineBoxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
          if (removableBoxes.length < Math.abs(quantityDelta)) {
            throw Object.assign(new Error(`Cannot reduce ${liveMedicine.name}; some boxes are already opened`), { code: "INVALID_STOCK" });
          }
          await tx.medicineBox.deleteMany({ where: { id: { in: removableBoxes.slice(0, Math.abs(quantityDelta)).map((box) => box.id) } } });
        }

        const updatedMedicine = await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            // تعديل الفاتورة يطبق فرق الكمية فقط ويحافظ على كل الرصيد السابق.
            quantity: { increment: baseUnitDelta },
            purchasePrice,
            sellingPrice
          }
        });

        if (isFractionalMedicine(liveMedicine) && quantityDelta > 0) {
          await createMedicineBoxes(tx, {
            medicineId: item.medicineId,
            purchaseInvoiceItemId: item.id,
            boxesCount: quantityDelta,
            stripsPerBox: liveMedicine.stripsPerBox,
            pillsPerStrip: liveMedicine.pillsPerStrip,
            batchNumber: liveMedicine.batchNumber,
            expiryDate: liveMedicine.expiryDate
          });
        }

        if (baseUnitDelta !== 0) {
          await createStockMovement(tx, {
            medicineId: item.medicineId,
            userId: req.user?.id,
            type: "PURCHASE_EDIT",
            quantityChange: baseUnitDelta,
            quantityAfter: updatedMedicine.quantity,
            reason: "Purchase invoice edited",
            note: `Edited purchase invoice ${invoiceNumber}`
          });
        }

        const totalPrice = Number((quantity * purchasePrice).toFixed(2));
        totalAmount += totalPrice;
        await tx.purchaseInvoiceItem.update({
          where: { id: item.id },
          data: { quantity, baseUnits: nextBaseUnits, purchasePrice, sellingPrice, totalPrice }
        });
      }

      const roundedTotal = Number(totalAmount.toFixed(2));
      const totalDelta = Number((roundedTotal - Number(current.totalAmount || 0)).toFixed(2));
      await tx.treasuryTransaction.updateMany({
        where: { referenceType: "PURCHASE", referenceId: id },
        data: { referenceNumber: invoiceNumber }
      });
      if (current.paymentStatus === "PAID" && totalDelta !== 0) {
        const originalPayment = await tx.treasuryTransaction.findFirst({
          where: { referenceType: "PURCHASE", referenceId: id, type: "PURCHASE" },
          orderBy: { createdAt: "desc" }
        });
        await recordTreasuryTransaction(tx, {
          type: "PURCHASE_EDIT",
          direction: totalDelta > 0 ? "OUT" : "IN",
          amount: Math.abs(totalDelta),
          treasuryAccountId: originalPayment?.treasuryAccountId,
          paymentMethod: originalPayment?.paymentMethod || "CASH",
          note: `تسوية تعديل فاتورة مشتريات ${invoiceNumber}`,
          referenceType: "PURCHASE",
          referenceId: id,
          referenceNumber: invoiceNumber,
          userId: req.user?.id || null
        });
      }

      return tx.purchaseInvoice.update({
        where: { id },
        data: { invoiceNumber, notes: String(req.body.notes || "").trim() || null, totalAmount: roundedTotal },
        include: { supplier: true, items: { include: { medicine: true, medicineBoxes: true } } }
      });
    });

    res.json({ success: true, message: "Purchase invoice updated", data: invoice });
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ success: false, message: "Invoice number already exists" });
    if (["NOT_FOUND", "RETURNED_INVOICE", "INVALID_ITEM", "INVALID_STOCK"].includes(error.code)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to update purchase invoice", error: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const paymentStatus = String(req.body.paymentStatus || "").toUpperCase();

    if (!["PENDING", "PARTIAL", "PAID"].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status" });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!current) throw Object.assign(new Error("Purchase invoice not found"), { code: "NOT_FOUND" });
      const updated = await tx.purchaseInvoice.update({ where: { id }, data: { paymentStatus } });
      if (current.paymentStatus !== "PAID" && paymentStatus === "PAID" && updated.totalAmount > 0) {
        await recordTreasuryTransaction(tx, {
          type: "PURCHASE",
          direction: "OUT",
          amount: updated.totalAmount,
          accountingAccountId: req.body.accountingAccountId,
          treasuryAccountId: req.body.treasuryAccountId,
          paymentMethod: String(req.body.paymentMethod || "CASH"),
          note: `سداد فاتورة مشتريات ${updated.invoiceNumber}`,
          referenceType: "PURCHASE",
          referenceId: updated.id,
          referenceNumber: updated.invoiceNumber,
          userId: req.user?.id || null
        });
      }
      return updated;
    });

    res.json({ success: true, message: "Payment status updated", data: invoice });
  } catch (error) {
    if (error.code === "P2025" || error.code === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createFreePurchaseReturn = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
    if (!items.length) return res.status(400).json({ success: false, message: "At least one returned item is required" });
    if (!["CASH", "CARD", "TRANSFER"].includes(paymentMethod)) return res.status(400).json({ success: false, message: "Unsupported payment method" });

    const invoice = await prisma.$transaction(async (tx) => {
      const openShift = await tx.cashierShift.findFirst({ where: { userId: req.user.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (!openShift) throw Object.assign(new Error("Open a cashier shift before recording a free purchase return"), { code: "SHIFT_REQUIRED" });
      if (supplierId && !(await tx.supplier.findUnique({ where: { id: supplierId } }))) throw Object.assign(new Error("Supplier not found"), { code: "NOT_FOUND" });

      const prepared = [];
      let totalAmount = 0;
      for (const raw of items) {
        const medicineId = Number(raw.medicineId);
        const quantity = Number(raw.quantity);
        const saleUnit = String(raw.saleUnit || "BOX").toUpperCase();
        if (!medicineId || !Number.isInteger(quantity) || quantity <= 0 || !["BOX", "STRIP", "PILL"].includes(saleUnit)) throw Object.assign(new Error("Each returned item needs medicine, unit, and positive quantity"), { code: "INVALID_ITEM" });
        const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
        if (!medicine) throw Object.assign(new Error("Medicine not found"), { code: "MEDICINE_NOT_FOUND" });
        if (!isFractionalMedicine(medicine) && saleUnit !== "BOX") throw Object.assign(new Error(`${medicine.name} only supports unit returns`), { code: "INVALID_ITEM" });
        const metrics = purchaseReturnMetrics(medicine, saleUnit, quantity);
        if (medicine.quantity < metrics.baseUnits) throw Object.assign(new Error(`Insufficient stock for ${medicine.name}`), { code: "INVALID_RETURN" });
        const totalPrice = Number((metrics.unitPrice * quantity).toFixed(2));
        totalAmount += totalPrice;
        prepared.push({ medicine, quantity, saleUnit, ...metrics, totalPrice });
      }

      const created = await tx.purchaseInvoice.create({ data: { invoiceNumber: `PFR-${Date.now()}`, supplierId, totalAmount: Number(totalAmount.toFixed(2)), paymentStatus: "PAID", status: "RETURNED", notes: String(req.body.notes || "مرتجع مشتريات حر"), returnedAt: new Date() } });
      for (const item of prepared) {
        if (isFractionalMedicine(item.medicine)) await deductFromBoxes(tx, item.medicine, item.saleUnit, item.quantity);
        const updated = await tx.medicine.update({ where: { id: item.medicine.id }, data: { quantity: { decrement: item.baseUnits } } });
        await tx.purchaseInvoiceItem.create({ data: { purchaseInvoiceId: created.id, medicineId: item.medicine.id, quantity: item.quantity, baseUnits: item.baseUnits, purchasePrice: Number(item.unitPrice.toFixed(2)), sellingPrice: item.medicine.sellingPrice, totalPrice: item.totalPrice } });
        await createStockMovement(tx, { medicineId: item.medicine.id, userId: req.user?.id, type: "FREE_PURCHASE_RETURN", quantityChange: -item.baseUnits, quantityAfter: updated.quantity, reason: "Free purchase return", note: `Free purchase return ${created.invoiceNumber}` });
      }
      await recordTreasuryTransaction(tx, { type: "FREE_PURCHASE_RETURN", direction: "IN", amount: totalAmount, accountingAccountId: req.body.accountingAccountId, treasuryAccountId: req.body.treasuryAccountId, paymentMethod, note: `مرتجع مشتريات حر ${created.invoiceNumber}`, referenceType: "PURCHASE", referenceId: created.id, referenceNumber: created.invoiceNumber, userId: req.user?.id || null, cashierShiftId: openShift.id });
      return tx.purchaseInvoice.findUnique({ where: { id: created.id }, include: { supplier: true, items: { include: { medicine: true } } } });
    });
    res.status(201).json({ success: true, message: "Free purchase return recorded", data: invoice });
  } catch (error) {
    if (["SHIFT_REQUIRED", "NOT_FOUND", "INVALID_ITEM", "MEDICINE_NOT_FOUND", "INVALID_RETURN", "INSUFFICIENT_BOXES", "INSUFFICIENT_STRIPS", "INSUFFICIENT_PILLS"].includes(error.code)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to record free purchase return", error: error.message });
  }
};

exports.returnPurchaseInvoice = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const invoice = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              medicine: true,
              medicineBoxes: true
            }
          }
        }
      });

      if (!existingInvoice) {
        throw Object.assign(new Error("Purchase invoice not found"), { code: "NOT_FOUND" });
      }

      if (existingInvoice.status === "RETURNED") {
        throw Object.assign(new Error("Purchase invoice already returned"), { code: "ALREADY_RETURNED" });
      }

      for (const item of existingInvoice.items) {
        const medicine = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        if (!medicine) {
          throw Object.assign(new Error("Medicine not found during purchase return"), { code: "MEDICINE_NOT_FOUND" });
        }

        if (medicine.quantity < item.baseUnits) {
          throw Object.assign(new Error(`Cannot return purchase for ${medicine.name}; stock is lower than purchased quantity`), { code: "INVALID_RETURN" });
        }

        if (item.medicineBoxes.length) {
          const removableBoxes = item.medicineBoxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
          if (removableBoxes.length < item.quantity) {
            throw Object.assign(new Error(`Cannot return purchase for ${medicine.name}; some boxes from this invoice are already opened`), { code: "PARTIAL_BOX_RETURN" });
          }

          await tx.medicineBox.deleteMany({
            where: { id: { in: removableBoxes.slice(0, item.quantity).map((box) => box.id) } }
          });
        }

        const updatedMedicine = await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            quantity: medicine.quantity - item.baseUnits
          }
        });

        await createStockMovement(tx, {
          medicineId: item.medicineId,
          userId: req.user?.id,
          type: "PURCHASE_RETURN",
          quantityChange: -item.baseUnits,
          quantityAfter: updatedMedicine.quantity,
          reason: "Purchase return",
          note: `Returned purchase invoice ${existingInvoice.invoiceNumber}`
        });
      }

      if (existingInvoice.paymentStatus === "PAID" && existingInvoice.totalAmount > 0) {
        await recordTreasuryTransaction(tx, {
          type: "PURCHASE_RETURN",
          direction: "IN",
          amount: existingInvoice.totalAmount,
          accountingAccountId: req.body.accountingAccountId,
          treasuryAccountId: req.body.treasuryAccountId,
          paymentMethod: String(req.body.paymentMethod || "CASH"),
          note: `مرتجع فاتورة مشتريات ${existingInvoice.invoiceNumber}`,
          referenceType: "PURCHASE",
          referenceId: existingInvoice.id,
          referenceNumber: existingInvoice.invoiceNumber,
          userId: req.user?.id || null
        });
      }

      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          status: "RETURNED",
          returnedAt: new Date()
        },
        include: {
          supplier: true,
          items: {
            include: {
              medicine: true,
              medicineBoxes: true
            }
          }
        }
      });
    });

    res.json({ success: true, message: "Purchase invoice returned successfully", data: invoice });
  } catch (error) {
    if (["NOT_FOUND", "ALREADY_RETURNED", "MEDICINE_NOT_FOUND", "INVALID_RETURN", "PARTIAL_BOX_RETURN"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
