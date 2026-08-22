const express = require("express");
const controller = require("../controllers/inventoryController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/overview", controller.getOverview);
router.get("/expired", controller.getExpired);
router.get("/movements", controller.getMovements);
router.get("/counts", controller.getInventoryCounts);
router.get("/counts/:id", controller.getInventoryCount);
router.post("/counts", allowRoles("ADMIN", "PHARMACIST"), controller.createInventoryCount);
router.post("/counts/:id/items", allowRoles("ADMIN", "PHARMACIST"), controller.addInventoryCountItem);
router.patch("/counts/:id/items/:itemId", allowRoles("ADMIN", "PHARMACIST"), controller.updateInventoryCountItem);
router.post("/counts/:id/complete", allowRoles("ADMIN", "PHARMACIST"), controller.completeInventoryCount);
router.get("/report", controller.getInventoryReport);
router.get("/report/export", controller.exportInventoryReport);
router.post("/adjustments", allowRoles("ADMIN", "PHARMACIST"), controller.adjustStock);

module.exports = router;
