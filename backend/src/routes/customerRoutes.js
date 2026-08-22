const express = require("express");
const controller = require("../controllers/customerController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", controller.getCustomers);
router.get("/:id/account", controller.getCustomerAccount);
router.post("/:id/payments", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.recordPayment);
router.post("/:id/adjustments", allowRoles("ADMIN", "PHARMACIST"), controller.adjustBalance);
router.post("/", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.createCustomer);
router.put("/:id", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.updateCustomer);
router.delete("/:id", allowRoles("ADMIN", "PHARMACIST"), controller.deleteCustomer);

module.exports = router;
