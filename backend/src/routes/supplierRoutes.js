const express = require("express");
const controller = require("../controllers/supplierController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", requirePermissions("suppliers.view", "sales.pos"), controller.getSuppliers);
router.get("/:id/profile", requirePermissions("suppliers.view"), controller.getSupplierProfile);
router.post("/", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("suppliers.manage"), controller.createSupplier);
router.post("/:id/payments", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("cashier.collections", "cashier.supplier_payment", "suppliers.manage"), controller.recordPayment);
router.put("/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("suppliers.manage"), controller.updateSupplier);
router.delete("/:id", allowRoles("ADMIN"), requirePermissions("suppliers.manage"), controller.deleteSupplier);

module.exports = router;
