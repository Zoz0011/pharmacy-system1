const express = require("express");
const controller = require("../controllers/dataResetController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect, allowRoles("ADMIN"));
router.get("/backups", controller.listBackups);
router.post("/:scope", controller.reset);
router.post("/backups/:id/restore", controller.restore);
module.exports = router;
