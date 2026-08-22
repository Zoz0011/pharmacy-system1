const express = require("express");
const controller = require("../controllers/supplierController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", controller.getSuppliers);
router.post("/", allowRoles("ADMIN", "PHARMACIST"), controller.createSupplier);
router.post("/:id/payments", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.recordPayment);
router.put("/:id", allowRoles("ADMIN", "PHARMACIST"), controller.updateSupplier);
router.delete("/:id", allowRoles("ADMIN"), controller.deleteSupplier);

module.exports = router;
