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

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    project: "PharmaCore API"
  });
});

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

module.exports = app;
