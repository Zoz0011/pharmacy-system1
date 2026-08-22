const assert = require("node:assert/strict");

const baseUrl = process.env.TEST_API_URL || "http://127.0.0.1:5099/api";

async function request(path, options = {}, token = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const suffix = Date.now();
  const registration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: `treasury${suffix}`, email: `treasury${suffix}@example.com`, password: "Test1234!", confirmPassword: "Test1234!" })
  });
  const token = registration.token;
  const initial = await request("/treasury", {}, token);
  assert.equal(initial.data.summary.balance, 0);

  const shift = (await request("/shifts/open", { method: "POST", body: JSON.stringify({ openingCash: 0 }) }, token)).data;
  const medicine = (await request("/medicines", { method: "POST", body: JSON.stringify({ name: "Treasury test item", barcode: `T${suffix}`, purchasePrice: 2, sellingPrice: 10, quantity: 10 }) }, token)).data;
  const sale = (await request("/sales", { method: "POST", body: JSON.stringify({ paymentMethod: "CASH", items: [{ medicineId: medicine.id, quantity: 2, saleUnit: "BOX" }] }) }, token)).data;
  assert.equal((await request("/treasury", {}, token)).data.summary.balance, 20);

  await request(`/shifts/${shift.id}/expenses`, { method: "POST", body: JSON.stringify({ amount: 3, category: "GENERAL", paymentMethod: "CASH", note: "test expense" }) }, token);
  const supplier = (await request("/suppliers", { method: "POST", body: JSON.stringify({ name: "Treasury test supplier" }) }, token)).data;
  await request(`/suppliers/${supplier.id}/payments`, { method: "POST", body: JSON.stringify({ amount: 4, paymentMethod: "CASH" }) }, token);
  const customer = (await request("/customers", { method: "POST", body: JSON.stringify({ name: "Treasury test customer", openingBalance: 10, creditLimit: 100 }) }, token)).data;
  await request(`/customers/${customer.id}/payments`, { method: "POST", body: JSON.stringify({ amount: 5, paymentMethod: "CASH" }) }, token);

  const purchase = (await request("/purchases", { method: "POST", body: JSON.stringify({ supplierId: supplier.id, paymentStatus: "PAID", paymentMethod: "CASH", items: [{ name: medicine.name, barcode: medicine.barcode, purchasePrice: 2, sellingPrice: 10, quantity: 1 }] }) }, token)).data;
  await request(`/purchases/${purchase.id}/return`, { method: "POST", body: JSON.stringify({ paymentMethod: "CASH" }) }, token);
  await request(`/sales/${sale.id}/return`, { method: "POST", body: "{}" }, token);
  await request("/treasury/adjustments", { method: "POST", body: JSON.stringify({ direction: "IN", amount: 2, paymentMethod: "CASH", note: "test balancing adjustment" }) }, token);

  await request("/sales/free-return", { method: "POST", body: JSON.stringify({ paymentMethod: "CASH", items: [{ medicineId: medicine.id, quantity: 1, saleUnit: "BOX" }] }) }, token);
  await request("/purchases/free-return", { method: "POST", body: JSON.stringify({ supplierId: supplier.id, paymentMethod: "CASH", items: [{ medicineId: medicine.id, quantity: 1, saleUnit: "BOX" }] }) }, token);
  await request("/treasury/adjustments", { method: "POST", body: JSON.stringify({ direction: "IN", amount: 8, paymentMethod: "CASH", note: "test free-return balancing adjustment" }) }, token);

  const finalTreasury = (await request("/treasury", {}, token)).data;
  assert.equal(finalTreasury.summary.balance, 0);
  assert.equal(finalTreasury.transactions.length, 11);
  console.log(JSON.stringify({ ok: true, transactions: finalTreasury.transactions.length, finalBalance: finalTreasury.summary.balance }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
