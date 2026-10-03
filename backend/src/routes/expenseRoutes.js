const express = require("express");
const controller = require("../controllers/expenseController");
const { protect, requirePermissions } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.get("/categories", requirePermissions("expenses.view", "expenses.manage", "treasury.view", "treasury.manage"), controller.listCategories);
router.post("/categories", requirePermissions("expenses.manage", "treasury.manage"), controller.createCategory);
router.put("/categories/:id", requirePermissions("expenses.manage", "treasury.manage"), controller.updateCategory);
router.delete("/categories/:id", requirePermissions("expenses.manage", "treasury.manage"), controller.deleteCategory);
router.get("/", requirePermissions("expenses.view", "expenses.manage", "treasury.view", "treasury.manage"), controller.listExpenses);
router.post("/", requirePermissions("expenses.manage", "treasury.manage"), controller.createExpense);
router.delete("/:id", requirePermissions("expenses.manage", "treasury.manage"), controller.deleteExpense);
module.exports = router;
