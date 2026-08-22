const assert = require("node:assert/strict");

const baseUrl = process.env.TEST_API_URL || "http://127.0.0.1:5099/api";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ identifier: "admin@pharmacy.com", password: "admin123" }) });
  const headers = { Authorization: `Bearer ${login.token}` };
  const suffix = Date.now().toString(36);

  const supplier = (await request("/suppliers", { method: "POST", headers, body: JSON.stringify({ name: `مورد اختبار ${suffix}`, phone: "01000000001", businessName: "شركة اختبار", supplierType: "BUSINESS", openingBalance: 125, paymentTermValue: 14, paymentTermUnit: "DAYS", taxNumber: "TX-1", customFields: { field1: "قيمة" } }) })).data;
  assert.ok(supplier.id);
  await request(`/suppliers/${supplier.id}`, { method: "PUT", headers, body: JSON.stringify({ name: `مورد معدل ${suffix}`, phone: "01000000001", supplierType: "BUSINESS", openingBalance: 125, customFields: { field1: "معدل" } }) });
  const suppliers = await request(`/suppliers?q=${encodeURIComponent(suffix)}`, { headers });
  assert.equal(suppliers.data[0].customFields.field1, "معدل");

  const customer = (await request("/customers", { method: "POST", headers, body: JSON.stringify({ name: `عميل اختبار ${suffix}`, phone: "01000000002", customerType: "PERSON", openingBalance: 75, creditLimit: 500, customFields: { field2: "عميل" } }) })).data;
  assert.ok(customer.id);
  const customers = await request(`/customers?q=${encodeURIComponent(suffix)}`, { headers });
  assert.equal(customers.data[0].stats.totalDue, 75);

  const employee = (await request("/users", { method: "POST", headers, body: JSON.stringify({ name: `موظف اختبار ${suffix}`, username: `employee_${suffix}`, email: `employee_${suffix}@example.com`, password: "Test1234!", role: "PHARMACIST", phone: "01000000003", jobTitle: "صيدلي", department: "المبيعات", salary: 6000, active: true, customFields: { field3: "موظف" } }) })).data;
  assert.equal(employee.jobTitle, "صيدلي");

  const settings = await request("/settings", { method: "PUT", headers, body: JSON.stringify({ stagnantAlertEnabled: false, stagnantAlertDays: 14, expiryAlertDays: 60 }) });
  assert.equal(settings.data.stagnantAlertDays, 14);
  const report = await request("/reports/overview", { headers });
  assert.equal(report.data.staleStock.enabled, false);
  assert.equal(report.data.expiry.thresholdDays, 60);
  assert.ok(Object.prototype.hasOwnProperty.call(report.data.summary, "totalExpenses"));

  await request(`/users/${employee.id}`, { method: "DELETE", headers });
  await request(`/customers/${customer.id}`, { method: "DELETE", headers });
  await request(`/suppliers/${supplier.id}`, { method: "DELETE", headers });
  console.log(JSON.stringify({ success: true, supplier: true, customer: true, employee: true, settings: true, dashboard: true }));
}

main().catch((error) => { console.error(error); process.exit(1); });
