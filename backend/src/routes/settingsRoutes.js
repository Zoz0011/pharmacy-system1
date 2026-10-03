const express = require("express");
const controller = require("../controllers/settingsController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.get("/", requirePermissions("settings.view", "settings.manage"), controller.getWorkspaceSettings);
router.put("/", allowRoles("ADMIN", "PHARMACIST"), requirePermissions("settings.manage"), controller.updateWorkspaceSettings);

module.exports = router;
