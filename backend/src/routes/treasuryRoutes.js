const express = require("express");
const controller = require("../controllers/treasuryController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));
router.get("/", controller.getTreasury);
router.post("/adjustments", allowRoles("ADMIN", "PHARMACIST"), controller.createAdjustment);

module.exports = router;
