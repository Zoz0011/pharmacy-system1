const express = require("express");
const router = express.Router();
const controller = require("../controllers/medicineController");
const purchaseController = require("../controllers/purchaseController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/expiring-soon", controller.expiringSoon);
router.get("/low-stock", controller.lowStock);
router.get("/options", controller.getMedicineOptions);
router.get("/export", controller.exportMedicines);
router.get("/barcode/:barcode", controller.findByBarcode);
router.post("/import", controller.importMedicines);
router.get("/", controller.getMedicines);
router.delete("/", allowRoles("ADMIN"), controller.deleteAllMedicines);
router.post("/bulk", controller.bulkCreateMedicines);
router.post("/purchase-invoices", purchaseController.createPurchaseInvoice);
router.get("/:id", controller.getMedicineById);
router.post("/", controller.createMedicine);
router.put("/:id", controller.updateMedicine);
router.delete("/:id", controller.deleteMedicine);

module.exports = router;
