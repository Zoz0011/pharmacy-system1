const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { AsyncLocalStorage } = require("async_hooks");

if (!getApps().length) initializeApp();

const firestore = getFirestore();
const workspaceContext = new AsyncLocalStorage();
const scopedModels = new Set([
  "User", "Supplier", "Customer", "Medicine", "Sale", "CashierShift",
  "InventoryCount", "StockMovement", "PurchaseInvoice", "ShiftExpense", "ExpenseCategory", "SalesAgent", "CustomerGroup",
  "TreasuryAccount", "TreasuryTransaction", "AccountingAccount", "AccountingEntry", "Prescription", "Branch", "InventoryTransfer", "ProductType", "Manufacturer", "PriceGroup", "ItemWarranty", "ItemExchange", "Promotion", "DeliveryAgent", "TherapeuticGroup", "ItemVariant", "AuditLog", "Notification"
]);

const MODELS = [
  "Workspace", "User", "Supplier", "Customer", "Medicine", "Sale", "SalePayment",
  "CashierShift", "ShiftExpense", "ExpenseCategory", "SalesAgent", "CustomerGroup", "CustomerAccountTransaction", "InventoryCount",
  "InventoryCountItem", "SaleItem", "StockMovement", "PurchaseInvoice",
  "PurchaseInvoiceItem", "MedicineBox", "BoxSaleAllocation", "TreasuryAccount",
  "TreasuryTransaction", "AccountingAccount", "AccountingEntry", "AccountingEntryLine", "Prescription", "PrescriptionItem", "Branch", "InventoryTransfer", "InventoryTransferItem", "ProductType", "Manufacturer", "PriceGroup", "ItemWarranty", "ItemExchange", "Promotion", "DeliveryAgent", "TherapeuticGroup", "ItemVariant", "AuditLog", "Notification"
];

const COLLECTIONS = Object.fromEntries(MODELS.map((model) => [model, model.toLowerCase()]));
const compoundKeys = {
  InventoryCountItem: { inventoryCountId_medicineId: ["inventoryCountId", "medicineId"] }
};
const defaults = {
  Workspace: { stagnantAlertEnabled: true, stagnantAlertDays: 7, expiryAlertDays: 30 },
  User: { role: "PHARMACIST", permissions: "[]", salary: 0, active: true },
  Supplier: { supplierType: "BUSINESS", contactRole: "SUPPLIER", openingBalance: 0 },
  Customer: { customerType: "PERSON", contactRole: "CUSTOMER", openingBalance: 0, creditLimit: 0, accountBalance: 0 },
  Medicine: { itemType: "MEDICINE", quantity: 0, minStock: 5, stripsPerBox: 1, pillsPerStrip: 1, isQuickSale: false },
  Sale: { discount: 0, refundedAmount: 0, status: "COMPLETED", paymentMethod: "CASH", counterpartyType: "CASH" },
  CashierShift: { status: "OPEN", openingCash: 0, expectedCash: 0, difference: 0 },
  ShiftExpense: { category: "GENERAL", paymentMethod: "CASH" },
  ExpenseCategory: { cycle: "GENERAL", active: true },
  SalesAgent: { commission: 0, active: true },
  CustomerGroup: { rate: 0, active: true },
  InventoryCount: { status: "OPEN" },
  SaleItem: { saleUnit: "BOX", baseUnits: 0, discountValue: 0 },
  PurchaseInvoice: { paymentStatus: "PENDING", status: "COMPLETED" },
  PurchaseInvoiceItem: { baseUnits: 0 },
  MedicineBox: { status: "OPEN" },
  TreasuryAccount: { balance: 0, isDefault: false },
  AccountingAccount: { openingBalance: 0, balance: 0, active: true, isPaymentAccount: false },
  AccountingEntry: { entryType: "MANUAL" },
  AccountingEntryLine: { debit: 0, credit: 0 },
  Prescription: { status: "ACTIVE" },
  PrescriptionItem: { quantity: 1 }
  ,Branch: { isActive: true, isDefault: false }
  ,InventoryTransfer: { status: "PENDING" }
  ,ProductType: { active: true }
  ,Manufacturer: { active: true }
  ,PriceGroup: { markupPercent: 0, discountPercent: 0, isDefault: false, active: true }
  ,ItemWarranty: { durationMonths: 0, active: true }
  ,Promotion: { discountType: "PERCENT", discountValue: 0, active: true }
  ,DeliveryAgent: { active: true, deliveryOperations: 0, collectedAmount: 0 }
  ,ItemVariant: { valuesJson: "[]", active: true }
  ,Notification: { type: "INFO", isRead: false }
};
const timestampedModels = new Set([
  "Workspace", "User", "Supplier", "Customer", "Medicine", "Sale", "SalePayment",
  "CashierShift", "ShiftExpense", "ExpenseCategory", "SalesAgent", "CustomerGroup", "CustomerAccountTransaction", "InventoryCount",
  "StockMovement", "PurchaseInvoice", "MedicineBox", "BoxSaleAllocation", "TreasuryAccount",
  "TreasuryTransaction", "AccountingAccount", "AccountingEntry", "Prescription", "Branch", "InventoryTransfer", "ProductType", "Manufacturer", "PriceGroup", "ItemWarranty", "ItemExchange", "Promotion", "DeliveryAgent", "TherapeuticGroup", "ItemVariant", "AuditLog", "Notification"
]);
const updatedModels = new Set(["Workspace", "User", "Supplier", "Customer", "Medicine", "TreasuryAccount", "AccountingAccount", "Branch"]);

