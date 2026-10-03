const express = require("express");
const controller = require("../controllers/syncController");
const { protect, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
// Sales users only read the revision to refresh their own open session. They
// cannot run a reconciliation or access the management-only sync operation.
router.get("/status", requirePermissions("sync.manage", "sales.pos"), controller.status);
router.post("/reconcile", requirePermissions("sync.manage"), controller.reconcile);

module.exports = router;
