const express = require("express");
const controller = require("../controllers/salesController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));

router.get("/summary/daily", controller.getDailySummary);
router.get("/", controller.getSales);
router.get("/:id", controller.getSaleById);
router.post("/", controller.createSale);
router.post("/free-return", controller.createFreeReturn);
router.post("/:id/return", controller.returnSale);

module.exports = router;
