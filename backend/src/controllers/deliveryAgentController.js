const prisma = require("../config/prisma");

function text(value) {
  const result = String(value || "").trim();
  return result || null;
}

function payload(body = {}) {
  return {
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: text(body.email),
    deliveryArea: text(body.deliveryArea),
    active: body.active !== false,
    deliveryOperations: Math.max(0, Math.floor(Number(body.deliveryOperations || 0))),
    collectedAmount: Math.max(0, Number(Number(body.collectedAmount || 0).toFixed(2)))
  };
}

exports.list = async (req, res) => {
  try {
    const rows = await prisma.deliveryAgent.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: "Could not load delivery agents" });
  }
};

exports.create = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.name || !data.phone) return res.status(400).json({ success: false, message: "Delivery agent name and phone are required" });
    const row = await prisma.deliveryAgent.create({ data });
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: "Could not create delivery agent" });
  }
};

exports.update = async (req, res) => {
  try {
    const data = payload(req.body);
    if (!data.name || !data.phone) return res.status(400).json({ success: false, message: "Delivery agent name and phone are required" });
    const row = await prisma.deliveryAgent.update({ where: { id: Number(req.params.id) }, data });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: error.code === "P2025" ? "Delivery agent not found" : "Could not update delivery agent" });
  }
};

exports.remove = async (req, res) => {
  try {
    await prisma.deliveryAgent.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true, message: "Delivery agent deleted" });
  } catch (error) {
    res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: error.code === "P2025" ? "Delivery agent not found" : "Could not delete delivery agent" });
  }
};
