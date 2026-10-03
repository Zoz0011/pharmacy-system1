const prisma = require("../config/prisma");

function resourceFromRequest(req) {
  const path = String(req.baseUrl || req.path || "").replace(/^\/api\/?/, "");
  return path.split("/").filter(Boolean)[0] || "system";
}

function actionFromMethod(method) {
  return ({ POST: "CREATE", PUT: "UPDATE", PATCH: "UPDATE", DELETE: "DELETE" })[method] || String(method || "ACTION");
}

async function recordAudit({ userId, workspaceId, action, entityType, entityId, description, metadata }) {
  return prisma.auditLog.create({
    data: {
      ...(workspaceId ? { workspaceId: Number(workspaceId) } : {}),
      actorUserId: userId || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

function auditMutations(req, res, next) {
  res.on("finish", () => {
    if (!req.user || res.statusCode >= 400 || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
    if (req.baseUrl === "/api/audit" || req.baseUrl === "/api/notifications") return;
    const entityType = resourceFromRequest(req);
    recordAudit({
      userId: req.user.id,
      workspaceId: req.user.workspaceId,
      action: actionFromMethod(req.method),
      entityType,
      entityId: req.params?.id,
      description: `${actionFromMethod(req.method)} ${entityType}`,
      metadata: {
        path: req.originalUrl,
        statusCode: res.statusCode,
        // A per-browser ID lets other devices distinguish their changes from
        // writes that were just made by this same device.
        deviceId: String(req.get("x-pharmacore-device-id") || "").slice(0, 120) || null
      }
    }).catch((error) => console.error("Audit log error:", error.message));
  });
  next();
}

module.exports = { auditMutations, recordAudit };
