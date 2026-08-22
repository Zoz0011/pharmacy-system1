import React, { useEffect, useMemo, useRef, useState } from "react";
import API from "./api";
import "./operations.css";

function activeLocale() {
  return document.documentElement.lang?.startsWith("ar") ? "ar" : "en";
}

function money(value) {
  return new Intl.NumberFormat(activeLocale() === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(activeLocale() === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function apiError(error, fallback) {
  return error.response?.data?.message || fallback;
}

function shiftItemName(item, ar) {
  return ar
    ? item.nameAr || item.name || item.nameEn || "—"
    : item.nameEn || item.name || item.nameAr || "—";
}

function shiftUnitName(item, ar) {
  if (["PACK_PIECE", "SINGLE"].includes(item.itemType)) {
    if (item.saleUnit === "PILL") return ar ? item.pieceNameAr || "قطعة" : item.pieceNameEn || "piece";
    return ar ? item.packageNameAr || "عبوة" : item.packageNameEn || "package";
  }
  if (item.saleUnit === "PILL") return ar ? "حبة" : "pill";
  if (item.saleUnit === "STRIP") return ar ? "شريط" : "strip";
  return ar ? "علبة" : "box";
}

function StatusPill({ status }) {
  const value = String(status || "").toUpperCase();
  return <span className={`ops-status ops-status--${value.toLowerCase()}`}>{value || "—"}</span>;
}

export function CashierShiftWidget({ user, onChange, requestClose = 0 }) {
  const ar = activeLocale() === "ar";
  const [shift, setShift] = useState(null);
  const [openingCash, setOpeningCash] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [notes, setNotes] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadCurrent() {
    setLoading(true);
    try {
      const response = await API.get("/shifts/current");
      setShift(response.data.data || null);
      onChange?.(response.data.data || null);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر تحميل الوردية" : "Failed to load shift"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCurrent();
  }, []);

  useEffect(() => {
    if (!requestClose || !shift) return;
    setShowClose(true);
    setCountedCash(shift.summary?.expectedCash || 0);
  }, [requestClose]);

  async function openShift(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await API.post("/shifts/open", { openingCash: Number(openingCash || 0), notes });
      setShift(response.data.data);
      onChange?.(response.data.data);
      setNotes("");
    } catch (err) {
      setError(apiError(err, ar ? "تعذر فتح الوردية" : "Failed to open shift"));
    } finally {
      setBusy(false);
    }
  }

  async function closeShift(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await API.post(`/shifts/${shift.id}/close`, { countedCash: Number(countedCash || 0), notes });
      setShift(null);
      onChange?.(null);
      setCountedCash(0);
      setNotes("");
      setShowClose(false);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر إغلاق الوردية" : "Failed to close shift"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="ops-shift-widget ops-shift-widget--loading">{ar ? "جارٍ فحص الوردية..." : "Checking shift..."}</section>;

  if (!shift) {
    return (
      <section className="ops-shift-widget ops-shift-widget--closed">
        <div className="ops-shift-heading">
          <span className="ops-shift-signal" />
          <div><strong>{ar ? "لا توجد وردية مفتوحة" : "No open shift"}</strong><small>{user?.name}</small></div>
        </div>
        <form className="ops-shift-open-form" onSubmit={openShift}>
          <label><span>{ar ? "رصيد بداية الوردية" : "Opening cash"}</span><input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
          <button type="submit" className="ops-primary" disabled={busy}>{busy ? "..." : ar ? "فتح الوردية" : "Open shift"}</button>
        </form>
        {error ? <p className="ops-error">{error}</p> : null}
      </section>
    );
  }

  const summary = shift.summary || {};
  return (
    <section className="ops-shift-widget ops-shift-widget--open">
      <div className="ops-shift-heading">
        <span className="ops-shift-signal" />
        <div><strong>{ar ? "الوردية مفتوحة" : "Shift open"}</strong><small>{dateTime(shift.openedAt)}</small></div>
      </div>
      <div className="ops-shift-kpis">
        <div><span>{ar ? "الفواتير" : "Invoices"}</span><strong>{summary.invoiceCount || 0}</strong></div>
        <div><span>{ar ? "صافي المبيعات" : "Net sales"}</span><strong>{money(summary.netSales)}</strong></div>
        <div><span>{ar ? "النقد المتوقع" : "Expected cash"}</span><strong>{money(summary.expectedCash)}</strong></div>
      </div>
      {!showClose ? (
        <button type="button" className="ops-secondary" onClick={() => { setShowClose(true); setCountedCash(summary.expectedCash || 0); }}>{ar ? "إغلاق ومراجعة الوردية" : "Close and review shift"}</button>
      ) : (
        <div className="ops-shift-close-review">
          <aside className="ops-shift-sales-review">
            <div className="ops-shift-review-head">
              <div><strong>{ar ? "تفاصيل مبيعات الوردية" : "Shift sales details"}</strong><small>{ar ? `${summary.invoiceCount || 0} فاتورة` : `${summary.invoiceCount || 0} invoices`}</small></div>
              <strong>{money(summary.netSales)}</strong>
            </div>
            <div className="ops-shift-payment-breakdown">
              <span><small>{ar ? "نقدي" : "Cash"}</small><strong>{money(Number(summary.cashSales || 0) - Number(summary.cashRefunds || 0))}</strong></span>
              <span><small>{ar ? "بطاقة" : "Card"}</small><strong>{money(summary.cardSales)}</strong></span>
              <span><small>{ar ? "آجل" : "Credit"}</small><strong>{money(summary.creditSales)}</strong></span>
              <span><small>{ar ? "أخرى" : "Other"}</small><strong>{money(summary.otherSales)}</strong></span>
              <span><small>{ar ? "المصروفات" : "Expenses"}</small><strong className="ops-negative">{money(summary.totalExpenses)}</strong></span>
              <span><small>{ar ? "دفعات العملاء" : "Customer payments"}</small><strong>{money(summary.customerPayments)}</strong></span>
            </div>
            <div className="ops-shift-sales-list">
              {(summary.soldItems || []).map((item) => (
                <article className="ops-shift-sales-row" key={`${item.medicineId}-${item.saleUnit}`}>
                  <div>
                    <strong>{shiftItemName(item, ar)}</strong>
                    <small>{shiftUnitName(item, ar)}{item.serials?.length ? ` · ${ar ? "السيريال" : "serial"}: ${item.serials.join(", ")}` : item.batchNumber ? ` · ${item.batchNumber}` : ""}</small>
                  </div>
                  <span><small>{ar ? "الكمية" : "Qty"}</small><strong>{item.quantity || 0}</strong>{item.returnedQuantity ? <em>{ar ? `مرتجع ${item.returnedQuantity}` : `returned ${item.returnedQuantity}`}</em> : null}</span>
                  <span><small>{ar ? "الإجمالي" : "Total"}</small><strong>{money(item.total)}</strong></span>
                </article>
              ))}
              {!(summary.soldItems || []).length ? <p className="ops-shift-sales-empty">{ar ? "لم تُسجل مبيعات في هذه الوردية." : "No sales were recorded in this shift."}</p> : null}
            </div>
          </aside>
          <form className="ops-close-form" onSubmit={closeShift}>
            <label><span>{ar ? "النقد الفعلي في الدرج" : "Counted cash"}</span><input autoFocus type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} /></label>
            <div className="ops-difference-preview"><span>{ar ? "الفرق المتوقع" : "Expected difference"}</span><strong>{money(Number(countedCash || 0) - Number(summary.expectedCash || 0))}</strong></div>
            <label className="ops-wide"><span>{ar ? "ملاحظة" : "Note"}</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={ar ? "سبب العجز أو الزيادة (اختياري)" : "Shortage/overage reason (optional)"} /></label>
            <div className="ops-form-actions"><button type="button" className="ops-ghost" onClick={() => setShowClose(false)}>{ar ? "رجوع" : "Back"}</button><button type="submit" className="ops-danger" disabled={busy}>{busy ? "..." : ar ? "تأكيد الإغلاق" : "Confirm close"}</button></div>
          </form>
        </div>
      )}
      {error ? <p className="ops-error">{error}</p> : null}
    </section>
  );
}

export function CashierShiftsPage({ user }) {
  const ar = activeLocale() === "ar";
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadShifts() {
    setLoading(true);
    try {
      const response = await API.get("/shifts", { params: { limit: 50 } });
      setShifts(response.data.data || []);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر تحميل سجل الورديات" : "Failed to load shifts"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadShifts(); }, []);

  const totals = useMemo(() => shifts.reduce((acc, shift) => {
    acc.sales += Number(shift.summary?.netSales || 0);
    acc.difference += Number(shift.difference || 0);
    return acc;
  }, { sales: 0, difference: 0 }), [shifts]);

  return (
    <section className="ops-page">
      <header className="ops-page-head"><div><span className="ops-eyebrow">{ar ? "نقطة البيع" : "Point of sale"}</span><h1>{ar ? "الورديات والصندوق" : "Cashier shifts"}</h1><p>{ar ? "فتح الوردية ومراجعة النقد والمبيعات قبل الإغلاق." : "Open shifts and reconcile cash before closing."}</p></div><button className="ops-secondary" onClick={loadShifts}>{ar ? "تحديث" : "Refresh"}</button></header>
      <CashierShiftWidget user={user} onChange={loadShifts} />
      <div className="ops-summary-grid"><article><span>{ar ? "عدد الورديات" : "Shifts"}</span><strong>{shifts.length}</strong></article><article><span>{ar ? "صافي المبيعات" : "Net sales"}</span><strong>{money(totals.sales)}</strong></article><article><span>{ar ? "فرق الصندوق" : "Cash difference"}</span><strong className={totals.difference < 0 ? "ops-negative" : ""}>{money(totals.difference)}</strong></article></div>
      {error ? <p className="ops-error">{error}</p> : null}
      <section className="ops-table-card">
        <div className="ops-table-title"><h2>{ar ? "سجل الورديات" : "Shift history"}</h2><span>{loading ? "..." : `${shifts.length}`}</span></div>
        <div className="ops-table-scroll"><table><thead><tr><th>{ar ? "الموظف" : "User"}</th><th>{ar ? "الفتح" : "Opened"}</th><th>{ar ? "الإغلاق" : "Closed"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "الفواتير" : "Invoices"}</th><th>{ar ? "النقد المتوقع" : "Expected"}</th><th>{ar ? "النقد الفعلي" : "Counted"}</th><th>{ar ? "الفرق" : "Difference"}</th></tr></thead><tbody>
          {shifts.map((shift) => <tr key={shift.id}><td><strong>{shift.user?.name}</strong></td><td>{dateTime(shift.openedAt)}</td><td>{dateTime(shift.closedAt)}</td><td><StatusPill status={shift.status} /></td><td>{shift.summary?.invoiceCount || 0}</td><td>{money(shift.summary?.expectedCash ?? shift.expectedCash)}</td><td>{shift.countedCash === null ? "—" : money(shift.countedCash)}</td><td className={Number(shift.difference) < 0 ? "ops-negative" : ""}>{money(shift.difference)}</td></tr>)}
          {!loading && !shifts.length ? <tr><td colSpan="8" className="ops-empty">{ar ? "لا توجد ورديات بعد" : "No shifts yet"}</td></tr> : null}
        </tbody></table></div>
      </section>
    </section>
  );
}

export function CustomerAccountsPage() {
  const ar = activeLocale() === "ar";
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", phone: "", creditLimit: "", openingBalance: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadCustomers() {
    try {
      const response = await API.get("/customers", { params: query.trim() ? { q: query.trim() } : {} });
      setCustomers(response.data.data || []);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر تحميل حسابات العملاء" : "Failed to load accounts"));
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 180);
    return () => clearTimeout(timer);
  }, [query]);

  async function openAccount(customer) {
    setError("");
    try {
      const response = await API.get(`/customers/${customer.id}/account`);
      setSelected(response.data.data);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر فتح كشف الحساب" : "Failed to open account"));
    }
  }

  async function recordPayment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await API.post(`/customers/${selected.id}/payments`, { amount: Number(payment), note: paymentNote });
      setPayment("");
      setPaymentNote("");
      await loadCustomers();
      await openAccount(selected);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر تسجيل الدفعة" : "Failed to record payment"));
    } finally { setBusy(false); }
  }

  async function createCustomer(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await API.post("/customers", {
        ...createForm,
        creditLimit: Number(createForm.creditLimit || 0),
        openingBalance: Number(createForm.openingBalance || 0)
      });
      setCreateForm({ name: "", phone: "", creditLimit: "", openingBalance: "" });
      setShowCreate(false);
      await loadCustomers();
    } catch (err) {
      setError(apiError(err, ar ? "تعذر إضافة العميل" : "Failed to create customer"));
    } finally { setBusy(false); }
  }

  const totals = useMemo(() => customers.reduce((acc, customer) => {
    const balance = Number(customer.accountBalance || 0);
    acc.balance += balance;
    if (balance > 0) acc.debtors += 1;
    if (customer.creditLimit > 0 && balance >= customer.creditLimit) acc.atLimit += 1;
    return acc;
  }, { balance: 0, debtors: 0, atLimit: 0 }), [customers]);

  return (
    <section className="ops-page">
      <header className="ops-page-head"><div><span className="ops-eyebrow">{ar ? "الحسابات المدينة" : "Receivables"}</span><h1>{ar ? "حسابات العملاء" : "Customer accounts"}</h1><p>{ar ? "بيع آجل، حدود ائتمان، وتسجيل الدفعات في كشف واحد." : "Credit sales, limits, and payments in one ledger."}</p></div><button className="ops-primary" onClick={() => setShowCreate((value) => !value)}>{ar ? "+ عميل جديد" : "+ New customer"}</button></header>
      <div className="ops-summary-grid"><article><span>{ar ? "إجمالي المستحق" : "Total due"}</span><strong>{money(totals.balance)}</strong></article><article><span>{ar ? "عملاء عليهم رصيد" : "Customers with debt"}</span><strong>{totals.debtors}</strong></article><article><span>{ar ? "وصلوا لحد الائتمان" : "At credit limit"}</span><strong>{totals.atLimit}</strong></article></div>
      {showCreate ? <form className="ops-inline-form" onSubmit={createCustomer}><label><span>{ar ? "اسم العميل" : "Customer name"}</span><input required value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} /></label><label><span>{ar ? "الهاتف" : "Phone"}</span><input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} /></label><label><span>{ar ? "حد الائتمان" : "Credit limit"}</span><input type="number" min="0" value={createForm.creditLimit} onChange={(event) => setCreateForm((current) => ({ ...current, creditLimit: event.target.value }))} /></label><label><span>{ar ? "الرصيد الافتتاحي" : "Opening balance"}</span><input type="number" value={createForm.openingBalance} onChange={(event) => setCreateForm((current) => ({ ...current, openingBalance: event.target.value }))} /></label><button className="ops-primary" disabled={busy}>{ar ? "حفظ العميل" : "Save customer"}</button></form> : null}
      {error ? <p className="ops-error">{error}</p> : null}
      <div className="ops-split-layout">
        <section className="ops-table-card">
          <div className="ops-table-title"><h2>{ar ? "العملاء" : "Customers"}</h2><input className="ops-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث بالاسم أو الهاتف" : "Search name or phone"} /></div>
          <div className="ops-table-scroll"><table><thead><tr><th>{ar ? "العميل" : "Customer"}</th><th>{ar ? "الهاتف" : "Phone"}</th><th>{ar ? "الرصيد" : "Balance"}</th><th>{ar ? "حد الائتمان" : "Limit"}</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id} className={selected?.id === customer.id ? "ops-row-selected" : ""}><td><strong>{customer.name}</strong></td><td>{customer.phone || "—"}</td><td className={customer.accountBalance > 0 ? "ops-negative" : ""}>{money(customer.accountBalance)}</td><td>{customer.creditLimit > 0 ? money(customer.creditLimit) : ar ? "غير محدد" : "Not set"}</td><td><button className="ops-table-action" onClick={() => openAccount(customer)}>{ar ? "كشف الحساب" : "Ledger"}</button></td></tr>)}</tbody></table></div>
        </section>
        <aside className="ops-account-panel">
          {selected ? <><div className="ops-account-head"><div><span>{ar ? "كشف حساب" : "Account ledger"}</span><h2>{selected.name}</h2></div><strong>{money(selected.accountBalance)}</strong></div>
            <form className="ops-payment-form" onSubmit={recordPayment}><label><span>{ar ? "دفعة جديدة" : "New payment"}</span><input required type="number" min="0.01" step="0.01" max={Math.max(0, Number(selected.accountBalance || 0))} value={payment} onChange={(event) => setPayment(event.target.value)} /></label><label><span>{ar ? "ملاحظة" : "Note"}</span><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></label><button className="ops-primary" disabled={busy || Number(selected.accountBalance) <= 0}>{ar ? "تسجيل الدفعة" : "Record payment"}</button></form>
            <div className="ops-ledger">{selected.accountTransactions?.map((transaction) => <article key={transaction.id}><div><strong>{transaction.type}</strong><small>{dateTime(transaction.createdAt)}</small></div><span className={transaction.amount > 0 ? "ops-negative" : "ops-positive"}>{transaction.amount > 0 ? "+" : ""}{money(transaction.amount)}</span><small>{ar ? "الرصيد" : "Balance"}: {money(transaction.balanceAfter)}</small></article>)}{!selected.accountTransactions?.length ? <p className="ops-empty">{ar ? "لا توجد حركات بعد" : "No transactions yet"}</p> : null}</div>
          </> : <div className="ops-empty-panel"><span>◎</span><strong>{ar ? "اختر عميلًا لعرض كشف الحساب" : "Select a customer to view the ledger"}</strong></div>}
        </aside>
      </div>
    </section>
  );
}

