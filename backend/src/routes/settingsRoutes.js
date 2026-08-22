const express = require("express");
const controller = require("../controllers/settingsController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.get("/", controller.getWorkspaceSettings);
router.put("/", allowRoles("ADMIN", "PHARMACIST"), controller.updateWorkspaceSettings);

module.exports = router;
