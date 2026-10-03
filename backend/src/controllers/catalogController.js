const prisma = require("../config/prisma");
const { ensureTherapeuticClassification } = require("../services/therapeuticClassificationService");

const resources = {
  "product-types": {
    model: "productType",
    codePrefix: "TYPE",
    normalize: (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), description: String(body.description || "").trim() || null, active: body.active !== false })
  },
  manufacturers: {
    model: "manufacturer",
    codePrefix: "MFR",
    normalize: (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), phone: String(body.phone || "").trim() || null, email: String(body.email || "").trim().toLowerCase() || null, description: String(body.description || "").trim() || null, active: body.active !== false })
  },
  "price-groups": {
    model: "priceGroup",
    codePrefix: "",
    normalize: (body) => ({ name: String(body.name || "").trim(), markupPercent: Math.max(0, Number(body.markupPercent || 0)), discountPercent: Math.max(0, Number(body.discountPercent || 0)), isDefault: body.isDefault === true, active: body.active !== false })
  },
  warranties: {
    model: "itemWarranty",
    codePrefix: "WRT",
    normalize: (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), description: String(body.description || "").trim() || null, durationMonths: Math.max(0, Math.floor(Number(body.durationMonths || 0))), active: body.active !== false })
  },
  promotions: {
    model: "promotion",
    codePrefix: "",
    normalize: (body) => ({ name: String(body.name || "").trim(), discountType: String(body.discountType || "PERCENT").toUpperCase() === "FIXED" ? "FIXED" : "PERCENT", discountValue: Math.max(0, Number(body.discountValue || 0)), startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null, active: body.active !== false })
  },
  "therapeutic-groups": {
    model: "therapeuticGroup",
    codePrefix: "THR",
    normalize: (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), description: String(body.description || "").trim() || null, active: body.active !== false })
  },
  variants: {
    model: "itemVariant",
    codePrefix: "VAR",
    normalize: (body) => ({ name: String(body.name || "").trim(), code: String(body.code || "").trim().toUpperCase(), valuesJson: JSON.stringify(Array.isArray(body.values) ? body.values.map((value) => String(value).trim()).filter(Boolean) : String(body.values || "").split(",").map((value) => value.trim()).filter(Boolean)), active: body.active !== false })
  }
};

function resourceFrom(req) {
  return resources[String(req.params.resource || "")];
}

function nextCode(prefix) {
  return `${prefix}-${Date.now().toString().slice(-7)}`;
}

async function applyDefault(model, data, id) {
  if (!data.isDefault) return;
  await prisma[model].updateMany({ where: id ? { id: { not: id } } : undefined, data: { isDefault: false } });
}

exports.list = async (req, res) => {
  const resource = resourceFrom(req);
  if (!resource) return res.status(404).json({ success: false, message: "Unknown catalog resource" });
  try {
    if (resource.model === "therapeuticGroup") await ensureTherapeuticClassification();
    const rows = await prisma[resource.model].findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: "Could not load catalog records" });
  }
};

exports.create = async (req, res) => {
  const resource = resourceFrom(req);
  if (!resource) return res.status(404).json({ success: false, message: "Unknown catalog resource" });
  try {
    const data = resource.normalize(req.body);
    if (!data.name) return res.status(400).json({ success: false, message: "Name is required" });
    if ("code" in data && !data.code) data.code = nextCode(resource.codePrefix);
    const row = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx[resource.model].updateMany({ data: { isDefault: false } });
      return tx[resource.model].create({ data });
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(error.code === "P2002" ? 400 : 500).json({ success: false, message: error.code === "P2002" ? "Name or code already exists" : "Could not create catalog record" });
  }
};

exports.update = async (req, res) => {
  const resource = resourceFrom(req);
  if (!resource) return res.status(404).json({ success: false, message: "Unknown catalog resource" });
  try {
    const data = resource.normalize(req.body);
    if (!data.name) return res.status(400).json({ success: false, message: "Name is required" });
    if ("code" in data && !data.code) return res.status(400).json({ success: false, message: "Code is required" });
    const id = Number(req.params.id);
    const row = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx[resource.model].updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx[resource.model].update({ where: { id }, data });
    });
    res.json({ success: true, data: row });
  } catch (error) {
    const status = error.code === "P2025" ? 404 : error.code === "P2002" ? 400 : 500;
    res.status(status).json({ success: false, message: status === 404 ? "Record not found" : status === 400 ? "Name or code already exists" : "Could not update catalog record" });
  }
};

exports.remove = async (req, res) => {
  const resource = resourceFrom(req);
  if (!resource) return res.status(404).json({ success: false, message: "Unknown catalog resource" });
  try {
    await prisma[resource.model].delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true, message: "Catalog record deleted" });
  } catch (error) {
    res.status(error.code === "P2025" ? 404 : 500).json({ success: false, message: error.code === "P2025" ? "Record not found" : "Could not delete catalog record" });
  }
};
