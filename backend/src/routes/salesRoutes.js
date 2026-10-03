const express = require("express");
const controller = require("../controllers/salesController");
const deliveryAgentController = require("../controllers/deliveryAgentController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST", "CASHIER"));

router.get("/summary/daily", requirePermissions("sales.pos", "reports.view"), controller.getDailySummary);
router.get("/promotions/active", requirePermissions("sales.pos"), controller.getActivePromotions);
router.get("/delivery-agents", requirePermissions("sales.delivery_agents"), deliveryAgentController.list);
router.post("/delivery-agents", requirePermissions("sales.delivery_agents"), deliveryAgentController.create);
router.put("/delivery-agents/:id", requirePermissions("sales.delivery_agents"), deliveryAgentController.update);
router.delete("/delivery-agents/:id", requirePermissions("sales.delivery_agents"), deliveryAgentController.remove);
// Keep the POS "recent operations" list separate from the general sales API.
// A cashier may sell without being allowed to browse all previous sales.
router.get("/recent", requirePermissions("cashier.recent_sales", "sales.returns", "reports.view"), controller.getSales);
router.get("/", requirePermissions("sales.pos", "reports.view", "sales.returns"), controller.getSales);
router.get("/:id", requirePermissions("sales.pos", "reports.view", "sales.returns"), controller.getSaleById);
router.post("/", requirePermissions("sales.pos"), controller.createSale);
router.post("/import", requirePermissions("sales.pos"), controller.importSales);
router.post("/free-return", requirePermissions("sales.returns"), controller.createFreeReturn);
router.post("/:id/return", requirePermissions("sales.returns"), controller.returnSale);

module.exports = router;
