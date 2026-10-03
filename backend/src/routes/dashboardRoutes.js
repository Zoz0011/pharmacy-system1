const express = require("express");
const router = express.Router();
const { summary } = require("../controllers/dashboardController");
const { protect, requirePermissions } = require("../middleware/authMiddleware");

router.get("/summary", protect, requirePermissions("dashboard.view"), summary);

module.exports = router;
