const express = require("express");
const controller = require("../controllers/cashierShiftController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));
router.get("/current", controller.getCurrentShift);
router.get("/", controller.getShifts);
router.post("/open", controller.openShift);
router.post("/:id/expenses", controller.addExpense);
router.post("/:id/close", controller.closeShift);

module.exports = router;
