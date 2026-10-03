require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { PrismaClient } = require("@prisma/client");

if (!getApps().length) initializeApp();

const firestore = getFirestore();
const prisma = new PrismaClient();
const models = [
  "workspace", "user", "supplier", "customer", "medicine", "sale", "salePayment",
  "cashierShift", "shiftExpense", "customerAccountTransaction", "inventoryCount",
  "inventoryCountItem", "saleItem", "stockMovement", "purchaseInvoice", "purchaseInvoiceItem",
  "medicineBox", "boxSaleAllocation", "treasuryAccount", "treasuryTransaction",
  "accountingAccount", "accountingEntry", "accountingEntryLine", "prescription", "prescriptionItem"
];

async function migrate() {
  const counters = {};
  for (const model of models) {
    const rows = await prisma[model].findMany();
    let batch = firestore.batch();
    let writes = 0;
    let highestId = 0;
    for (const row of rows) {
      highestId = Math.max(highestId, Number(row.id || 0));
      batch.set(firestore.collection(model.toLowerCase()).doc(String(row.id)), row);
      writes += 1;
      if (writes === 400) {
        await batch.commit();
        batch = firestore.batch();
        writes = 0;
      }
    }
    if (writes) await batch.commit();
    counters[model.charAt(0).toUpperCase() + model.slice(1)] = highestId;
    console.log(`${model}: ${rows.length}`);
  }
  await firestore.collection("__meta").doc("counters").set(counters, { merge: true });
  console.log("SQLite data migrated to Firestore.");
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