const belongsTo = (target, foreignKey) => ({ kind: "belongsTo", target, foreignKey });
const hasMany = (target, foreignKey) => ({ kind: "hasMany", target, foreignKey });
const hasOne = (target, foreignKey) => ({ kind: "hasOne", target, foreignKey });
const RELATIONS = {
  User: { workspace: belongsTo("Workspace", "workspaceId"), sales: hasMany("Sale", "userId"), stockMovements: hasMany("StockMovement", "userId"), cashierShifts: hasMany("CashierShift", "userId"), customerAccountTransactions: hasMany("CustomerAccountTransaction", "userId"), inventoryCounts: hasMany("InventoryCount", "createdById"), shiftExpenses: hasMany("ShiftExpense", "userId"), accountingAccounts: hasMany("AccountingAccount", "createdById"), accountingEntries: hasMany("AccountingEntry", "createdById"), prescriptions: hasMany("Prescription", "createdById"), inventoryTransfers: hasMany("InventoryTransfer", "createdById"), itemExchanges: hasMany("ItemExchange", "createdById"), auditLogs: hasMany("AuditLog", "actorUserId"), notifications: hasMany("Notification", "userId") },
  Workspace: { users: hasMany("User", "workspaceId"), suppliers: hasMany("Supplier", "workspaceId"), customers: hasMany("Customer", "workspaceId"), medicines: hasMany("Medicine", "workspaceId"), sales: hasMany("Sale", "workspaceId"), cashierShifts: hasMany("CashierShift", "workspaceId"), inventoryCounts: hasMany("InventoryCount", "workspaceId"), stockMovements: hasMany("StockMovement", "workspaceId"), purchaseInvoices: hasMany("PurchaseInvoice", "workspaceId"), shiftExpenses: hasMany("ShiftExpense", "workspaceId"), expenseCategories: hasMany("ExpenseCategory", "workspaceId"), salesAgents: hasMany("SalesAgent", "workspaceId"), customerGroups: hasMany("CustomerGroup", "workspaceId"), treasuryAccounts: hasMany("TreasuryAccount", "workspaceId"), treasuryTransactions: hasMany("TreasuryTransaction", "workspaceId"), accountingAccounts: hasMany("AccountingAccount", "workspaceId"), accountingEntries: hasMany("AccountingEntry", "workspaceId"), prescriptions: hasMany("Prescription", "workspaceId"), branches: hasMany("Branch", "workspaceId"), inventoryTransfers: hasMany("InventoryTransfer", "workspaceId"), productTypes: hasMany("ProductType", "workspaceId"), manufacturers: hasMany("Manufacturer", "workspaceId"), priceGroups: hasMany("PriceGroup", "workspaceId"), warranties: hasMany("ItemWarranty", "workspaceId"), itemExchanges: hasMany("ItemExchange", "workspaceId"), promotions: hasMany("Promotion", "workspaceId"), deliveryAgents: hasMany("DeliveryAgent", "workspaceId"), therapeuticGroups: hasMany("TherapeuticGroup", "workspaceId"), itemVariants: hasMany("ItemVariant", "workspaceId"), auditLogs: hasMany("AuditLog", "workspaceId"), notifications: hasMany("Notification", "workspaceId") },
  Supplier: { workspace: belongsTo("Workspace", "workspaceId"), linkedCustomer: belongsTo("Customer", "linkedCustomerId"), medicines: hasMany("Medicine", "supplierId"), purchaseInvoices: hasMany("PurchaseInvoice", "supplierId"), sales: hasMany("Sale", "supplierId") },
  Customer: { workspace: belongsTo("Workspace", "workspaceId"), supplierProfile: hasOne("Supplier", "linkedCustomerId"), sales: hasMany("Sale", "customerId"), accountTransactions: hasMany("CustomerAccountTransaction", "customerId"), prescriptions: hasMany("Prescription", "customerId") },
  Medicine: { workspace: belongsTo("Workspace", "workspaceId"), supplier: belongsTo("Supplier", "supplierId"), therapeuticGroup: belongsTo("TherapeuticGroup", "therapeuticGroupId"), itemVariant: belongsTo("ItemVariant", "itemVariantId"), saleItems: hasMany("SaleItem", "medicineId"), stockMovements: hasMany("StockMovement", "medicineId"), purchaseInvoiceItems: hasMany("PurchaseInvoiceItem", "medicineId"), medicineBoxes: hasMany("MedicineBox", "medicineId"), inventoryCountItems: hasMany("InventoryCountItem", "medicineId"), prescriptionItems: hasMany("PrescriptionItem", "medicineId"), inventoryTransferItems: hasMany("InventoryTransferItem", "medicineId"), exchangedFrom: hasMany("ItemExchange", "fromMedicineId"), exchangedTo: hasMany("ItemExchange", "toMedicineId") },
  Sale: { workspace: belongsTo("Workspace", "workspaceId"), user: belongsTo("User", "userId"), customer: belongsTo("Customer", "customerId"), supplier: belongsTo("Supplier", "supplierId"), cashierShift: belongsTo("CashierShift", "cashierShiftId"), items: hasMany("SaleItem", "saleId"), payments: hasMany("SalePayment", "saleId"), accountTransactions: hasMany("CustomerAccountTransaction", "saleId") },
  SalePayment: { sale: belongsTo("Sale", "saleId") },
  CashierShift: { workspace: belongsTo("Workspace", "workspaceId"), user: belongsTo("User", "userId"), sales: hasMany("Sale", "cashierShiftId"), expenses: hasMany("ShiftExpense", "cashierShiftId"), customerTransactions: hasMany("CustomerAccountTransaction", "cashierShiftId") },
  ShiftExpense: { workspace: belongsTo("Workspace", "workspaceId"), cashierShift: belongsTo("CashierShift", "cashierShiftId"), user: belongsTo("User", "userId") },
  ExpenseCategory: { workspace: belongsTo("Workspace", "workspaceId") },
  SalesAgent: { workspace: belongsTo("Workspace", "workspaceId") },
  CustomerGroup: { workspace: belongsTo("Workspace", "workspaceId") },
  CustomerAccountTransaction: { customer: belongsTo("Customer", "customerId"), user: belongsTo("User", "userId"), sale: belongsTo("Sale", "saleId"), cashierShift: belongsTo("CashierShift", "cashierShiftId") },
  InventoryCount: { workspace: belongsTo("Workspace", "workspaceId"), createdBy: belongsTo("User", "createdById"), items: hasMany("InventoryCountItem", "inventoryCountId") },
  InventoryCountItem: { inventoryCount: belongsTo("InventoryCount", "inventoryCountId"), medicine: belongsTo("Medicine", "medicineId") },
  SaleItem: { sale: belongsTo("Sale", "saleId"), medicine: belongsTo("Medicine", "medicineId"), allocations: hasMany("BoxSaleAllocation", "saleItemId") },
  StockMovement: { workspace: belongsTo("Workspace", "workspaceId"), medicine: belongsTo("Medicine", "medicineId"), user: belongsTo("User", "userId") },
  PurchaseInvoice: { workspace: belongsTo("Workspace", "workspaceId"), supplier: belongsTo("Supplier", "supplierId"), items: hasMany("PurchaseInvoiceItem", "purchaseInvoiceId") },
  PurchaseInvoiceItem: { purchaseInvoice: belongsTo("PurchaseInvoice", "purchaseInvoiceId"), medicine: belongsTo("Medicine", "medicineId"), medicineBoxes: hasMany("MedicineBox", "purchaseInvoiceItemId") },
  MedicineBox: { medicine: belongsTo("Medicine", "medicineId"), purchaseInvoiceItem: belongsTo("PurchaseInvoiceItem", "purchaseInvoiceItemId"), allocations: hasMany("BoxSaleAllocation", "medicineBoxId") },
  BoxSaleAllocation: { saleItem: belongsTo("SaleItem", "saleItemId"), medicineBox: belongsTo("MedicineBox", "medicineBoxId") },
  TreasuryAccount: { workspace: belongsTo("Workspace", "workspaceId"), accountingAccount: belongsTo("AccountingAccount", "accountingAccountId"), transactions: hasMany("TreasuryTransaction", "treasuryAccountId") },
  TreasuryTransaction: { workspace: belongsTo("Workspace", "workspaceId"), treasuryAccount: belongsTo("TreasuryAccount", "treasuryAccountId") },
  AccountingAccount: { workspace: belongsTo("Workspace", "workspaceId"), createdBy: belongsTo("User", "createdById"), lines: hasMany("AccountingEntryLine", "accountId"), treasuryAccount: hasOne("TreasuryAccount", "accountingAccountId") },
  AccountingEntry: { workspace: belongsTo("Workspace", "workspaceId"), createdBy: belongsTo("User", "createdById"), lines: hasMany("AccountingEntryLine", "accountingEntryId") },
  AccountingEntryLine: { entry: belongsTo("AccountingEntry", "accountingEntryId"), account: belongsTo("AccountingAccount", "accountId") },
  Prescription: { workspace: belongsTo("Workspace", "workspaceId"), customer: belongsTo("Customer", "customerId"), createdBy: belongsTo("User", "createdById"), items: hasMany("PrescriptionItem", "prescriptionId") },
  PrescriptionItem: { prescription: belongsTo("Prescription", "prescriptionId"), medicine: belongsTo("Medicine", "medicineId") },
  Branch: { workspace: belongsTo("Workspace", "workspaceId"), outgoingTransfers: hasMany("InventoryTransfer", "sourceBranchId"), incomingTransfers: hasMany("InventoryTransfer", "destinationBranchId") },
  InventoryTransfer: { workspace: belongsTo("Workspace", "workspaceId"), sourceBranch: belongsTo("Branch", "sourceBranchId"), destinationBranch: belongsTo("Branch", "destinationBranchId"), createdBy: belongsTo("User", "createdById"), items: hasMany("InventoryTransferItem", "transferId") },
  InventoryTransferItem: { transfer: belongsTo("InventoryTransfer", "transferId"), medicine: belongsTo("Medicine", "medicineId") },
  ProductType: { workspace: belongsTo("Workspace", "workspaceId") },
  Manufacturer: { workspace: belongsTo("Workspace", "workspaceId") },
  PriceGroup: { workspace: belongsTo("Workspace", "workspaceId") },
  ItemWarranty: { workspace: belongsTo("Workspace", "workspaceId") },
  ItemExchange: { workspace: belongsTo("Workspace", "workspaceId"), fromMedicine: belongsTo("Medicine", "fromMedicineId"), toMedicine: belongsTo("Medicine", "toMedicineId"), createdBy: belongsTo("User", "createdById") },
  Promotion: { workspace: belongsTo("Workspace", "workspaceId") },
  DeliveryAgent: { workspace: belongsTo("Workspace", "workspaceId") },
  TherapeuticGroup: { workspace: belongsTo("Workspace", "workspaceId"), medicines: hasMany("Medicine", "therapeuticGroupId") },
  ItemVariant: { workspace: belongsTo("Workspace", "workspaceId"), medicines: hasMany("Medicine", "itemVariantId") },
  AuditLog: { workspace: belongsTo("Workspace", "workspaceId"), actor: belongsTo("User", "actorUserId") },
  Notification: { workspace: belongsTo("Workspace", "workspaceId"), user: belongsTo("User", "userId") }
};

