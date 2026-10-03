const express = require("express");
const controller = require("../controllers/prescriptionController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/", controller.list);
router.post("/", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.create);
router.patch("/:id/status", allowRoles("ADMIN", "PHARMACIST", "CASHIER"), controller.updateStatus);

module.exports = router;
