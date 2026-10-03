const prisma = require("../config/prisma");
const { success, error } = require("../utils/apiResponse");

const validStatuses = new Set(["ACTIVE", "DISPENSED", "CANCELLED"]);

function prescriptionNumber() {
  return `RX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function formatPrescription(prescription) {
  return {
    ...prescription,
    items: (prescription.items || []).map((item) => ({
      ...item,
      medicineName: item.medicine?.name || "دواء غير معروف"
    }))
  };
}

exports.list = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();
    const prescriptions = await prisma.prescription.findMany({
      where: {
        ...(validStatuses.has(status) ? { status } : {}),
        ...(query ? {
          OR: [
            { prescriptionNo: { contains: query } },
            { patientName: { contains: query } },
            { patientPhone: { contains: query } },
            { doctorName: { contains: query } }
          ]
        } : {})
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    return success(res, prescriptions.map(formatPrescription));
  } catch (exception) {
    return error(res, exception.message || "Failed to load prescriptions");
  }
};

exports.create = async (req, res) => {
  try {
    const patientName = normalizeText(req.body.patientName);
    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!patientName) return error(res, "Patient name is required", 400);
    if (!items.length) return error(res, "Add at least one medicine to the prescription", 400);

    const normalizedItems = items.map((item) => ({
      medicineId: Number(item.medicineId),
      dosage: normalizeText(item.dosage),
      frequency: normalizeText(item.frequency),
      duration: normalizeText(item.duration),
      quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
      instructions: normalizeText(item.instructions)
    }));
    if (normalizedItems.some((item) => !item.medicineId)) return error(res, "Every prescription item needs a medicine", 400);

    const created = await prisma.$transaction(async (tx) => {
      if (customerId) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error("Selected customer was not found");
      }
      const medicines = await tx.medicine.findMany({ where: { id: { in: normalizedItems.map((item) => item.medicineId) } } });
      if (medicines.length !== new Set(normalizedItems.map((item) => item.medicineId)).size) throw new Error("One or more selected medicines were not found");
      return tx.prescription.create({
        data: {
          prescriptionNo: prescriptionNumber(),
          patientName,
          patientPhone: normalizeText(req.body.patientPhone),
          doctorName: normalizeText(req.body.doctorName),
          diagnosis: normalizeText(req.body.diagnosis),
          notes: normalizeText(req.body.notes),
          customerId,
          createdById: req.user.id,
          items: { create: normalizedItems }
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          createdBy: { select: { id: true, name: true } },
          items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } }
        }
      });
    });
    return success(res, formatPrescription(created), "Prescription saved", 201);
  } catch (exception) {
    return error(res, exception.message || "Failed to save prescription", 400);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "").trim().toUpperCase();
    if (!validStatuses.has(status)) return error(res, "Invalid prescription status", 400);
    const updated = await prisma.prescription.update({
      where: { id },
      data: { status },
      include: { customer: { select: { id: true, name: true, phone: true } }, createdBy: { select: { id: true, name: true } }, items: { include: { medicine: { select: { id: true, name: true, quantity: true } } } } }
    });
    return success(res, formatPrescription(updated), "Prescription status updated");
  } catch (exception) {
    return error(res, "Prescription was not found", 404);
  }
};