// Read requests must not scan every Firestore collection. Pull only the model
// being requested and the relations used by its filters, sorting or response.
function collectReadModels(model, args = {}) {
  const models = new Set([model]);
  const addRelation = (source, key, nested) => {
    const relation = RELATIONS[source]?.[key];
    if (!relation) return;
    models.add(relation.target);
    if (nested && typeof nested === "object") visitArgs(relation.target, nested);
  };
  const visitWhere = (source, where) => {
    if (!where || typeof where !== "object") return;
    Object.entries(where).forEach(([key, value]) => {
      if (["AND", "OR", "NOT"].includes(key)) {
        (Array.isArray(value) ? value : [value]).forEach((item) => visitWhere(source, item));
      } else if (RELATIONS[source]?.[key]) {
        addRelation(source, key, value);
      }
    });
  };
  const visitRelations = (source, value) => {
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, nested]) => {
      if (nested) addRelation(source, key, nested === true ? null : nested);
    });
  };
  const visitOrder = (source, orderBy) => {
    (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).forEach((clause) => {
      Object.keys(clause || {}).forEach((key) => addRelation(source, key));
    });
  };
  const visitArgs = (source, value) => {
    if (!value || typeof value !== "object") return;
    visitWhere(source, value.where);
    visitRelations(source, value.include);
    visitRelations(source, value.select);
    visitOrder(source, value.orderBy);
  };
  visitArgs(model, args);
  return [...models];
}

