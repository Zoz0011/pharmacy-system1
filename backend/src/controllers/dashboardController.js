const prisma = require("../config/prisma");

exports.summary = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAhead = new Date(now);
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const [users, medicinesCount, suppliers, customers, sales, medicines] = await Promise.all([
      prisma.user.count(),
      prisma.medicine.count(),
      prisma.supplier.count(),
      prisma.customer.count(),
      prisma.sale.findMany({
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 8
      }),
      prisma.medicine.findMany()
    ]);

    const allSales = await prisma.sale.findMany();
    const totalSales = allSales.reduce((sum, sale) => sum + sale.finalAmount, 0);
    const todaySales = allSales
      .filter((sale) => new Date(sale.createdAt) >= startOfDay)
      .reduce((sum, sale) => sum + sale.finalAmount, 0);
    const monthlyRevenue = allSales
      .filter((sale) => new Date(sale.createdAt) >= startOfMonth)
      .reduce((sum, sale) => sum + sale.finalAmount, 0);

    const lowStock = medicines
      .filter((medicine) => medicine.quantity <= medicine.minStock)
      .sort((left, right) => left.quantity - right.quantity || left.name.localeCompare(right.name));
    const lowStockCount = lowStock.length;
    const totalQuantity = medicines.reduce((sum, medicine) => sum + medicine.quantity, 0);
    const expiringSoonCount = medicines.filter((medicine) => {
      if (!medicine.expiryDate) return false;
      const expiryDate = new Date(medicine.expiryDate);
      return expiryDate >= now && expiryDate <= thirtyDaysAhead;
    }).length;

    res.json({
      success: true,
      data: {
        users,
        medicines: medicinesCount,
        suppliers,
        customers,
        invoices: allSales.length,
        totalSales,
        todaySales,
        monthlyRevenue,
        lowStockCount,
        lowStock: lowStock.map((medicine) => ({
          id: medicine.id,
          name: medicine.name,
          barcode: medicine.barcode,
          manufacturer: medicine.manufacturer,
          quantity: medicine.quantity,
          minStock: medicine.minStock,
          expiryDate: medicine.expiryDate,
          batchNumber: medicine.batchNumber,
          stripsPerBox: medicine.stripsPerBox,
          pillsPerStrip: medicine.pillsPerStrip
        })),
        totalQuantity,
        expiringSoonCount,
        recentSales: sales.map((sale) => ({
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          finalAmount: sale.finalAmount,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt,
          userName: sale.user?.name || "Unknown",
          customerName: sale.customer?.name || "Walk-in"
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
