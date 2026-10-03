const express = require("express");
const controller = require("../controllers/cashierShiftController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));
router.get("/current", requirePermissions("cashier.shifts", "sales.pos"), controller.getCurrentShift);
router.get("/", requirePermissions("cashier.shifts"), controller.getShifts);
router.post("/open", requirePermissions("cashier.shifts"), controller.openShift);
router.post("/:id/expenses", requirePermissions("cashier.expenses"), controller.addExpense);
router.post("/:id/close", requirePermissions("cashier.shifts"), controller.closeShift);

module.exports = router;
