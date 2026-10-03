const express = require("express");
const controller = require("../controllers/customerGroupController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);
router.get("/", requirePermissions("customers.view", "sales.pos"), controller.list);
router.post("/", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("customers.manage"), controller.create);
router.delete("/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("customers.manage"), controller.remove);
module.exports = router;
