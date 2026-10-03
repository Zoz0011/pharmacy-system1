const express = require("express");
const controller = require("../controllers/notificationController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.use(requirePermissions("notifications.view"));
router.get("/", controller.listMine);
router.post("/", allowRoles("ADMIN"), controller.create);
router.patch("/:id/read", controller.markRead);
router.patch("/read-all", controller.markAllRead);
module.exports = router;
