const prisma = require("../config/prisma");

function cleanSettings(workspace) {
  return {
    stagnantAlertEnabled: workspace.stagnantAlertEnabled !== false,
    stagnantAlertDays: Number(workspace.stagnantAlertDays || 7),
    expiryAlertDays: Number(workspace.expiryAlertDays || 30)
  };
}

exports.getWorkspaceSettings = async (req, res) => {
  try {
    const workspace = await prisma.unscoped.workspace.findUnique({ where: { id: req.user.workspaceId } });
    if (!workspace) return res.status(404).json({ success: false, message: "Workspace not found" });
    res.json({ success: true, data: cleanSettings(workspace) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
};

exports.updateWorkspaceSettings = async (req, res) => {
  try {
    const stagnantAlertDays = Number.parseInt(req.body.stagnantAlertDays, 10);
    const expiryAlertDays = Number.parseInt(req.body.expiryAlertDays, 10);
    if (!Number.isInteger(stagnantAlertDays) || stagnantAlertDays < 1 || stagnantAlertDays > 365) {
      return res.status(400).json({ success: false, message: "Stagnant alert days must be between 1 and 365" });
    }
    if (!Number.isInteger(expiryAlertDays) || expiryAlertDays < 1 || expiryAlertDays > 365) {
      return res.status(400).json({ success: false, message: "Expiry alert days must be between 1 and 365" });
    }
    const workspace = await prisma.unscoped.workspace.update({
      where: { id: req.user.workspaceId },
      data: { stagnantAlertEnabled: req.body.stagnantAlertEnabled !== false, stagnantAlertDays, expiryAlertDays }
    });
    res.json({ success: true, message: "Workspace settings updated", data: cleanSettings(workspace) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
};
