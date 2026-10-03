const express = require("express");
const controller = require("../controllers/inventoryController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(requirePermissions("inventory.view", "inventory.manage"));

router.get("/overview", controller.getOverview);
router.get("/expired", controller.getExpired);
router.get("/movements", controller.getMovements);
router.get("/transfers", controller.getTransfers);
router.post("/transfers", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.createTransfer);
router.patch("/transfers/:id/receive", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.receiveTransfer);
router.get("/exchanges", controller.getExchanges);
router.post("/exchanges", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.createExchange);
router.get("/counts", controller.getInventoryCounts);
router.get("/counts/:id", controller.getInventoryCount);
router.post("/counts", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.createInventoryCount);
router.delete("/counts/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.cancelInventoryCount);
router.post("/counts/:id/items", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.addInventoryCountItem);
router.patch("/counts/:id/items/:itemId", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.updateInventoryCountItem);
router.post("/counts/:id/complete", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.completeInventoryCount);
router.get("/report", controller.getInventoryReport);
router.get("/report/export", controller.exportInventoryReport);
router.post("/adjustments", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("inventory.manage"), controller.adjustStock);

module.exports = router;
