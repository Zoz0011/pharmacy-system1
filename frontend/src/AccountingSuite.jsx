import React, { useEffect, useMemo, useState } from "react";
import API from "./api";

const ACCOUNT_TYPES = [
  { value: "ASSET", label: "الأصول" },
  { value: "LIABILITY", label: "الالتزامات" },
  { value: "EQUITY", label: "حقوق الملكية" },
  { value: "INCOME", label: "الإيرادات" },
  { value: "EXPENSE", label: "المصروفات" }
];
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const date = new Date(); date.setDate(1); return date.toISOString().slice(0, 10); };
const money = (value) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dateTime = (value) => value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const typeLabel = (type) => ACCOUNT_TYPES.find((item) => item.value === type)?.label || type;
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="accounting-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`accounting-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" dir="rtl">
        <header><div><span className="accounting-modal-mark">▣</span><h2>{title}</h2></div><button type="button" onClick={onClose} title="إغلاق">×</button></header>
        <div className="accounting-modal-body">{children}</div>
      </section>
    </div>
  );
}

function Notice({ notice, clear }) {
  if (!notice) return null;
  return <div className={`accounting-notice ${notice.type || "success"}`}><span>{notice.text}</span><button type="button" onClick={clear}>×</button></div>;
}

function PageHead({ title, subtitle, actions, range, setRange, loading, onRefresh }) {
  return (
    <>
      <div className="accounting-page-head" dir="rtl">
        <div><span className="eyebrow">إدارة الحسابات</span><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="accounting-page-actions">{actions}{onRefresh ? <button type="button" className="secondary-button" onClick={onRefresh} disabled={loading}>↻ تحديث</button> : null}<button type="button" className="secondary-button" onClick={() => window.print()}>🖨 طباعة</button></div>
      </div>
      {range && setRange ? <details className="transaction-filter-panel accounting-filter-bar" dir="rtl" open><summary><span className="unified-filter-title">التصفية<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5.5l-4 2V13L3 5Z" /></svg></span></summary><div className="transaction-filter-grid"><label className="transaction-filter-range"><span>نطاق التاريخ</span><div><input aria-label="من تاريخ" type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} /><input aria-label="إلى تاريخ" type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} /></div></label><span className="accounting-filter-note">كل الأرقام محسوبة من العمليات المسجلة في النظام</span></div></details> : null}
    </>
  );
}

function LoadingBlock({ loading, error, children }) {
  if (loading) return <div className="accounting-state">جارٍ تحميل البيانات المحاسبية…</div>;
  if (error) return <div className="accounting-state error">{error}</div>;
  return children;
}

function AccountForm({ initial, onSubmit, onClose, saving }) {
  const [form, setForm] = useState(() => ({ name: initial?.name || "", accountNumber: initial?.accountNumber || "", accountType: initial?.accountType || "ASSET", subType: initial?.subType || "", openingBalance: initial?.openingBalance || "", note: initial?.note || "", active: initial?.active ?? true, details: Array.from({ length: 6 }, (_, index) => initial?.details?.[index] || { label: "", value: "" }) }));
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateDetail = (index, key, value) => setForm((current) => ({ ...current, details: current.details.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  return <form className="accounting-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, details: form.details.filter((row) => row.label || row.value) }); }}>
    <div className="accounting-form-grid">
      <label>اسم الحساب *<input required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="مثال: حساب البنك" /></label>
      <label>رقم الحساب *<input required value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} placeholder="مثال: 1005" /></label>
      <label>نوع الحساب *<select value={form.accountType} onChange={(e) => update("accountType", e.target.value)}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>النوع الفرعي<input value={form.subType} onChange={(e) => update("subType", e.target.value)} placeholder="أصول متداولة / مصروف تشغيلي" /></label>
      {!initial ? <label>الرصيد الافتتاحي<input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => update("openingBalance", e.target.value)} /></label> : <label className="accounting-check"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />الحساب نشط</label>}
    </div>
    <div className="accounting-detail-editor"><h3>تفاصيل إضافية للحساب</h3><div className="accounting-details-head"><span>الملصق</span><span>القيمة</span></div>{form.details.map((row, index) => <div className="accounting-details-row" key={index}><input value={row.label} onChange={(e) => updateDetail(index, "label", e.target.value)} placeholder={`بيان ${index + 1}`} /><input value={row.value} onChange={(e) => updateDetail(index, "value", e.target.value)} placeholder="القيمة" /></div>)}</div>
    <label>ملاحظة<textarea rows="3" value={form.note} onChange={(e) => update("note", e.target.value)} placeholder="ملاحظة داخلية عن الحساب" /></label>
    <footer className="accounting-form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button><button type="button" className="secondary-button" onClick={onClose}>إغلاق</button></footer>
  </form>;
}

export function AccountingAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState(null);

  async function load() {
    setLoading(true);
    try { const { data } = await API.get("/accounting/accounts", { params: { active: showInactive ? undefined : true } }); setAccounts(data.data || []); }
    catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر تحميل الحسابات") }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [showInactive]);
  const filtered = useMemo(() => accounts.filter((account) => !query || `${account.name} ${account.accountNumber} ${typeLabel(account.accountType)}`.toLowerCase().includes(query.toLowerCase())), [accounts, query]);
  const totals = useMemo(() => ACCOUNT_TYPES.map((type) => ({ ...type, amount: accounts.filter((account) => account.accountType === type.value && account.active).reduce((sum, account) => sum + Number(account.effectiveBalance || 0), 0) })), [accounts]);

  async function saveAccount(payload) {
    setSaving(true);
    try {
      if (selected) await API.put(`/accounting/accounts/${selected.id}`, payload); else await API.post("/accounting/accounts", payload);
      setNotice({ text: selected ? "تم تعديل الحساب بنجاح" : "تمت إضافة الحساب بنجاح" }); setModal(null); setSelected(null); await load();
    } catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر حفظ الحساب") }); }
    finally { setSaving(false); }
  }
  async function removeAccount(account) {
    if (!window.confirm(`هل تريد حذف/إغلاق حساب «${account.name}»؟`)) return;
    try { const { data } = await API.delete(`/accounting/accounts/${account.id}`); setNotice({ text: data.message }); await load(); }
    catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر حذف الحساب") }); }
  }
  async function openLedger(account) {
    setSelected(account); setModal("ledger"); setLedger(null);
    try { const { data } = await API.get(`/accounting/accounts/${account.id}/ledger`); setLedger(data.data); }
    catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر تحميل دفتر الأستاذ") }); }
  }
  async function submitOpening(event) {
    event.preventDefault(); setSaving(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try { await API.post(`/accounting/accounts/${selected.id}/opening`, payload); setNotice({ text: "تم تسجيل الإيداع الافتتاحي" }); setModal(null); await load(); }
    catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر تسجيل الإيداع") }); }
    finally { setSaving(false); }
  }
  async function submitTransfer(event) {
    event.preventDefault(); setSaving(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try { await API.post("/accounting/transfers", payload); setNotice({ text: "تم التحويل بين الحسابات" }); setModal(null); await load(); }
    catch (error) { setNotice({ type: "error", text: errorMessage(error, "تعذر تنفيذ التحويل") }); }
    finally { setSaving(false); }
  }

  return <div className="accounting-page" dir="rtl">
    <PageHead title="إدارة الحسابات" subtitle="دليل الحسابات المالية والنقدية المرتبط تلقائيًا بالخزينة والعمليات" loading={loading} onRefresh={load} actions={<button type="button" className="primary-button" onClick={() => { setSelected(null); setModal("form"); }}>＋ إضافة حساب</button>} />
    <Notice notice={notice} clear={() => setNotice(null)} />
    <div className="accounting-kpi-row">{totals.map((item) => <div className={`accounting-kpi ${item.value.toLowerCase()}`} key={item.value}><span>{item.label}</span><strong>{money(item.amount)}</strong></div>)}</div>
    <section className="accounting-card">
      <div className="accounting-table-tools"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو رقم الحساب…" /><label className="accounting-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />عرض الحسابات المغلقة</label><span>{filtered.length} حساب</span></div>
      <LoadingBlock loading={loading}><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>اسم الحساب</th><th>رقم الحساب</th><th>النوع</th><th>النوع الفرعي</th><th>الرصيد</th><th>الحالة</th><th>خيارات</th></tr></thead><tbody>{filtered.length ? filtered.map((account) => <tr key={account.id}><td><strong>{account.name}</strong>{account.systemKey ? <small className="system-account-badge">تلقائي</small> : null}</td><td>{account.accountNumber}</td><td>{typeLabel(account.accountType)}</td><td>{account.subType || "—"}</td><td className={Number(account.effectiveBalance) < 0 ? "negative" : "positive"}>{money(account.effectiveBalance)}</td><td><span className={`account-status ${account.active ? "active" : "closed"}`}>{account.active ? "نشط" : "مغلق"}</span></td><td><div className="account-action-grid"><button type="button" onClick={() => openLedger(account)}>دفتر الأستاذ</button><button type="button" onClick={() => { setSelected(account); setModal("opening"); }}>إيداع افتتاحي</button>{account.accountType === "ASSET" ? <button type="button" onClick={() => { setSelected(account); setModal("transfer"); }}>تحويل</button> : null}<button type="button" onClick={() => { setSelected(account); setModal("form"); }}>تعديل</button><button type="button" className="danger" onClick={() => removeAccount(account)}>{account.systemKey ? "إغلاق" : "حذف"}</button></div></td></tr>) : <tr><td colSpan="7" className="empty-cell">لا توجد حسابات مطابقة</td></tr>}</tbody></table></div></LoadingBlock>
    </section>
    {modal === "form" ? <Modal title={selected ? "تعديل الحساب" : "إضافة حساب جديد"} onClose={() => { setModal(null); setSelected(null); }} wide><AccountForm initial={selected} saving={saving} onSubmit={saveAccount} onClose={() => setModal(null)} /></Modal> : null}
    {modal === "opening" && selected ? <Modal title={`إيداع افتتاحي — ${selected.name}`} onClose={() => setModal(null)}><form className="accounting-form" onSubmit={submitOpening}><label>المبلغ *<input autoFocus required name="amount" type="number" min="0.01" step="0.01" /></label><label>البيان<textarea name="note" rows="3" placeholder="سبب الإيداع" /></label><footer className="accounting-form-actions"><button className="primary-button" disabled={saving}>تسجيل الإيداع</button><button type="button" className="secondary-button" onClick={() => setModal(null)}>إلغاء</button></footer></form></Modal> : null}
    {modal === "transfer" && selected ? <Modal title="تحويل بين الحسابات النقدية والبنكية" onClose={() => setModal(null)}><form className="accounting-form" onSubmit={submitTransfer}><label>من حساب<select name="fromAccountId" defaultValue={selected.id}>{accounts.filter((a) => a.active && a.accountType === "ASSET").map((a) => <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>)}</select></label><label>إلى حساب<select name="toAccountId" required defaultValue=""><option value="" disabled>اختر الحساب المستلم</option>{accounts.filter((a) => a.active && a.accountType === "ASSET" && a.id !== selected.id).map((a) => <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>)}</select></label><label>المبلغ *<input name="amount" required type="number" min="0.01" step="0.01" /></label><label>طريقة الدفع<select name="paymentMethod"><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل بنكي</option></select></label><label>البيان<textarea name="note" rows="2" /></label><footer className="accounting-form-actions"><button className="primary-button" disabled={saving}>تنفيذ التحويل</button><button type="button" className="secondary-button" onClick={() => setModal(null)}>إلغاء</button></footer></form></Modal> : null}
    {modal === "ledger" && selected ? <Modal title={`دفتر الأستاذ — ${selected.name}`} onClose={() => setModal(null)} wide><LoadingBlock loading={!ledger}>{ledger ? <><div className="ledger-balance"><span>الرصيد الحالي</span><strong>{money(ledger.account.effectiveBalance)}</strong></div><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>التاريخ</th><th>المرجع</th><th>البيان</th><th>مدين</th><th>دائن</th><th>المصدر</th></tr></thead><tbody>{ledger.entries.length ? ledger.entries.map((row) => <tr key={row.id}><td>{dateTime(row.entryDate)}</td><td>{row.entryNumber}</td><td>{row.description || "—"}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{row.source === "TREASURY" ? "الخزينة" : "قيد محاسبي"}</td></tr>) : <tr><td colSpan="6" className="empty-cell">لا توجد حركة على الحساب</td></tr>}</tbody></table></div></> : null}</LoadingBlock></Modal> : null}
  </div>;
}

function useAccountingReport(path) {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); try { const response = await API.get(path, { params: range }); setData(response.data.data); } catch (requestError) { setError(errorMessage(requestError, "تعذر تحميل التقرير")); } finally { setLoading(false); } }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [path, range.from, range.to]);
  return { range, setRange, data, loading, error, load };
}

function MetricRows({ rows }) { return <div className="accounting-metric-rows">{rows.map((row) => <div className={row.total ? "total" : ""} key={row.label}><span>{row.label}</span><strong className={Number(row.value) < 0 ? "negative" : ""}>{money(row.value)}</strong></div>)}</div>; }

export function AccountingProfitLossPage() {
  const report = useAccountingReport("/accounting/reports/profit-loss"); const m = report.data?.metrics || {};
  return <div className="accounting-page" dir="rtl"><PageHead title="الدخل (الربح / الخسارة)" subtitle="إيرادات ومصروفات وتكلفة المخزون وصافي الربح للفترة" {...report} /><LoadingBlock loading={report.loading} error={report.error}><div className="accounting-report-grid"><section className="accounting-card"><h2>المبيعات والإيرادات</h2><MetricRows rows={[{ label: "إجمالي المبيعات", value: m.grossSales }, { label: "إجمالي مرتجع المبيعات", value: -m.salesReturns }, { label: "صافي المبيعات", value: m.netSales, total: true }, { label: "تكلفة البضاعة المباعة", value: -m.costOfGoodsSold }, { label: "مجمل الربح", value: m.grossProfit, total: true }]} /></section><section className="accounting-card"><h2>المشتريات والمصروفات</h2><MetricRows rows={[{ label: "إجمالي المشتريات", value: m.grossPurchases }, { label: "مرتجع المشتريات", value: -m.purchaseReturns }, { label: "صافي المشتريات", value: m.netPurchases, total: true }, { label: "المصروفات التشغيلية", value: -m.operatingExpenses }, { label: "المخزون الحالي بسعر الشراء", value: m.inventory }]} /></section></div><section className="profit-summary"><div><span>تكلفة البضاعة المباعة</span><strong>{money(m.costOfGoodsSold)}</strong></div><div><span>إجمالي الربح</span><strong>{money(m.grossProfit)}</strong></div><div className={Number(m.netProfit) < 0 ? "loss" : "profit"}><span>صافي الربح</span><strong>{money(m.netProfit)}</strong></div></section></LoadingBlock></div>;
}

export function AccountingTradingPage() {
  const report = useAccountingReport("/accounting/reports/trading"); const d = report.data || {}; const s = d.sales || {}; const p = d.purchases || {};
  return <div className="accounting-page" dir="rtl"><PageHead title="تقرير المتاجرة" subtitle="مقارنة تفاصيل المشتريات والمبيعات والمرتجعات والديون" {...report} /><LoadingBlock loading={report.loading} error={report.error}><div className="accounting-report-grid"><section className="accounting-card"><h2>المبيعات</h2><MetricRows rows={[{ label: "إجمالي المبيعات", value: s.gross }, { label: "مرتجع المبيعات", value: s.returns }, { label: "صافي المبيعات", value: s.net, total: true }, { label: "ديون العملاء", value: s.customerDebt }]} /></section><section className="accounting-card"><h2>المشتريات</h2><MetricRows rows={[{ label: "إجمالي المشتريات", value: p.gross }, { label: "مرتجع المشتريات", value: p.returns }, { label: "صافي المشتريات", value: p.net, total: true }, { label: "ديون الموردين", value: p.supplierDebt }]} /></section></div><section className="trading-summary"><p>صافي المتاجرة (بيع − شراء)<strong>{money(d.difference)}</strong></p><p>صافي المستحق (عملاء − موردين)<strong>{money(d.amountDue)}</strong></p></section></LoadingBlock></div>;
}

export function AccountingTrialBalancePage() {
  const report = useAccountingReport("/accounting/reports/trial-balance"); const rows = report.data?.rows || []; const totals = report.data?.totals || {};
  return <div className="accounting-page" dir="rtl"><PageHead title="ميزان المراجعة" subtitle="الأرصدة المدينة والدائنة مع تحقق تلقائي من توازن القيود" {...report} /><LoadingBlock loading={report.loading} error={report.error}><section className="accounting-card"><div className={`balance-status ${totals.balanced ? "ok" : "bad"}`}>{totals.balanced ? "✓ الميزان متوازن" : "! يوجد فرق يحتاج المراجعة"}</div><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>رقم الحساب</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.accountNumber}</td><td>{row.name}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td></tr>)}<tr className="table-total"><td colSpan="2">المجموع</td><td>{money(totals.debit)}</td><td>{money(totals.credit)}</td></tr></tbody></table></div></section></LoadingBlock></div>;
}

