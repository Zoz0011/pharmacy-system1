const express = require("express");
const controller = require("../controllers/branchController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);
router.get("/", controller.list);
router.post("/", allowRoles("ADMIN"), controller.create);
router.put("/:id", allowRoles("ADMIN"), controller.update);
router.delete("/:id", allowRoles("ADMIN"), controller.remove);
module.exports = router;
