const express = require("express");
const controller = require("../controllers/purchaseController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("purchases.view", "purchases.manage", "cashier.purchase_returns"), controller.getPurchaseInvoices);
router.get("/number/:invoiceNumber", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("purchases.view", "purchases.manage", "cashier.purchase_returns"), controller.getPurchaseInvoiceByNumber);
router.get("/:id", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("purchases.view", "purchases.manage", "cashier.purchase_returns"), controller.getPurchaseInvoiceById);
router.post("/", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("purchases.manage"), controller.createPurchaseInvoice);
router.put("/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("purchases.manage"), controller.updatePurchaseInvoice);
router.post("/free-return", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("purchases.manage", "cashier.purchase_returns"), controller.createFreePurchaseReturn);
router.patch("/:id/payment-status", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("purchases.manage"), controller.updatePaymentStatus);
router.post("/:id/return", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("purchases.manage", "cashier.purchase_returns"), controller.returnPurchaseInvoice);

module.exports = router;
