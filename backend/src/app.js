const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const userRoutes = require("./routes/userRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const customerRoutes = require("./routes/customerRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const salesRoutes = require("./routes/salesRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const cashierShiftRoutes = require("./routes/cashierShiftRoutes");
const treasuryRoutes = require("./routes/treasuryRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const accountingRoutes = require("./routes/accountingRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const branchRoutes = require("./routes/branchRoutes");
const auditRoutes = require("./routes/auditRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const dataResetRoutes = require("./routes/dataResetRoutes");
const syncRoutes = require("./routes/syncRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const salesAgentRoutes = require("./routes/salesAgentRoutes");
const customerGroupRoutes = require("./routes/customerGroupRoutes");
const creditSalesRoutes = require("./routes/creditSalesRoutes");
const { auditMutations } = require("./services/auditService");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const firebaseProjectId = process.env.GCLOUD_PROJECT || (() => {
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId; } catch { return null; }
})();
const firebaseHostingOrigins = firebaseProjectId
  ? [`https://${firebaseProjectId}.web.app`, `https://${firebaseProjectId}.firebaseapp.com`]
  : [];
const isDevelopment = process.env.NODE_ENV !== "production";
// Development may be opened from another device on the same private network.
// Keep this allowance local-only; production still requires an explicitly
// configured origin.
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(?:192\.168\.\d{1,3}\.\d{1,3})|(?:172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}))(?::\d+)?$/i.test(origin);

app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (payload) => {
    if (res.statusCode >= 500 && payload && typeof payload === "object" && !Array.isArray(payload)) {
      const { error, ...safePayload } = payload;
      return sendJson({ ...safePayload, success: false, message: "حدث خطأ في الخادم. حاول مرة أخرى." });
    }
    return sendJson(payload);
  };
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || firebaseHostingOrigins.includes(origin) || (isDevelopment && isLocalOrigin(origin))) return callback(null, true);
    const error = new Error("Origin is not allowed by CORS");
    error.statusCode = 403;
    error.publicMessage = "مصدر الطلب غير مسموح.";
    return callback(error);
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(auditMutations);

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    project: "PharmaCore API"
  });
});

app.get("/api/health", (req, res) => res.json({ status: "OK", project: "PharmaCore API" }));

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/users", userRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/shifts", cashierShiftRoutes);
app.use("/api/treasury", treasuryRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/data-reset", dataResetRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/sales-agents", salesAgentRoutes);
app.use("/api/customer-groups", customerGroupRoutes);
app.use("/api/credit-sales", creditSalesRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: "المسار غير موجود" }));
app.use(errorHandler);

module.exports = app;
