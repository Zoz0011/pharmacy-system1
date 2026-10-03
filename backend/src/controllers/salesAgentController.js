const prisma = require("../config/prisma");

function text(value) { return String(value || "").trim() || null; }
function payload(body = {}) {
  return {
    name: String(body.name || "").trim(), phone: text(body.phone), email: text(body.email), address: text(body.address),
    commission: Math.max(0, Math.min(100, Number(body.commission || 0))), active: body.active !== false, notes: text(body.notes)
  };
}

exports.list = async (req, res) => {
  try { res.json({ success: true, data: await prisma.salesAgent.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }) }); }
  catch { res.status(500).json({ success: false, message: "تعذر تحميل مندوبي المبيعات" }); }
};
exports.create = async (req, res) => {
  try { const data = payload(req.body); if (!data.name) return res.status(400).json({ success: false, message: "اسم المندوب مطلوب" }); res.status(201).json({ success: true, data: await prisma.salesAgent.create({ data }) }); }
  catch { res.status(500).json({ success: false, message: "تعذر حفظ مندوب المبيعات" }); }
};
exports.update = async (req, res) => {
  try { const data = payload(req.body); if (!data.name) return res.status(400).json({ success: false, message: "اسم المندوب مطلوب" }); res.json({ success: true, data: await prisma.salesAgent.update({ where: { id: Number(req.params.id) }, data }) }); }
  catch (error) { res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: error.code === "P2025" ? "مندوب المبيعات غير موجود" : "تعذر تحديث مندوب المبيعات" }); }
};
exports.remove = async (req, res) => {
  try { await prisma.salesAgent.delete({ where: { id: Number(req.params.id) } }); res.json({ success: true }); }
  catch (error) { res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: error.code === "P2025" ? "مندوب المبيعات غير موجود" : "تعذر حذف مندوب المبيعات" }); }
};
