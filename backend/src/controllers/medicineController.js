const prisma = require("../config/prisma");
const { ensureTherapeuticClassification, getDetectedTherapeuticGroupCode } = require("../services/therapeuticClassificationService");
const {
  parseInteger,
  parseNumber,
  isFractionalMedicine,
  getBaseUnitsPerBox,
  buildPricingSummary,
  buildPackagingSummary,
  createMedicineBoxes,
  convertInputQuantityToBaseUnits
} = require("../utils/packaging");

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

function parseExcelDateValue(value) {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value));
    return excelEpoch;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sanitizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0621-\u064A]+/g, "")
    .trim();
}

const ARABIC_PHONETIC_MAP = {
  ا: "a", ب: "b", ت: "t", ث: "th", ج: "g", ح: "h", خ: "kh", د: "d", ذ: "z",
  ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a",
  غ: "gh", ف: "f", ق: "k", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "o",
  ي: "i", ء: "", ئ: "i", ؤ: "o"
};

function searchFingerprint(value) {
  const normalized = normalizeSearchText(value);
  const latin = Array.from(normalized).map((char) => ARABIC_PHONETIC_MAP[char] ?? char).join("");
  return latin.replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");
}

function levenshteinDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
}

function getMedicineSearchScore(medicine, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return Number.POSITIVE_INFINITY;
  const needleFingerprint = searchFingerprint(query);
  const barcode = normalizeSearchText(medicine.barcode);

  if (barcode) {
    if (barcode === needle) return 0;
    if (barcode.startsWith(needle)) return 5 + Math.min(4, barcode.length - needle.length);
    if (barcode.includes(needle)) return 12 + Math.min(4, barcode.indexOf(needle));

    if (/^\d+$/.test(needle) && /^\d+$/.test(barcode) && needle.length >= 5) {
      const distance = levenshteinDistance(barcode, needle);
      const allowedDistance = needle.length >= 8 ? 2 : 1;
      if (distance <= allowedDistance) return 20 + distance;
    }
  }

  const values = [medicine.name, medicine.nameAr, medicine.nameEn, medicine.searchAliases, medicine.category, medicine.manufacturer].filter(Boolean);
  let bestScore = Number.POSITIVE_INFINITY;
  values.forEach((value) => {
    const normalized = normalizeSearchText(value);
    if (normalized === needle) bestScore = Math.min(bestScore, 30);
    else if (normalized.startsWith(needle)) bestScore = Math.min(bestScore, 40 + Math.min(5, normalized.length - needle.length));
    else if (normalized.includes(needle)) bestScore = Math.min(bestScore, 50 + Math.min(8, normalized.indexOf(needle)));
    const fingerprint = searchFingerprint(value);
    if (needleFingerprint.length < 3 || fingerprint.length < 3) return;
    if (fingerprint.includes(needleFingerprint) || needleFingerprint.includes(fingerprint)) {
      bestScore = Math.min(bestScore, 65);
      return;
    }
    if (levenshteinDistance(fingerprint, needleFingerprint) <= 1) bestScore = Math.min(bestScore, 75);
  });

  return bestScore;
}

