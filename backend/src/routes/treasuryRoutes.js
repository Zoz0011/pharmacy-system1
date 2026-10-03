const express = require("express");
const controller = require("../controllers/treasuryController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));
router.get("/accounts", requirePermissions("treasury.view", "sales.pos", "cashier.collections"), controller.getPaymentAccounts);
router.get("/", requirePermissions("treasury.view"), controller.getTreasury);
router.post("/adjustments", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("treasury.manage"), controller.createAdjustment);

module.exports = router;
