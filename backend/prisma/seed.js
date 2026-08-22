const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  await prisma.workspace.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "الصيدلية الرئيسية" }
  });

  const users = [
    { name: "Admin", username: "admin", email: "admin@pharmacy.com", password: "admin123", role: "ADMIN" },
    { name: "Main Pharmacist", username: "pharmacist", email: "pharmacist@pharmacy.com", password: "pharma123", role: "PHARMACIST" },
    { name: "Cashier", username: "cashier", email: "cashier@pharmacy.com", password: "cashier123", role: "CASHIER" }
  ];

  for (const user of users) {
    const password = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { username: user.username },
      create: {
        name: user.name,
        username: user.username,
        email: user.email,
        password,
        role: user.role,
        workspaceId: 1
      }
    });
  }

  await prisma.supplier.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Default Supplier",
      phone: "01000000000",
      email: "supplier@example.com",
      address: "Alexandria, Egypt",
      workspaceId: 1
    }
  });

  const medicines = [
    { name: "Panadol Extra", barcode: "622000000001", category: "Pain Relief", manufacturer: "GSK", purchasePrice: 20, sellingPrice: 30, quantity: 50, minStock: 10, batchNumber: "PX-001", supplierId: 1 },
    { name: "Augmentin 1g", barcode: "622000000002", category: "Antibiotic", manufacturer: "GSK", purchasePrice: 85, sellingPrice: 110, quantity: 20, minStock: 5, batchNumber: "AG-001", supplierId: 1 },
    { name: "Vitamin C", barcode: "622000000003", category: "Vitamins", manufacturer: "Local", purchasePrice: 25, sellingPrice: 40, quantity: 8, minStock: 10, batchNumber: "VC-001", supplierId: 1 }
  ];

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { workspaceId_barcode: { workspaceId: 1, barcode: med.barcode } },
      update: {},
      create: { ...med, workspaceId: 1 }
    });
  }

  console.log("Seed completed ✅");
  console.log("Admin login: admin@pharmacy.com / admin123");
  console.log("Pharmacist login: pharmacist@pharmacy.com / pharma123");
  console.log("Cashier login: cashier@pharmacy.com / cashier123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
