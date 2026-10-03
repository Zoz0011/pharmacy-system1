const express = require("express");
const controller = require("../controllers/customerController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", requirePermissions("customers.view", "sales.pos"), controller.getCustomers);
router.get("/:id/profile", requirePermissions("customers.view"), controller.getCustomerProfile);
router.get("/:id/account", requirePermissions("customers.view", "cashier.collections", "cashier.customer_collection"), controller.getCustomerAccount);
router.post("/:id/payments", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("cashier.collections", "cashier.customer_collection", "customers.manage"), controller.recordPayment);
router.post("/:id/advances", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("cashier.collections", "customers.manage"), controller.recordAdvance);
router.post("/:id/settlement", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("cashier.collections", "customers.manage"), controller.settleAccount);
router.post("/:id/adjustments", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("customers.manage"), controller.adjustBalance);
router.post("/", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("customers.manage", "sales.pos"), controller.createCustomer);
router.put("/:id", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), requirePermissions("customers.manage"), controller.updateCustomer);
router.delete("/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("customers.manage"), controller.deleteCustomer);

module.exports = router;