function matchesMedicineSearch(medicine, query) {
  return Number.isFinite(getMedicineSearchScore(medicine, query));
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSearchCondition(q, searchField, searchMode) {
  if (!q) return null;

  const usePrefix = searchMode === "prefix";
  const textFilter = usePrefix ? { startsWith: q } : { contains: q };

  if (searchField && ["name", "barcode", "category", "manufacturer"].includes(searchField)) {
    return { [searchField]: textFilter };
  }

  return {
    OR: [
      { name: textFilter },
      { barcode: { contains: q } },
      { category: { contains: q } },
      { manufacturer: { contains: q } }
    ]
  };
}

function buildMedicineWhere(query = {}) {
  const q = String(query.q || "").trim();
  const searchField = String(query.searchField || "").trim();
  const searchMode = String(query.searchMode || "contains").trim();
  const category = sanitizeText(query.category);
  const manufacturer = sanitizeText(query.manufacturer);
  const therapeuticGroupId = parseInteger(query.therapeuticGroupId, 0);
  const uncategorized = String(query.uncategorized || "").toLowerCase() === "true";
  const clauses = [String(query.archived || "").toLowerCase() === "true" ? { archivedAt: { not: null } } : { archivedAt: null }];

  const searchCondition = buildSearchCondition(q, searchField, searchMode);
  if (searchCondition) clauses.push(searchCondition);
  if (category) clauses.push({ category });
  if (manufacturer) clauses.push({ manufacturer });
  if (therapeuticGroupId > 0) clauses.push({ therapeuticGroupId });
  if (uncategorized) clauses.push({ therapeuticGroupId: null });

  if (!clauses.length) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { AND: clauses };
}

function normalizeMedicinePayload(raw = {}) {
  const itemType = ["MEDICINE", "PACK_PIECE", "SINGLE"].includes(String(raw.itemType || "").toUpperCase())
    ? String(raw.itemType).toUpperCase()
    : "MEDICINE";
  const requestedStripsPerBox = Math.max(1, parseInteger(raw.stripsPerBox, 1));
  const requestedPillsPerStrip = Math.max(1, parseInteger(raw.piecesPerPackage ?? raw.pillsPerStrip, 1));
  const normalized = {
    name: String(raw.name || "").trim(),
    nameAr: sanitizeText(raw.nameAr),
    nameEn: sanitizeText(raw.nameEn),
    searchAliases: sanitizeText(raw.searchAliases),
    itemType,
    packageNameAr: sanitizeText(raw.packageNameAr),
    packageNameEn: sanitizeText(raw.packageNameEn),
    pieceNameAr: sanitizeText(raw.pieceNameAr),
    pieceNameEn: sanitizeText(raw.pieceNameEn),
    stockUnit: sanitizeText(raw.stockUnit),
    barcode: sanitizeText(raw.barcode),
    category: sanitizeText(raw.category),
    manufacturer: sanitizeText(raw.manufacturer),
    productTypeId: raw.productTypeId ? Number(raw.productTypeId) : null,
    manufacturerId: raw.manufacturerId ? Number(raw.manufacturerId) : null,
    warrantyId: raw.warrantyId ? Number(raw.warrantyId) : null,
    therapeuticGroupId: raw.therapeuticGroupId ? Number(raw.therapeuticGroupId) : null,
    itemVariantId: raw.itemVariantId ? Number(raw.itemVariantId) : null,
    description: sanitizeText(raw.description),
    purchasePrice: parseNumber(raw.purchasePrice),
    sellingPrice: parseNumber(raw.sellingPrice),
    stripsPerBox: itemType === "MEDICINE" ? requestedStripsPerBox : 1,
    pillsPerStrip: itemType === "SINGLE" ? 1 : requestedPillsPerStrip,
    stripSellingPrice: raw.stripSellingPrice === "" || raw.stripSellingPrice === undefined ? null : parseNumber(raw.stripSellingPrice),
    pillSellingPrice: raw.pillSellingPrice === "" || raw.pillSellingPrice === undefined ? null : parseNumber(raw.pillSellingPrice),
    minStock: parseInteger(raw.minStock, 5),
    expiryDate: parseExcelDateValue(raw.expiryDate),
    batchNumber: sanitizeText(raw.batchNumber),
    supplierId: raw.supplierId ? Number(raw.supplierId) : null,
    isQuickSale: parseBoolean(raw.isQuickSale)
  };

  return {
    ...normalized,
    stockInputQuantity: Math.max(0, parseInteger(raw.quantity, 0)),
    quantity: Math.max(0, convertInputQuantityToBaseUnits(raw))
  };
}

async function getMedicineOptionsData() {
  const [categories, manufacturers, productTypes, manufacturerRecords, warranties, therapeuticGroups, itemVariants] = await Promise.all([
    prisma.medicine.findMany({
      where: { category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" }
    }),
    prisma.medicine.findMany({
      where: { manufacturer: { not: null } },
      distinct: ["manufacturer"],
      select: { manufacturer: true },
      orderBy: { manufacturer: "asc" }
    }),
    prisma.productType.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.manufacturer.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.itemWarranty.findMany({ where: { active: true }, select: { id: true, name: true, code: true, durationMonths: true }, orderBy: { name: "asc" } }),
    prisma.therapeuticGroup.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.itemVariant.findMany({ where: { active: true }, select: { id: true, name: true, code: true, valuesJson: true }, orderBy: { name: "asc" } })
  ]);

  return {
    categories: categories.map((item) => item.category).filter(Boolean),
    manufacturers: manufacturers.map((item) => item.manufacturer).filter(Boolean),
    productTypes,
    manufacturerRecords,
    warranties,
    therapeuticGroups,
    itemVariants
  };
}

function withPackagingSummary(medicine) {
  const boxes = Array.isArray(medicine.medicineBoxes) ? medicine.medicineBoxes : [];
  return {
    ...medicine,
    packagingSummary: buildPackagingSummary(medicine, boxes),
    pricingSummary: buildPricingSummary(medicine)
  };
}

function toMedicineCreateData(item, overrides = {}) {
  return {
    name: item.name,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    searchAliases: item.searchAliases,
    itemType: item.itemType,
    packageNameAr: item.packageNameAr,
    packageNameEn: item.packageNameEn,
    pieceNameAr: item.pieceNameAr,
    pieceNameEn: item.pieceNameEn,
    stockUnit: item.stockUnit,
    barcode: item.barcode,
    category: item.category,
    manufacturer: item.manufacturer,
    productTypeId: item.productTypeId,
    manufacturerId: item.manufacturerId,
    warrantyId: item.warrantyId,
    therapeuticGroupId: item.therapeuticGroupId,
    itemVariantId: item.itemVariantId,
    description: item.description,
    purchasePrice: item.purchasePrice,
    sellingPrice: item.sellingPrice,
    stripsPerBox: item.stripsPerBox,
    pillsPerStrip: item.pillsPerStrip,
    stripSellingPrice: item.stripSellingPrice,
    pillSellingPrice: item.pillSellingPrice,
    quantity: overrides.quantity ?? item.quantity,
    minStock: item.minStock,
    expiryDate: item.expiryDate,
    batchNumber: item.batchNumber,
    supplierId: overrides.supplierId ?? item.supplierId ?? null,
    isQuickSale: item.isQuickSale
  };
}

async function syncMedicineBoxesForAbsoluteQuantity(tx, medicine, payload) {
  const boxes = await tx.medicineBox.findMany({
    where: { medicineId: medicine.id },
    orderBy: { createdAt: "asc" }
  });

  if (!isFractionalMedicine(payload)) {
    if (boxes.length) {
      await tx.medicineBox.deleteMany({ where: { medicineId: medicine.id } });
    }
    return;
  }

  const baseUnitsPerBox = getBaseUnitsPerBox(payload);
  const currentBaseUnits = boxes.reduce((sum, box) => sum + Number(box.remainingPills || 0), 0);
  const delta = payload.quantity - currentBaseUnits;

  if (delta === 0) return;
  if (delta % baseUnitsPerBox !== 0) {
    throw Object.assign(new Error("Packaged medicine stock must be adjusted in full boxes from the medicine form"), {
      code: "INVALID_PACKAGING_ADJUSTMENT"
    });
  }

  if (delta > 0) {
    const boxesToCreate = delta / baseUnitsPerBox;
    await createMedicineBoxes(tx, {
      medicineId: medicine.id,
      boxesCount: boxesToCreate,
      stripsPerBox: payload.stripsPerBox,
      pillsPerStrip: payload.pillsPerStrip,
      batchNumber: payload.batchNumber,
      expiryDate: payload.expiryDate
    });
    return;
  }

  const boxesToRemove = Math.abs(delta) / baseUnitsPerBox;
  const removableBoxes = boxes.filter((box) => Number(box.remainingPills) === Number(box.totalPills));
  if (removableBoxes.length < boxesToRemove) {
    throw Object.assign(new Error("Cannot reduce stock because some boxes are already partially opened"), {
      code: "PARTIAL_BOXES_PRESENT"
    });
  }

  await tx.medicineBox.deleteMany({
    where: { id: { in: removableBoxes.slice(0, boxesToRemove).map((box) => box.id) } }
  });
}

async function queryMedicines(query = {}) {
  const searchQuery = String(query.q || "").trim();
  const where = buildMedicineWhere(searchQuery ? { ...query, q: "" } : query);
  const page = Math.max(1, parseInteger(query.page, 1));
  const pageSize = Math.min(100, Math.max(1, parseInteger(query.pageSize, 10)));
  const paginate = String(query.paginate || "true") !== "false";

  if (searchQuery) {
    const allMedicines = await prisma.medicine.findMany({
      where,
      include: {
        supplier: true,
        medicineBoxes: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ quantity: "asc" }, { id: "desc" }]
    });
    const rankedMatches = allMedicines
      .map((medicine) => ({ medicine, score: getMedicineSearchScore(medicine, searchQuery) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((left, right) => left.score - right.score
        || Number(right.medicine.quantity > 0) - Number(left.medicine.quantity > 0)
        || right.medicine.id - left.medicine.id)
      .map((item) => item.medicine);
    const normalizedSearchQuery = normalizeSearchText(searchQuery);
    const exactBarcodeMatches = /^\d+$/.test(normalizedSearchQuery)
      ? rankedMatches.filter((medicine) => normalizeSearchText(medicine.barcode) === normalizedSearchQuery)
      : [];
    const resultCandidates = exactBarcodeMatches.length ? exactBarcodeMatches : rankedMatches;
    const seenMatches = new Set();
    const matches = resultCandidates.filter((medicine) => {
      const barcodeKey = normalizeSearchText(medicine.barcode);
      const nameKey = normalizeSearchText(medicine.name);
      const key = barcodeKey ? `${barcodeKey}|${nameKey}` : `id:${medicine.id}`;
      if (seenMatches.has(key)) return false;
      seenMatches.add(key);
      return true;
    });
    const medicines = paginate ? matches.slice((page - 1) * pageSize, page * pageSize) : matches;
    return {
      medicines: medicines.map(withPackagingSummary),
      meta: { page, pageSize, total: matches.length, totalPages: paginate ? Math.max(1, Math.ceil(matches.length / pageSize)) : 1 }
    };
  }

  const [total, medicines] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({
      where,
      include: {
        supplier: true,
        medicineBoxes: {
          where: { status: "OPEN" },
          select: {
            id: true,
            boxCode: true,
            totalPills: true,
            remainingPills: true,
            stripsPerBox: true,
            pillsPerStrip: true,
            batchNumber: true,
            expiryDate: true,
            status: true
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ quantity: "asc" }, { id: "desc" }],
      skip: paginate ? (page - 1) * pageSize : undefined,
      take: paginate ? pageSize : undefined
    })
  ]);

  return {
    medicines: medicines.map(withPackagingSummary),
    meta: {
      page,
      pageSize,
      total,
      totalPages: paginate ? Math.max(1, Math.ceil(total / pageSize)) : 1
    }
  };
}

function buildSpreadsheetXml(medicines) {
  const headers = [
    "Name",
    "Barcode",
    "Category",
    "Manufacturer",
    "Description",
    "Unit",
    "Box Purchase Price",
    "Box Selling Price",
    "Strip Selling Price",
    "Pill Selling Price",
    "Current Warehouse Stock",
    "Strips Per Box",
    "Pills Per Strip",
    "Min Stock",
    "Expiry Date",
    "Batch Number",
    "Supplier"
  ];

  const rows = medicines.map((medicine) => [
    medicine.name,
    medicine.barcode || "",
    medicine.category || "",
    medicine.manufacturer || "",
    medicine.description || "",
    medicine.stockUnit || "",
    Number(medicine.purchasePrice || 0).toFixed(2),
    Number(medicine.sellingPrice || 0).toFixed(2),
    medicine.stripSellingPrice ?? "",
    medicine.pillSellingPrice ?? "",
    medicine.quantity,
    medicine.stripsPerBox,
    medicine.pillsPerStrip,
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
    '<Worksheet ss:Name="Medicines"><Table>',
    `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join("")}</Row>`,
    ...rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`),
    "</Table></Worksheet></Workbook>"
  ].join("");
}

exports.getMedicines = async (req, res) => {
  try {
    await ensureTherapeuticClassification();
    const { medicines, meta } = await queryMedicines(req.query);
    res.json({ success: true, data: medicines, meta });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getMedicineOptions = async (req, res) => {
  try {
    const data = await getMedicineOptionsData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.exportMedicines = async (req, res) => {
  try {
    const { medicines } = await queryMedicines({ ...req.query, paginate: "false" });
    const workbook = buildSpreadsheetXml(medicines);
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="medicines-export.xls"');
    res.send(workbook);
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.importMedicines = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ success: false, message: "At least one medicine row is required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const rawItem of items) {
        const item = normalizeMedicinePayload(rawItem);
        const hasValue = (key) => rawItem[key] !== undefined && rawItem[key] !== null && String(rawItem[key]).trim() !== "";
        if (!item.name || !hasValue("purchasePrice") || !hasValue("sellingPrice")) {
          throw Object.assign(new Error("Each imported row needs name, purchasePrice, and sellingPrice"), { code: "INVALID_IMPORT_ROW" });
        }

        let medicine = item.barcode ? await tx.medicine.findFirst({ where: { barcode: item.barcode } }) : null;
        if (!medicine) {
          medicine = await tx.medicine.findFirst({
            where: {
              name: item.name,
              batchNumber: item.batchNumber || undefined
            }
          });
        }

        if (medicine) {
          const previousQuantity = medicine.quantity;
          const mergedItem = {
            ...item,
            nameAr: hasValue("nameAr") ? item.nameAr : medicine.nameAr,
            nameEn: hasValue("nameEn") ? item.nameEn : medicine.nameEn,
            searchAliases: hasValue("searchAliases") ? item.searchAliases : medicine.searchAliases,
            itemType: hasValue("itemType") ? item.itemType : medicine.itemType,
            packageNameAr: hasValue("packageNameAr") ? item.packageNameAr : medicine.packageNameAr,
            packageNameEn: hasValue("packageNameEn") ? item.packageNameEn : medicine.packageNameEn,
            pieceNameAr: hasValue("pieceNameAr") ? item.pieceNameAr : medicine.pieceNameAr,
            pieceNameEn: hasValue("pieceNameEn") ? item.pieceNameEn : medicine.pieceNameEn,
            stockUnit: hasValue("stockUnit") ? item.stockUnit : medicine.stockUnit,
            barcode: hasValue("barcode") ? item.barcode : medicine.barcode,
            category: hasValue("category") ? item.category : medicine.category,
            manufacturer: hasValue("manufacturer") ? item.manufacturer : medicine.manufacturer,
            description: hasValue("description") ? item.description : medicine.description,
            stripSellingPrice: hasValue("stripSellingPrice") ? item.stripSellingPrice : medicine.stripSellingPrice,
            pillSellingPrice: hasValue("pillSellingPrice") ? item.pillSellingPrice : medicine.pillSellingPrice,
            quantity: hasValue("quantity") ? item.quantity : medicine.quantity,
            stockInputQuantity: hasValue("quantity") ? item.stockInputQuantity : medicine.quantity,
            stripsPerBox: hasValue("stripsPerBox") ? item.stripsPerBox : medicine.stripsPerBox,
            pillsPerStrip: hasValue("pillsPerStrip") ? item.pillsPerStrip : medicine.pillsPerStrip,
            minStock: hasValue("minStock") ? item.minStock : medicine.minStock,
            expiryDate: hasValue("expiryDate") ? item.expiryDate : medicine.expiryDate,
            batchNumber: hasValue("batchNumber") ? item.batchNumber : medicine.batchNumber,
            supplierId: hasValue("supplierId") ? item.supplierId : medicine.supplierId,
            isQuickSale: hasValue("isQuickSale") ? item.isQuickSale : medicine.isQuickSale
          };
          const updated = await tx.medicine.update({
            where: { id: medicine.id },
            data: {
              name: mergedItem.name,
              nameAr: mergedItem.nameAr,
              nameEn: mergedItem.nameEn,
              searchAliases: mergedItem.searchAliases,
              itemType: mergedItem.itemType,
              packageNameAr: mergedItem.packageNameAr,
              packageNameEn: mergedItem.packageNameEn,
              pieceNameAr: mergedItem.pieceNameAr,
              pieceNameEn: mergedItem.pieceNameEn,
              stockUnit: mergedItem.stockUnit,
              barcode: mergedItem.barcode,
              category: mergedItem.category,
              manufacturer: mergedItem.manufacturer,
              description: mergedItem.description,
              purchasePrice: mergedItem.purchasePrice,
              sellingPrice: mergedItem.sellingPrice,
              stripSellingPrice: mergedItem.stripSellingPrice,
              pillSellingPrice: mergedItem.pillSellingPrice,
              quantity: mergedItem.quantity,
              stripsPerBox: mergedItem.stripsPerBox,
              pillsPerStrip: mergedItem.pillsPerStrip,
              minStock: mergedItem.minStock,
              expiryDate: mergedItem.expiryDate,
              batchNumber: mergedItem.batchNumber,
              supplierId: mergedItem.supplierId,
              isQuickSale: mergedItem.isQuickSale
            }
          });

          await syncMedicineBoxesForAbsoluteQuantity(tx, updated, mergedItem);

          if (updated.quantity !== previousQuantity) {
            await createStockMovement(tx, {
              medicineId: updated.id,
              userId: req.user?.id,
              type: "IMPORT_SET",
              quantityChange: updated.quantity - previousQuantity,
              quantityAfter: updated.quantity,
              reason: "Excel import",
              note: "Quantity synchronized from import file"
            });
          }

          updatedCount += 1;
        } else {
          const created = await tx.medicine.create({
            data: toMedicineCreateData(item)
          });

          if (isFractionalMedicine(item) && item.stockInputQuantity > 0) {
            await createMedicineBoxes(tx, {
              medicineId: created.id,
              boxesCount: item.stockInputQuantity,
              stripsPerBox: item.stripsPerBox,
              pillsPerStrip: item.pillsPerStrip,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate
            });
          }

          if (created.quantity > 0) {
            await createStockMovement(tx, {
              medicineId: created.id,
              userId: req.user?.id,
              type: "IMPORT_CREATE",
              quantityChange: created.quantity,
              quantityAfter: created.quantity,
              reason: "Excel import",
              note: "Created from imported medicines file"
            });
          }

          createdCount += 1;
        }
      }

      return { createdCount, updatedCount };
    });

    res.status(201).json({ success: true, message: "Medicines imported successfully", data: result });
  } catch (err) {
    if (["INVALID_IMPORT_ROW", "INVALID_PACKAGING_ADJUSTMENT", "PARTIAL_BOXES_PRESENT"].includes(err.code)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === "P2002") {
      return res.status(400).json({ success: false, message: "One of the barcodes already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.findByBarcode = async (req, res) => {
  try {
    const barcode = (req.params.barcode || "").trim();
    if (!barcode) {
      return res.status(400).json({ success: false, message: "Barcode is required" });
    }

    const medicine = await prisma.medicine.findFirst({
      where: { barcode },
      include: {
        supplier: true,
        medicineBoxes: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!medicine) {
      return res.status(404).json({ success: false, message: "Medicine not found" });
    }

    res.json({ success: true, data: withPackagingSummary(medicine) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getMedicineById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const medicine = await prisma.medicine.findUnique({
      where: { id },
      include: {
        supplier: true,
        medicineBoxes: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });
    res.json({ success: true, data: withPackagingSummary(medicine) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createMedicine = async (req, res) => {
  try {
    const data = normalizeMedicinePayload(req.body);
    if (!data.name || req.body.purchasePrice === undefined || req.body.sellingPrice === undefined) {
      return res.status(400).json({ success: false, message: "Name, purchasePrice and sellingPrice are required" });
    }

    if (!data.therapeuticGroupId) {
      const code = getDetectedTherapeuticGroupCode(data);
      if (code) {
        const groups = await ensureTherapeuticClassification();
        data.therapeuticGroupId = groups.find((group) => group.code === code)?.id || null;
      }
    }

    const medicine = await prisma.$transaction(async (tx) => {
      const created = await tx.medicine.create({ data: toMedicineCreateData(data) });

      if (isFractionalMedicine(data) && data.stockInputQuantity > 0) {
        await createMedicineBoxes(tx, {
          medicineId: created.id,
          boxesCount: data.stockInputQuantity,
          stripsPerBox: data.stripsPerBox,
          pillsPerStrip: data.pillsPerStrip,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate
        });
      }

      if (created.quantity > 0) {
        await createStockMovement(tx, {
          medicineId: created.id,
          userId: req.user?.id,
          type: "OPENING_STOCK",
          quantityChange: created.quantity,
          quantityAfter: created.quantity,
          reason: "Opening stock",
          note: isFractionalMedicine(data)
            ? `${data.stockInputQuantity} boxes added as opening stock`
            : "Initial quantity when medicine was created"
        });
      }

      return tx.medicine.findUnique({
        where: { id: created.id },
        include: { supplier: true, medicineBoxes: true }
      });
    });

    res.status(201).json({ success: true, message: "Medicine created", data: withPackagingSummary(medicine) });
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ success: false, message: "Barcode already exists" });
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.bulkCreateMedicines = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ success: false, message: "At least one medicine is required" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const rawItem of items) {
        const item = normalizeMedicinePayload(rawItem);
        const medicine = await tx.medicine.create({ data: toMedicineCreateData(item) });

        if (isFractionalMedicine(item) && item.stockInputQuantity > 0) {
          await createMedicineBoxes(tx, {
            medicineId: medicine.id,
            boxesCount: item.stockInputQuantity,
            stripsPerBox: item.stripsPerBox,
            pillsPerStrip: item.pillsPerStrip,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate
          });
        }

        if (medicine.quantity > 0) {
          await createStockMovement(tx, {
            medicineId: medicine.id,
            userId: req.user?.id,
            type: "BULK_OPENING_STOCK",
            quantityChange: medicine.quantity,
            quantityAfter: medicine.quantity,
            reason: "Bulk add",
            note: isFractionalMedicine(item)
              ? `${item.stockInputQuantity} boxes added through bulk workflow`
              : "Created through bulk medicines workflow"
          });
        }

        results.push(
          await tx.medicine.findUnique({
            where: { id: medicine.id },
            include: { supplier: true, medicineBoxes: true }
          })
        );
      }

      return results;
    });

    res.status(201).json({
      success: true,
      message: "Medicines created in bulk",
      data: created.map(withPackagingSummary)
    });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ success: false, message: "One of the barcodes already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createPurchaseInvoice = async (req, res) => {
  try {
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!items.length) {
      return res.status(400).json({ success: false, message: "Invoice items are required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const processedItems = [];
      let totalCost = 0;

      for (const rawItem of items) {
        const item = normalizeMedicinePayload(rawItem);
        if (!item.name || rawItem.purchasePrice === undefined || rawItem.sellingPrice === undefined) {
          throw new Error("Each invoice item needs name, purchasePrice and sellingPrice");
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
              quantity: medicine.quantity + item.quantity,
              stripsPerBox: item.stripsPerBox,
              pillsPerStrip: item.pillsPerStrip,
              minStock: item.minStock,
              expiryDate: item.expiryDate || medicine.expiryDate,
              batchNumber: item.batchNumber ?? medicine.batchNumber,
              supplierId: supplierId ?? item.supplierId ?? medicine.supplierId
            }
          });
        } else {
          medicine = await tx.medicine.create({
            data: toMedicineCreateData(item, {
              supplierId: supplierId ?? item.supplierId
            })
          });
        }

        if (isFractionalMedicine(item) && item.stockInputQuantity > 0) {
          await createMedicineBoxes(tx, {
            medicineId: medicine.id,
            boxesCount: item.stockInputQuantity,
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
          quantityChange: item.quantity,
          quantityAfter: medicine.quantity,
          reason: "Purchase invoice",
          note: isFractionalMedicine(item)
            ? `${item.stockInputQuantity} boxes added from purchase`
            : `Supplier invoice ${supplierId || "N/A"}`
        });

        totalCost += item.stockInputQuantity * item.purchasePrice;
        processedItems.push(medicine);
      }

      return { processedItems, totalCost };
    });

    res.status(201).json({
      success: true,
      message: "Purchase invoice applied and stock updated",
      data: {
        invoiceNumber: `PI-${Date.now()}`,
        supplierId,
        itemsCount: result.processedItems.length,
        totalCost: Number(result.totalCost.toFixed(2)),
        medicines: result.processedItems.map(withPackagingSummary)
      }
    });
  } catch (err) {
    if (err.message.includes("Each invoice item")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === "P2002") {
      return res.status(400).json({ success: false, message: "One of the barcodes already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateMedicine = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = normalizeMedicinePayload(req.body);

    const medicine = await prisma.$transaction(async (tx) => {
      const existing = await tx.medicine.findUnique({ where: { id } });
      const updated = await tx.medicine.update({
        where: { id },
        data: {
          name: payload.name,
          nameAr: payload.nameAr,
          nameEn: payload.nameEn,
          searchAliases: payload.searchAliases,
          itemType: payload.itemType,
          packageNameAr: payload.packageNameAr,
          packageNameEn: payload.packageNameEn,
          pieceNameAr: payload.pieceNameAr,
          pieceNameEn: payload.pieceNameEn,
          stockUnit: payload.stockUnit,
          barcode: payload.barcode,
          category: payload.category,
          manufacturer: payload.manufacturer,
          productTypeId: req.body.productTypeId !== undefined ? payload.productTypeId : undefined,
          manufacturerId: req.body.manufacturerId !== undefined ? payload.manufacturerId : undefined,
          warrantyId: req.body.warrantyId !== undefined ? payload.warrantyId : undefined,
          therapeuticGroupId: req.body.therapeuticGroupId !== undefined ? payload.therapeuticGroupId : undefined,
          itemVariantId: req.body.itemVariantId !== undefined ? payload.itemVariantId : undefined,
          description: payload.description,
          purchasePrice: req.body.purchasePrice !== undefined ? payload.purchasePrice : undefined,
          sellingPrice: req.body.sellingPrice !== undefined ? payload.sellingPrice : undefined,
          stripSellingPrice: req.body.stripSellingPrice !== undefined ? payload.stripSellingPrice : undefined,
          pillSellingPrice: req.body.pillSellingPrice !== undefined ? payload.pillSellingPrice : undefined,
          quantity: req.body.quantity !== undefined ? payload.quantity : undefined,
          stripsPerBox: req.body.stripsPerBox !== undefined ? payload.stripsPerBox : undefined,
          pillsPerStrip: req.body.pillsPerStrip !== undefined ? payload.pillsPerStrip : undefined,
          minStock: req.body.minStock !== undefined ? payload.minStock : undefined,
          expiryDate: req.body.expiryDate !== undefined ? payload.expiryDate : undefined,
          batchNumber: payload.batchNumber,
          supplierId: req.body.supplierId !== undefined ? payload.supplierId : undefined,
          isQuickSale: req.body.isQuickSale !== undefined ? payload.isQuickSale : undefined
        }
      });

      if (req.body.quantity !== undefined) {
        await syncMedicineBoxesForAbsoluteQuantity(tx, updated, payload);
      }

      if (existing && req.body.quantity !== undefined && payload.quantity !== existing.quantity) {
        await createStockMovement(tx, {
          medicineId: updated.id,
          userId: req.user?.id,
          type: "MANUAL_SET",
          quantityChange: payload.quantity - existing.quantity,
          quantityAfter: updated.quantity,
          reason: "Medicine edit",
          note: "Quantity changed from medicine form"
        });
      }

      return tx.medicine.findUnique({
        where: { id },
        include: { supplier: true, medicineBoxes: true }
      });
    });

    res.json({ success: true, message: "Medicine updated", data: withPackagingSummary(medicine) });
  } catch (err) {
    if (["INVALID_PACKAGING_ADJUSTMENT", "PARTIAL_BOXES_PRESENT"].includes(err.code)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === "P2002") {
      return res.status(400).json({ success: false, message: "Barcode already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.deleteMedicine = async (req, res) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const medicine = await tx.medicine.findUnique({ where: { id }, select: { id: true } });
      if (!medicine) {
        throw Object.assign(new Error("Medicine not found"), { code: "NOT_FOUND" });
      }

      const [boxes, saleItems] = await Promise.all([
        tx.medicineBox.findMany({ where: { medicineId: id }, select: { id: true } }),
        tx.saleItem.findMany({ where: { medicineId: id }, select: { id: true } })
      ]);

      const boxIds = boxes.map((box) => box.id);
      const saleItemIds = saleItems.map((item) => item.id);

      if (boxIds.length) {
        await tx.boxSaleAllocation.deleteMany({ where: { medicineBoxId: { in: boxIds } } });
      }

      if (saleItemIds.length) {
        await tx.boxSaleAllocation.deleteMany({ where: { saleItemId: { in: saleItemIds } } });
      }

      await tx.medicineBox.deleteMany({ where: { medicineId: id } });
      await tx.stockMovement.deleteMany({ where: { medicineId: id } });
      await tx.purchaseInvoiceItem.deleteMany({ where: { medicineId: id } });
      await tx.saleItem.deleteMany({ where: { medicineId: id } });
      await tx.medicine.delete({ where: { id } });
    });

    res.json({ success: true, message: "Medicine deleted" });
  } catch (err) {
    if (err.code === "NOT_FOUND" || err.code === "P2025") {
      return res.status(404).json({ success: false, message: "Medicine not found" });
    }
    res.status(500).json({ success: false, message: err.message || "Server Error" });
  }
};

exports.archiveMedicine = async (req, res) => {
  try {
    const medicine = await prisma.medicine.update({ where: { id: Number(req.params.id) }, data: { archivedAt: new Date() } });
    res.json({ success: true, data: medicine, message: "Medicine archived" });
  } catch (error) { res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: "Could not archive medicine" }); }
};

exports.restoreMedicine = async (req, res) => {
  try {
    const medicine = await prisma.medicine.update({ where: { id: Number(req.params.id) }, data: { archivedAt: null } });
    res.json({ success: true, data: medicine, message: "Medicine restored" });
  } catch (error) { res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: "Could not restore medicine" }); }
};

exports.updateQuickSaleStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Medicine id is required" });
    const medicine = await prisma.medicine.update({
      where: { id },
      data: { isQuickSale: parseBoolean(req.body.isQuickSale) },
      include: { supplier: true, medicineBoxes: true }
    });
    res.json({ success: true, message: "Quick sale status updated", data: withPackagingSummary(medicine) });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ success: false, message: "Medicine not found" });
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.deleteAllMedicines = async (req, res) => {
  try {
    const medicines = await prisma.medicine.findMany({ select: { id: true } });
    const ids = medicines.map((medicine) => medicine.id);
    if (!ids.length) return res.json({ success: true, message: "Inventory is already empty", data: { deletedCount: 0 } });

    await prisma.$transaction(async (tx) => {
      for (let offset = 0; offset < ids.length; offset += 400) {
        const chunk = ids.slice(offset, offset + 400);
        const [boxes, saleItems] = await Promise.all([
          tx.medicineBox.findMany({ where: { medicineId: { in: chunk } }, select: { id: true } }),
          tx.saleItem.findMany({ where: { medicineId: { in: chunk } }, select: { id: true } })
        ]);
        const boxIds = boxes.map((box) => box.id);
        const saleItemIds = saleItems.map((item) => item.id);
        if (boxIds.length) await tx.boxSaleAllocation.deleteMany({ where: { medicineBoxId: { in: boxIds } } });
        if (saleItemIds.length) await tx.boxSaleAllocation.deleteMany({ where: { saleItemId: { in: saleItemIds } } });
        await tx.inventoryCountItem.deleteMany({ where: { medicineId: { in: chunk } } });
        await tx.medicineBox.deleteMany({ where: { medicineId: { in: chunk } } });
        await tx.stockMovement.deleteMany({ where: { medicineId: { in: chunk } } });
        await tx.purchaseInvoiceItem.deleteMany({ where: { medicineId: { in: chunk } } });
        await tx.saleItem.deleteMany({ where: { medicineId: { in: chunk } } });
        await tx.medicine.deleteMany({ where: { id: { in: chunk } } });
      }
    }, { timeout: 120000 });

    res.json({ success: true, message: "All medicines and stock were deleted", data: { deletedCount: ids.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to delete inventory" });
  }
};

exports.lowStock = async (req, res) => {
  try {
    const medicines = await prisma.medicine.findMany({
      include: { medicineBoxes: { where: { status: "OPEN" } } },
      orderBy: { quantity: "asc" }
    });
    const low = medicines.filter((medicine) => medicine.quantity <= medicine.minStock).map(withPackagingSummary);
    res.json({ success: true, data: low });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.expiringSoon = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAhead = new Date(now);
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const medicines = await prisma.medicine.findMany({
      where: {
        expiryDate: {
          gte: now,
          lte: thirtyDaysAhead
        }
      },
      include: { medicineBoxes: { where: { status: "OPEN" } } },
      orderBy: { expiryDate: "asc" }
    });

    res.json({ success: true, data: medicines.map(withPackagingSummary) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
