function parseInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildBoxCode(medicineId) {
  return `BOX-${medicineId}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isFractionalMedicine(medicine) {
  return String(medicine?.itemType || "MEDICINE") === "PACK_PIECE"
    || Number(medicine?.stripsPerBox || 1) > 1
    || Number(medicine?.pillsPerStrip || 1) > 1;
}

function getBaseUnitsPerBox(medicine) {
  return Number(medicine?.stripsPerBox || 1) * Number(medicine?.pillsPerStrip || 1);
}

function getDerivedStripSellingPrice(medicine) {
  if (medicine.stripSellingPrice !== undefined && medicine.stripSellingPrice !== null) {
    return Number(medicine.stripSellingPrice);
  }
  const stripsPerBox = Number(medicine.stripsPerBox || 1);
  return Number((Number(medicine.sellingPrice || 0) / stripsPerBox).toFixed(2));
}

function getDerivedPillSellingPrice(medicine) {
  if (medicine.pillSellingPrice !== undefined && medicine.pillSellingPrice !== null) {
    return Number(medicine.pillSellingPrice);
  }
  const pillsPerStrip = Number(medicine.pillsPerStrip || 1);
  return Number((getDerivedStripSellingPrice(medicine) / pillsPerStrip).toFixed(2));
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calculateUnitMetrics(cost, price) {
  const normalizedCost = Number(cost || 0);
  const normalizedPrice = Number(price || 0);
  const profit = roundMoney(normalizedPrice - normalizedCost);
  const marginPercent = normalizedCost > 0
    ? roundMoney((profit / normalizedCost) * 100)
    : 0;

  return {
    cost: roundMoney(normalizedCost),
    price: roundMoney(normalizedPrice),
    profit,
    marginPercent
  };
}

function buildPricingSummary(medicine) {
  const purchasePrice = Number(medicine.purchasePrice || 0);
  const sellingPrice = Number(medicine.sellingPrice || 0);
  const stripsPerBox = Math.max(1, Number(medicine.stripsPerBox || 1));
  const pillsPerStrip = Math.max(1, Number(medicine.pillsPerStrip || 1));
  const baseUnitsPerBox = stripsPerBox * pillsPerStrip;
  const stripCost = purchasePrice / stripsPerBox;
  const pillCost = purchasePrice / baseUnitsPerBox;
  const stripPrice = getDerivedStripSellingPrice(medicine);
  const pillPrice = getDerivedPillSellingPrice(medicine);

  return {
    packaging: {
      stripsPerBox,
      pillsPerStrip,
      pillsPerBox: baseUnitsPerBox
    },
    box: calculateUnitMetrics(purchasePrice, sellingPrice),
    strip: calculateUnitMetrics(stripCost, stripPrice),
    pill: calculateUnitMetrics(pillCost, pillPrice)
  };
}

function convertInputQuantityToBaseUnits(payload = {}) {
  const quantity = parseInteger(payload.quantity, 0);
  const stripsPerBox = parseInteger(payload.stripsPerBox, 1);
  const pillsPerStrip = parseInteger(payload.pillsPerStrip, 1);
  if (stripsPerBox > 1 || pillsPerStrip > 1) {
    return quantity * stripsPerBox * pillsPerStrip;
  }
  return quantity;
}

function buildPackagingSummary(medicine, boxes = []) {
  if (!isFractionalMedicine(medicine)) {
    return {
      mode: "SINGLE_UNIT",
      totalBaseUnits: Number(medicine.quantity || 0),
      availableBoxes: Number(medicine.quantity || 0),
      availableStrips: Number(medicine.quantity || 0),
      availablePills: Number(medicine.quantity || 0),
      loosePills: 0,
      label: `${medicine.quantity || 0} units`
    };
  }

  const pillsPerStrip = Number(medicine.pillsPerStrip || 1);
  const totalPills = boxes.reduce((sum, box) => sum + Number(box.remainingPills || 0), 0);
  const availableBoxes = boxes.filter((box) => Number(box.remainingPills || 0) === Number(box.totalPills || 0)).length;
  const availableStrips = boxes.reduce((sum, box) => sum + Math.floor(Number(box.remainingPills || 0) / pillsPerStrip), 0);
  const loosePills = boxes.reduce((sum, box) => sum + (Number(box.remainingPills || 0) % pillsPerStrip), 0);

  return {
    mode: "FRACTIONAL",
    totalBaseUnits: totalPills,
    availableBoxes,
    availableStrips,
    availablePills: totalPills,
    loosePills,
    label: `${availableBoxes} boxes, ${availableStrips} full strips, ${loosePills} loose pills`
  };
}

async function createMedicineBoxes(tx, {
  medicineId,
  boxesCount,
  stripsPerBox,
  pillsPerStrip,
  batchNumber,
  expiryDate,
  purchaseInvoiceItemId
}) {
  const totalPills = stripsPerBox * pillsPerStrip;
  const created = [];

  for (let index = 0; index < boxesCount; index += 1) {
    const box = await tx.medicineBox.create({
      data: {
        medicineId,
        purchaseInvoiceItemId: purchaseInvoiceItemId || null,
        boxCode: buildBoxCode(medicineId),
        totalPills,
        remainingPills: totalPills,
        stripsPerBox,
        pillsPerStrip,
        batchNumber: batchNumber || null,
        expiryDate: expiryDate || null
      }
    });
    created.push(box);
  }

  return created;
}

function normalizeBoxStatus(box, nextRemainingPills) {
  return {
    remainingPills: nextRemainingPills,
    status: nextRemainingPills <= 0 ? "DEPLETED" : "OPEN",
    depletedAt: nextRemainingPills <= 0 ? new Date() : null
  };
}

async function deductFromBoxes(tx, medicine, saleUnit, saleQuantity) {
  const quantity = parseInteger(saleQuantity, 0);
  const normalizedUnit = String(saleUnit || "BOX").toUpperCase();
  const pillsPerStrip = Number(medicine.pillsPerStrip || 1);
  const baseUnitsPerBox = getBaseUnitsPerBox(medicine);
  const openBoxes = await tx.medicineBox.findMany({
    where: {
      medicineId: medicine.id,
      status: "OPEN"
    },
    orderBy: { createdAt: "asc" }
  });

  const allocations = [];
  let remaining = quantity;
  let totalBaseUnits = 0;

  if (normalizedUnit === "BOX") {
    const candidates = openBoxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
    if (candidates.length < quantity) {
      throw Object.assign(new Error(`Insufficient full boxes for ${medicine.name}`), { code: "INSUFFICIENT_BOXES" });
    }

    for (const box of candidates.slice(0, quantity)) {
      await tx.medicineBox.update({
        where: { id: box.id },
        data: normalizeBoxStatus(box, 0)
      });
      allocations.push({
        medicineBoxId: box.id,
        saleUnit: "BOX",
        saleQuantity: 1,
        baseUnits: baseUnitsPerBox
      });
      totalBaseUnits += baseUnitsPerBox;
    }
  } else if (normalizedUnit === "STRIP") {
    const stripCandidates = openBoxes.filter((box) => Math.floor(Number(box.remainingPills) / pillsPerStrip) > 0);
    const totalStrips = stripCandidates.reduce((sum, box) => sum + Math.floor(Number(box.remainingPills) / pillsPerStrip), 0);
    if (totalStrips < quantity) {
      throw Object.assign(new Error(`Insufficient full strips for ${medicine.name}`), { code: "INSUFFICIENT_STRIPS" });
    }

    for (const box of stripCandidates) {
      while (remaining > 0 && Math.floor(Number(box.remainingPills) / pillsPerStrip) > 0) {
        const nextRemainingPills = Number(box.remainingPills) - pillsPerStrip;
        box.remainingPills = nextRemainingPills;
        await tx.medicineBox.update({
          where: { id: box.id },
          data: normalizeBoxStatus(box, nextRemainingPills)
        });
        allocations.push({
          medicineBoxId: box.id,
          saleUnit: "STRIP",
          saleQuantity: 1,
          baseUnits: pillsPerStrip
        });
        totalBaseUnits += pillsPerStrip;
        remaining -= 1;
      }
      if (remaining <= 0) break;
    }
  } else {
    const totalPills = openBoxes.reduce((sum, box) => sum + Number(box.remainingPills), 0);
    if (totalPills < quantity) {
      throw Object.assign(new Error(`Insufficient pills for ${medicine.name}`), { code: "INSUFFICIENT_PILLS" });
    }

    for (const box of openBoxes) {
      if (remaining <= 0) break;
      const usable = Math.min(remaining, Number(box.remainingPills));
      if (usable <= 0) continue;
      const nextRemainingPills = Number(box.remainingPills) - usable;
      box.remainingPills = nextRemainingPills;
      await tx.medicineBox.update({
        where: { id: box.id },
        data: normalizeBoxStatus(box, nextRemainingPills)
      });
      allocations.push({
        medicineBoxId: box.id,
        saleUnit: "PILL",
        saleQuantity: usable,
        baseUnits: usable
      });
      totalBaseUnits += usable;
      remaining -= usable;
    }
  }

  return {
    saleUnit: normalizedUnit,
    saleQuantity: quantity,
    baseUnits: totalBaseUnits,
    allocations
  };
}

async function restoreAllocationsToBoxes(tx, allocations = []) {
  for (const allocation of allocations) {
    const box = allocation.medicineBox;
    const nextRemainingPills = Math.min(Number(box.totalPills), Number(box.remainingPills) + Number(allocation.baseUnits));
    await tx.medicineBox.update({
      where: { id: box.id },
      data: normalizeBoxStatus(box, nextRemainingPills)
    });
  }
}

function resolveSaleUnitPrice(medicine, saleUnit) {
  const normalizedUnit = String(saleUnit || "BOX").toUpperCase();
  if (normalizedUnit === "PILL") return getDerivedPillSellingPrice(medicine);
  if (normalizedUnit === "STRIP") return getDerivedStripSellingPrice(medicine);
  return Number(medicine.sellingPrice || 0);
}

module.exports = {
  parseInteger,
  parseNumber,
  isFractionalMedicine,
  getBaseUnitsPerBox,
  getDerivedStripSellingPrice,
  getDerivedPillSellingPrice,
  buildPricingSummary,
  convertInputQuantityToBaseUnits,
  buildPackagingSummary,
  createMedicineBoxes,
  deductFromBoxes,
  restoreAllocationsToBoxes,
  resolveSaleUnitPrice
};