export function AccountingCashFlowPage() {
  const report = useAccountingReport("/accounting/reports/cash-flow"); const rows = report.data?.transactions || []; const totals = report.data?.totals || {};
  return <div className="accounting-page" dir="rtl"><PageHead title="التدفق النقدي" subtitle="كل الأموال الداخلة والخارجة المسجلة في الخزينة" {...report} /><LoadingBlock loading={report.loading} error={report.error}><div className="accounting-kpi-row"><div className="accounting-kpi income"><span>المقبوضات</span><strong>{money(totals.income)}</strong></div><div className="accounting-kpi expense"><span>المدفوعات</span><strong>{money(totals.expense)}</strong></div><div className="accounting-kpi asset"><span>الرصيد الحالي</span><strong>{money(totals.balance)}</strong></div></div><section className="accounting-card"><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>التاريخ</th><th>المرجع</th><th>الوصف</th><th>طريقة الدفع</th><th>داخل</th><th>خارج</th><th>الرصيد بعد الحركة</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{dateTime(row.createdAt)}</td><td>{row.referenceNumber || `TR-${row.id}`}</td><td>{row.note || row.type}</td><td>{row.paymentMethod || "—"}</td><td className="positive">{money(row.credit)}</td><td className="negative">{money(row.debit)}</td><td>{money(row.balanceAfter)}</td></tr>) : <tr><td colSpan="7" className="empty-cell">لا توجد حركة نقدية في الفترة</td></tr>}</tbody></table></div></section></LoadingBlock></div>;
}

