const express = require("express");
const controller = require("../controllers/auditController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect, allowRoles("ADMIN"));
router.get("/", controller.list);
module.exports = router;
