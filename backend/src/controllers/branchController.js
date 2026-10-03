const prisma = require("../config/prisma");
const { recordAudit } = require("../services/auditService");

function normalize(body = {}) {
  return {
    name: String(body.name || "").trim(),
    code: String(body.code || "").trim().toUpperCase(),
    phone: String(body.phone || "").trim() || null,
    email: String(body.email || "").trim().toLowerCase() || null,
    address: String(body.address || "").trim() || null,
    isActive: body.isActive !== false,
    isDefault: body.isDefault === true
  };
}

async function applyDefault(tx, branch) {
  if (!branch.isDefault) return branch;
  await tx.branch.updateMany({ where: { id: { not: branch.id } }, data: { isDefault: false } });
  return branch;
}

exports.list = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load branches" });
  }
};

exports.create = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.name || !data.code) return res.status(400).json({ success: false, message: "Branch name and code are required" });
    const branch = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.branch.count();
      const created = await tx.branch.create({ data: { ...data, isDefault: data.isDefault || existingCount === 0 } });
      return applyDefault(tx, created);
    });
    await recordAudit({ userId: req.user.id, action: "CREATE", entityType: "BRANCH", entityId: branch.id, description: `Created branch ${branch.name}` });
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(error.code === "P2002" ? 400 : 500).json({ success: false, message: error.code === "P2002" ? "Branch code already exists" : "Could not create branch" });
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = normalize(req.body);
    if (!id || !data.name || !data.code) return res.status(400).json({ success: false, message: "Branch name and code are required" });
    const branch = await prisma.$transaction(async (tx) => applyDefault(tx, await tx.branch.update({ where: { id }, data })));
    await recordAudit({ userId: req.user.id, action: "UPDATE", entityType: "BRANCH", entityId: id, description: `Updated branch ${branch.name}` });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(error.code === "P2025" ? 404 : error.code === "P2002" ? 400 : 500).json({ success: false, message: error.code === "P2025" ? "Branch not found" : error.code === "P2002" ? "Branch code already exists" : "Could not update branch" });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ success: false, message: "Branch not found" });
    if (branch.isDefault) return res.status(400).json({ success: false, message: "Choose another default branch before deleting this branch" });
    await prisma.branch.delete({ where: { id } });
    await recordAudit({ userId: req.user.id, action: "DELETE", entityType: "BRANCH", entityId: id, description: `Deleted branch ${branch.name}` });
    res.json({ success: true, message: "Branch deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete branch" });
  }
};