function plain(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function clean(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      const cleaned = clean(item);
      return cleaned === undefined ? [] : [[key, cleaned]];
    }));
  }
  return value;
}

function compare(left, right) {
  if (left instanceof Date) left = left.getTime();
  if (right instanceof Date) right = right.getTime();
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function valueMatches(actual, expected) {
  if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, "equals")) return valueMatches(actual, expected.equals);
    if (Object.prototype.hasOwnProperty.call(expected, "in")) return expected.in.some((item) => valueMatches(actual, item));
    if (Object.prototype.hasOwnProperty.call(expected, "notIn")) return !expected.notIn.some((item) => valueMatches(actual, item));
    if (Object.prototype.hasOwnProperty.call(expected, "not")) return !valueMatches(actual, expected.not);
    if (Object.prototype.hasOwnProperty.call(expected, "lt") && !(compare(actual, expected.lt) < 0)) return false;
    if (Object.prototype.hasOwnProperty.call(expected, "lte") && !(compare(actual, expected.lte) <= 0)) return false;
    if (Object.prototype.hasOwnProperty.call(expected, "gt") && !(compare(actual, expected.gt) > 0)) return false;
    if (Object.prototype.hasOwnProperty.call(expected, "gte") && !(compare(actual, expected.gte) >= 0)) return false;
    if (Object.prototype.hasOwnProperty.call(expected, "contains") && !String(actual || "").toLowerCase().includes(String(expected.contains).toLowerCase())) return false;
    if (Object.prototype.hasOwnProperty.call(expected, "startsWith") && !String(actual || "").toLowerCase().startsWith(String(expected.startsWith).toLowerCase())) return false;
    return true;
  }
  return compare(actual, expected) === 0;
}

