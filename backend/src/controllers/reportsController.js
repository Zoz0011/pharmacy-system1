const prisma = require("../config/prisma");
const { getBaseUnitsPerBox, isFractionalMedicine } = require("../utils/packaging");

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDateRange(query = {}) {
  const now = new Date();
  const from = query.from ? startOfDay(new Date(query.from)) : startOfMonth(now);
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  return { from, to };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePdf(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatMonthKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildSpreadsheetXml(report) {
  const summaryRows = [
    ["From", formatDateKey(report.range.from)],
    ["To", formatDateKey(report.range.to)],
    ["Sales Count", report.summary.salesCount],
    ["Purchase Count", report.summary.purchaseCount],
    ["Total Revenue", report.summary.totalRevenue.toFixed(2)],
    ["Total Refunded", report.summary.totalRefunded.toFixed(2)],
    ["Net Revenue", report.summary.netRevenue.toFixed(2)],
    ["Total Purchase Spend", report.summary.totalPurchaseSpend.toFixed(2)],
    ["Estimated Profit", report.summary.estimatedProfit.toFixed(2)]
  ];

  const bestSellingRows = report.bestSelling.map((item) => [
    item.name,
    item.quantitySold,
    item.revenue.toFixed(2),
    item.estimatedProfit.toFixed(2)
  ]);

  const supplierRows = report.suppliers.map((item) => [
    item.name,
    item.medicineCount,
    item.purchaseInvoicesCount,
    item.totalPurchases.toFixed(2),
    item.lastPurchaseAt ? formatDateKey(item.lastPurchaseAt) : ""
  ]);

  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Worksheet ss:Name="Reports"><Table>',
    '<Row><Cell><Data ss:Type="String">Metric</Data></Cell><Cell><Data ss:Type="String">Value</Data></Cell></Row>',
    ...summaryRows.map(
      (row) =>
        `<Row><Cell><Data ss:Type="String">${escapeXml(row[0])}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(row[1])}</Data></Cell></Row>`
    ),
    "<Row></Row>",
    '<Row><Cell><Data ss:Type="String">Best Selling Medicine</Data></Cell><Cell><Data ss:Type="String">Base Units Sold</Data></Cell><Cell><Data ss:Type="String">Revenue</Data></Cell><Cell><Data ss:Type="String">Estimated Profit</Data></Cell></Row>',
    ...bestSellingRows.map(
      (row) =>
        `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`
    ),
    "<Row></Row>",
    '<Row><Cell><Data ss:Type="String">Supplier</Data></Cell><Cell><Data ss:Type="String">Medicines</Data></Cell><Cell><Data ss:Type="String">Invoices</Data></Cell><Cell><Data ss:Type="String">Purchases</Data></Cell><Cell><Data ss:Type="String">Last Purchase</Data></Cell></Row>',
    ...supplierRows.map(
      (row) =>
        `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`
    ),
    "</Table></Worksheet></Workbook>"
  ].join("");
}

function buildPdfBuffer(report) {
  const lines = [
    "PharmaCore Reports",
    `From: ${formatDateKey(report.range.from)}  To: ${formatDateKey(report.range.to)}`,
    `Sales Count: ${report.summary.salesCount}`,
    `Purchase Count: ${report.summary.purchaseCount}`,
    `Total Revenue: ${report.summary.totalRevenue.toFixed(2)} EGP`,
    `Total Refunded: ${report.summary.totalRefunded.toFixed(2)} EGP`,
    `Net Revenue: ${report.summary.netRevenue.toFixed(2)} EGP`,
    `Purchase Spend: ${report.summary.totalPurchaseSpend.toFixed(2)} EGP`,
    `Estimated Profit: ${report.summary.estimatedProfit.toFixed(2)} EGP`,
    `Low Stock: ${report.lowStock.length}`,
    `Expired: ${report.expiry.expired.length}`,
    `Expiring Soon: ${report.expiry.expiringSoon.length}`,
    "Best Selling:",
    ...report.bestSelling.slice(0, 5).map((item) => `${item.name}: ${item.quantitySold} base units / ${item.revenue.toFixed(2)} EGP`)
  ];

  const textStream = lines
    .map((line, index) => `BT /F1 12 Tf 40 ${790 - index * 18} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(textStream, "utf8")} >> stream\n${textStream}\nendstream endobj`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  });
  const xrefPosition = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

async function buildReportsOverview(query = {}) {
  const range = parseDateRange(query);

  const [sales, purchases, medicines, suppliers, customers, saleActivity, expenses, workspaceSettings] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                purchasePrice: true,
                stripsPerBox: true,
                pillsPerStrip: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.purchaseInvoice.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      include: {
        supplier: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.medicine.findMany({
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { quantity: "asc" }
    }),
    prisma.supplier.findMany({
      include: {
        medicines: { select: { id: true } },
        purchaseInvoices: {
          select: { id: true, totalAmount: true, createdAt: true }
        }
      },
      orderBy: { name: "asc" }
    }),
    prisma.customer.findMany({ select: { accountBalance: true } }),
    prisma.sale.findMany({
      where: { status: { not: "RETURNED" } },
      select: {
        createdAt: true,
        items: { select: { medicineId: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.shiftExpense.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { amount: true }
    }),
    prisma.unscoped.workspace.findUnique({
      where: { id: prisma.getWorkspaceId() },
      select: { stagnantAlertEnabled: true, stagnantAlertDays: true, expiryAlertDays: true }
    })
  ]);

  const salesCount = sales.length;
  const purchaseCount = purchases.length;
  const totalRevenue = sales.filter((sale) => sale.status !== "RETURNED").reduce((sum, sale) => sum + sale.finalAmount, 0);
  const totalRefunded = sales.reduce((sum, sale) => sum + sale.refundedAmount, 0);
  const netRevenue = totalRevenue - totalRefunded;
  const totalPurchaseSpend = purchases.filter((invoice) => invoice.status !== "RETURNED").reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const totalPurchaseReturned = purchases.filter((invoice) => invoice.status === "RETURNED").reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const purchaseDue = purchases.filter((invoice) => invoice.status !== "RETURNED" && invoice.paymentStatus !== "PAID").reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const customerReceivables = customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.accountBalance || 0)), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const dailyMap = new Map();
  const monthlyMap = new Map();
  const bestSellingMap = new Map();
  let estimatedProfit = 0;

  sales
    .filter((sale) => sale.status !== "RETURNED")
    .forEach((sale) => {
      const dayKey = formatDateKey(sale.createdAt);
      const monthKey = formatMonthKey(sale.createdAt);
      const dayEntry = dailyMap.get(dayKey) || { date: dayKey, totalRevenue: 0, invoiceCount: 0 };
      const monthEntry = monthlyMap.get(monthKey) || { month: monthKey, totalRevenue: 0, invoiceCount: 0 };

      dayEntry.totalRevenue += sale.finalAmount;
      dayEntry.invoiceCount += 1;
      monthEntry.totalRevenue += sale.finalAmount;
      monthEntry.invoiceCount += 1;
      dailyMap.set(dayKey, dayEntry);
      monthlyMap.set(monthKey, monthEntry);

      sale.items.forEach((item) => {
        const key = item.medicineId;
        const medicine = item.medicine || {};
        const baseUnitsPerBox = isFractionalMedicine(medicine) ? getBaseUnitsPerBox(medicine) : 1;
        const unitCost = baseUnitsPerBox > 0
          ? Number(medicine.purchasePrice || 0) / baseUnitsPerBox
          : Number(medicine.purchasePrice || 0);
        const soldBaseUnits = Number(item.baseUnits || item.quantity || 0);
        const cost = unitCost * soldBaseUnits;
        const profit = item.totalPrice - cost;
        estimatedProfit += profit;

        const entry = bestSellingMap.get(key) || {
          medicineId: key,
          name: item.medicine?.name || "Unknown medicine",
          quantitySold: 0,
          revenue: 0,
          estimatedProfit: 0
        };

        entry.quantitySold += soldBaseUnits;
        entry.revenue += item.totalPrice;
        entry.estimatedProfit += profit;
        bestSellingMap.set(key, entry);
      });
    });

  const now = new Date();
  const expiryAlertDays = Number(workspaceSettings?.expiryAlertDays || 30);
  const thirtyDaysAhead = new Date(now);
  thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + expiryAlertDays);
  const expired = medicines.filter((medicine) => medicine.expiryDate && new Date(medicine.expiryDate) < now);
  const expiringSoon = medicines.filter((medicine) => {
    if (!medicine.expiryDate) return false;
    const expiryDate = new Date(medicine.expiryDate);
    return expiryDate >= now && expiryDate <= thirtyDaysAhead;
  });
  const staleThresholdDays = Number(workspaceSettings?.stagnantAlertDays || 7);
  const staleAlertEnabled = workspaceSettings?.stagnantAlertEnabled !== false;
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - staleThresholdDays);
  const lastSoldByMedicine = new Map();

  saleActivity.forEach((sale) => {
    sale.items.forEach((item) => {
      if (!lastSoldByMedicine.has(item.medicineId)) {
        lastSoldByMedicine.set(item.medicineId, sale.createdAt);
      }
    });
  });

  const staleMedicines = (staleAlertEnabled ? medicines : [])
    .filter((medicine) => Number(medicine.quantity || 0) > 0)
    .map((medicine) => {
      const lastSoldAt = lastSoldByMedicine.get(medicine.id) || null;
      const inactiveSince = lastSoldAt || medicine.createdAt;
      const daysWithoutSale = Math.max(0, Math.floor((now - new Date(inactiveSince)) / (24 * 60 * 60 * 1000)));

      return {
        ...medicine,
        lastSoldAt,
        daysWithoutSale
      };
    })
    .filter((medicine) => new Date(medicine.lastSoldAt || medicine.createdAt) <= staleCutoff)
    .sort((left, right) => right.daysWithoutSale - left.daysWithoutSale || left.name.localeCompare(right.name));

  return {
    range,
    summary: {
      salesCount,
      purchaseCount,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalRefunded: Number(totalRefunded.toFixed(2)),
      netRevenue: Number(netRevenue.toFixed(2)),
      totalPurchaseSpend: Number(totalPurchaseSpend.toFixed(2)),
      totalPurchaseReturned: Number(totalPurchaseReturned.toFixed(2)),
      purchaseDue: Number(purchaseDue.toFixed(2)),
      customerReceivables: Number(customerReceivables.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      estimatedProfit: Number(estimatedProfit.toFixed(2))
    },
    dailySales: Array.from(dailyMap.values()).map((entry) => ({
      ...entry,
      totalRevenue: Number(entry.totalRevenue.toFixed(2))
    })),
    monthlySales: Array.from(monthlyMap.values()).map((entry) => ({
      ...entry,
      totalRevenue: Number(entry.totalRevenue.toFixed(2))
    })),
    bestSelling: Array.from(bestSellingMap.values())
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10)
      .map((entry) => ({
        ...entry,
        revenue: Number(entry.revenue.toFixed(2)),
        estimatedProfit: Number(entry.estimatedProfit.toFixed(2))
      })),
    lowStock: medicines.filter((medicine) => medicine.quantity <= medicine.minStock),
    staleStock: {
      enabled: staleAlertEnabled,
      thresholdDays: staleThresholdDays,
      medicines: staleMedicines
    },
    expiry: {
      thresholdDays: expiryAlertDays,
      expired,
      expiringSoon
    },
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      medicineCount: supplier.medicines.length,
      purchaseInvoicesCount: supplier.purchaseInvoices.length,
      totalPurchases: Number(
        supplier.purchaseInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0).toFixed(2)
      ),
      lastPurchaseAt: supplier.purchaseInvoices.length
        ? supplier.purchaseInvoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt
        : null
    }))
  };
}

exports.getOverview = async (req, res) => {
  try {
    const report = await buildReportsOverview(req.query);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const report = await buildReportsOverview(req.query);
    const workbook = buildSpreadsheetXml(report);

    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pharmacore-reports.xls"');
    res.send(workbook);
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.exportPdf = async (req, res) => {
  try {
    const report = await buildReportsOverview(req.query);
    const pdf = buildPdfBuffer(report);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="pharmacore-reports.pdf"');
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
