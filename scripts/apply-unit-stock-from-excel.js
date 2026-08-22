const path = require("path");
const { pathToFileURL } = require("url");
const prisma = require("../backend/src/config/prisma");

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isInteger(value)) return value.toFixed(0);
  return String(value).trim();
}

function normalizeName(value) {
  return cellText(value).toLocaleLowerCase("ar").replace(/\s+/g, " ").trim();
}

function parseUnitStock(value) {
  const raw = cellText(value);
  if (!raw) return null;
  const westernDigits = raw.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = westernDigits.match(/\d+/);
  const quantity = Math.max(1, Number(match?.[0] || 1));
  const stockUnit = raw.replace(/[\d٠-٩]+/g, "").trim() || "وحدة";
  return { quantity, stockUnit };
}

async function main() {
  const inputPath = process.argv[2];
  const workspaceId = Number(process.argv[3]);
  if (!inputPath || !Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new Error("Usage: node scripts/apply-unit-stock-from-excel.js <xlsx-path> <workspace-id>");
  }

  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/node_modules/read-excel-file/node/index.js")).href;
  const { default: readXlsxFile } = await import(moduleUrl);
  const workbook = await readXlsxFile(path.resolve(inputPath));
  const rows = Array.isArray(workbook?.[0]?.data) ? workbook[0].data : workbook;
  const headers = rows[0].map((header) => cellText(header).toUpperCase());
  const nameIndex = headers.indexOf("NAME");
  const unitIndex = headers.indexOf("UNIT");
  const skuIndex = headers.findIndex((header) => header === "SKU" || header.startsWith("SKU ("));
  if (nameIndex < 0 || unitIndex < 0 || skuIndex < 0) {
    throw new Error("The workbook must contain NAME, UNIT, and SKU columns");
  }

  const medicines = await prisma.unscoped.medicine.findMany({
    where: { workspaceId },
    select: { id: true, name: true, barcode: true }
  });
  const byBarcode = new Map(medicines.filter((item) => item.barcode).map((item) => [cellText(item.barcode), item]));
  const byName = new Map(medicines.map((item) => [normalizeName(item.name), item]));
  const pending = new Map();
  let unmatchedRows = 0;

  for (const row of rows.slice(1)) {
    const parsed = parseUnitStock(row[unitIndex]);
    if (!parsed) continue;
    const barcode = cellText(row[skuIndex]);
    const name = normalizeName(row[nameIndex]);
    const medicine = byBarcode.get(barcode) || byName.get(name);
    if (!medicine) {
      unmatchedRows += 1;
      continue;
    }
    pending.set(medicine.id, parsed);
  }

  const updates = Array.from(pending, ([id, parsed]) => ({ id, ...parsed }));
  for (let offset = 0; offset < updates.length; offset += 200) {
    const batch = updates.slice(offset, offset + 200);
    await prisma.unscoped.$transaction(
      batch.map((item) => prisma.unscoped.medicine.update({
        where: { id: item.id },
        data: {
          quantity: item.quantity,
          stockUnit: item.stockUnit,
          itemType: "SINGLE",
          packageNameAr: item.stockUnit,
          packageNameEn: item.stockUnit,
          stripsPerBox: 1,
          pillsPerStrip: 1
        }
      }))
    );
    process.stdout.write(`\rUpdated ${Math.min(offset + batch.length, updates.length)} of ${updates.length}`);
  }

  process.stdout.write("\n");
  console.log(JSON.stringify({ workbookRows: rows.length - 1, updatedMedicines: updates.length, unmatchedRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.unscoped.$disconnect();
  });
