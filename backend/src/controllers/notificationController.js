const prisma = require("../config/prisma");
const { recordAudit } = require("../services/auditService");

exports.listMine = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ userId: req.user.id }, { userId: null }] },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ success: true, data: notifications, unreadCount: notifications.filter((item) => !item.isRead).length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load notifications" });
  }
};

exports.create = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const type = String(req.body.type || "INFO").trim().toUpperCase();
    const userId = req.body.userId ? Number(req.body.userId) : null;
    if (!title || !message) return res.status(400).json({ success: false, message: "Title and message are required" });
    if (userId && !(await prisma.user.findUnique({ where: { id: userId } }))) return res.status(404).json({ success: false, message: "Recipient not found" });
    const notification = await prisma.notification.create({ data: { title, message, type, userId } });
    await recordAudit({ userId: req.user.id, action: "CREATE", entityType: "NOTIFICATION", entityId: notification.id, description: `Created notification ${title}` });
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create notification" });
  }
};

exports.markRead = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const notification = await prisma.notification.findFirst({ where: { id, OR: [{ userId: req.user.id }, { userId: null }] } });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
    const updated = await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update notification" });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { OR: [{ userId: req.user.id }, { userId: null }], isRead: false }, data: { isRead: true, readAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update notifications" });
  }
};
