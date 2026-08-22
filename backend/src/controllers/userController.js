const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

const ROLES = ["ADMIN", "PHARMACIST", "CASHIER"];

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    phone: user.phone,
    alternatePhone: user.alternatePhone,
    telephone: user.telephone,
    jobTitle: user.jobTitle,
    department: user.department,
    salary: user.salary,
    hireDate: user.hireDate,
    nationalId: user.nationalId,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    district: user.district,
    city: user.city,
    state: user.state,
    country: user.country,
    postalCode: user.postalCode,
    active: user.active,
    customFields: parseCustomFields(user.customFields),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function parseCustomFields(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function normalizeEmployeePayload(body = {}) {
  const data = {};
  const textFields = ["name", "username", "email", "phone", "alternatePhone", "telephone", "jobTitle", "department", "nationalId", "addressLine1", "addressLine2", "district", "city", "state", "country", "postalCode"];
  for (const field of textFields) if (body[field] !== undefined) data[field] = String(body[field] || "").trim() || null;
  if (data.email) data.email = data.email.toLowerCase();
  if (data.username) data.username = data.username.toLowerCase();
  if (body.salary !== undefined) data.salary = Number(Number(body.salary || 0).toFixed(2));
  if (body.hireDate !== undefined) data.hireDate = body.hireDate ? new Date(body.hireDate) : null;
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.customFields !== undefined) data.customFields = JSON.stringify(body.customFields && typeof body.customFields === "object" ? body.customFields : {});
  return data;
}

function normalizeRole(role) {
  return String(role || "PHARMACIST").toUpperCase();
}

function ensureValidRole(role) {
  return ROLES.includes(normalizeRole(role));
}

exports.getUsers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { username: { contains: q } },
              { phone: { contains: q } },
              { jobTitle: { contains: q } },
              { department: { contains: q } },
              { email: { contains: q } },
              { role: { contains: q.toUpperCase() } }
            ]
          }
        : undefined,
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: users.map(sanitizeUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    if (!ensureValidRole(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const employeeData = normalizeEmployeePayload(req.body);
    if (!Number.isFinite(employeeData.salary || 0)) return res.status(400).json({ success: false, message: "Salary must be a valid number" });
    const user = await prisma.user.create({ data: { ...employeeData, name, email: String(email).trim().toLowerCase(), password: hashedPassword, role: normalizeRole(role) } });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: sanitizeUser(user)
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and email are required" });
    }

    if (!ensureValidRole(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    if (req.user.id === id && req.body.active === false) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { ...normalizeEmployeePayload(req.body), name, email: String(email).trim().toLowerCase(), role: normalizeRole(role) }
    });

    res.json({
      success: true,
      message: "User updated successfully",
      data: sanitizeUser(user)
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (req.user.id === id) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const password = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { password }
    });

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getRoleOptions = async (req, res) => {
  res.json({ success: true, data: ROLES });
};