export function AccountingBalanceSheetPage() {
  const report = useAccountingReport("/accounting/reports/balance-sheet"); const d = report.data || {}; const totals = d.totals || {};
  return <div className="accounting-page" dir="rtl"><PageHead title="الميزانية العمومية" subtitle="الأصول في مقابل الالتزامات وحقوق الملكية" {...report} /><LoadingBlock loading={report.loading} error={report.error}><div className="accounting-report-grid balance-sheet"><section className="accounting-card"><h2>الأصول</h2><MetricRows rows={(d.assets || []).map((row) => ({ label: row.name, value: row.amount })).concat([{ label: "إجمالي الأصول", value: totals.assets, total: true }])} /></section><section className="accounting-card"><h2>الالتزامات وحقوق الملكية</h2><MetricRows rows={(d.liabilities || []).map((row) => ({ label: row.name, value: row.amount })).concat((d.equity || []).map((row) => ({ label: row.name, value: row.amount }))).concat([{ label: "إجمالي الالتزامات", value: totals.liabilities }, { label: "إجمالي حقوق الملكية", value: totals.equity, total: true }])} /></section></div><div className={`balance-status ${totals.balanced ? "ok" : "bad"}`}>{totals.balanced ? "✓ الميزانية متوازنة" : "! الميزانية غير متوازنة"}</div></LoadingBlock></div>;
}

export function AccountingMovementsPage() {
  const report = useAccountingReport("/accounting/reports/movements"); const [query, setQuery] = useState(""); const rows = (report.data || []).filter((row) => !query || `${row.reference} ${row.description} ${row.account}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="accounting-page" dir="rtl"><PageHead title="سجل حركة الحسابات" subtitle="حركة الخزينة والقيود والتحويلات في سجل واحد" {...report} /><LoadingBlock loading={report.loading} error={report.error}><section className="accounting-card"><div className="accounting-table-tools"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث في المرجع أو البيان أو الحساب…" /><span>{rows.length} حركة</span></div><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th>التاريخ</th><th>رقم المرجع</th><th>الحساب</th><th>الوصف</th><th>طريقة الدفع</th><th>مدين</th><th>دائن</th><th>المصدر</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{dateTime(row.date)}</td><td>{row.reference}</td><td>{row.account}</td><td>{row.description || "—"}</td><td>{row.paymentMethod || "—"}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{row.source === "TREASURY" ? "الخزينة" : "قيد محاسبي"}</td></tr>) : <tr><td colSpan="8" className="empty-cell">لا توجد حركات في الفترة</td></tr>}</tbody></table></div></section></LoadingBlock></div>;
}
