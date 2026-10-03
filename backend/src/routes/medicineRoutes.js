const express = require("express");
const router = express.Router();
const controller = require("../controllers/medicineController");
const purchaseController = require("../controllers/purchaseController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/expiring-soon", requirePermissions("catalog.view", "inventory.view"), controller.expiringSoon);
router.get("/low-stock", requirePermissions("catalog.view", "inventory.view"), controller.lowStock);
router.get("/options", requirePermissions("catalog.view"), controller.getMedicineOptions);
router.get("/export", requirePermissions("catalog.view"), controller.exportMedicines);
router.get("/barcode/:barcode", requirePermissions("catalog.view", "sales.pos"), controller.findByBarcode);
router.post("/import", requirePermissions("catalog.manage"), controller.importMedicines);
router.get("/", requirePermissions("catalog.view", "sales.pos"), controller.getMedicines);
router.delete("/", allowRoles("ADMIN"), controller.deleteAllMedicines);
router.post("/bulk", requirePermissions("catalog.manage"), controller.bulkCreateMedicines);
router.patch("/:id/archive", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("catalog.manage"), controller.archiveMedicine);
router.patch("/:id/restore", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("catalog.manage"), controller.restoreMedicine);
router.post("/purchase-invoices", requirePermissions("purchases.manage"), purchaseController.createPurchaseInvoice);
router.get("/:id", requirePermissions("catalog.view", "sales.pos"), controller.getMedicineById);
router.post("/", requirePermissions("catalog.manage"), controller.createMedicine);
// The cashier's quick-items permission is deliberately narrower than full
// catalog management: it only controls the POS quick-items list.
router.patch("/:id/quick-sale", requirePermissions("catalog.manage", "cashier.quick_items"), controller.updateQuickSaleStatus);
router.put("/:id", requirePermissions("catalog.manage"), controller.updateMedicine);
router.delete("/:id", requirePermissions("catalog.manage"), controller.deleteMedicine);

module.exports = router;