class State {
  constructor(records, counters, transaction = null) {
    this.records = records;
    this.counters = counters || {};
    this.transaction = transaction;
    this.dirty = new Map();
  }

  static async load(transaction = null, requestedModels = MODELS) {
    const models = [...new Set(requestedModels.filter((model) => MODELS.includes(model)))];
    const counterRef = firestore.collection("__meta").doc("counters");
    const [counterSnapshot, ...snapshots] = await Promise.all([
      transaction ? transaction.get(counterRef) : counterRef.get(),
      ...models.map((model) => {
        const ref = firestore.collection(COLLECTIONS[model]);
        return transaction ? transaction.get(ref) : ref.get();
      })
    ]);
    const records = new Map();
    MODELS.forEach((model) => records.set(model, []));
    models.forEach((model, index) => {
      records.set(model, snapshots[index].docs.map((document) => ({ id: Number(document.id), ...plain(document.data()) })));
    });
    return new State(records, plain(counterSnapshot.data() || {}), transaction);
  }

  rows(model) { return this.records.get(model) || []; }
  mark(model, id, value) { this.dirty.set(`${model}:${id}`, { model, id, value }); }

  nextId(model) {
    const current = Number(this.counters[model] || 0);
    const highestExistingId = this.rows(model).reduce((highest, row) => Math.max(highest, Number(row.id || 0)), 0);
    const id = Math.max(current, highestExistingId) + 1;
    this.counters[model] = id;
    return id;
  }

