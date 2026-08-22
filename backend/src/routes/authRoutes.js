const express = require("express");
const { register, login, forgotPassword, resetPassword, me, changePassword } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, me);
router.post("/change-password", protect, changePassword);

module.exports = router;
