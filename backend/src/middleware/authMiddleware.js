const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { getUserPermissions } = require("../config/permissions");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const tokenUser = await prisma.unscoped.user.findUnique({
      where: { id: decoded.id },
      // Read both formats while existing pharmacy accounts are gradually
      // migrated: older accounts can still store grants in `permissions`,
      // while the current employee editor mirrors them in customFields.
      select: { id: true, name: true, username: true, email: true, role: true, permissions: true, customFields: true, active: true, workspaceId: true, updatedAt: true, workspace: { select: { name: true } } }
    });

    if (!tokenUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (tokenUser.active === false) {
      return res.status(403).json({ message: "Employee account is inactive" });
    }

    return prisma.withWorkspace(tokenUser.workspaceId, () => {
      req.user = { ...tokenUser, permissions: getUserPermissions(tokenUser), workspaceName: tokenUser.workspace?.name };
      delete req.user.workspace;
      return next();
    });
  } catch (error) {
    res.status(401).json({ message: "Not authorized", error: error.message });
  }
};

exports.allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};

// Administrative permissions are checked again on the server. Hiding a menu
// item in the browser is never relied upon as access control.
exports.requirePermissions = (...permissions) => {
  return (req, res, next) => {
    if (req.user.role === "ADMIN") return next();
    const granted = Array.isArray(req.user.permissions) ? req.user.permissions : getUserPermissions(req.user);
    if (!permissions.some((permission) => granted.includes(permission))) {
      return res.status(403).json({ message: "لا تملك صلاحية الأدمن المطلوبة لتنفيذ هذه العملية." });
    }
    next();
  };
};
