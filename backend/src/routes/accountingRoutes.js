const express = require("express");
const controller = require("../controllers/accountingController");
const { protect, allowRoles, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.use(allowRoles("ADMIN", "PHARMACIST"));
router.use(requirePermissions("accounting.view", "accounting.manage"));
router.get("/accounts", controller.listAccounts);
router.post("/accounts", controller.createAccount);
router.put("/accounts/:id", controller.updateAccount);
router.delete("/accounts/:id", controller.deleteAccount);
router.post("/accounts/:id/opening", controller.addOpeningBalance);
router.get("/accounts/:id/ledger", controller.getLedger);
router.post("/transfers", controller.transfer);
router.get("/reports/profit-loss", controller.getProfitLoss);
router.get("/reports/trading", controller.getTrading);
router.get("/reports/trial-balance", controller.getTrialBalance);
router.get("/reports/cash-flow", controller.getCashFlow);
router.get("/reports/balance-sheet", controller.getBalanceSheet);
router.get("/reports/movements", controller.getMovements);

module.exports = router;
