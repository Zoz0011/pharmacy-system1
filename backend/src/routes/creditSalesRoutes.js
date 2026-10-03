const express = require("express");
const controller = require("../controllers/creditSalesController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);
router.get("/", requirePermissions("sales.pos", "reports.view", "cashier.shifts"), controller.list);
router.get("/customer/:customerId", requirePermissions("sales.pos", "customers.view", "reports.view"), controller.customerStatement);
router.post("/:id/cancel", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("sales.returns", "sales.pos"), controller.cancel);
module.exports = router;
