const express = require("express");
const controller = require("../controllers/userController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(allowRoles("ADMIN"));

router.get("/roles", controller.getRoleOptions);
router.get("/", controller.getUsers);
router.post("/", controller.createUser);
router.put("/:id", controller.updateUser);
router.patch("/:id/password", controller.resetUserPassword);
router.delete("/:id", controller.deleteUser);

module.exports = router;
