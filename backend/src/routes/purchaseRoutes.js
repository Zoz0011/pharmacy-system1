const express = require("express");
const controller = require("../controllers/purchaseController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST"));

router.get("/", controller.getPurchaseInvoices);
router.get("/number/:invoiceNumber", controller.getPurchaseInvoiceByNumber);
router.get("/:id", controller.getPurchaseInvoiceById);
router.post("/", controller.createPurchaseInvoice);
router.post("/free-return", controller.createFreePurchaseReturn);
router.patch("/:id/payment-status", controller.updatePaymentStatus);
router.post("/:id/return", controller.returnPurchaseInvoice);

module.exports = router;
