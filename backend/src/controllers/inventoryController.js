const prisma = require("../config/prisma");
const { isFractionalMedicine, getBaseUnitsPerBox, createMedicineBoxes } = require("../utils/packaging");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function buildInventorySnapshot() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAhead = new Date(now);
  thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

  const medicines = await prisma.medicine.findMany({
    include: { supplier: true },
    orderBy: [{ quantity: "asc" }, { expiryDate: "asc" }]
  });

  const lowStock = medicines.filter((medicine) => medicine.quantity <= medicine.minStock);
  const expired = medicines.filter((medicine) => medicine.expiryDate && new Date(medicine.expiryDate) < todayStart);
  const expiringSoon = medicines.filter((medicine) => {
    if (!medicine.expiryDate) return false;
    const expiryDate = new Date(medicine.expiryDate);
    return expiryDate >= todayStart && expiryDate <= thirtyDaysAhead;
  });

  return {
    generatedAt: now,
    totalMedicines: medicines.length,
    totalQuantity: medicines.reduce((sum, medicine) => sum + medicine.quantity, 0),
    lowStockCount: lowStock.length,
    expiredCount: expired.length,
    expiringSoonCount: expiringSoon.length,
    lowStock,
    expired,
    expiringSoon,
    medicines
  };
}

function buildInventoryWorkbook(report) {
  const summaryRows = [
    ["Generated At", report.generatedAt.toISOString()],
    ["Total Medicines", report.totalMedicines],
    ["Total Quantity", report.totalQuantity],
    ["Low Stock Count", report.lowStockCount],
    ["Expired Count", report.expiredCount],
    ["Expiring Soon Count", report.expiringSoonCount]
  ];

  const medicineRows = report.medicines.map((medicine) => [
    medicine.name,
    medicine.barcode || "",
    medicine.category || "",
    medicine.manufacturer || "",
    medicine.quantity,
    medicine.minStock,
    medicine.expiryDate ? new Date(medicine.expiryDate).toISOString().slice(0, 10) : "",
    medicine.batchNumber || "",
    medicine.supplier?.name || ""
  ]);

  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Worksheet ss:Name="Inventory Report"><Table>',
    '<Row><Cell><Data ss:Type="String">Metric</Data></Cell><Cell><Data ss:Type="String">Value</Data></Cell></Row>',
    ...summaryRows.map(
      (row) =>
        `<Row><Cell><Data ss:Type="String">${escapeXml(row[0])}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(row[1])}</Data></Cell></Row>`
    ),
    '<Row></Row>',
    '<Row>'
      + '<Cell><Data ss:Type="String">Name</Data></Cell>'
      + '<Cell><Data ss:Type="String">Barcode</Data></Cell>'
      + '<Cell><Data ss:Type="String">Category</Data></Cell>'
      + '<Cell><Data ss:Type="String">Manufacturer</Data></Cell>'
      + '<Cell><Data ss:Type="String">Quantity</Data></Cell>'
      + '<Cell><Data ss:Type="String">Min Stock</Data></Cell>'
      + '<Cell><Data ss:Type="String">Expiry Date</Data></Cell>'
      + '<Cell><Data ss:Type="String">Batch</Data></Cell>'
      + '<Cell><Data ss:Type="String">Supplier</Data></Cell>'
      + '</Row>',
    ...medicineRows.map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
          .join("")}</Row>`
    ),
    "</Table></Worksheet></Workbook>"
  ].join("");
}

exports.getOverview = async (req, res) => {
  try {
    const snapshot = await buildInventorySnapshot();

    res.json({
      success: true,
      data: {
        totalMedicines: snapshot.totalMedicines,
        totalQuantity: snapshot.totalQuantity,
        lowStockCount: snapshot.lowStockCount,
        expiredCount: snapshot.expiredCount,
        expiringSoonCount: snapshot.expiringSoonCount,
        lowStock: snapshot.lowStock,
        expired: snapshot.expired,
        expiringSoon: snapshot.expiringSoon
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getExpired = async (req, res) => {
  try {
    const snapshot = await buildInventorySnapshot();
    res.json({ success: true, data: snapshot.expired });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getMovements = async (req, res) => {
  try {
    const medicineId = req.query.medicineId ? Number(req.query.medicineId) : null;
    const type = req.query.type ? String(req.query.type).trim() : "";
    const take = Math.min(300, Math.max(1, Number(req.query.limit || 100)));

    const where = {
      ...(medicineId ? { medicineId } : {}),
      ...(type ? { type } : {})
    };

    const movements = await prisma.stockMovement.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        medicine: { select: { id: true, name: true, barcode: true } },
        user: { select: { id: true, name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take
    });

    res.json({ success: true, data: movements });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getInventoryReport = async (req, res) => {
  try {
    const snapshot = await buildInventorySnapshot();
    const recentMovements = await prisma.stockMovement.findMany({
      include: {
        medicine: { select: { id: true, name: true, barcode: true } },
        user: { select: { id: true, name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    res.json({
      success: true,
      data: {
        generatedAt: snapshot.generatedAt,
        summary: {
          totalMedicines: snapshot.totalMedicines,
          totalQuantity: snapshot.totalQuantity,
          lowStockCount: snapshot.lowStockCount,
          expiredCount: snapshot.expiredCount,
          expiringSoonCount: snapshot.expiringSoonCount
        },
        lowStock: snapshot.lowStock,
        expired: snapshot.expired,
        expiringSoon: snapshot.expiringSoon,
        medicines: snapshot.medicines,
        recentMovements
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.exportInventoryReport = async (req, res) => {
  try {
    const snapshot = await buildInventorySnapshot();
    const workbook = buildInventoryWorkbook(snapshot);

    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-report.xls"');
    res.send(workbook);
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const medicineId = Number(req.body.medicineId);
    const quantityChange = Number(req.body.quantityChange);
    const reason = req.body.reason || "Manual adjustment";
    const note = req.body.note || null;

    if (!medicineId || !quantityChange) {
      return res.status(400).json({ success: false, message: "medicineId and quantityChange are required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
      if (!medicine) {
        throw Object.assign(new Error("Medicine not found"), { code: "NOT_FOUND" });
      }

      if (isFractionalMedicine(medicine)) {
        const boxUnits = getBaseUnitsPerBox(medicine);
        if (Math.abs(quantityChange) % boxUnits !== 0) {
          throw Object.assign(new Error("Packaged medicines can only be manually adjusted in full-box counts"), {
            code: "INVALID_PACKAGED_ADJUSTMENT"
          });
        }

        const boxesCount = Math.abs(quantityChange) / boxUnits;
        if (quantityChange > 0) {
          await createMedicineBoxes(tx, {
            medicineId,
            boxesCount,
            stripsPerBox: medicine.stripsPerBox,
            pillsPerStrip: medicine.pillsPerStrip,
            batchNumber: medicine.batchNumber,
            expiryDate: medicine.expiryDate
          });
        } else {
          const openBoxes = await tx.medicineBox.findMany({
            where: { medicineId, status: "OPEN" },
            orderBy: { createdAt: "asc" }
          });
          const removableBoxes = openBoxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
          if (removableBoxes.length < boxesCount) {
            throw Object.assign(new Error("Not enough full unopened boxes to reduce this packaged stock"), {
              code: "PARTIAL_BOXES_PRESENT"
            });
          }
          await tx.medicineBox.deleteMany({
            where: { id: { in: removableBoxes.slice(0, boxesCount).map((box) => box.id) } }
          });
        }
      }

      const nextQuantity = medicine.quantity + quantityChange;
      if (nextQuantity < 0) {
        throw Object.assign(new Error("Stock cannot go below zero"), { code: "INVALID_STOCK" });
      }

      const updated = await tx.medicine.update({
        where: { id: medicineId },
        data: { quantity: nextQuantity }
      });

      await tx.stockMovement.create({
        data: {
          medicineId,
          userId: req.user?.id || null,
          type: quantityChange > 0 ? "ADJUST_IN" : "ADJUST_OUT",
          quantityChange,
          quantityAfter: updated.quantity,
          reason,
          note
        }
      });

      return updated;
    });

    res.json({ success: true, message: "Stock adjusted successfully", data: result });
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.code === "INVALID_STOCK") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (["INVALID_PACKAGED_ADJUSTMENT", "PARTIAL_BOXES_PRESENT"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

function buildCountNumber() {
  return `STK-${Date.now()}`;
}

function countInclude() {
  return {
    createdBy: { select: { id: true, name: true, role: true } },
    items: {
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            barcode: true,
            quantity: true,
            stripsPerBox: true,
            pillsPerStrip: true,
            minStock: true
          }
        }
      },
      orderBy: { id: "desc" }
    }
  };
}

exports.getInventoryCounts = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toUpperCase();
    const counts = await prisma.inventoryCount.findMany({
      where: status ? { status } : undefined,
      include: countInclude(),
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, Number(req.query.limit || 30)))
    });
    res.json({ success: true, data: counts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load inventory counts" });
  }
};

exports.getInventoryCount = async (req, res) => {
  try {
    const count = await prisma.inventoryCount.findUnique({
      where: { id: Number(req.params.id) },
      include: countInclude()
    });
    if (!count) return res.status(404).json({ success: false, message: "Inventory count not found" });
    res.json({ success: true, data: count });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load inventory count" });
  }
};

exports.createInventoryCount = async (req, res) => {
  try {
    const medicineIds = Array.isArray(req.body.medicineIds)
      ? [...new Set(req.body.medicineIds.map(Number).filter(Boolean))]
      : [];
    const notes = String(req.body.notes || "").trim() || null;

    const medicines = medicineIds.length
      ? await prisma.medicine.findMany({ where: { id: { in: medicineIds } } })
      : [];

    const count = await prisma.inventoryCount.create({
      data: {
        countNumber: buildCountNumber(),
        notes,
        createdById: req.user.id,
        items: medicines.length
          ? {
              create: medicines.map((medicine) => ({
                medicineId: medicine.id,
                expectedQuantity: medicine.quantity
              }))
            }
          : undefined
      },
      include: countInclude()
    });

    res.status(201).json({ success: true, message: "Inventory count started", data: count });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to start inventory count" });
  }
};

exports.addInventoryCountItem = async (req, res) => {
  try {
    const inventoryCountId = Number(req.params.id);
    const medicineId = req.body.medicineId ? Number(req.body.medicineId) : null;
    const barcode = String(req.body.barcode || "").trim();
    const countedQuantity = Number(req.body.countedQuantity);

    if ((!medicineId && !barcode) || !Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return res.status(400).json({ success: false, message: "Medicine and a whole counted quantity are required" });
    }

    const count = await prisma.inventoryCount.findUnique({ where: { id: inventoryCountId } });
    if (!count) return res.status(404).json({ success: false, message: "Inventory count not found" });
    if (count.status !== "OPEN") return res.status(409).json({ success: false, message: "Inventory count is already completed" });

    const medicine = await prisma.medicine.findFirst({
      where: medicineId ? { id: medicineId } : { barcode }
    });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    const existingItem = await prisma.inventoryCountItem.findUnique({
      where: { inventoryCountId_medicineId: { inventoryCountId, medicineId: medicine.id } }
    });
    const expectedQuantity = existingItem?.expectedQuantity ?? medicine.quantity;

    const item = await prisma.inventoryCountItem.upsert({
      where: { inventoryCountId_medicineId: { inventoryCountId, medicineId: medicine.id } },
      update: {
        countedQuantity,
        difference: countedQuantity - expectedQuantity,
        note: String(req.body.note || "").trim() || null,
        countedAt: new Date()
      },
      create: {
        inventoryCountId,
        medicineId: medicine.id,
        expectedQuantity,
        countedQuantity,
        difference: countedQuantity - expectedQuantity,
        note: String(req.body.note || "").trim() || null,
        countedAt: new Date()
      },
      include: { medicine: true }
    });

    res.json({ success: true, message: "Counted item saved", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to save counted item" });
  }
};

exports.updateInventoryCountItem = async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const countedQuantity = Number(req.body.countedQuantity);
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return res.status(400).json({ success: false, message: "Counted quantity must be a whole number" });
    }

    const count = await prisma.inventoryCount.findUnique({ where: { id: Number(req.params.id) } });
    if (!count) return res.status(404).json({ success: false, message: "Inventory count not found" });

    const existing = await prisma.inventoryCountItem.findUnique({
      where: { id: itemId },
      include: { inventoryCount: true, medicine: true }
    });
    if (!existing || existing.inventoryCountId !== Number(req.params.id)) {
      return res.status(404).json({ success: false, message: "Counted item not found" });
    }
    if (existing.inventoryCount.status !== "OPEN") {
      return res.status(409).json({ success: false, message: "Inventory count is already completed" });
    }

    const item = await prisma.inventoryCountItem.update({
      where: { id: itemId },
      data: {
        countedQuantity,
        difference: countedQuantity - existing.expectedQuantity,
        note: req.body.note === undefined ? existing.note : String(req.body.note || "").trim() || null,
        countedAt: new Date()
      },
      include: { medicine: true }
    });
    res.json({ success: true, message: "Counted quantity updated", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update counted item" });
  }
};

async function syncPackagedStock(tx, medicine, difference) {
  if (!isFractionalMedicine(medicine) || difference === 0) return;
  const boxUnits = getBaseUnitsPerBox(medicine);
  if (Math.abs(difference) % boxUnits !== 0) {
    throw Object.assign(new Error(`${medicine.name}: packaged stock differences must equal whole boxes`), {
      code: "INVALID_PACKAGED_COUNT"
    });
  }

  const boxesCount = Math.abs(difference) / boxUnits;
  if (difference > 0) {
    await createMedicineBoxes(tx, {
      medicineId: medicine.id,
      boxesCount,
      stripsPerBox: medicine.stripsPerBox,
      pillsPerStrip: medicine.pillsPerStrip,
      batchNumber: medicine.batchNumber,
      expiryDate: medicine.expiryDate
    });
    return;
  }

  const openBoxes = await tx.medicineBox.findMany({
    where: { medicineId: medicine.id, status: "OPEN" },
    orderBy: { createdAt: "asc" }
  });
  const removable = openBoxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
  if (removable.length < boxesCount) {
    throw Object.assign(new Error(`${medicine.name}: not enough unopened boxes to apply this count`), {
      code: "PARTIAL_BOXES_PRESENT"
    });
  }
  await tx.medicineBox.deleteMany({ where: { id: { in: removable.slice(0, boxesCount).map((box) => box.id) } } });
}

exports.completeInventoryCount = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const completed = await prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({
        where: { id },
        include: { items: { include: { medicine: true } } }
      });
      if (!count) throw Object.assign(new Error("Inventory count not found"), { code: "NOT_FOUND" });
      if (count.status !== "OPEN") throw Object.assign(new Error("Inventory count is already completed"), { code: "ALREADY_COMPLETED" });

      const countedItems = count.items.filter((item) => item.countedQuantity !== null);
      if (!countedItems.length) throw Object.assign(new Error("Count at least one medicine before completing"), { code: "EMPTY_COUNT" });

      for (const item of countedItems) {
        const medicine = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        const difference = Number(item.countedQuantity) - Number(medicine.quantity);
        await syncPackagedStock(tx, medicine, difference);

        const updated = await tx.medicine.update({
          where: { id: medicine.id },
          data: { quantity: item.countedQuantity }
        });
        await tx.inventoryCountItem.update({
          where: { id: item.id },
          data: { difference, countedAt: item.countedAt || new Date() }
        });
        if (difference !== 0) {
          await tx.stockMovement.create({
            data: {
              medicineId: medicine.id,
              userId: req.user.id,
              type: "STOCKTAKE",
              quantityChange: difference,
              quantityAfter: updated.quantity,
              reason: `Inventory count ${count.countNumber}`,
              note: item.note || "Physical stock count adjustment"
            }
          });
        }
      }

      return tx.inventoryCount.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
        include: countInclude()
      });
    });

    res.json({ success: true, message: "Inventory count completed and stock updated", data: completed });
  } catch (error) {
    if (error.code === "NOT_FOUND") return res.status(404).json({ success: false, message: error.message });
    if (["ALREADY_COMPLETED", "EMPTY_COUNT", "INVALID_PACKAGED_COUNT", "PARTIAL_BOXES_PRESENT"].includes(error.code)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Failed to complete inventory count" });
  }
};
