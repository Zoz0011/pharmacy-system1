const express = require("express");
const controller = require("../controllers/reportsController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(requirePermissions("reports.view"));
router.get("/overview", controller.getOverview);
router.get("/export/excel", allowRoles("ADMIN", "PHARMACIST"), controller.exportExcel);
router.get("/export/pdf", allowRoles("ADMIN", "PHARMACIST"), controller.exportPdf);

module.exports = router;
