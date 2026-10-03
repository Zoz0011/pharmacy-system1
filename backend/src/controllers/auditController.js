const prisma = require("../config/prisma");

exports.list = async (req, res) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
    const logs = await prisma.auditLog.findMany({
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take
    });
    res.json({ success: true, data: logs.map((log) => ({ ...log, metadata: log.metadata ? JSON.parse(log.metadata) : null })) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load audit log" });
  }
};
