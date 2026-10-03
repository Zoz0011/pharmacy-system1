const express = require("express");
const controller = require("../controllers/catalogController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.get("/:resource", requirePermissions("catalog.view", "sales.pos"), controller.list);
router.post("/:resource", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("catalog.manage"), controller.create);
router.put("/:resource/:id", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("catalog.manage"), controller.update);
router.delete("/:resource/:id", allowRoles("ADMIN"), requirePermissions("catalog.manage"), controller.remove);
module.exports = router;
