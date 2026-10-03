const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { getUserPermissions } = require("../config/permissions");
const { sendPasswordResetCode } = require("../services/emailService");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: getUserPermissions(user),
    workspaceId: user.workspaceId,
    workspaceName: user.workspace?.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, workspaceId: user.workspaceId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

exports.register = async (req, res) => {
  try {
    // Public registration creates a completely separate pharmacy workspace.
    // Employees in an existing workspace are still created by its administrator.
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "Username, email, password, and password confirmation are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Password confirmation does not match" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim().toLowerCase();
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    }
    const existing = await prisma.unscoped.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username: normalizedUsername }] }
    });
    if (existing) {
      return res.status(409).json({ message: "Email or username is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.unscoped.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: `صيدلية ${String(username).trim()}` } });
      const createdUser = await tx.user.create({
        data: {
          name: String(username).trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          password: hashedPassword,
          role: "ADMIN",
          workspaceId: workspace.id
        },
        include: { workspace: true }
      });
      await tx.treasuryAccount.create({
        data: {
          name: "الخزينة الرئيسية",
          balance: 0,
          isDefault: true,
          workspaceId: workspace.id
        }
      });
      return createdUser;
    });

    res.status(201).json({
      message: "Account created successfully",
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (error) {
    if (error.code === "P2021" || error.code === "P2022") {
      return res.status(500).json({
        message: "Database is not initialized. Run backend setup first.",
        error: error.message
      });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginIdentifier = String(identifier || email || "").trim().toLowerCase();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Email or username and password are required" });
    }

    const user = await prisma.unscoped.user.findFirst({
      where: { OR: [{ email: loginIdentifier }, { username: loginIdentifier }] },
      include: { workspace: true }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.active === false) {
      return res.status(403).json({ message: "This employee account is inactive" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = signToken(user);

    res.json({
      message: "Login successful",
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    if (error.code === "P2021" || error.code === "P2022") {
      return res.status(500).json({
        message: "Database is not initialized. Run backend setup first.",
        error: error.message
      });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "").trim().toLowerCase();
    if (!identifier) return res.status(400).json({ message: "Email or username is required" });

    const user = await prisma.unscoped.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] }
    });
    const genericMessage = "If the account exists, a reset code will be sent to its recovery email";
    if (!user) return res.json({ message: genericMessage, deliveryConfigured: true });

    const code = String(crypto.randomInt(100000, 1000000));
    const passwordResetCodeHash = crypto.createHash("sha256").update(code).digest("hex");
    await prisma.unscoped.user.update({
      where: { id: user.id },
      data: { passwordResetCodeHash, passwordResetExpiresAt: new Date(Date.now() + 10 * 60 * 1000) }
    });

    const delivery = await sendPasswordResetCode({ to: user.email, username: user.username || user.name, code });
    if (!delivery.sent) {
      return res.status(503).json({
        message: "Password recovery email is not configured on this server yet",
        code: "EMAIL_NOT_CONFIGURED"
      });
    }
    return res.json({ message: genericMessage, deliveryConfigured: true });
  } catch (error) {
    res.status(500).json({ message: "Could not start password recovery", error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const identifier = String(req.body.identifier || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const { password, confirmPassword } = req.body;
    if (!identifier || !code || !password || !confirmPassword) {
      return res.status(400).json({ message: "All reset fields are required" });
    }
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (password !== confirmPassword) return res.status(400).json({ message: "Password confirmation does not match" });

    const user = await prisma.unscoped.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] }
    });
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    if (!user || !user.passwordResetCodeHash || user.passwordResetCodeHash !== codeHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      return res.status(400).json({ message: "Reset code is invalid or expired" });
    }

    await prisma.unscoped.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 10),
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null
      }
    });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Could not reset password", error: error.message });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