  async flush() {
    const counterRef = firestore.collection("__meta").doc("counters");
    const writes = [...this.dirty.values()];
    if (this.transaction) {
      this.transaction.set(counterRef, clean(this.counters), { merge: true });
      writes.forEach(({ model, id, value }) => {
        const ref = firestore.collection(COLLECTIONS[model]).doc(String(id));
        if (value === null) this.transaction.delete(ref);
        else this.transaction.set(ref, clean(value));
      });
      return;
    }
    const batch = firestore.batch();
    batch.set(counterRef, clean(this.counters), { merge: true });
    writes.forEach(({ model, id, value }) => {
      const ref = firestore.collection(COLLECTIONS[model]).doc(String(id));
      if (value === null) batch.delete(ref);
      else batch.set(ref, clean(value));
    });
    await batch.commit();
  }
}

function applyScope(model, where, workspaceId) {
  if (!workspaceId || !scopedModels.has(model)) return where || {};
  return { ...(where || {}), workspaceId };
}

function relationRows(state, model, row, relation) {
  if (relation.kind === "belongsTo") {
    if (!row[relation.foreignKey]) return [];
    return state.rows(relation.target).filter((candidate) => candidate.id === Number(row[relation.foreignKey]));
  }
  return state.rows(relation.target).filter((candidate) => candidate[relation.foreignKey] === row.id);
}

function matchesWhere(state, model, row, where = {}) {
  return Object.entries(where || {}).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((item) => matchesWhere(state, model, row, item));
    if (key === "OR") return (Array.isArray(expected) ? expected : [expected]).some((item) => matchesWhere(state, model, row, item));
    if (key === "NOT") return !(Array.isArray(expected) ? expected : [expected]).some((item) => matchesWhere(state, model, row, item));
    const compound = compoundKeys[model]?.[key];
    if (compound) return compound.every((field) => valueMatches(row[field], expected?.[field]));
    const relation = RELATIONS[model]?.[key];
    if (relation && expected && typeof expected === "object") {
      const related = relationRows(state, model, row, relation);
      if (relation.kind === "belongsTo" || relation.kind === "hasOne") return related[0] ? matchesWhere(state, relation.target, related[0], expected) : false;
      if (expected.some) return related.some((item) => matchesWhere(state, relation.target, item, expected.some));
      if (expected.none) return !related.some((item) => matchesWhere(state, relation.target, item, expected.none));
      if (expected.every) return related.every((item) => matchesWhere(state, relation.target, item, expected.every));
      return related.some((item) => matchesWhere(state, relation.target, item, expected));
    }
    return valueMatches(row[key], expected);
  });
}

function orderRows(state, model, rows, orderBy) {
  const clauses = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((first, second) => {
    for (const clause of clauses) {
      const [field, direction] = Object.entries(clause)[0] || [];
      if (!field) continue;
      let firstValue = first[field];
      let secondValue = second[field];
      const relation = RELATIONS[model]?.[field];
      if (relation && direction && typeof direction === "object") {
        const [nestedField, nestedDirection] = Object.entries(direction)[0] || [];
        firstValue = relationRows(state, model, first, relation)[0]?.[nestedField];
        secondValue = relationRows(state, model, second, relation)[0]?.[nestedField];
        const result = compare(firstValue, secondValue);
        if (result) return nestedDirection === "desc" ? -result : result;
      } else {
        const result = compare(firstValue, secondValue);
        if (result) return direction === "desc" ? -result : result;
      }
    }
    return 0;
  });
}