export function InventoryCountWorkspace({ currentUser }) {
  const ar = activeLocale() === "ar";
  const canCount = ["ADMIN", "PHARMACIST"].includes(currentUser?.role);
  const [counts, setCounts] = useState([]);
  const [active, setActive] = useState(null);
  const [barcode, setBarcode] = useState("");
  const [countedQuantity, setCountedQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const barcodeRef = useRef(null);

  async function loadCounts(selectOpen = false) {
    try {
      const response = await API.get("/inventory/counts");
      const next = response.data.data || [];
      setCounts(next);
      if (active) setActive(next.find((count) => count.id === active.id) || null);
      else if (selectOpen) setActive(next.find((count) => count.status === "OPEN") || null);
    } catch (err) {
      setError(apiError(err, ar ? "تعذر تحميل الجرد" : "Failed to load counts"));
    }
  }

  useEffect(() => { loadCounts(true); }, []);

  async function createCount() {
    setBusy(true); setError("");
    try {
      const response = await API.post("/inventory/counts", { notes: note });
      setActive(response.data.data); setNote(""); await loadCounts();
      setTimeout(() => barcodeRef.current?.focus(), 0);
    } catch (err) { setError(apiError(err, ar ? "تعذر بدء الجرد" : "Failed to start count")); }
    finally { setBusy(false); }
  }

  async function saveScan(event) {
    event.preventDefault();
    if (!active || !barcode.trim()) return;
    setBusy(true); setError("");
    try {
      const query = barcode.trim();
      const response = await API.get("/medicines", { params: { q: query, searchMode: "contains", pageSize: 20 } });
      const matches = response.data.data || [];
      const normalized = query.toLowerCase();
      const medicine = matches.find((item) => String(item.barcode || "").toLowerCase() === normalized || String(item.name || "").toLowerCase() === normalized) || matches[0];
      if (!medicine?.barcode) throw new Error(ar ? "لم يتم العثور على صنف مطابق له باركود." : "No matching barcoded item was found.");
      await API.post(`/inventory/counts/${active.id}/items`, { barcode: medicine.barcode, countedQuantity: Number(countedQuantity), note });
      setBarcode(""); setCountedQuantity(1); setNote(""); await loadCounts();
      setTimeout(() => barcodeRef.current?.focus(), 0);
    } catch (err) { setError(apiError(err, err.message || (ar ? "تعذر حفظ الصنف" : "Failed to save item"))); }
    finally { setBusy(false); }
  }

  async function updateItem(item, value) {
    setBusy(true); setError("");
    try {
      await API.patch(`/inventory/counts/${active.id}/items/${item.id}`, { countedQuantity: Number(value) });
      await loadCounts();
    } catch (err) { setError(apiError(err, ar ? "تعذر تعديل الكمية" : "Failed to update quantity")); }
    finally { setBusy(false); }
  }

  async function completeCount() {
    if (!window.confirm(ar ? "تطبيق فروق الجرد على المخزون وإغلاق العملية؟" : "Apply differences and complete this count?")) return;
    setBusy(true); setError("");
    try {
      const response = await API.post(`/inventory/counts/${active.id}/complete`);
      setActive(response.data.data); await loadCounts();
    } catch (err) { setError(apiError(err, ar ? "تعذر إكمال الجرد" : "Failed to complete count")); }
    finally { setBusy(false); }
  }

  const discrepancies = active?.items?.filter((item) => Number(item.difference || 0) !== 0) || [];
  const countDisplayName = (count) => {
    const names = Array.from(new Set((count?.items || []).map((item) => item.medicine?.name).filter(Boolean)));
    if (!names.length) return ar ? "جرد جديد بدون أصناف" : "New empty stocktake";
    return names.length > 2 ? `${names.slice(0, 2).join("، ")} +${names.length - 2}` : names.join("، ");
  };
  return (
    <section className="ops-page">
      <header className="ops-page-head"><div><span className="ops-eyebrow">{ar ? "المخزون الفعلي" : "Physical inventory"}</span><h1>{ar ? "الجرد السريع للأصناف" : "Fast item stocktake"}</h1><p>{ar ? "ابحث بالاسم أو جزء منه أو امسح الباركود، ثم أدخل الكمية الفعلية وراجع الفروق." : "Search by name or part of it, or scan the barcode, then review differences."}</p></div><button className="ops-primary" disabled={!canCount || busy || counts.some((count) => count.status === "OPEN")} onClick={createCount}>{ar ? "+ بدء جرد جديد" : "+ Start count"}</button></header>
      {!canCount ? <p className="ops-info">{ar ? "يمكنك عرض عمليات الجرد، بينما بدء الجرد وتطبيق الفروق متاحان للمدير والصيدلي." : "You can review counts; only admins and pharmacists can apply stock differences."}</p> : null}
      {error ? <p className="ops-error">{error}</p> : null}
      <div className="ops-stocktake-layout">
        <aside className="ops-count-list"><div className="ops-table-title"><h2>{ar ? "عمليات الجرد" : "Counts"}</h2><span>{counts.length}</span></div>{counts.map((count) => <button key={count.id} className={active?.id === count.id ? "active" : ""} onClick={() => setActive(count)}><div><strong>{countDisplayName(count)}</strong><small>{dateTime(count.createdAt)}</small></div><StatusPill status={count.status} /><span>{count.items?.length || 0} {ar ? "صنف" : "items"}</span></button>)}{!counts.length ? <p className="ops-empty">{ar ? "ابدأ أول عملية جرد" : "Start the first count"}</p> : null}</aside>
        <main className="ops-stocktake-main">
          {active ? <><div className="ops-stocktake-head"><div><StatusPill status={active.status} /><h2>{countDisplayName(active)}</h2><span>{ar ? "بواسطة" : "By"} {active.createdBy?.name}</span></div><div className="ops-stocktake-mini"><span>{ar ? "تم عدها" : "Counted"}<strong>{active.items?.length || 0}</strong></span><span>{ar ? "بها فرق" : "Differences"}<strong>{discrepancies.length}</strong></span></div></div>
            {active.status === "OPEN" && canCount ? <form className="ops-scan-form" onSubmit={saveScan}><label className="ops-scan-barcode"><span>{ar ? "بحث الصنف" : "Item search"}</span><input ref={barcodeRef} autoFocus required data-unified-medicine-search="true" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder={ar ? "اسم الصنف أو جزء منه / SKU / امسح الباركود — F4" : "Item name or part of it / SKU / scan barcode — F4"} /></label><label><span>{ar ? "الكمية الفعلية" : "Counted quantity"}</span><input type="number" min="0" step="1" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label><label><span>{ar ? "ملاحظة" : "Note"}</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={ar ? "اختياري" : "Optional"} /></label><button className="ops-primary" disabled={busy}>{ar ? "حفظ وانتقال للصنف التالي" : "Save and scan next"}</button></form> : null}
            <section className="ops-table-card ops-stocktake-table"><div className="ops-table-title"><h2>{ar ? "الأصناف المعدودة" : "Counted items"}</h2>{active.status === "OPEN" && canCount ? <button className="ops-danger" disabled={busy || !active.items?.length} onClick={completeCount}>{ar ? "مراجعة وتطبيق الفروق" : "Apply differences"}</button> : <span>{active.completedAt ? dateTime(active.completedAt) : active.status}</span>}</div><div className="ops-table-scroll"><table><thead><tr><th>{ar ? "الصنف" : "Medicine"}</th><th>{ar ? "النظام" : "Expected"}</th><th>{ar ? "الفعلي" : "Counted"}</th><th>{ar ? "الفرق" : "Difference"}</th><th>{ar ? "ملاحظة" : "Note"}</th></tr></thead><tbody>{active.items?.map((item) => <tr key={item.id}><td><strong>{item.medicine?.name}</strong><small className="ops-cell-sub">{item.medicine?.barcode}</small></td><td>{item.expectedQuantity}</td><td>{active.status === "OPEN" && canCount ? <input className="ops-qty-input" type="number" min="0" defaultValue={item.countedQuantity} onBlur={(event) => Number(event.target.value) !== item.countedQuantity && updateItem(item, event.target.value)} /> : item.countedQuantity}</td><td><span className={`ops-diff ${item.difference < 0 ? "negative" : item.difference > 0 ? "positive" : "zero"}`}>{item.difference > 0 ? "+" : ""}{item.difference || 0}</span></td><td>{item.note || "—"}</td></tr>)}{!active.items?.length ? <tr><td colSpan="5" className="ops-empty">{ar ? "امسح أول باركود لبدء العد" : "Scan the first barcode to begin"}</td></tr> : null}</tbody></table></div></section>
          </> : <div className="ops-empty-panel"><span>▦</span><strong>{ar ? "ابدأ عملية جرد جديدة أو اختر عملية سابقة" : "Start or select an inventory count"}</strong></div>}
        </main>
      </div>
    </section>
  );
}

export function OperationsOverview({ locale, onNavigate = () => {} }) {
  const ar = locale === "ar";
  const [data, setData] = useState({ shift: null, debt: 0, debtors: 0, openCount: null });

  useEffect(() => {
    let active = true;
    Promise.all([API.get("/shifts/current"), API.get("/customers"), API.get("/inventory/counts", { params: { status: "OPEN" } })])
      .then(([shiftResponse, customersResponse, countsResponse]) => {
        if (!active) return;
        const customers = customersResponse.data.data || [];
        setData({
          shift: shiftResponse.data.data || null,
          debt: customers.reduce((sum, item) => sum + Number(item.accountBalance || 0), 0),
          debtors: customers.filter((item) => Number(item.accountBalance || 0) > 0).length,
          openCount: (countsResponse.data.data || [])[0] || null
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const openCountNames = Array.from(new Set((data.openCount?.items || []).map((item) => item.medicine?.name).filter(Boolean)));
  const openCountLabel = openCountNames.length ? (openCountNames.length > 2 ? `${openCountNames.slice(0, 2).join("، ")} +${openCountNames.length - 2}` : openCountNames.join("، ")) : (data.openCount ? (ar ? "جرد مفتوح بدون أصناف" : "Open empty stocktake") : (ar ? "لا يوجد" : "None"));
  return <section className="ops-overview"><button type="button" onClick={() => onNavigate("cashier-shifts")}><span className="ops-overview-icon">◉</span><div><small>{ar ? "الوردية الحالية" : "Current shift"}</small><strong>{data.shift ? ar ? "مفتوحة" : "Open" : ar ? "غير مفتوحة" : "Not open"}</strong><em>{data.shift ? money(data.shift.summary?.netSales) : "—"}</em><i>{ar ? "عرض التفاصيل ←" : "View details →"}</i></div></button><button type="button" onClick={() => onNavigate("customer-accounts")}><span className="ops-overview-icon">◎</span><div><small>{ar ? "مستحقات العملاء" : "Customer receivables"}</small><strong>{money(data.debt)}</strong><em>{data.debtors} {ar ? "عميل" : "customers"}</em><i>{ar ? "عرض التفاصيل ←" : "View details →"}</i></div></button><button type="button" onClick={() => onNavigate("inventory")}><span className="ops-overview-icon">▦</span><div><small>{ar ? "الجرد الحالي" : "Current stocktake"}</small><strong>{openCountLabel}</strong><em>{data.openCount?.items?.length || 0} {ar ? "صنف معدود" : "counted items"}</em><i>{ar ? "عرض التفاصيل ←" : "View details →"}</i></div></button></section>;
}
