const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
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
      select: { id: true, name: true, username: true, email: true, role: true, active: true, workspaceId: true, workspace: { select: { name: true } } }
    });

    if (!tokenUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (tokenUser.active === false) {
      return res.status(403).json({ message: "Employee account is inactive" });
    }

    return prisma.withWorkspace(tokenUser.workspaceId, () => {
      req.user = { ...tokenUser, workspaceName: tokenUser.workspace?.name };
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