function selectRow(state, model, row, args = {}) {
  if (!row) return null;
  const source = clone(row);
  const relationConfig = args.include || args.select || {};
  const selected = args.select
    ? Object.fromEntries(Object.entries(args.select).flatMap(([field, enabled]) => (enabled === true && !RELATIONS[model]?.[field] ? [[field, source[field]]] : [])))
    : source;

  for (const [field, config] of Object.entries(relationConfig)) {
    if (!config || field === "_count" || !RELATIONS[model]?.[field]) continue;
    const relation = RELATIONS[model][field];
    let related = relationRows(state, model, source, relation);
    const options = config === true ? {} : config;
    related = orderRows(state, relation.target, related.filter((item) => matchesWhere(state, relation.target, item, options.where)), options.orderBy);
    if (options.skip) related = related.slice(options.skip);
    if (options.take !== undefined) related = related.slice(0, options.take);
    const converted = related.map((item) => selectRow(state, relation.target, item, options));
    selected[field] = relation.kind === "belongsTo" || relation.kind === "hasOne" ? (converted[0] || null) : converted;
  }

  if (relationConfig._count) {
    const countSelect = relationConfig._count.select || {};
    selected._count = Object.fromEntries(Object.keys(countSelect).map((field) => [field, relationRows(state, model, source, RELATIONS[model]?.[field] || {}).length]));
  }
  return selected;
}

function splitData(model, input = {}) {
  const data = { ...input };
  const nested = {};
  Object.keys(RELATIONS[model] || {}).forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      nested[field] = data[field];
      delete data[field];
    }
  });
  return { data, nested };
}

function scalarData(model, current, input, isNew) {
  const result = { ...(isNew ? defaults[model] || {} : current), ...input };
  Object.entries(result).forEach(([field, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(value, "increment")) result[field] = Number(current?.[field] || 0) + Number(value.increment || 0);
      if (Object.prototype.hasOwnProperty.call(value, "decrement")) result[field] = Number(current?.[field] || 0) - Number(value.decrement || 0);
    }
  });
  const now = new Date();
  if (isNew && timestampedModels.has(model) && !result.createdAt) result.createdAt = now;
  if (!isNew && updatedModels.has(model)) result.updatedAt = now;
  return result;
}

function createRow(state, model, input, workspaceId) {
  const { data, nested } = splitData(model, input);
  const id = state.nextId(model);
  const row = scalarData(model, null, { ...data, id }, true);
  if (workspaceId && scopedModels.has(model)) row.workspaceId = Number(workspaceId);
  state.rows(model).push(row);
  state.mark(model, id, row);
  applyNested(state, model, row, nested, workspaceId);
  return row;
}

function applyNested(state, model, row, nested, workspaceId) {
  Object.entries(nested || {}).forEach(([field, action]) => {
    if (!action) return;
    const relation = RELATIONS[model]?.[field];
    if (!relation) return;
    if (relation.kind === "belongsTo") {
      if (action.connect?.id) row[relation.foreignKey] = Number(action.connect.id);
      if (action.disconnect) row[relation.foreignKey] = null;
      state.mark(model, row.id, row);
      return;
    }
    const entries = Array.isArray(action.create) ? action.create : action.create ? [action.create] : [];
    entries.forEach((entry) => createRow(state, relation.target, { ...entry, [relation.foreignKey]: row.id }, workspaceId));
  });
}

function updateRow(state, model, row, input, workspaceId) {
  const { data, nested } = splitData(model, input);
  const updated = scalarData(model, row, data, false);
  Object.assign(row, updated);
  if (workspaceId && scopedModels.has(model)) row.workspaceId = Number(workspaceId);
  state.mark(model, row.id, row);
  applyNested(state, model, row, nested, workspaceId);
  return row;
}

