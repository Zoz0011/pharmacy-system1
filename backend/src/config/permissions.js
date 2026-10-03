const PERMISSION_KEYS = [
  "dashboard.view",
  "catalog.view",
  "catalog.manage",
  "sales.pos",
  "sales.returns",
  "sales.pricing",
  "sales.delivery_agents",
  "cashier.shifts",
  "cashier.expenses",
  "cashier.collections",
  "cashier.item_inquiry",
  "cashier.quick_items",
  "cashier.recent_sales",
  "cashier.suspended_sales",
  "cashier.purchase_returns",
  "cashier.session_details",
  "cashier.removed_items",
  "cashier.customer_collection",
  "cashier.supplier_payment",
  "expenses.view",
  "expenses.manage",
  "customers.view",
  "customers.manage",
  "suppliers.view",
  "suppliers.manage",
  "purchases.view",
  "purchases.manage",
  "inventory.view",
  "inventory.manage",
  "treasury.view",
  "treasury.manage",
  "accounting.view",
  "accounting.manage",
  "reports.view",
  "settings.view",
  "settings.manage",
  "sync.manage",
  "notifications.view"
];

function parsePermissions(value) {
  if (Array.isArray(value)) return value.filter((permission) => PERMISSION_KEYS.includes(permission));
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((permission) => PERMISSION_KEYS.includes(permission)) : [];
  } catch {
    return [];
  }
}

function normalizePermissions(value) {
  return [...new Set(parsePermissions(value))];
}

function parseCustomFields(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

// Keep the grants inside the already-supported customFields column as well.
// This lets a running server with an older Prisma client authenticate safely
// until it is restarted and its client is regenerated.
function getUserPermissions(user) {
  // Newer screens save the grants in customFields so they work with both the
  // current schema and older running Prisma clients.  Prefer that explicit
  // value; falling back to the legacy column prevents a default "[]" there
  // from hiding the permissions an administrator has just saved.
  const customPermissions = parseCustomFields(user?.customFields).permissions;
  if (Array.isArray(customPermissions) || typeof customPermissions === "string") return normalizePermissions(customPermissions);
  return normalizePermissions(user?.permissions);
}

function withUserPermissions(customFields, permissions) {
  return JSON.stringify({ ...parseCustomFields(customFields), permissions: normalizePermissions(permissions) });
}

module.exports = { PERMISSION_KEYS, parsePermissions, normalizePermissions, getUserPermissions, withUserPermissions };
