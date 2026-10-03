const prisma = require("../config/prisma");

function auditMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function revisionFor(audit) {
  if (!audit) return "initial";
  const timestamp = audit.createdAt ? new Date(audit.createdAt).toISOString() : "";
  return `${audit.id || "change"}:${timestamp}`;
}

exports.status = async (req, res) => {
  try {
    // Each pharmacy observes only its own revisions.  Without this filter a
    // sale in another pharmacy could hide this pharmacy's latest change.
    const latest = await prisma.auditLog.findFirst({
      where: { workspaceId: req.user.workspaceId },
      orderBy: { createdAt: "desc" }
    });
    const metadata = auditMetadata(latest?.metadata);
    res.json({
      success: true,
      data: {
        revision: revisionFor(latest),
        changedAt: latest?.createdAt || null,
        resource: latest?.entityType || null,
        action: latest?.action || null,
        originDeviceId: metadata.deviceId || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not read sync status" });
  }
};

exports.reconcile = async (req, res) => {
  try {
    const tables = Array.isArray(req.body?.tables)
      ? req.body.tables.map((value) => String(value).slice(0, 80)).filter(Boolean).slice(0, 120)
      : [];
    // Firestore is the central source of truth. This endpoint confirms that a
    // client has completed a reconciliation cycle; the audit middleware then
    // publishes the new revision for the other signed-in devices to observe.
    res.json({
      success: true,
      data: {
        reconciledTables: tables,
        reconciledAt: new Date().toISOString(),
        message: "Cloud data reconciliation completed"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not reconcile cloud data" });
  }
};