function createFacade(state = null, workspaceId = null) {
  const facade = {
    withWorkspace: (id, callback) => workspaceContext.run(Number(id), async () => await callback()),
    getWorkspaceId: () => workspaceContext.getStore(),
    $disconnect: async () => undefined,
    $transaction: async (callback) => {
      if (state) return callback(createFacade(state, workspaceId));
      return firestore.runTransaction(async (transaction) => {
        const transactionState = await State.load(transaction);
        const transactionFacade = createFacade(transactionState, workspaceContext.getStore());
        const result = await callback(transactionFacade);
        await transactionState.flush();
        return result;
      });
    }
  };

  MODELS.forEach((model) => {
    const currentWorkspaceId = () => workspaceId || workspaceContext.getStore();
    const read = async (args = {}) => state || State.load(null, collectReadModels(model, args));
    const rows = async (args = {}) => {
      const currentState = await read(args);
      const where = applyScope(model, args.where, currentWorkspaceId());
      let result = currentState.rows(model).filter((row) => matchesWhere(currentState, model, row, where));
      result = orderRows(currentState, model, result, args.orderBy);
      if (args.skip) result = result.slice(args.skip);
      if (args.take !== undefined) result = result.slice(0, args.take);
      return { currentState, result };
    };
    const mutate = async (callback) => {
      if (state) return callback(state);
      return facade.$transaction((transactionFacade) => callback(transactionFacade.__state));
    };
    facade[model.charAt(0).toLowerCase() + model.slice(1)] = {
      findMany: async (args = {}) => {
        const { currentState, result } = await rows(args);
        return result.map((row) => selectRow(currentState, model, row, args));
      },
      findFirst: async (args = {}) => {
        const { currentState, result } = await rows({ ...args, take: 1 });
        return selectRow(currentState, model, result[0], args);
      },
      findUnique: async (args = {}) => {
        const { currentState, result } = await rows({ ...args, take: 1 });
        return selectRow(currentState, model, result[0], args);
      },
      count: async (args = {}) => (await rows(args)).result.length,
      aggregate: async (args = {}) => {
        const result = (await rows(args)).result;
        const sums = Object.fromEntries(Object.keys(args._sum || {}).map((field) => [field, result.reduce((total, row) => total + Number(row[field] || 0), 0)]));
        return { _sum: sums, _count: result.length };
      },
      create: async (args) => {
        const created = await mutate((currentState) => createRow(currentState, model, args.data, currentWorkspaceId()));
        const currentState = state || await State.load(null, collectReadModels(model, args));
        return selectRow(state || currentState, model, created, args);
      },
      createMany: async (args) => {
        const data = Array.isArray(args.data) ? args.data : [args.data];
        await mutate((currentState) => data.forEach((row) => createRow(currentState, model, row, currentWorkspaceId())));
        return { count: data.length };
      },
      update: async (args) => {
        const updated = await mutate((currentState) => {
          const where = applyScope(model, args.where, currentWorkspaceId());
          const row = currentState.rows(model).find((item) => matchesWhere(currentState, model, item, where));
          if (!row) throw new Error(`${model} not found`);
          return updateRow(currentState, model, row, args.data, currentWorkspaceId());
        });
        return selectRow(state || await State.load(null, collectReadModels(model, args)), model, updated, args);
      },
      updateMany: async (args) => {
        let count = 0;
        await mutate((currentState) => {
          const where = applyScope(model, args.where, currentWorkspaceId());
          currentState.rows(model).filter((row) => matchesWhere(currentState, model, row, where)).forEach((row) => {
            updateRow(currentState, model, row, args.data, currentWorkspaceId());
            count += 1;
          });
        });
        return { count };
      },
      delete: async (args) => {
        let deleted;
        await mutate((currentState) => {
          const where = applyScope(model, args.where, currentWorkspaceId());
          const index = currentState.rows(model).findIndex((row) => matchesWhere(currentState, model, row, where));
          if (index < 0) throw new Error(`${model} not found`);
          [deleted] = currentState.rows(model).splice(index, 1);
          currentState.mark(model, deleted.id, null);
        });
        return selectRow(state || await State.load(null, collectReadModels(model, args)), model, deleted, args);
      },
      deleteMany: async (args = {}) => {
        let count = 0;
        await mutate((currentState) => {
          const where = applyScope(model, args.where, currentWorkspaceId());
          const survivors = [];
          currentState.rows(model).forEach((row) => {
            if (!matchesWhere(currentState, model, row, where)) return survivors.push(row);
            currentState.mark(model, row.id, null);
            count += 1;
          });
          currentState.records.set(model, survivors);
        });
        return { count };
      },
      upsert: async (args) => {
        const found = await facade[model.charAt(0).toLowerCase() + model.slice(1)].findUnique({ where: args.where });
        return found
          ? facade[model.charAt(0).toLowerCase() + model.slice(1)].update({ where: args.where, data: args.update, include: args.include, select: args.select })
          : facade[model.charAt(0).toLowerCase() + model.slice(1)].create({ data: args.create, include: args.include, select: args.select });
      }
    };
  });
  Object.defineProperties(facade, {
    __state: { value: state, enumerable: false },
    unscoped: { value: facade, enumerable: false }
  });
  return facade;
}

module.exports = createFacade();
