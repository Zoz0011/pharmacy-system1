import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import readXlsxFile from "read-excel-file/browser";
import "./style.css";
import API from "./api";
import { getInitialLocale, LOCALES, setLocalePreference, translateText } from "./i18n";
import {
  CashierShiftWidget,
  CashierShiftsPage,
  CustomerAccountsPage,
  InventoryCountWorkspace,
  OperationsOverview
} from "./OperationsSuite";
import {
  AccountingAccountsPage,
  AccountingProfitLossPage,
  AccountingTradingPage,
  AccountingTrialBalancePage,
  AccountingCashFlowPage,
  AccountingBalanceSheetPage,
  AccountingMovementsPage
} from "./AccountingSuite";
const ROLE_OPTIONS = ["ADMIN", "PHARMACIST", "CASHIER"];
const MEDICINE_SEARCH_PLACEHOLDER_AR = "ابحث باسم الصنف أو جزء منه / SKU / امسح الباركود — F4";
const MEDICINE_SEARCH_PLACEHOLDER_EN = "Item name or part of it / SKU / scan barcode — F4";

let successAudioContext;

function prepareSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    successAudioContext ||= new AudioContextClass();
    if (successAudioContext.state === "suspended") successAudioContext.resume();
    return successAudioContext;
  } catch {
    return null;
  }
}

function playSuccessSound(kind = "add") {
  const context = prepareSuccessSound();
  if (!context) return;
  const notes = kind === "sale"
    ? [{ frequency: 659, offset: 0 }, { frequency: 784, offset: 0.1 }, { frequency: 1047, offset: 0.2 }]
    : [{ frequency: 587, offset: 0 }, { frequency: 880, offset: 0.12 }];
  const peakGain = kind === "sale" ? 0.32 : 0.26;
  const start = context.currentTime + 0.02;

  notes.forEach(({ frequency, offset }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + offset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(peakGain, noteStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.22);
  });
}

function playErrorSound() {
  const context = prepareSuccessSound();
  if (!context) return;
  const start = context.currentTime + 0.01;
  [0, 0.14].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index ? 150 : 210, start + offset);
    oscillator.frequency.exponentialRampToValueAtTime(index ? 105 : 135, start + offset + 0.11);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.13);
  });
}

const emptyMedicineForm = {
  name: "",
  nameAr: "",
  nameEn: "",
  searchAliases: "",
  itemType: "MEDICINE",
  packageNameAr: "علبة",
  packageNameEn: "box",
  pieceNameAr: "حبة",
  pieceNameEn: "pill",
  stockUnit: "علبة",
  barcode: "",
  category: "",
  manufacturer: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  stripSellingPrice: "",
  pillSellingPrice: "",
  quantity: 0,
  minStock: 5,
  stripsPerBox: 1,
  pillsPerStrip: 1,
  expiryDate: "",
  batchNumber: ""
};

const emptyInvoiceItem = {
  name: "",
  barcode: "",
  category: "",
  manufacturer: "",
  purchasePrice: "",
  sellingPrice: "",
  stripSellingPrice: "",
  pillSellingPrice: "",
  quantity: 1,
  minStock: 5,
  stripsPerBox: 1,
  pillsPerStrip: 1,
  expiryDate: "",
  batchNumber: ""
};

const emptyUserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "PHARMACIST",
  phone: "",
  alternatePhone: "",
  telephone: "",
  jobTitle: "",
  department: "",
  salary: "0",
  hireDate: "",
  nationalId: "",
  addressLine1: "",
  addressLine2: "",
  district: "",
  city: "",
  state: "",
  country: "مصر",
  postalCode: "",
  active: true,
  customFields: {}
};

const emptySupplierForm = {
  contactRole: "SUPPLIER",
  supplierType: "BUSINESS",
  businessName: "",
  name: "",
  familyName: "",
  middleName: "",
  title: "",
  phone: "",
  alternatePhone: "",
  telephone: "",
  email: "",
  taxNumber: "",
  openingBalance: "0",
  customerOpeningBalance: "0",
  creditLimit: "0",
  paymentTermValue: "",
  paymentTermUnit: "DAYS",
  contactCode: "",
  addressLine1: "",
  addressLine2: "",
  district: "",
  city: "",
  state: "",
  country: "مصر",
  postalCode: "",
  shippingAddress: "",
  customFields: {}
};

const emptyCustomerForm = {
  contactRole: "CUSTOMER",
  customerType: "PERSON",
  businessName: "",
  name: "",
  familyName: "",
  middleName: "",
  title: "",
  phone: "",
  alternatePhone: "",
  telephone: "",
  email: "",
  taxNumber: "",
  openingBalance: "0",
  supplierOpeningBalance: "0",
  creditLimit: "0",
  paymentTermValue: "",
  paymentTermUnit: "DAYS",
  contactCode: "",
  addressLine1: "",
  addressLine2: "",
  district: "",
  city: "",
  state: "",
  country: "مصر",
  postalCode: "",
  shippingAddress: "",
  customFields: {}
};

const APP_PAGE_KEYS = [
  "home",
  "dashboard",
  "settings",
  "medicines",
  "selling-price-group",
  "update-product-price",
  "stock-adjustments",
  "labels-show",
  "sales",
  "sales-add",
  "sales-list",
  "sales-register",
  "sales-drafts",
  "sales-pricing",
  "sales-returns",
  "sales-shipping",
  "sales-promotions",
  "sales-import",
  "sales-detailed-report",
  "cashier-shifts",
  "purchases",
  "purchases-add",
  "purchases-list",
  "purchases-return",
  "purchases-report",
  "expenses-list",
  "expenses-add",
  "expenses-categories",
  "expenses-report",
  "inventory",
  "inventory-low-stock",
  "inventory-expiring",
  "inventory-expired",
  "inventory-stale",
  "suppliers",
  "contacts-suppliers",
  "contacts-customers",
  "customer-accounts",
  "contacts-users",
  "contacts-agents",
  "contacts-roles",
  "contacts-groups",
  "contacts-report",
  "contacts-register-report",
  "contacts-sales-agent-report",
  "contacts-import",
  "accounting-accounts",
  "accounting-profit-loss",
  "accounting-trading",
  "accounting-trial-balance",
  "accounting-cash-flow",
  "accounting-balance-sheet",
  "accounting-movements"
];

const CONTACTS_PAGE_KEYS = [
  "contacts-suppliers",
  "contacts-customers",
  "customer-accounts",
  "contacts-users",
  "contacts-agents",
  "contacts-roles",
  "contacts-groups",
  "contacts-report",
  "contacts-register-report",
  "contacts-sales-agent-report",
  "contacts-import"
];

const SALES_PAGE_KEYS = [
  "sales",
  "sales-add",
  "sales-list",
  "sales-register",
  "sales-drafts",
  "sales-pricing",
  "sales-returns",
  "sales-shipping",
  "sales-promotions",
  "sales-import",
  "sales-detailed-report",
  "cashier-shifts"
];

const PURCHASE_PAGE_KEYS = [
  "purchases",
  "purchases-add",
  "purchases-list",
  "purchases-return",
  "purchases-report",
  "expenses-list",
  "expenses-add",
  "expenses-categories",
  "expenses-report"
];

function getErrorMessage(error, fallback) {
  const message = error.response?.data?.message || fallback;
  return translateText(message, getActiveLocale());
}

function getActiveLocale() {
  if (typeof document === "undefined") return "en";
  return document.documentElement.lang?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function formatCurrency(value) {
  const locale = getActiveLocale() === "ar" ? "ar-EG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const locale = getActiveLocale() === "ar" ? "ar-EG" : "en-US";

  const rawValue = String(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);

  if (isDateOnly) {
    return date.toLocaleDateString(locale);
  }

  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDateInput(value) {
  const date = value ? new Date(value) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roleLabel(role) {
  return translateText(String(role || "").replace("_", " "), getActiveLocale());
}

function SectionIcon({ name }) {
  const commonProps = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="11" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="17" width="7" height="4" rx="2" />
        </svg>
      );
    case "medicines":
      return (
        <svg {...commonProps}>
          <path d="M8 4.5a3.5 3.5 0 0 1 5 0l6.5 6.5a3.5 3.5 0 0 1-5 5L8 9.5a3.5 3.5 0 0 1 0-5Z" />
          <path d="M9 8.5 15.5 15" />
          <path d="M4.5 19.5 9 15" />
        </svg>
      );
    case "sales":
      return (
        <svg {...commonProps}>
          <path d="M6 7h12" />
          <path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7" />
          <path d="M5 7h14l-1.1 10.2A2 2 0 0 1 15.9 19H8.1a2 2 0 0 1-1.99-1.8Z" />
          <path d="M10 11h4" />
          <path d="M12 9v4" />
        </svg>
      );
    case "purchases":
      return (
        <svg {...commonProps}>
          <path d="M7 7h10" />
          <path d="M7 12h10" />
          <path d="M7 17h6" />
          <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-6 0V6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...commonProps}>
          <path d="M4 8.5 12 4l8 4.5-8 4.5Z" />
          <path d="M4 15.5 12 20l8-4.5" />
          <path d="M4 8.5v7l8 4.5v-7.5" />
          <path d="M20 8.5v7" />
        </svg>
      );
    case "suppliers":
      return (
        <svg {...commonProps}>
          <path d="M4 20v-6.5A1.5 1.5 0 0 1 5.5 12H10v8" />
          <path d="M10 20V6.5A1.5 1.5 0 0 1 11.5 5h7A1.5 1.5 0 0 1 20 6.5V20" />
          <path d="M7 15h.01" />
          <path d="M14 9h2" />
          <path d="M14 13h2" />
          <path d="M14 17h2" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg className="brand-mark-svg" viewBox="0 0 96 96" role="presentation">
        <defs>
          <linearGradient id="brand-shield-gold" x1="18" y1="8" x2="79" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFE59A" />
            <stop offset="0.45" stopColor="#D7A62B" />
            <stop offset="1" stopColor="#8B5A08" />
          </linearGradient>
          <linearGradient id="brand-shield-blue" x1="30" y1="18" x2="68" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0C6281" />
            <stop offset="0.55" stopColor="#063D68" />
            <stop offset="1" stopColor="#042747" />
          </linearGradient>
          <linearGradient id="brand-capsule-green" x1="45" y1="30" x2="69" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#37D6A0" />
            <stop offset="1" stopColor="#08765F" />
          </linearGradient>
        </defs>
        <path className="brand-mark-shadow" d="M48 4 83 17v25c0 24-14 41-35 51C27 83 13 66 13 42V17L48 4Z" />
        <path fill="url(#brand-shield-gold)" d="M48 3 84 16v26c0 25-15 43-36 53C26 85 12 67 12 42V16L48 3Z" />
        <path fill="url(#brand-shield-blue)" d="M48 10 77 21v21c0 20-11 34-29 44-18-10-29-24-29-44V21L48 10Z" />
        <path className="brand-mark-highlight" d="M48 14 73 23v18c0 17-9 29-25 38-15-9-24-21-24-38V23L48 14Z" />
        <g className="brand-capsule" transform="rotate(-34 48 45)">
          <rect x="23" y="34" width="50" height="22" rx="11" fill="#F8FBF6" />
          <path d="M48 34h14a11 11 0 0 1 0 22H48V34Z" fill="url(#brand-capsule-green)" />
          <path d="M48 34v22" stroke="#D5A62E" strokeWidth="2.4" />
          <path d="M29 39.5c3-3 7-3.5 11-2" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
        </g>
        <path className="brand-leaf brand-leaf-left" d="M47 70c-10 1-17-4-19-13 10-1 17 3 19 13Z" />
        <path className="brand-leaf brand-leaf-right" d="M49 70c10 1 17-4 19-13-10-1-17 3-19 13Z" />
        <path d="M48 69v10" stroke="#E5BD55" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function BrandLockup({ compact = false }) {
  return (
    <div className={compact ? "brand-lockup compact" : "brand-lockup"}>
      <BrandMark />
      <div>
        <strong>PHARMACY</strong>
        <span>صيدلية</span>
      </div>
    </div>
  );
}

function getMedicineUnitPrice(medicine, unit) {
  const summary = medicine.packagingSummary || {};
  if (unit !== "BOX" && summary.mode !== "FRACTIONAL") {
    return 0;
  }
  if (unit === "PILL") {
    return Number(
      medicine.pillSellingPrice
      ?? ((medicine.stripSellingPrice ?? (Number(medicine.sellingPrice || 0) / Number(medicine.stripsPerBox || 1))) / Number(medicine.pillsPerStrip || 1))
    );
  }
  if (unit === "STRIP") {
    return Number(medicine.stripSellingPrice ?? (Number(medicine.sellingPrice || 0) / Number(medicine.stripsPerBox || 1)));
  }
  return Number(medicine.sellingPrice || 0);
}

function getMedicineUnitAvailability(medicine, unit) {
  const summary = medicine.packagingSummary || {};
  if (unit !== "BOX" && summary.mode !== "FRACTIONAL") return 0;
  if (unit === "PILL") return Number(summary.availablePills ?? medicine.quantity ?? 0);
  if (unit === "STRIP") return Number(summary.availableStrips ?? medicine.quantity ?? 0);
  return Number(summary.availableBoxes ?? medicine.quantity ?? 0);
}

function getMedicineInputQuantity(medicine) {
  const summary = medicine.packagingSummary || {};
  return summary.mode === "FRACTIONAL"
    ? Number(summary.availableBoxes ?? 0)
    : Number(medicine.quantity ?? 0);
}

function getMedicineDisplayName(medicine) {
  const locale = getActiveLocale();
  return locale === "ar"
    ? (medicine.nameAr || medicine.name || medicine.nameEn)
    : (medicine.nameEn || medicine.name || medicine.nameAr);
}

function getAvailableSaleUnits(medicine) {
  if (medicine?.itemType === "SINGLE") return ["BOX"];
  if (medicine?.itemType === "PACK_PIECE") return ["PILL", "BOX"];
  return ["BOX", "STRIP", "PILL"];
}

function getMedicineAvailabilityLabel(medicine, requestedUnit = "") {
  const units = getAvailableSaleUnits(medicine);
  const unit = requestedUnit || units.find((candidate) => getMedicineUnitAvailability(medicine, candidate) > 0) || units[0] || "BOX";
  return `${getMedicineUnitAvailability(medicine, unit)} ${getUnitLabel(unit, medicine)}`;
}

function getUnitLabel(unit, medicine = null) {
  const locale = getActiveLocale();
  const normalizedUnit = String(unit || "BOX").toUpperCase();
  if (medicine?.itemType === "SINGLE" && medicine?.stockUnit) {
    return medicine.stockUnit;
  }
  if (medicine?.itemType === "PACK_PIECE" || medicine?.itemType === "SINGLE") {
    if (normalizedUnit === "PILL") {
      return locale === "ar" ? (medicine.pieceNameAr || "قطعة") : (medicine.pieceNameEn || "piece");
    }
    return locale === "ar" ? (medicine.packageNameAr || "عبوة") : (medicine.packageNameEn || "package");
  }
  if (locale === "ar") {
    if (normalizedUnit === "PILL") return "حبة";
    if (normalizedUnit === "STRIP") return "شريط";
    return "علبة";
  }
  if (normalizedUnit === "PILL") return "pill";
  if (normalizedUnit === "STRIP") return "strip";
  return "box";
}

function getPackagingLabel(medicine) {
  const locale = getActiveLocale();
  if (medicine.itemType === "PACK_PIECE") {
    const summary = medicine.packagingSummary || {};
    const packageName = getUnitLabel("BOX", medicine);
    const pieceName = getUnitLabel("PILL", medicine);
    return `${summary.availableBoxes ?? 0} ${packageName}، ${summary.availablePills ?? 0} ${pieceName}`;
  }
  if (medicine.itemType === "SINGLE") {
    return `${medicine.quantity || 0} ${getUnitLabel("BOX", medicine)}`;
  }
  return medicine.packagingSummary?.label || (locale === "ar" ? `${medicine.quantity || 0} وحدة` : `${medicine.quantity || 0} units`);
}

function getRetailSetupNote(medicine) {
  const locale = getActiveLocale();
  const summary = medicine.packagingSummary || {};
  if (summary.mode === "FRACTIONAL") {
    if (medicine.itemType === "PACK_PIECE") {
      return locale === "ar"
        ? `فاضل من ${getMedicineDisplayName(medicine)}: ${boxes} ${getUnitLabel("BOX", medicine)}، ${remainingPills} ${getUnitLabel("PILL", medicine)}`
        : `${getMedicineDisplayName(medicine)} remaining: ${boxes} ${getUnitLabel("BOX", medicine)}, ${remainingPills} ${getUnitLabel("PILL", medicine)}`;
    }
    return locale === "ar"
      ? `المتاح ${summary.availableBoxes ?? 0} علبة، ${summary.availableStrips ?? 0} شريط، ${summary.availablePills ?? 0} حبة`
      : `${summary.availableBoxes ?? 0} box, ${summary.availableStrips ?? 0} strip, ${summary.availablePills ?? 0} pill available`;
  }
  return locale === "ar"
    ? "البيع بالتجزئة غير مفعّل لهذا الدواء بعد. حدّد الشرائط لكل علبة والحبات لكل شريط أولًا."
    : "Retail sale is not configured yet for this medicine. Set strips/box and pills/strip first.";
}

function getStockRemainderText(medicine, saleUnit = "BOX", soldQuantity = 0) {
  const locale = getActiveLocale();
  const summary = medicine.packagingSummary || {};
  const sold = Number(soldQuantity || 0);

  if (summary.mode === "FRACTIONAL") {
    const perStrip = Math.max(1, Number(medicine.pillsPerStrip || summary.pillsPerStrip || 1));
    const perBox = Math.max(1, Number(medicine.stripsPerBox || summary.stripsPerBox || 1) * perStrip);
    const currentPills = Number(summary.availablePills ?? medicine.quantity ?? 0);
    const soldPills = saleUnit === "BOX" ? sold * perBox : saleUnit === "STRIP" ? sold * perStrip : sold;
    const remainingPills = Math.max(0, currentPills - soldPills);
    const boxes = Math.floor(remainingPills / perBox);
    const strips = Math.floor((remainingPills % perBox) / perStrip);
    const pills = remainingPills % perStrip;
    return locale === "ar"
      ? "فاضل من " + medicine.name + ": " + boxes + " علبة، " + strips + " شريط، " + pills + " قرص"
      : medicine.name + " remaining: " + boxes + " box, " + strips + " strip, " + pills + " pill";
  }

  const remaining = Math.max(0, Number(medicine.quantity || 0) - sold);
  return locale === "ar"
    ? "فاضل من " + medicine.name + ": " + remaining + " " + getUnitLabel("BOX", medicine)
    : medicine.name + " remaining: " + remaining + " " + getUnitLabel("BOX", medicine);
}

function CashierStockBadge({ remaining, compact = false }) {
  const safeRemaining = Math.max(0, Number(remaining || 0));
  const tone = safeRemaining === 0 ? "empty" : safeRemaining <= 5 ? "low" : "available";
  const label = safeRemaining === 0 ? "نفد المخزون" : safeRemaining <= 5 ? "قارب على النفاد" : "متاح";
  return (
    <span className={`cashier-stock-badge ${tone}${compact ? " compact" : ""}`}>
      <span className="cashier-stock-count"><small>المتبقي</small><b>{safeRemaining}</b></span>
      <em>{label}</em>
    </span>
  );
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calculateUnitMetrics(cost, price) {
  const normalizedCost = Number(cost || 0);
  const normalizedPrice = Number(price || 0);
  const profit = roundMoney(normalizedPrice - normalizedCost);
  const marginPercent = normalizedCost > 0
    ? roundMoney((profit / normalizedCost) * 100)
    : 0;

  return {
    cost: roundMoney(normalizedCost),
    price: roundMoney(normalizedPrice),
    profit,
    marginPercent
  };
}

function buildPricingPreview(source = {}) {
  const purchasePrice = Number(source.purchasePrice || 0);
  const sellingPrice = Number(source.sellingPrice || 0);
  const stripsPerBox = Math.max(1, Number(source.stripsPerBox || 1));
  const pillsPerStrip = Math.max(1, Number(source.pillsPerStrip || 1));
  const pillsPerBox = stripsPerBox * pillsPerStrip;
  const stripCost = purchasePrice / stripsPerBox;
  const pillCost = purchasePrice / pillsPerBox;
  const stripPrice = source.stripSellingPrice !== "" && source.stripSellingPrice !== null && source.stripSellingPrice !== undefined
    ? Number(source.stripSellingPrice)
    : sellingPrice / stripsPerBox;
  const pillPrice = source.pillSellingPrice !== "" && source.pillSellingPrice !== null && source.pillSellingPrice !== undefined
    ? Number(source.pillSellingPrice)
    : stripPrice / pillsPerStrip;

  return {
    packaging: {
      stripsPerBox,
      pillsPerStrip,
      pillsPerBox
    },
    box: calculateUnitMetrics(purchasePrice, sellingPrice),
    strip: calculateUnitMetrics(stripCost, stripPrice),
    pill: calculateUnitMetrics(pillCost, pillPrice)
  };
}

function LocaleSwitch({ locale, onToggle, className = "" }) {
  return (
    <button type="button" className={`locale-switch ${className}`.trim()} onClick={onToggle}>
      {locale === "ar" ? "English" : "عربي"}
    </button>
  );
}

function formatTopBarDate(locale, value = new Date(), includeTime = false) {
  if (includeTime) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function HomeGlyph({ symbol }) {
  return <span className="home-glyph" aria-hidden="true">{symbol}</span>;
}

const PRICE_GROUPS_STORAGE_KEY = "pharmacore-price-groups";

function MedicineToolHeader({ title, description, onNavigate }) {
  return <header className="medicine-tool-header"><div><span>الأصناف</span><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={() => onNavigate("medicines")}>الرجوع لقائمة الأصناف</button></header>;
}

function SellingPriceGroupsPage({ onNavigate }) {
  const [groups, setGroups] = useState(() => readLocalCollection(PRICE_GROUPS_STORAGE_KEY, []));
  const [form, setForm] = useState({ name: "", discountPercent: "0", category: "الكل", active: true });
  const [feedback, setFeedback] = useState("");
  function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    const discountPercent = Math.min(100, Math.max(0, Number(form.discountPercent || 0)));
    if (!name) return;
    const next = [{ id: Date.now(), name, discountPercent, category: form.category.trim() || "الكل", active: form.active }, ...groups];
    setGroups(next); writeLocalCollection(PRICE_GROUPS_STORAGE_KEY, next);
    setForm({ name: "", discountPercent: "0", category: "الكل", active: true });
    setFeedback("تم حفظ مجموعة الأسعار، وستظهر للكاشير عند اختيار فئة السعر.");
  }
  function remove(id) { const next = groups.filter((item) => item.id !== id); setGroups(next); writeLocalCollection(PRICE_GROUPS_STORAGE_KEY, next); }
  return <section className="medicine-tool-page" dir="rtl"><MedicineToolHeader title="مجموعات الأسعار" description="أنشئ شرائح خصم تُستخدم لتسعير العملاء والعروض." onNavigate={onNavigate} />
    {feedback ? <div className="notice success">{feedback}</div> : null}
    <div className="medicine-tool-split"><form className="section-card medicine-tool-form" onSubmit={save}><h3>إضافة مجموعة</h3><label><span>اسم المجموعة</span><input required value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="مثال: عملاء الجملة" /></label><label><span>نسبة الخصم %</span><input type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={(e) => setForm((v) => ({ ...v, discountPercent: e.target.value }))} /></label><label><span>التصنيف المستهدف</span><input value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))} placeholder="الكل أو اسم التصنيف" /></label><label className="medicine-tool-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm((v) => ({ ...v, active: e.target.checked }))} /><span>المجموعة نشطة</span></label><button type="submit" className="primary-button">حفظ المجموعة</button></form>
      <section className="section-card"><div className="medicine-tool-section-title"><h3>المجموعات المسجلة</h3><span>{groups.length} مجموعة</span></div><div className="medicine-tool-list">{groups.map((group) => <article key={group.id}><div><strong>{group.name}</strong><small>{group.category === "الكل" ? "كل الأصناف" : `تصنيف: ${group.category}`}</small></div><b>{group.discountPercent}% خصم</b><span className={group.active ? "directory-status" : "directory-status inactive"}>{group.active ? "نشطة" : "موقوفة"}</span><button type="button" className="ghost-danger" onClick={() => remove(group.id)}>حذف</button></article>)}{!groups.length ? <div className="empty-state">لا توجد مجموعات أسعار بعد.</div> : null}</div></section></div>
  </section>;
}

function UpdateProductPricePage({ onNavigate }) {
  const [medicines, setMedicines] = useState([]), [selected, setSelected] = useState([]), [search, setSearch] = useState(""), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [error, setError] = useState("");
  const [change, setChange] = useState({ target: "sellingPrice", mode: "percent", value: "" });
  async function load() { try { const response = await API.get("/medicines", { params: { paginate: false } }); setMedicines(response.data.data || []); } catch (err) { setError(getErrorMessage(err, "تعذر تحميل الأصناف")); } }
  useEffect(() => { load(); }, []);
  const visible = medicines.filter((m) => !search.trim() || `${m.name} ${m.barcode || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleRows = visible.slice(0, 250);
  async function applyUpdate(event) { event.preventDefault(); const amount = Number(change.value); if (!selected.length || !Number.isFinite(amount)) { setError("اختر صنفًا واحدًا على الأقل وأدخل قيمة صحيحة."); return; } setBusy(true); setError(""); try { const rows = medicines.filter((m) => selected.includes(m.id)); await Promise.all(rows.map((medicine) => { const current = Number(medicine[change.target] || 0); const nextValue = change.mode === "percent" ? Math.max(0, current * (1 + amount / 100)) : Math.max(0, amount); return API.put(`/medicines/${medicine.id}`, { ...medicine, [change.target]: Number(nextValue.toFixed(2)) }); })); setFeedback(`تم تحديث ${rows.length} صنف بنجاح.`); setSelected([]); await load(); } catch (err) { setError(getErrorMessage(err, "تعذر تحديث الأسعار")); } finally { setBusy(false); } }
  return <section className="medicine-tool-page" dir="rtl"><MedicineToolHeader title="تحديث أسعار الأصناف" description="عدّل سعر البيع أو الشراء لعدة أصناف دفعة واحدة." onNavigate={onNavigate} />{feedback ? <div className="notice success">{feedback}</div> : null}{error ? <div className="notice error">{error}</div> : null}<form className="section-card medicine-bulk-price-form" onSubmit={applyUpdate}><label><span>السعر المطلوب</span><select value={change.target} onChange={(e) => setChange((v) => ({ ...v, target: e.target.value }))}><option value="sellingPrice">سعر البيع</option><option value="purchasePrice">سعر الشراء</option></select></label><label><span>طريقة التحديث</span><select value={change.mode} onChange={(e) => setChange((v) => ({ ...v, mode: e.target.value }))}><option value="percent">نسبة زيادة/نقص</option><option value="fixed">قيمة ثابتة</option></select></label><label><span>{change.mode === "percent" ? "النسبة % (استخدم السالب للنقص)" : "السعر الجديد"}</span><input required type="number" step="0.01" value={change.value} onChange={(e) => setChange((v) => ({ ...v, value: e.target.value }))} /></label><button type="submit" className="primary-button" disabled={busy || !selected.length}>{busy ? "جارٍ التحديث..." : `تحديث المحدد (${selected.length})`}</button></form><section className="section-card"><div className="medicine-tool-table-head"><input data-unified-medicine-search="true" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /><button type="button" onClick={() => setSelected(visibleRows.map((m) => m.id))}>تحديد الظاهر</button><button type="button" onClick={() => setSelected([])}>إلغاء التحديد</button><small>عرض {visibleRows.length} من {visible.length} — استخدم البحث للوصول لأي صنف</small></div><div className="table-shell"><table><thead><tr><th>اختيار</th><th>الصنف</th><th>الباركود</th><th>سعر الشراء</th><th>سعر البيع</th></tr></thead><tbody>{visibleRows.map((m) => <tr key={m.id}><td><input type="checkbox" checked={selected.includes(m.id)} onChange={() => setSelected((rows) => rows.includes(m.id) ? rows.filter((id) => id !== m.id) : [...rows, m.id])} /></td><td><strong>{m.name}</strong></td><td>{m.barcode || "—"}</td><td>{formatCurrency(m.purchasePrice)}</td><td>{formatCurrency(m.sellingPrice)}</td></tr>)}</tbody></table></div></section></section>;
}

function DamagedStockPage({ onNavigate }) {
  const [medicines, setMedicines] = useState([]), [movements, setMovements] = useState([]), [form, setForm] = useState({ medicineId: "", quantity: "1", note: "" }), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(""), [error, setError] = useState("");
  async function load() { try { const [m, x] = await Promise.all([API.get("/medicines", { params: { paginate: false } }), API.get("/inventory/movements", { params: { type: "ADJUST_OUT", limit: 100 } })]); setMedicines(m.data.data || []); setMovements((x.data.data || []).filter((row) => String(row.reason || "").includes("تالف") || String(row.note || "").includes("تالف") || String(row.reason || "").includes("Damaged"))); } catch (err) { setError(getErrorMessage(err, "تعذر تحميل المخزون التالف")); } }
  useEffect(() => { load(); }, []);
  async function submit(event) { event.preventDefault(); const quantity = Math.max(1, Number(form.quantity || 0)); setBusy(true); setError(""); try { await API.post("/inventory/adjustments", { medicineId: Number(form.medicineId), quantityChange: -quantity, reason: "مخزون تالف", note: form.note || "تسجيل صنف تالف" }); setFeedback("تم خصم الكمية التالفة وتسجيل حركة المخزون."); setForm({ medicineId: "", quantity: "1", note: "" }); await load(); } catch (err) { setError(getErrorMessage(err, "تعذر تسجيل المخزون التالف")); } finally { setBusy(false); } }
  return <section className="medicine-tool-page" dir="rtl"><MedicineToolHeader title="المخزون التالف" description="سجّل الهالك مع خصمه من الرصيد وحفظ الحركة باسم المستخدم." onNavigate={onNavigate} />{feedback ? <div className="notice success">{feedback}</div> : null}{error ? <div className="notice error">{error}</div> : null}<form className="section-card damaged-stock-form" onSubmit={submit}><label><span>الصنف</span><select required value={form.medicineId} onChange={(e) => setForm((v) => ({ ...v, medicineId: e.target.value }))}><option value="">اختر الصنف...</option>{medicines.map((m) => <option key={m.id} value={m.id}>{m.name} — متاح {m.quantity}</option>)}</select></label><label><span>الكمية التالفة</span><input required type="number" min="1" value={form.quantity} onChange={(e) => setForm((v) => ({ ...v, quantity: e.target.value }))} /></label><label><span>السبب / الملاحظة</span><input value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} placeholder="مثال: عبوة مكسورة" /></label><button type="submit" className="primary-button" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل التالف"}</button></form><section className="section-card"><h3>سجل المخزون التالف</h3><div className="table-shell"><table><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>الملاحظة</th><th>المستخدم</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.medicine?.name}</td><td>{Math.abs(row.quantityChange)}</td><td>{row.note || row.reason}</td><td>{row.user?.name || "—"}</td></tr>)}{!movements.length ? <tr><td colSpan="5" className="empty-state">لا توجد حركات تالف مسجلة.</td></tr> : null}</tbody></table></div></section></section>;
}

function LabelsShowPage({ onNavigate }) {
  const [medicines, setMedicines] = useState([]), [selected, setSelected] = useState([]), [search, setSearch] = useState(""), [copies, setCopies] = useState(1), [error, setError] = useState("");
  useEffect(() => { API.get("/medicines", { params: { paginate: false } }).then((r) => setMedicines(r.data.data || [])).catch((err) => setError(getErrorMessage(err, "تعذر تحميل الأصناف"))); }, []);
  const visible = medicines.filter((m) => !search.trim() || `${m.name} ${m.barcode || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleRows = visible.slice(0, 250);
  const printRows = selected.flatMap((id) => { const item = medicines.find((m) => m.id === id); return item ? Array.from({ length: Math.max(1, copies) }, (_, index) => ({ ...item, printKey: `${id}-${index}` })) : []; });
  return <section className="medicine-tool-page labels-page" dir="rtl"><div className="no-print"><MedicineToolHeader title="طباعة ملصقات الأصناف" description="اختر الأصناف وعدد النسخ ثم اطبع ملصقات الاسم والسعر والباركود." onNavigate={onNavigate} />{error ? <div className="notice error">{error}</div> : null}<section className="section-card labels-controls"><input data-unified-medicine-search="true" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /><label><span>عدد النسخ</span><input type="number" min="1" max="20" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value || 1)))} /></label><button type="button" onClick={() => setSelected(visibleRows.map((m) => m.id))}>تحديد الظاهر</button><button type="button" onClick={() => setSelected([])}>إلغاء التحديد</button><button type="button" className="primary-button" disabled={!selected.length} onClick={() => window.print()}>طباعة {printRows.length} ملصق</button></section><small className="labels-result-note">عرض {visibleRows.length} من {visible.length} — استخدم البحث للوصول لأي صنف</small><section className="section-card labels-medicine-picker">{visibleRows.map((m) => <label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={() => setSelected((rows) => rows.includes(m.id) ? rows.filter((id) => id !== m.id) : [...rows, m.id])} /><span><strong>{m.name}</strong><small>{m.barcode || "بدون باركود"} · {formatCurrency(m.sellingPrice)}</small></span></label>)}</section></div><section className="labels-print-sheet">{printRows.map((m) => <article key={m.printKey} className="medicine-label"><strong>{m.name}</strong><span>{formatCurrency(m.sellingPrice)}</span><i aria-hidden="true" /><b>{m.barcode || `ITEM-${m.id}`}</b></article>)}{!printRows.length ? <div className="empty-state no-print">اختر الأصناف لمعاينة الملصقات.</div> : null}</section></section>;
}

function mapPurchaseItemToInvoiceDraft(item) {
  const medicine = item.medicine || {};
  return {
    ...emptyInvoiceItem,
    name: medicine.name || "",
    barcode: medicine.barcode || "",
    category: medicine.category || "",
    manufacturer: medicine.manufacturer || "",
    description: medicine.description || "",
    purchasePrice: item.purchasePrice ?? medicine.purchasePrice ?? "",
    sellingPrice: item.sellingPrice ?? medicine.sellingPrice ?? "",
    stripSellingPrice: medicine.stripSellingPrice ?? "",
    pillSellingPrice: medicine.pillSellingPrice ?? "",
    quantity: item.quantity ?? 1,
    minStock: medicine.minStock ?? 5,
    stripsPerBox: medicine.stripsPerBox ?? 1,
    pillsPerStrip: medicine.pillsPerStrip ?? 1,
    expiryDate: medicine.expiryDate ? medicine.expiryDate.slice(0, 10) : "",
    batchNumber: medicine.batchNumber || ""
  };
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

function parseSeparatedRows(text, delimiter) {
  const rows = [];
  let currentCell = "";
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!insideQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => String(cell).trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function parseImportRows(text) {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t"];
  const delimiter = candidates.reduce((best, current) => {
    const bestScore = firstLine.split(best).length;
    const currentScore = firstLine.split(current).length;
    return currentScore > bestScore ? current : best;
  }, ",");

  return parseSeparatedRows(text, delimiter);
}

function mapRowsToMedicineItems(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeImportHeader);
  const columnMap = {
    name: ["name", "medicinename", "productname", "الاسم", "اسمالصنف", "الصنف"],
    nameAr: ["namear", "arabicname", "الاسمالعربي", "اسمالصنفبالعربي"],
    nameEn: ["nameen", "englishname", "الاسمالانجليزي", "اسمالصنفبالانجليزي"],
    barcode: ["barcode", "sku", "skuleaveblanktoautogeneratesku", "الباركود", "skuالباركود"],
    category: ["category", "maincategory", "المجموعةالرئيسية", "الفئة", "التصنيف"],
    manufacturer: ["manufacturer", "brand", "الشركةالمصنعة", "الماركة"],
    stockUnit: ["unit", "stockunit", "الوحدة", "وحدةالصنف", "وحدةالمخزون"],
    description: ["description", "productdescription", "الوصف", "وصفالصنف"],
    purchasePrice: ["purchaseprice", "boxpurchaseprice", "purchasepriceincludingtax", "purchasepriceexcludingtax", "buyprice", "costprice", "سعرالشراء", "سعرشراءالوحدة", "سعرشراءالعبوة"],
    sellingPrice: ["sellingprice", "boxsellingprice", "saleprice", "retailprice", "سعرالبيع", "سعربيعالوحدة", "سعربيعالعبوة"],
    stripSellingPrice: ["stripsellingprice"],
    pillSellingPrice: ["pillsellingprice"],
    quantity: ["quantity", "stock", "qty", "openingstock", "baseunitsquantity", "currentwarehousestock", "warehousestock", "المخزون", "المخزونالحالي", "مخزونالمخزن", "الرصيدالافتتاحي"],
    minStock: ["minstock", "minimumstock", "alertquantity", "حدالتنبيه", "تنبيهالكمية"],
    stripsPerBox: ["stripsperbox", "boxestrips"],
    pillsPerStrip: ["pillsperstrip", "stripunits", "pillscountperstrip"],
    expiryDate: ["expirydate", "expirationdate", "expiredate", "تاريخالصلاحية"],
    batchNumber: ["batchnumber", "batch", "رقمالتشغيلة", "التشغيلة"]
  };

  return rows.slice(1).map((row, rowIndex) => {
    const item = {};

    Object.entries(columnMap).forEach(([field, aliases]) => {
      const columnIndex = headers.findIndex((header) => aliases.includes(header));
      if (columnIndex >= 0) {
        item[field] = row[columnIndex] ?? "";
      }
    });

    const importedUnit = String(item.stockUnit || "").trim();
    const normalizedUnitDigits = importedUnit.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const unitCount = Math.max(1, Number(normalizedUnitDigits.match(/\d+/)?.[0] || 1));
    if (importedUnit) {
      const explicitQuantity = item.quantity !== undefined && item.quantity !== null && String(item.quantity).trim() !== "";
      if (!explicitQuantity) item.quantity = unitCount;
      item.stockUnit = importedUnit.replace(/[\d٠-٩]+/g, "").trim() || importedUnit;
      item.itemType = "SINGLE";
    }

    item._sourceRow = rowIndex + 2;

    return item;
  }).filter((item) => item.name || item.barcode);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadRowsAsCsv(filename, headers, rows) {
  const csv = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(","))
  ].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

function escapeExcelXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadRowsAsExcel(filename, sheetName, headers, rows) {
  const safeSheetName = String(sheetName || "Data").replace(/[\\/?*:[\]]/g, " ").slice(0, 31) || "Data";
  const rowXml = [headers, ...rows].map((row, rowIndex) => `<Row>${row.map((cell) => `<Cell${rowIndex === 0 ? ' ss:StyleID="Header"' : ""}><Data ss:Type="String">${escapeExcelXml(cell)}</Data></Cell>`).join("")}</Row>`).join("");
  const workbook = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/></Style></Styles>',
    `<Worksheet ss:Name="${escapeExcelXml(safeSheetName)}"><Table>${rowXml}</Table></Worksheet>`,
    '</Workbook>'
  ].join("");
  downloadBlob(new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8;" }), filename.endsWith(".xls") ? filename : `${filename}.xls`);
}

const emptyTransactionFilters = Object.freeze({ fromDate: "", toDate: "", fromTime: "", toTime: "", minAmount: "", maxAmount: "", paymentMethod: "", party: "", customerGroup: "", branch: "", category: "", brand: "" });

function transactionRecordMatchesFilters(record, filters, dateKeys = [], amountKeys = []) {
  const rawDate = dateKeys.map((key) => record[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const recordDate = rawDate ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(rawDate)) ? `${rawDate}T00:00:00` : rawDate) : null;
  if ((filters.fromDate || filters.toDate || filters.fromTime || filters.toTime) && (!recordDate || Number.isNaN(recordDate.getTime()))) return false;
  if (filters.fromDate) {
    const from = new Date(`${filters.fromDate}T00:00:00`);
    if (recordDate < from) return false;
  }
  if (filters.toDate) {
    const to = new Date(`${filters.toDate}T23:59:59.999`);
    if (recordDate > to) return false;
  }
  if (filters.fromTime || filters.toTime) {
    const recordMinutes = recordDate.getHours() * 60 + recordDate.getMinutes();
    const toMinutes = (value) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
    if (filters.fromTime && recordMinutes < toMinutes(filters.fromTime)) return false;
    if (filters.toTime && recordMinutes > toMinutes(filters.toTime)) return false;
  }
  const rawAmount = amountKeys.map((key) => record[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const amount = Number(rawAmount || 0);
  if (filters.minAmount !== "" && amount < Number(filters.minAmount)) return false;
  if (filters.maxAmount !== "" && amount > Number(filters.maxAmount)) return false;
  if (filters.paymentMethod && String(record.paymentMethod || record.paymentStatus || "").toUpperCase() !== filters.paymentMethod.toUpperCase()) return false;
  if (filters.party && String(record.customerName || record.supplier || record.vendor || "") !== filters.party) return false;
  if (filters.customerGroup && String(record.customerGroup || "") !== filters.customerGroup) return false;
  if (filters.branch && String(record.branch || "") !== filters.branch) return false;
  if (filters.category && String(record.category || record.expenseCategory || "") !== filters.category) return false;
  if (filters.brand && String(record.manufacturer || record.brand || "") !== filters.brand) return false;
  return true;
}

function FilterHeading({ label = "التصفية" }) {
  return <span className="unified-filter-title">{label}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5.5l-4 2V13L3 5Z" /></svg></span>;
}

function TransactionFilterPanel({ filters, setFilters, showDate = false, showAmount = false, showPayment = false, paymentOptions = [], search = "", setSearch, partyOptions = [], customerGroupOptions = [], showCustomerGroup = false, branchOptions = [], categoryOptions = [], brandOptions = [], referenceLayout = false }) {
  const locale = getActiveLocale();
  const isArabic = locale === "ar";
  const activeCount = Object.values(filters).filter((value) => String(value || "").trim() !== "").length + (search.trim() ? 1 : 0);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const optionField = (key, label, options, always = false, placeholder = null, icon = null) => options.length || always ? <label><span>{label}</span><div className={icon ? "transaction-filter-select-shell with-icon" : "transaction-filter-select-shell"}><select value={filters[key]} onChange={(event) => update(key, event.target.value)}><option value="">{placeholder || (isArabic ? "الكل" : "All")}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>{icon ? <b aria-hidden="true">{icon === "person" ? <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2Z"/></svg> : <svg viewBox="0 0 24 24"><path d="M12 22s7-6.1 7-13a7 7 0 1 0-14 0c0 6.9 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>}</b> : null}</div></label> : null;
  if (!showDate && !showAmount && !showPayment && !setSearch && !partyOptions.length && !showCustomerGroup && !branchOptions.length && !categoryOptions.length && !brandOptions.length) return null;
  return (
    <details className="transaction-filter-panel" open>
      <summary><FilterHeading label={isArabic ? "التصفية" : "Filters"} />{activeCount ? <b>{activeCount}</b> : null}</summary>
      <div className="transaction-filter-grid">
        {setSearch ? <label className="transaction-filter-search"><span>{isArabic ? "بحث عن صنف" : "Search items"}</span><div><input data-unified-medicine-search="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isArabic ? MEDICINE_SEARCH_PLACEHOLDER_AR : MEDICINE_SEARCH_PLACEHOLDER_EN} /><b aria-hidden="true">⌕</b></div></label> : null}
        {optionField("party", referenceLayout && isArabic ? "زبون" : (isArabic ? "العميل / المورد" : "Customer / supplier"), partyOptions, referenceLayout, referenceLayout && isArabic ? "غير ذلك" : null, referenceLayout ? "person" : null)}
        {optionField("customerGroup", isArabic ? "اسم مجموعة العملاء" : "Customer group", customerGroupOptions, showCustomerGroup)}
        {optionField("branch", isArabic ? "الفرع" : "Branch", branchOptions, referenceLayout, referenceLayout && isArabic ? "يرجى الاختيار" : null, referenceLayout ? "pin" : null)}
        {optionField("category", isArabic ? "المجموعة الرئيسية" : "Main category", categoryOptions)}
        {optionField("brand", isArabic ? "الماركة" : "Brand", brandOptions, Boolean(setSearch))}
        {showDate ? <label className="transaction-filter-range transaction-filter-date-range"><span>{isArabic ? "نطاق التاريخ" : "Date range"}</span><div><input type="date" value={filters.fromDate} onChange={(event) => update("fromDate", event.target.value)} /><input type="date" value={filters.toDate} onChange={(event) => update("toDate", event.target.value)} /></div></label> : null}
        {showDate ? <label className="transaction-filter-range"><span>{isArabic ? "النطاق الزمني" : "Time range"}</span><div><input type="time" value={filters.fromTime} onChange={(event) => update("fromTime", event.target.value)} /><input type="time" value={filters.toTime} onChange={(event) => update("toTime", event.target.value)} /></div></label> : null}
        {showAmount ? <><label><span>{isArabic ? "أقل مبلغ" : "Minimum amount"}</span><input type="number" min="0" step="0.01" value={filters.minAmount} onChange={(event) => update("minAmount", event.target.value)} placeholder="0.00" /></label><label><span>{isArabic ? "أعلى مبلغ" : "Maximum amount"}</span><input type="number" min="0" step="0.01" value={filters.maxAmount} onChange={(event) => update("maxAmount", event.target.value)} placeholder="0.00" /></label></> : null}
        {showPayment ? <label><span>{isArabic ? "طريقة / حالة الدفع" : "Payment method / status"}</span><select value={filters.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}><option value="">{isArabic ? "الكل" : "All"}</option>{paymentOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
        {!referenceLayout ? <button type="button" className="transaction-filter-reset" disabled={!activeCount} onClick={() => { setFilters({ ...emptyTransactionFilters }); if (setSearch) setSearch(""); }}>{isArabic ? "مسح التصفية" : "Clear filters"}</button> : null}
      </div>
    </details>
  );
}

function parseSpreadsheetXmlRows(text) {
  const documentNode = new DOMParser().parseFromString(String(text || ""), "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("تعذر قراءة ملف Excel بصيغة XLS.");
  return Array.from(documentNode.getElementsByTagNameNS("*", "Row")).map((rowNode) => Array.from(rowNode.childNodes)
    .filter((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === "Cell")
    .map((cellNode) => Array.from(cellNode.getElementsByTagNameNS("*", "Data"))[0]?.textContent || ""));
}

async function readMedicineImportItems(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let rows;
  if (extension === "xlsx") {
    const workbook = await readXlsxFile(file);
    rows = Array.isArray(workbook?.[0]?.data) ? workbook[0].data : workbook;
  } else if (extension === "xls") {
    rows = parseSpreadsheetXmlRows(await file.text());
  } else {
    rows = parseImportRows(await file.text());
  }
  const items = mapRowsToMedicineItems(rows);
  if (!items.length) throw new Error("لم يتم العثور على صفوف أصناف صالحة في الملف.");
  const invalidRows = items.filter((item) => !String(item.name || "").trim() || item.purchasePrice === undefined || item.purchasePrice === "" || item.sellingPrice === undefined || item.sellingPrice === "");
  if (invalidRows.length) {
    const examples = invalidRows.slice(0, 8).map((item) => item._sourceRow).join("، ");
    throw new Error(`يوجد ${invalidRows.length} صف ناقص الاسم أو سعر الشراء أو سعر البيع. راجع الصفوف: ${examples}`);
  }
  return items;
}

async function uploadMedicineImportItems(items, onProgress = () => {}) {
  let createdCount = 0;
  let updatedCount = 0;
  const batchSize = 150;
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize).map(({ _sourceRow, ...item }) => item);
    onProgress(Math.min(offset + batch.length, items.length), items.length);
    let response;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await API.post("/medicines/import", { items: batch });
        break;
      } catch (batchError) {
        if (attempt === 3) throw batchError;
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 900));
      }
    }
    createdCount += Number(response.data.data.createdCount || 0);
    updatedCount += Number(response.data.data.updatedCount || 0);
  }
  return { createdCount, updatedCount, total: items.length };
}

function readLocalCollection(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function promptForFields(fields, initialValues = {}) {
  const result = {};
  for (const field of fields) {
    const answer = window.prompt(field.label, initialValues[field.key] ?? field.defaultValue ?? "");
    if (answer === null) return null;
    result[field.key] = answer;
  }
  return result;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("admin@pharmacy.com");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("admin123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectMode(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setResetCode("");
    setConfirmPassword("");
    if (nextMode === "register") {
      setUsername("");
      setEmail("");
      setPassword("");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const { data } = await API.post("/auth/forgot-password", { identifier });
        setNotice(data.message || "تم إرسال كود الاسترجاع إلى بريدك.");
        setMode("reset");
      } else if (mode === "reset") {
        const { data } = await API.post("/auth/reset-password", { identifier, code: resetCode, password, confirmPassword });
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setResetCode("");
        setNotice(data.message || "تم تغيير كلمة المرور. يمكنك الدخول الآن.");
      } else {
        const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
        const payload = mode === "register"
          ? { username, email, password, confirmPassword }
          : { identifier, password };
        const { data } = await API.post(endpoint, payload);
        localStorage.setItem("token", data.token);
        onLogin(data.user);
      }
    } catch (err) {
      const fallback = mode === "register" ? "تعذر إنشاء الحساب" : mode === "forgot" ? "تعذر إرسال كود الاسترجاع" : mode === "reset" ? "تعذر تغيير كلمة المرور" : "تعذر تسجيل الدخول";
      setError(getErrorMessage(err, fallback));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="auth-card" onSubmit={submit}>
        <BrandLockup />
        {mode === "login" || mode === "register" ? <div className="auth-mode-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => selectMode("login")}>تسجيل الدخول</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => selectMode("register")}>إنشاء حساب جديد</button>
        </div> : null}
        <h1>{mode === "register" ? "إنشاء حساب جديد" : mode === "forgot" ? "نسيت كلمة المرور" : mode === "reset" ? "إدخال كود الاسترجاع" : "تسجيل الدخول"}</h1>
        <p className="muted">{mode === "register" ? "اختَر بياناتك بنفسك، وستدخل على صيدلية جديدة وفارغة خاصة بك." : mode === "forgot" ? "اكتب الإيميل أو اسم المستخدم وسنرسل كودًا إلى إيميل الاسترجاع." : mode === "reset" ? "اكتب الكود الذي وصلك ثم اختَر كلمة مرور جديدة." : "ادخل بالإيميل أو اسم المستخدم وكلمة المرور."}</p>
        {mode === "register" ? <input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اسم المستخدم" autoComplete="username" /> : null}
        {mode === "register" ? <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="إيميل الاسترجاع (Gmail أو Yahoo أو غيره)" autoComplete="email" /> : null}
        {mode !== "register" ? <input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="الإيميل أو اسم المستخدم" autoComplete="username" /> : null}
        {mode === "reset" ? <input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ""))} placeholder="كود الاسترجاع المكوّن من 6 أرقام" autoComplete="one-time-code" /> : null}
        {mode !== "forgot" ? <>
        <input
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="كلمة المرور"
          minLength={mode === "register" ? 6 : undefined}
          autoComplete={mode === "register" || mode === "reset" ? "new-password" : "current-password"}
        />
        {mode === "register" || mode === "reset" ? <input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="تأكيد كلمة المرور الجديدة" minLength="6" autoComplete="new-password" /> : null}
        </> : null}
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "جارٍ التنفيذ..." : mode === "register" ? "إنشاء الحساب والدخول" : mode === "forgot" ? "إرسال كود الاسترجاع" : mode === "reset" ? "تغيير كلمة المرور" : "دخول"}
        </button>
        {mode === "login" ? <button type="button" className="auth-text-button" onClick={() => selectMode("forgot")}>نسيت كلمة المرور؟</button> : null}
        {mode === "forgot" || mode === "reset" ? <button type="button" className="auth-text-button" onClick={() => selectMode("login")}>الرجوع لتسجيل الدخول</button> : null}
        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        <div className="helper-box"><strong>{mode === "register" ? "بيانات مستقلة" : mode === "forgot" || mode === "reset" ? "استرجاع آمن" : "دخول مرن"}</strong><span>{mode === "register" ? "الحساب الجديد لا يرى أي أدوية أو مبيعات أو موظفين تابعين للحسابات القديمة." : mode === "forgot" || mode === "reset" ? "الكود صالح لمدة 10 دقائق ويُرسل فقط إلى البريد المسجل." : "يمكنك استخدام الإيميل أو اسم المستخدم."}</span></div>
      </form>
    </div>
  );
}

function buttonTooltipLabel(button, locale) {
  const ar = locale === "ar";
  const explicit = button.getAttribute("aria-label") || button.getAttribute("data-tooltip");
  if (explicit) return explicit;

  const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
  const symbolLabels = {
    "+": ar ? "إضافة" : "Add",
    "-": ar ? "تقليل" : "Decrease",
    "−": ar ? "تقليل" : "Decrease",
    "×": ar ? "إغلاق" : "Close",
    "✕": ar ? "إغلاق" : "Close",
    "⌕": ar ? "بحث" : "Search",
    "⌃": ar ? "طي القائمة" : "Collapse menu",
    "⌄": ar ? "فتح القائمة" : "Expand menu",
    "‹": ar ? "فتح" : "Open",
    "☰": ar ? "القائمة" : "Menu",
    "⋮": ar ? "المزيد" : "More options"
  };
  if (symbolLabels[text]) return symbolLabels[text];
  if (text) return text;

  const className = String(button.className || "").toLowerCase();
  const classLabels = [
    ["search", ar ? "بحث" : "Search"],
    ["close", ar ? "إغلاق" : "Close"],
    ["delete", ar ? "حذف" : "Delete"],
    ["remove", ar ? "إزالة" : "Remove"],
    ["edit", ar ? "تعديل" : "Edit"],
    ["print", ar ? "طباعة" : "Print"],
    ["refresh", ar ? "تحديث" : "Refresh"],
    ["menu", ar ? "القائمة" : "Menu"],
    ["toggle", ar ? "فتح أو غلق" : "Toggle"],
    ["back", ar ? "رجوع" : "Back"],
    ["next", ar ? "التالي" : "Next"],
    ["add", ar ? "إضافة" : "Add"],
    ["brand", ar ? "الصفحة الرئيسية" : "Home"]
  ];
  return classLabels.find(([key]) => className.includes(key))?.[1] || (ar ? "زر إجراء" : "Action button");
}

function applyButtonTooltips(root, locale) {
  const buttons = root.matches?.("button") ? [root] : Array.from(root.querySelectorAll?.("button") || []);
  buttons.forEach((button) => {
    const label = buttonTooltipLabel(button, locale);
    if (!label) return;
    if (!button.hasAttribute("aria-label") && !String(button.textContent || "").trim()) button.setAttribute("aria-label", label);
    if (!button.hasAttribute("title") || button.dataset.autoTooltip === "true") {
      button.title = label;
      button.dataset.autoTooltip = "true";
    }
  });
}

const SETTINGS_SECTIONS = [
  {
    key: "project",
    labelAr: "المشروع",
    labelEn: "Project",
    groups: [
      {
        fields: [
          { key: "projectName", type: "text", labelAr: "اسم المشروع*", labelEn: "Project name*", value: "ziad" },
          { key: "startDate", type: "date", labelAr: "تاريخ البدء:", labelEn: "Start date:", value: "1970-01-01" },
          { key: "defaultProfit", type: "number", labelAr: "نسبة الربح الافتراضي*:", labelEn: "Default profit margin*:", value: "25.00" },
          { key: "currency", type: "select", labelAr: "العملة الرئيسية:", labelEn: "Main currency:", value: "egp", options: [{ value: "egp", labelAr: "الجنيه المصري - Pounds(EGP)", labelEn: "Egyptian pound - EGP" }] },
          { key: "currencyPosition", type: "select", labelAr: "تحديد مكان رمز العملة:", labelEn: "Currency position:", value: "before", options: [{ value: "before", labelAr: "قبل السعر", labelEn: "Before price" }, { value: "after", labelAr: "بعد السعر", labelEn: "After price" }] },
          { key: "timezone", type: "select", labelAr: "المنطقة الزمنية:", labelEn: "Timezone:", value: "asia-riyadh", options: [{ value: "asia-riyadh", labelAr: "Asia/Riyadh", labelEn: "Asia/Riyadh" }] },
          { key: "inventoryMethod", type: "select", labelAr: "طريقة الجرد:", labelEn: "Inventory method:", value: "fifo", options: [{ value: "fifo", labelAr: "FIFO (أول دخول، أول خروج)", labelEn: "FIFO (First in, first out)" }] },
          { key: "fiscalYear", type: "select", labelAr: "تاريخ بداية السنة المالية:", labelEn: "Fiscal year starts:", value: "jan", options: [{ value: "jan", labelAr: "يناير", labelEn: "January" }] },
          { key: "logo", type: "text", labelAr: "تحميل الشعار:", labelEn: "Upload logo:", value: "" },
          { key: "expiryDays", type: "number", labelAr: "تغير أيام المعاملة*:", labelEn: "Expiry notification days*:", value: "30" },
          { key: "timeFormat", type: "select", labelAr: "تنسيق الوقت*:", labelEn: "Time format*:", value: "24", options: [{ value: "24", labelAr: "24 ساعة", labelEn: "24 hour" }, { value: "12", labelAr: "12 ساعة", labelEn: "12 hour" }] },
          { key: "dateFormat", type: "select", labelAr: "صيغة التاريخ*:", labelEn: "Date format*:", value: "mdy", options: [{ value: "mdy", labelAr: "mm/dd/yyyy", labelEn: "mm/dd/yyyy" }] },
          { key: "moneyPrecision", type: "select", labelAr: "دقة العملة*:", labelEn: "Money precision*:", value: "2", options: [{ value: "2", labelAr: "2", labelEn: "2" }] },
          { key: "qtyPrecision", type: "select", labelAr: "دقة الكمية*:", labelEn: "Quantity precision*:", value: "2", options: [{ value: "2", labelAr: "2", labelEn: "2" }] }
        ]
      }
    ]
  },
  {
    key: "tax",
    labelAr: "الضريبة",
    labelEn: "Tax",
    groups: [
      {
        fields: [
          { key: "taxName", type: "text", labelAr: "الاسم الضريبي:", labelEn: "Tax name:", value: "" },
          { key: "taxNumber", type: "text", labelAr: "رقم المشغل المرخص:", labelEn: "Licensed operator number:", value: "" },
          { key: "licensedName", type: "text", labelAr: "اسم المشغل المرخص:", labelEn: "Licensed operator name:", value: "" },
          { key: "taxId", type: "text", labelAr: "الرقم الضريبي:", labelEn: "Tax number:", value: "" },
          { key: "enableTaxLine", type: "checkbox", labelAr: "تفعيل الضريبة في السطر على الشراء والبيع", labelEn: "Enable row tax in purchase and sale", value: false }
        ]
      }
    ]
  },
  {
    key: "item",
    labelAr: "الصنف",
    labelEn: "Item",
    groups: [
      {
        fields: [
          { key: "expiryMode", type: "select", labelAr: "تفعيل انتهاء صلاحية الصنف:", labelEn: "Enable expiry date:", value: "add-date", options: [{ value: "add-date", labelAr: "أضف تاريخ انتهاء الصلاحية", labelEn: "Add expiry date" }] },
          { key: "storageCode", type: "text", labelAr: "اختصار الكود التخزيني:", labelEn: "Storage code prefix:", value: "" },
          { key: "enableSubCategories", type: "checkbox", labelAr: "تفعيل المجموعات الفرعية", labelEn: "Enable subcategories", value: false },
          { key: "enableUnits", type: "checkbox", labelAr: "تمكين الوحدات الفرعية", labelEn: "Enable sub-units", value: false },
          { key: "enableBrands", type: "checkbox", labelAr: "تفعيل ماركات الاصناف", labelEn: "Enable brands", value: false },
          { key: "defaultUnit", type: "select", labelAr: "الوحدة الافتراضية:", labelEn: "Default unit:", value: "count", options: [{ value: "count", labelAr: "عدد (وحدة)", labelEn: "Count (unit)" }] },
          { key: "enableTaxPricing", type: "checkbox", labelAr: "تفعيل الضريبة والتسعير", labelEn: "Enable tax and pricing", value: true },
          { key: "enableShelf", type: "checkbox", labelAr: "تمكين الرفوف", labelEn: "Enable shelves", value: false },
          { key: "enableLocation", type: "checkbox", labelAr: "تمكين المكان", labelEn: "Enable location", value: false },
          { key: "enableClass", type: "checkbox", labelAr: "تمكين الصنف", labelEn: "Enable class", value: false },
          { key: "itemImageRequired", type: "checkbox", labelAr: "هل صورة الصنف مطلوبة؟", labelEn: "Require item image?", value: false },
          { key: "enableWarranty", type: "checkbox", labelAr: "تفعيل الضمان", labelEn: "Enable warranty", value: false },
          { key: "taxOnAdd", type: "checkbox", labelAr: "تفعيل الضريبة عند الإضافة", labelEn: "Enable tax on add", value: false }
        ]
      }
    ]
  },
  {
    key: "vendorCustomer",
    labelAr: "مورد او عميل",
    labelEn: "Vendor or customer",
    groups: [
      {
        fields: [
          { key: "creditLimit", type: "number", labelAr: "حد الدين الافتراضي للزبائن:", labelEn: "Default customer credit limit:", value: "" }
        ]
      }
    ]
  },
  {
    key: "sale",
    labelAr: "البيع",
    labelEn: "Sales",
    groups: [
      {
        fields: [
          { key: "salesAddMode", type: "select", labelAr: "طريقة إضافة صنف المبيعات؟", labelEn: "Sales item add mode?", value: "increase", options: [{ value: "increase", labelAr: "زيادة كمية الصنف إذا كانت موجودة بالفعل", labelEn: "Increase qty if item already exists" }] },
          { key: "defaultSalesTax", type: "select", labelAr: "ضريبة المبيعات - الافتراضي؟", labelEn: "Default sales tax?", value: "none", options: [{ value: "none", labelAr: "غير ذلك", labelEn: "None" }] },
          { key: "defaultDiscount", type: "number", labelAr: "الخصم على البيع الافتراضي*:", labelEn: "Default sale discount*:", value: "0.00" },
          { key: "roundingMethod", type: "select", labelAr: "طريقة تقريب المبالغ:", labelEn: "Rounding method:", value: "none", options: [{ value: "none", labelAr: "غير ذلك", labelEn: "None" }] },
          { key: "allowOversell", type: "checkbox", labelAr: "السماح بالبيع الزائد", labelEn: "Allow overselling", value: true },
          { key: "minSalePrice", type: "checkbox", labelAr: "سعر البيع هو سعر البيع الأدنى", labelEn: "Selling price is minimum selling price", value: false },
          { key: "enableOrders", type: "checkbox", labelAr: "تمكين الطلبيات", labelEn: "Enable orders", value: false },
          { key: "showBillDesign", type: "checkbox", labelAr: "إظهار تصميم الفاتورة في فاتورة البيع", labelEn: "Show invoice design in sale invoice", value: false },
          { key: "paymentTerms", type: "checkbox", labelAr: "هل شروط الدفع مطلوبة؟", labelEn: "Require payment terms?", value: false },
          { key: "showPaymentPeriod", type: "checkbox", labelAr: "إظهار فترة الدفع في فاتورة البيع", labelEn: "Show payment period in sale invoice", value: false },
          { key: "showAttachment", type: "checkbox", labelAr: "إظهار إرفاق مستند في فاتورة البيع", labelEn: "Show attachment in sale invoice", value: false },
          { key: "showInvoiceNumber", type: "checkbox", labelAr: "إظهار رقم الفاتورة في فاتورة البيع", labelEn: "Show invoice number", value: false },
          { key: "salesAgentEnabled", type: "select", labelAr: "مندوب المبيعات:", labelEn: "Sales agent:", value: "off", options: [{ value: "off", labelAr: "إلغاء", labelEn: "Off" }] },
          { key: "commissionType", type: "select", labelAr: "نوع حساب العمولة:", labelEn: "Commission type:", value: "invoice", options: [{ value: "invoice", labelAr: "قيمة الفاتورة", labelEn: "Invoice value" }] },
          { key: "salesAgentOnSale", type: "checkbox", labelAr: "إضافة وكيل العمولة على البيع؟", labelEn: "Add commission agent on sale?", value: false }
        ]
      }
    ]
  },
  {
    key: "cashier",
    labelAr: "الكاشير",
    labelEn: "Cashier",
    groups: [
      {
        fields: [
          { key: "shortcutFastFinish", type: "text", labelAr: "استكمال سريع؟", labelEn: "Fast complete?", value: "shift+e" },
          { key: "shortcutDiscount", type: "text", labelAr: "تعديل الخصم:", labelEn: "Edit discount:", value: "shift+i" },
          { key: "shortcutPayAndFinish", type: "text", labelAr: "دفع واستكمال:", labelEn: "Pay and finish:", value: "shift+p" },
          { key: "shortcutTax", type: "text", labelAr: "تعديل الضريبة:", labelEn: "Edit tax:", value: "shift+t" },
          { key: "shortcutDraft", type: "text", labelAr: "مسودة فاتورة:", labelEn: "Draft invoice:", value: "shift+d" },
          { key: "shortcutAddPayment", type: "text", labelAr: "أضف صف دفع:", labelEn: "Add payment row:", value: "shift+r" },
          { key: "shortcutCancel", type: "text", labelAr: "إلغاء:", labelEn: "Cancel:", value: "shift+c" },
          { key: "shortcutConfirm", type: "text", labelAr: "تأكيد:", labelEn: "Confirm:", value: "shift+f" },
          { key: "shortcutGoQty", type: "text", labelAr: "الذهاب إلى كمية الصنف:", labelEn: "Go to item quantity:", value: "f2" },
          { key: "shortcutNewItem", type: "text", labelAr: "أضف صنفًا جديدًا:", labelEn: "Add new item:", value: "f4" },
          { key: "shortcutScale", type: "text", labelAr: "جهاز قياس الوزن:", labelEn: "Scale device:", value: "" }
        ]
      },
      {
        titleAr: "إعدادات نقطة البيع:",
        titleEn: "Point of sale settings:",
        fields: [
          { key: "hideCashPayment", type: "checkbox", labelAr: "إخفاء الدفع النقدي", labelEn: "Hide cash payment", value: false },
          { key: "hideDraft", type: "checkbox", labelAr: "إخفاء مسودة الفاتورة", labelEn: "Hide draft invoice", value: false },
          { key: "hideSplitPayment", type: "checkbox", labelAr: "إخفاء الدفع المتعدد", labelEn: "Hide split payment", value: false },
          { key: "hideDiscount", type: "checkbox", labelAr: "إخفاء الخصم", labelEn: "Hide discount", value: false },
          { key: "hideRecentTx", type: "checkbox", labelAr: "إخفاء المعاملات الأخيرة", labelEn: "Hide recent transactions", value: false },
          { key: "hideSuggestedItems", type: "checkbox", labelAr: "إخفاء مربع الأصناف المقترحة", labelEn: "Hide suggested items", value: false },
          { key: "hideSuspend", type: "checkbox", labelAr: "إخفاء تعليق الفاتورة", labelEn: "Hide suspend invoice", value: false },
          { key: "subTotalAdjust", type: "checkbox", labelAr: "تعديل الإجمالي الفرعي", labelEn: "Edit subtotal", value: false },
          { key: "hideTax", type: "checkbox", labelAr: "إخفاء الضريبة", labelEn: "Hide tax", value: false },
          { key: "enableStaffItems", type: "checkbox", labelAr: "تمكين موظفي الخدمة على صنف الفاتورة", labelEn: "Enable service staff on invoice item", value: false },
          { key: "showTransactionDate", type: "checkbox", labelAr: "تمكين تاريخ المعاملة على شاشة نقاط البيع", labelEn: "Show transaction date in POS", value: false },
          { key: "enableServiceStaff", type: "checkbox", labelAr: "تمكين موظفي الخدمة", labelEn: "Enable service staff", value: false },
          { key: "enableScale", type: "checkbox", labelAr: "تمكين مقياس الميزان", labelEn: "Enable scale", value: false },
          { key: "hideCreditSale", type: "checkbox", labelAr: "إخفاء البيع الآجل", labelEn: "Hide credit sale", value: false },
          { key: "showDesign", type: "checkbox", labelAr: "إظهار تصميم الفاتورة في فاتورة البيع", labelEn: "Show invoice design in POS", value: false },
          { key: "printOnSuspend", type: "checkbox", labelAr: "طباعة الفاتورة عند الإيقاف", labelEn: "Print on suspend", value: false },
          { key: "showSuspendedList", type: "checkbox", labelAr: "إظهار القائمة المنسدلة لتخطيط الفاتورة", labelEn: "Show suspended invoice list", value: false },
          { key: "showPriceEditor", type: "checkbox", labelAr: "عرض السعر على تلميح الصنف", labelEn: "Show price on item hover", value: false },
          { key: "supplierPayments", type: "checkbox", labelAr: "دفعات موردين", labelEn: "Supplier payments", value: false },
          { key: "customerPayments", type: "checkbox", labelAr: "دفعات زبائن", labelEn: "Customer payments", value: false },
          { key: "barcodeQtyDigits", type: "select", labelAr: "عدد أرقام الكمية:", labelEn: "Quantity digits:", value: "4", options: [{ value: "4", labelAr: "4", labelEn: "4" }] },
          { key: "barcodeDecimalDigits", type: "select", labelAr: "عدد أرقام الكسور في الكمية:", labelEn: "Quantity decimal digits:", value: "3", options: [{ value: "3", labelAr: "3", labelEn: "3" }] },
          { key: "barcodeItemDigits", type: "select", labelAr: "طول باركود الصنف:", labelEn: "Item barcode length:", value: "5", options: [{ value: "5", labelAr: "5", labelEn: "5" }] },
          { key: "barcodePrefix", type: "text", labelAr: "اختصار:", labelEn: "Prefix:", value: "" }
        ]
      }
    ]
  },
  {
    key: "purchases",
    labelAr: "المشتريات",
    labelEn: "Purchases",
    groups: [
      {
        fields: [
          { key: "editPurchaseStatus", type: "checkbox", labelAr: "تفعيل حالة الشراء", labelEn: "Enable purchase status", value: true },
          { key: "editPurchasePrice", type: "checkbox", labelAr: "تمكين تعديل سعر الصنف من شاشة الشراء", labelEn: "Allow editing item price from purchase screen", value: true },
          { key: "enablePurchaseOrder", type: "checkbox", labelAr: "تمكين أمر الشراء", labelEn: "Enable purchase order", value: false },
          { key: "enableWarehouseNumber", type: "checkbox", labelAr: "تمكين رقم المخزن", labelEn: "Enable warehouse number", value: false },
          { key: "showPurchasePaymentPeriod", type: "checkbox", labelAr: "إظهار فترة الدفع في فاتورة المشتريات", labelEn: "Show purchase payment period", value: false },
          { key: "enablePurchaseRequest", type: "checkbox", labelAr: "تمكين طلب الشراء", labelEn: "Enable purchase request", value: false }
        ]
      }
    ]
  },
  {
    key: "payment",
    labelAr: "دفع",
    labelEn: "Payment",
    groups: [
      {
        fields: [
          { key: "cashDenominations", type: "text", labelAr: "الفئات النقدية:", labelEn: "Cash denominations:", value: "" },
          { key: "cashOnScreen", type: "select", labelAr: "تمكين الفئات النقدية على:", labelEn: "Enable denominations on:", value: "pos", options: [{ value: "pos", labelAr: "شاشة نقاط البيع", labelEn: "POS screen" }] },
          { key: "paymentMethods", type: "tags", labelAr: "تمكين الفئات النقدية لطرق الدفع:", labelEn: "Payment methods:", value: ["نقدا", "بطاقة", "شيك بنكي", "تحويل بنكي"] },
          { key: "fastCount", type: "checkbox", labelAr: "فحص دقيق", labelEn: "Exact count", value: false },
          { key: "showVoucherAttachment", type: "checkbox", labelAr: "إظهار إرفاق المستند في سندات القبض والصرف", labelEn: "Show voucher attachment", value: false }
        ]
      }
    ]
  },
  {
    key: "stockAlert",
    labelAr: "تنبيه المخزون",
    labelEn: "Stock alert",
    groups: [
      {
        fields: [
          { key: "stockAlertDays", type: "number", labelAr: "إظهار تنبيه من المخزون*:", labelEn: "Show stock alert after*:", value: "30", suffixAr: "أيام", suffixEn: "days" }
        ]
      }
    ]
  },
  {
    key: "system",
    labelAr: "النظام",
    labelEn: "System",
    groups: [
      {
        fields: [
          { key: "showHelpText", type: "checkbox", labelAr: "عرض نص المساعدة", labelEn: "Show help text", value: true },
          { key: "tableRows", type: "select", labelAr: "عدد البيانات الافتراضية في كل جدول", labelEn: "Default rows per table", value: "25", options: [{ value: "25", labelAr: "25", labelEn: "25" }] },
          { key: "designColor", type: "select", labelAr: "لون التصميم", labelEn: "Theme color", value: "", options: [{ value: "", labelAr: "يرجى الاختيار", labelEn: "Please select" }] }
        ]
      }
    ]
  },
  { key: "shortcuts", labelAr: "الاختصارات", labelEn: "Shortcuts", groups: [{ fields: [{ key: "shortcutNote", type: "note", labelAr: "يمكنك إضافة اختصارات لوحة المفاتيح كما في الشاشة الأصلية.", labelEn: "You can configure keyboard shortcuts similar to the reference screen." }] }] },
  { key: "email", labelAr: "إعدادات الايميل", labelEn: "Email settings", groups: [{ fields: [{ key: "emailNote", type: "note", labelAr: "سيتم تجهيز إعدادات البريد هنا بنفس نمط الشاشة المرجعية.", labelEn: "Email settings will be added here in the same reference style." }] }] },
  { key: "sms", labelAr: "إعدادات sms", labelEn: "SMS settings", groups: [{ fields: [{ key: "smsNote", type: "note", labelAr: "سيتم تجهيز إعدادات الرسائل هنا.", labelEn: "SMS settings will be added here." }] }] },
  { key: "rewards", labelAr: "نقاط المكافآت", labelEn: "Reward points", groups: [{ fields: [{ key: "rewardNote", type: "note", labelAr: "مكان مخصص لإعدادات النقاط والمكافآت.", labelEn: "Reserved for points and rewards settings." }] }] },
  { key: "units", labelAr: "وحدات إضافية", labelEn: "Extra units", groups: [{ fields: [{ key: "unitsNote", type: "note", labelAr: "إعدادات الوحدات الإضافية سيتم ربطها بالأصناف لاحقًا.", labelEn: "Extra unit settings will be linked to items later." }] }] },
  { key: "labels", labelAr: "التسميات المخصصة", labelEn: "Custom labels", groups: [{ fields: [{ key: "labelsNote", type: "note", labelAr: "مكان مخصص لتغيير أسماء الحقول والعناوين.", labelEn: "Reserved for custom field and heading labels." }] }] }
];

const MONITORING_DETAIL_CONFIG = {
  "inventory-low-stock": {
    title: "نواقص المخزون والأصناف الحرجة",
    subtitle: "كل الأصناف التي وصل رصيدها إلى حد الأمان أو أقل.",
    icon: "⚠",
    rows: (report) => report?.lowStock || []
  },
  "inventory-expiring": {
    title: "أصناف قاربت على انتهاء الصلاحية",
    subtitle: "الأصناف التي ستنتهي خلال فترة التنبيه المحددة في الإعدادات.",
    icon: "⌛",
    rows: (report) => report?.expiry?.expiringSoon || []
  },
  "inventory-expired": {
    title: "الأدوية منتهية الصلاحية",
    subtitle: "الأصناف التي تجاوزت تاريخ انتهاء الصلاحية المسجل.",
    icon: "!",
    rows: (report) => report?.expiry?.expired || []
  },
  "inventory-stale": {
    title: "الأدوية الراكدة",
    subtitle: "الأدوية التي لم تُبع خلال مدة التنبيه المحددة.",
    icon: "◷",
    rows: (report) => report?.staleStock?.medicines || []
  }
};

function MonitoringDetailsPage({ kind, onNavigate }) {
  const config = MONITORING_DETAIL_CONFIG[kind] || MONITORING_DETAIL_CONFIG["inventory-low-stock"];
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);
  const pageSize = 25;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    API.get("/reports/overview")
      .then((response) => {
        if (active) setRows(config.rows(response.data.data) || []);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "تعذر تحميل تفاصيل المخزون"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);

  useEffect(() => { setSearch(""); setPage(1); }, [kind]);
  useEffect(() => { setPage(1); }, [search]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = rows.filter((row) => !normalizedSearch || [row.name, row.barcode, row.batchNumber, row.supplier?.name]
    .some((value) => String(value || "").toLowerCase().includes(normalizedSearch)));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const isLowStock = kind === "inventory-low-stock";
  const isStale = kind === "inventory-stale";

  const excelHeaders = ["اسم الصنف", "الباركود", "المجموعة الرئيسية", "الشركة المصنعة", "سعر الشراء", "سعر البيع", "المخزون", "حد التنبيه", "تاريخ الصلاحية", "رقم التشغيلة", "المورد", "نوع التقرير", "تفاصيل التقرير"];

  function reportDetail(row) {
    if (isLowStock) return `العجز: ${Math.max(0, Number(row.minStock || 0) - Number(row.quantity || 0))}`;
    if (isStale) return `${row.daysWithoutSale || 0} يوم بدون بيع`;
    return expiryStatus(row);
  }

  function exportExcel() {
    const exportRows = filteredRows.map((row) => [
      row.name || "",
      row.barcode || "",
      row.category || "",
      row.manufacturer || "",
      row.purchasePrice ?? "",
      row.sellingPrice ?? "",
      row.quantity ?? 0,
      row.minStock ?? 0,
      row.expiryDate ? formatDateInput(row.expiryDate) : "",
      row.batchNumber || "",
      row.supplier?.name || "",
      config.title,
      reportDetail(row)
    ]);
    downloadRowsAsExcel(`${kind}.xls`, config.title, excelHeaders, exportRows);
    setFeedback(`تم تنزيل ${filteredRows.length} صنف في ملف Excel قابل للتعديل والرفع مرة أخرى.`);
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("سيتم إنشاء الأصناف الجديدة وتحديث الأصناف الموجودة، بما فيها الكمية والأسعار والصلاحية. هل تريد المتابعة؟")) return;
    setImporting(true);
    setFeedback("");
    setError("");
    try {
      const items = await readMedicineImportItems(file);
      const result = await uploadMedicineImportItems(items, (completed, totalRows) => setFeedback(`جارٍ رفع الأصناف: ${completed} من ${totalRows}...`));
      const response = await API.get("/reports/overview");
      setRows(config.rows(response.data.data) || []);
      setPage(1);
      setFeedback(`تم رفع الملف: إنشاء ${result.createdCount} صنف وتحديث ${result.updatedCount} صنف.`);
    } catch (err) {
      setError(getErrorMessage(err, err.message || "تعذر رفع ملف Excel"));
    } finally {
      setImporting(false);
    }
  }

  function expiryStatus(row) {
    if (!row.expiryDate) return "غير مسجل";
    const days = Math.ceil((new Date(row.expiryDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
    if (days < 0) return `منتهي منذ ${Math.abs(days)} يوم`;
    if (days === 0) return "ينتهي اليوم";
    return `متبقي ${days} يوم`;
  }

  return (
    <section className={`monitoring-details-page ${kind}`} dir="rtl">
      <header className="monitoring-details-head">
        <div className="monitoring-details-title"><span>{config.icon}</span><div><p>تفاصيل لوحة المتابعة</p><h1>{config.title}</h1><small>{config.subtitle}</small></div></div>
        <div className="monitoring-details-actions"><button type="button" onClick={() => onNavigate("dashboard")}>الرجوع للوحة المتابعة</button><button type="button" className="monitoring-excel-download" onClick={exportExcel}>⇩ تنزيل Excel</button><button type="button" className="monitoring-excel-upload" disabled={importing} onClick={() => importInputRef.current?.click()}>{importing ? "جارٍ الرفع..." : "⇧ رفع Excel"}</button><button type="button" className="primary-button" onClick={() => onNavigate("medicines")}>فتح قائمة الأصناف</button><input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={importExcel} hidden /></div>
      </header>
      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <section className="monitoring-details-toolbar">
        <label><span>بحث في النتائج</span><input data-unified-medicine-search="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /></label>
        <article><small>إجمالي النتائج</small><strong>{loading ? "..." : filteredRows.length}</strong></article>
        <article><small>الصفحة الحالية</small><strong>{currentPage} / {pageCount}</strong></article>
      </section>
      <section className="monitoring-details-table-card">
        <div className="table-shell"><table><thead><tr><th>#</th><th>الصنف</th><th>الباركود</th>{isLowStock ? <><th>الرصيد</th><th>حد الأمان</th><th>العجز</th><th>سعر البيع</th></> : isStale ? <><th>الرصيد</th><th>أيام بدون بيع</th><th>آخر بيع</th><th>تاريخ الإضافة</th></> : <><th>الرصيد</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>التشغيلة</th><th>المورد</th></>}</tr></thead>
          <tbody>{visibleRows.map((row, index) => <tr key={row.id}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><strong>{row.name}</strong></td><td>{row.barcode || "—"}</td>{isLowStock ? <><td><span className={Number(row.quantity || 0) === 0 ? "monitoring-detail-status danger" : "monitoring-detail-status warning"}>{row.quantity || 0}</span></td><td>{row.minStock || 0}</td><td>{Math.max(0, Number(row.minStock || 0) - Number(row.quantity || 0))}</td><td>{formatCurrency(row.sellingPrice)}</td></> : isStale ? <><td>{row.quantity || 0}</td><td><span className="monitoring-detail-status warning">{row.daysWithoutSale || 0} يوم</span></td><td>{row.lastSoldAt ? formatDate(row.lastSoldAt) : "لم يُبع"}</td><td>{formatDate(row.createdAt)}</td></> : <><td>{row.quantity || 0}</td><td>{formatDate(row.expiryDate)}</td><td><span className={kind === "inventory-expired" ? "monitoring-detail-status danger" : "monitoring-detail-status warning"}>{expiryStatus(row)}</span></td><td>{row.batchNumber || "—"}</td><td>{row.supplier?.name || "—"}</td></>}</tr>)}{!loading && !visibleRows.length ? <tr><td colSpan="9" className="empty-state">لا توجد نتائج مطابقة.</td></tr> : null}{loading ? <tr><td colSpan="9" className="empty-state">جارٍ تحميل التفاصيل...</td></tr> : null}</tbody>
        </table></div>
        <footer className="monitoring-details-pagination"><span>عرض {visibleRows.length} من {filteredRows.length}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)}>الأولى</button><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>السابق</button><strong>{currentPage}</strong><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>التالي</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(pageCount)}>الأخيرة</button></div></footer>
      </section>
    </section>
  );
}

function FollowUpBoard({ locale, user, onNavigate }) {
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateRange, setDateRange] = useState({ from: formatDateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)), to: formatDateInput(new Date()) });
  const [report, setReport] = useState(null);
  const [yearlyReport, setYearlyReport] = useState(null);
  const [monitoringData, setMonitoringData] = useState({ customers: [], suppliers: [], sales: [], purchases: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staleReminderDismissed, setStaleReminderDismissed] = useState(false);
  const [hoveredChartPoint, setHoveredChartPoint] = useState(null);

  async function loadBoard(nextRange = dateRange) {
    setLoading(true);
    setError("");
    try {
      const yearStart = `${new Date(`${nextRange.to}T00:00:00`).getFullYear()}-01-01`;
      const [response, yearResponse, customersResponse, suppliersResponse, salesResponse, purchasesResponse] = await Promise.all([
        API.get("/reports/overview", { params: nextRange }),
        API.get("/reports/overview", { params: { from: yearStart, to: nextRange.to } }),
        API.get("/customers"), API.get("/suppliers"), API.get("/sales"), API.get("/purchases")
      ]);
      setReport(response.data.data);
      setYearlyReport(yearResponse.data.data);
      setMonitoringData({ customers: customersResponse.data.data || [], suppliers: suppliersResponse.data.data || [], sales: salesResponse.data.data || [], purchases: purchasesResponse.data.data || [] });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard(dateRange);
  }, []);

  const summary = report?.summary || {};
  const staleStock = report?.staleStock || { thresholdDays: 7, medicines: [] };
  const staleMedicines = staleStock.medicines || [];
  const staleReminderKey = `pharmacore-stale-reminder-${user.id}`;

  useEffect(() => {
    if (!staleMedicines.length) return;
    const lastShownAt = Number(localStorage.getItem(staleReminderKey) || 0);
    const reminderInterval = Number(staleStock.thresholdDays || 7) * 24 * 60 * 60 * 1000;
    setStaleReminderDismissed(Date.now() - lastShownAt < reminderInterval);
  }, [staleReminderKey, staleMedicines.length]);

  function dismissStaleReminder() {
    localStorage.setItem(staleReminderKey, String(Date.now()));
    setStaleReminderDismissed(true);
  }
  const metrics = locale === "ar"
    ? [
      { key: "sales-total", label: "إجمالي المبيعات", value: summary.totalRevenue || 0, icon: "🛒", tone: "#50b8ff", target: "sales-detailed-report" },
      { key: "sales-due", label: "مستحقات العملاء", value: summary.customerReceivables || 0, icon: "📄", tone: "#f1be4b", target: "customer-accounts" },
      { key: "net-income", label: "صافي الدخل", value: summary.estimatedProfit || 0, icon: "💵", tone: "#45c66a", target: "accounting-profit-loss" },
      { key: "return-sales", label: "إجمالي مرجع المبيعات", value: summary.totalRefunded || 0, icon: "↔", tone: "#f37b7b", target: "sales-returns" },
      { key: "expenses", label: "إجمالي المصروفات", value: summary.totalExpenses || 0, icon: "🧾", tone: "#fa6b58", target: "expenses-report" },
      { key: "purchase-returns", label: "إجمالي مرجع المشتريات", value: summary.totalPurchaseReturned || 0, icon: "↩", tone: "#f37b7b", target: "purchases-return" },
      { key: "purchase-due", label: "المشتريات المستحقة", value: summary.purchaseDue || 0, icon: "⚠", tone: "#f1be4b", target: "contacts-suppliers" },
      { key: "purchase-total", label: "إجمالي المشتريات", value: summary.totalPurchaseSpend || 0, icon: "🛍", tone: "#50b8ff", target: "purchases-report" }
    ]
    : [
      { key: "sales-total", label: "Sales total", value: summary.totalRevenue || 0, icon: "🛒", tone: "#50b8ff", target: "sales-detailed-report" },
      { key: "sales-due", label: "Customer receivables", value: summary.customerReceivables || 0, icon: "📄", tone: "#f1be4b", target: "customer-accounts" },
      { key: "net-income", label: "Net income", value: summary.estimatedProfit || 0, icon: "💵", tone: "#45c66a", target: "accounting-profit-loss" },
      { key: "return-sales", label: "Sales returns total", value: summary.totalRefunded || 0, icon: "↔", tone: "#f37b7b", target: "sales-returns" },
      { key: "expenses", label: "Total expenses", value: summary.totalExpenses || 0, icon: "🧾", tone: "#fa6b58", target: "expenses-report" },
      { key: "purchase-returns", label: "Purchase returns total", value: summary.totalPurchaseReturned || 0, icon: "↩", tone: "#f37b7b", target: "purchases-return" },
      { key: "purchase-due", label: "Purchases due", value: summary.purchaseDue || 0, icon: "⚠", tone: "#f1be4b", target: "contacts-suppliers" },
      { key: "purchase-total", label: "Purchases total", value: summary.totalPurchaseSpend || 0, icon: "🛍", tone: "#50b8ff", target: "purchases-report" }
    ];

  const chartSeries = useMemo(() => {
    const salesByDate = new Map((report?.dailySales || []).map((item) => [item.date, item]));
    const start = new Date(`${dateRange.from}T00:00:00`);
    const end = new Date(`${dateRange.to}T00:00:00`);
    const days = [];
    for (let cursor = new Date(start); cursor <= end && days.length < 60; cursor.setDate(cursor.getDate() + 1)) {
      const key = formatDateInput(cursor);
      const found = salesByDate.get(key) || {};
      days.push({ date: key, totalRevenue: Number(found.totalRevenue || 0), invoiceCount: Number(found.invoiceCount || 0) });
    }
    return days;
  }, [report?.dailySales, dateRange.from, dateRange.to]);
  const maxRevenue = Math.max(1, ...chartSeries.map((item) => item.totalRevenue));
  const chartCoordinates = chartSeries.map((item, index) => ({
    ...item,
    x: 90 + (index * (1220 / Math.max(1, chartSeries.length - 1))),
    y: 230 - (item.totalRevenue / maxRevenue) * 170
  }));
  const chartPoints = chartCoordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => ({ value: (maxRevenue / 4) * index, y: 230 - (170 / 4) * index }));
  const yearlyMonths = Array.from({ length: 12 }, (_, index) => {
    const year = new Date(`${dateRange.to}T00:00:00`).getFullYear();
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const found = (yearlyReport?.monthlySales || []).find((item) => item.month === key);
    return { key, label: new Date(year, index, 1).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { month: "short" }), value: Number(found?.totalRevenue || 0) };
  });
  const yearlyMax = Math.max(1, ...yearlyMonths.map((item) => item.value));
  const recentOperations = [
    ...monitoringData.sales.map((item) => ({ id: `S-${item.id}`, type: "بيع", number: item.invoiceNumber, party: item.customer?.name || item.supplier?.name || "نقدي", amount: item.finalAmount, createdAt: item.createdAt, status: item.status })),
    ...monitoringData.purchases.map((item) => ({ id: `P-${item.id}`, type: "شراء", number: item.invoiceNumber, party: item.supplier?.name || "بدون مورد", amount: item.totalAmount, createdAt: item.createdAt, status: item.paymentStatus }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  const drilldownProps = (target, className) => ({
    className: `${className} dashboard-drilldown-panel`,
    role: "link",
    tabIndex: 0,
    onClick: () => onNavigate(target),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onNavigate(target);
      }
    }
  });

  return (
    <section className="cash-followup-board">
      <div className="cash-followup-head">
        <button type="button" className="cash-followup-date-chip" onClick={() => setShowDateFilter((value) => !value)}>
          <span>{locale === "ar" ? "تصفية حسب التاريخ" : "Filter by date"}</span>
          <small>▾</small>
        </button>
        <h1>{locale === "ar" ? "أهلاً وسهلاً، " + user.name : "Welcome, " + user.name}</h1>
      </div>

      {showDateFilter ? (
        <div className="cash-followup-date-panel">
          <label><span>{locale === "ar" ? "من" : "From"}</span><input type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} /></label>
          <label><span>{locale === "ar" ? "إلى" : "To"}</span><input type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} /></label>
          <button type="button" className="primary-button" onClick={() => { setShowDateFilter(false); loadBoard(dateRange); }}>{locale === "ar" ? "تطبيق" : "Apply"}</button>
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      {!loading && staleMedicines.length > 0 && !staleReminderDismissed ? (
        <div className="stale-stock-reminder" role="alert">
          <div>
            <strong>{locale === "ar" ? `تنبيه: ${staleMedicines.length} دواء لم يُبع منذ ${staleStock.thresholdDays} يومًا أو أكثر` : `Alert: ${staleMedicines.length} medicines have not sold for ${staleStock.thresholdDays} days or more`}</strong>
            <span>{locale === "ar" ? `راجع الأدوية الراكدة أدناه. سيظهر التذكير بعد ${staleStock.thresholdDays} يومًا حسب إعدادك.` : `Review stale stock below. The reminder interval is ${staleStock.thresholdDays} days.`}</span>
          </div>
          <button type="button" onClick={dismissStaleReminder}>{locale === "ar" ? "حسنًا" : "Dismiss"}</button>
        </div>
      ) : null}

      <div className="cash-followup-metrics">
        {metrics.map((metric) => (
          <button key={metric.key} type="button" className="cash-followup-card dashboard-drilldown-card" onClick={() => onNavigate(metric.target)}>
            <span className="cash-followup-icon" style={{ "--metric-tone": metric.tone }}>{metric.icon}</span>
            <div>
              <p>{metric.label}</p>
              <strong>{loading ? "..." : formatCurrency(metric.value)}</strong>
              <small>{locale === "ar" ? "عرض التفاصيل ←" : "View details →"}</small>
            </div>
          </button>
        ))}
      </div>

      <OperationsOverview locale={locale} onNavigate={onNavigate} />

      <section className="monitoring-grid-two">
        <article {...drilldownProps("sales-detailed-report", "monitoring-panel annual-sales-panel")}><header><div><span>تحديث تلقائي</span><h2>{locale === "ar" ? "مبيعات السنة المالية الحالية (شهريًا)" : "Current fiscal year sales"}</h2></div><strong>{formatCurrency(yearlyReport?.summary?.totalRevenue || 0)}</strong></header><div className="annual-sales-bars">{yearlyMonths.map((month) => <div key={month.key} title={`${month.label}: ${formatCurrency(month.value)}`}><span style={{ height: `${Math.max(4, (month.value / yearlyMax) * 100)}%` }} /><small>{month.label}</small></div>)}</div></article>
        <article {...drilldownProps("sales-detailed-report", "monitoring-panel")}><header><div><span>{locale === "ar" ? "نطاق التقرير" : "Report range"}</span><h2>{locale === "ar" ? "ملخص المبيعات اليومية" : "Daily sales summary"}</h2></div><strong>{summary.salesCount || 0} فاتورة</strong></header><div className="monitoring-mini-list">{(report?.dailySales || []).slice(-8).reverse().map((row) => <div key={row.date}><span>{formatDate(row.date)}</span><b>{row.invoiceCount} فاتورة</b><strong>{formatCurrency(row.totalRevenue)}</strong></div>)}{!report?.dailySales?.length ? <div className="empty-state">لا توجد مبيعات في النطاق.</div> : null}</div></article>
      </section>

      <section {...drilldownProps("inventory-low-stock", "monitoring-panel monitoring-table-panel")}><header><div><span>⚠ تنبيه</span><h2>نواقص المخزون والأصناف الحرجة</h2></div><strong>{report?.lowStock?.length || 0} صنف</strong></header><div className="table-shell"><table><thead><tr><th>الصنف</th><th>الرصيد المتبقي</th><th>حد الأمان</th><th>سعر الشراء</th><th>سعر البيع</th></tr></thead><tbody>{(report?.lowStock || []).slice(0, 25).map((m) => <tr key={m.id}><td><strong>{m.name}</strong><small>{m.barcode || "بدون باركود"}</small></td><td className="ops-negative">{m.quantity}</td><td>{m.minStock}</td><td>{formatCurrency(m.purchasePrice)}</td><td>{formatCurrency(m.sellingPrice)}</td></tr>)}{!report?.lowStock?.length ? <tr><td colSpan="5" className="empty-state">لا توجد نواقص مخزون حاليًا.</td></tr> : null}</tbody></table></div></section>

      <section {...drilldownProps("inventory-expiring", "monitoring-panel monitoring-table-panel")}><header><div><span>⌛ متابعة الصلاحية</span><h2>أصناف قاربت على انتهاء الصلاحية (خلال {report?.expiry?.thresholdDays || 30} يومًا)</h2></div><strong>{report?.expiry?.expiringSoon?.length || 0} صنف</strong></header><div className="table-shell"><table><thead><tr><th>الصنف</th><th>الكمية الحالية</th><th>تاريخ الانتهاء</th><th>التشغيلة</th><th>المورد</th></tr></thead><tbody>{(report?.expiry?.expiringSoon || []).slice(0, 25).map((m) => <tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.quantity}</td><td>{formatDate(m.expiryDate)}</td><td>{m.batchNumber || "—"}</td><td>{m.supplier?.name || "—"}</td></tr>)}{!report?.expiry?.expiringSoon?.length ? <tr><td colSpan="5" className="empty-state">لا توجد أصناف قريبة الانتهاء.</td></tr> : null}</tbody></table></div></section>

      <section className="monitoring-grid-two dues-panels"><article {...drilldownProps("customer-accounts", "monitoring-panel")}><header><div><span>▣ حسابات العملاء</span><h2>مستحقات وتحصيلات العملاء</h2></div><strong>{formatCurrency(summary.customerReceivables || 0)}</strong></header><div className="monitoring-mini-list">{monitoringData.customers.filter((c) => Number(c.accountBalance || 0) !== 0).slice(0, 12).map((c) => <div key={c.id}><span>{c.name}</span><b>{c.contactRole === "BOTH" ? "عميل ومورد" : "عميل"}</b><strong>{formatCurrency(c.accountBalance)}</strong></div>)}{!monitoringData.customers.some((c) => Number(c.accountBalance || 0) !== 0) ? <div className="empty-state">لا توجد مستحقات عملاء.</div> : null}</div></article><article {...drilldownProps("contacts-suppliers", "monitoring-panel")}><header><div><span>▣ حسابات الموردين</span><h2>مستحقات وديون الموردين</h2></div><strong>{formatCurrency(summary.purchaseDue || 0)}</strong></header><div className="monitoring-mini-list">{monitoringData.suppliers.filter((s) => Number(s.stats?.totalDue || 0) !== 0).slice(0, 12).map((s) => <div key={s.id}><span>{s.name}</span><b>{s.contactRole === "BOTH" ? "عميل ومورد" : "مورد"}</b><strong>{formatCurrency(s.stats?.totalDue)}</strong></div>)}{!monitoringData.suppliers.some((s) => Number(s.stats?.totalDue || 0) !== 0) ? <div className="empty-state">لا توجد مستحقات موردين.</div> : null}</div></article></section>

      <section {...drilldownProps("sales-list", "monitoring-panel monitoring-table-panel")}><header><div><span>▤ آخر تحديثات النظام</span><h2>العمليات والطلبات الأخيرة</h2></div><strong>{recentOperations.length} عملية</strong></header><div className="table-shell"><table><thead><tr><th>العملية</th><th>رقم الفاتورة</th><th>العميل / المورد</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>{recentOperations.map((row) => <tr key={row.id}><td><span className={row.type === "بيع" ? "monitoring-operation sale" : "monitoring-operation purchase"}>{row.type}</span></td><td>{row.number}</td><td>{row.party}</td><td>{formatCurrency(row.amount)}</td><td>{row.status}</td><td>{formatDate(row.createdAt)}</td></tr>)}{!recentOperations.length ? <tr><td colSpan="6" className="empty-state">لا توجد عمليات مسجلة.</td></tr> : null}</tbody></table></div></section>

      <section {...drilldownProps("inventory-stale", "stale-stock-card")}>
        <div className="stale-stock-head">
          <div>
            <span>{staleStock.enabled === false ? (locale === "ar" ? "التنبيه متوقف" : "Alert disabled") : (locale === "ar" ? `تنبيه كل ${staleStock.thresholdDays} يومًا` : `Every ${staleStock.thresholdDays} days`)}</span>
            <h2>{locale === "ar" ? "الأدوية الراكدة" : "Stale medicines"}</h2>
          </div>
          <strong>{loading ? "..." : staleMedicines.length}</strong>
        </div>
        {staleMedicines.length ? (
          <div className="stale-stock-list">
            {staleMedicines.slice(0, 12).map((medicine) => (
              <article key={medicine.id}>
                <div><strong>{medicine.name}</strong><small>{medicine.barcode || (locale === "ar" ? "بدون باركود" : "No barcode")}</small></div>
                <span>{locale === "ar" ? `${medicine.daysWithoutSale} يوم بدون بيع` : `${medicine.daysWithoutSale} days without a sale`}</span>
                <small>{locale === "ar" ? `المخزون: ${medicine.quantity}` : `Stock: ${medicine.quantity}`}</small>
              </article>
            ))}
          </div>
        ) : !loading ? <p className="stale-stock-empty">{staleStock.enabled === false ? (locale === "ar" ? "التنبيه متوقف من الإعدادات ويمكن تشغيله في أي وقت." : "The alert is disabled in settings.") : (locale === "ar" ? `ممتاز، لا توجد أدوية راكدة لأكثر من ${staleStock.thresholdDays} يومًا.` : `Great, no medicine has been sitting for over ${staleStock.thresholdDays} days.`)}</p> : null}
      </section>

      <section className="expiry-dashboard-card">
        <div {...drilldownProps("inventory-expired", "expiry-dashboard-column expired")}><header><div><span>⚠</span><h2>{locale === "ar" ? "أدوية منتهية الصلاحية" : "Expired medicines"}</h2></div><strong>{report?.expiry?.expired?.length || 0}</strong></header><div>{(report?.expiry?.expired || []).slice(0, 8).map((medicine) => <article key={medicine.id}><div><strong>{medicine.name}</strong><small>{medicine.batchNumber || medicine.barcode || "—"}</small></div><span>{formatDate(medicine.expiryDate)}</span></article>)}{!report?.expiry?.expired?.length ? <p>{locale === "ar" ? "لا توجد أدوية منتهية حاليًا." : "No expired medicines."}</p> : null}</div></div>
        <div {...drilldownProps("inventory-expiring", "expiry-dashboard-column soon")}><header><div><span>⌛</span><h2>{locale === "ar" ? "قريبة انتهاء الصلاحية" : "Expiring soon"}</h2></div><strong>{report?.expiry?.expiringSoon?.length || 0}</strong></header><div>{(report?.expiry?.expiringSoon || []).slice(0, 8).map((medicine) => <article key={medicine.id}><div><strong>{medicine.name}</strong><small>{locale === "ar" ? `المخزون: ${medicine.quantity}` : `Stock: ${medicine.quantity}`}</small></div><span>{formatDate(medicine.expiryDate)}</span></article>)}{!report?.expiry?.expiringSoon?.length ? <p>{locale === "ar" ? "لا توجد أدوية قريبة الانتهاء." : "No medicines expiring soon."}</p> : null}</div></div>
      </section>

      <section {...drilldownProps("sales-detailed-report", "cash-followup-chart-card")}>
        <div className="cash-followup-chart-head">
          <h2>{locale === "ar" ? "المبيعات في آخر 30 يوماً" : "Sales in the last 30 days"}</h2>
          <span>{user.name} (BL0001) · {dateRange.from} - {dateRange.to}</span>
        </div>
        <div className="cash-followup-chart-legend"><span><i />{user.name} (BL0001)</span><b>{locale === "ar" ? "مرّر الماوس على أي نقطة لعرض التفاصيل" : "Hover a point for details"}</b></div>
        <svg className="cash-followup-chart" viewBox="0 0 1380 330" role="img" aria-label={locale === "ar" ? "مخطط المبيعات" : "Sales chart"} onMouseLeave={() => setHoveredChartPoint(null)}>
          <defs><linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#72b4ef" stopOpacity=".28"/><stop offset="100%" stopColor="#72b4ef" stopOpacity="0"/></linearGradient></defs>
          {yTicks.map((tick) => <g key={tick.y}><line x1="90" y1={tick.y} x2="1310" y2={tick.y} stroke="#dbe6f2" strokeDasharray="5 7"/><text x="78" y={tick.y + 5} textAnchor="end" className="cash-chart-axis-label">{Math.round(tick.value).toLocaleString("ar-EG")}</text></g>)}
          <text x="23" y="150" transform="rotate(-90 23 150)" className="cash-chart-axis-title">{locale === "ar" ? "إجمالي المبيعات (ج.م)" : "Sales total (EGP)"}</text>
          {chartPoints ? <polygon points={`90,230 ${chartPoints} 1310,230`} fill="url(#salesAreaGradient)" /> : null}
          {chartPoints ? <polyline points={chartPoints} fill="none" stroke="#69aeea" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {chartCoordinates.map((point, index) => <g key={point.date}><circle cx={point.x} cy={point.y} r="12" fill="transparent" onMouseEnter={() => setHoveredChartPoint(index)} /><circle cx={point.x} cy={point.y} r={hoveredChartPoint === index ? 7 : 4.5} fill={hoveredChartPoint === index ? "#276fb2" : "#72b4ef"} stroke="#fff" strokeWidth="2" />{index % Math.max(1, Math.ceil(chartCoordinates.length / 10)) === 0 || index === chartCoordinates.length - 1 ? <text x={point.x} y="270" textAnchor="end" transform={`rotate(-42 ${point.x} 270)`} className="cash-chart-date-label">{new Date(`${point.date}T00:00:00`).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" })}</text> : null}</g>)}
          {hoveredChartPoint !== null && chartCoordinates[hoveredChartPoint] ? (() => { const point = chartCoordinates[hoveredChartPoint]; const tooltipX = Math.min(1160, Math.max(105, point.x - 75)); const tooltipY = Math.max(8, point.y - 78); return <g className="cash-chart-tooltip"><line x1={point.x} y1={point.y + 8} x2={point.x} y2="230" stroke="#8bbce8" strokeDasharray="3 4"/><rect x={tooltipX} y={tooltipY} width="170" height="62" rx="10"/><text x={tooltipX + 85} y={tooltipY + 22} textAnchor="middle">{new Date(`${point.date}T00:00:00`).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "long" })}</text><text x={tooltipX + 85} y={tooltipY + 43} textAnchor="middle">{formatCurrency(point.totalRevenue)} · {point.invoiceCount} {locale === "ar" ? "فاتورة" : "invoice(s)"}</text></g>; })() : null}
        </svg>
        <div className="cash-chart-summary"><span>{locale === "ar" ? "من" : "From"} <strong>{dateRange.from}</strong></span><span>{locale === "ar" ? "إلى" : "To"} <strong>{dateRange.to}</strong></span><span>{locale === "ar" ? "إجمالي الفترة" : "Period total"} <strong>{formatCurrency(summary.totalRevenue || 0)}</strong></span><span>{locale === "ar" ? "عدد الفواتير" : "Invoices"} <strong>{summary.salesCount || 0}</strong></span></div>
      </section>
    </section>
  );
}

function SettingsPage() {
  const locale = getActiveLocale();
  const [activeSection, setActiveSection] = useState("project");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [alertSettings, setAlertSettings] = useState({ stagnantAlertEnabled: true, stagnantAlertDays: 7, expiryAlertDays: 30 });
  const [settingsValues, setSettingsValues] = useState(() => SETTINGS_SECTIONS.reduce((accumulator, section) => {
    section.groups.forEach((group) => {
      group.fields.forEach((field) => {
        accumulator[field.key] = field.value;
      });
    });
    return accumulator;
  }, {}));

  const visibleSections = SETTINGS_SECTIONS.filter((section) => {
    const sectionLabel = locale === "ar" ? section.labelAr : section.labelEn;
    return !query.trim() || sectionLabel.includes(query.trim());
  });

  const currentSection = visibleSections.find((section) => section.key === activeSection) || visibleSections[0] || SETTINGS_SECTIONS[0];

  useEffect(() => {
    if (currentSection && currentSection.key !== activeSection) {
      setActiveSection(currentSection.key);
    }
  }, [activeSection, currentSection]);

  useEffect(() => {
    const saved = readLocalCollection("pharmacore-settings", null);
    if (saved && typeof saved === "object") {
      setSettingsValues((current) => ({ ...current, ...saved }));
    }
  }, []);

  useEffect(() => {
    API.get("/settings")
      .then((response) => setAlertSettings(response.data.data))
      .catch((err) => setSettingsError(getErrorMessage(err, "تعذر تحميل إعدادات التنبيهات")));
  }, []);

  function updateValue(key, value) {
    setSettingsValues((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    writeLocalCollection("pharmacore-settings", settingsValues);
    setSettingsError("");
    try {
      const response = await API.put("/settings", alertSettings);
      setAlertSettings(response.data.data);
      setFeedback(locale === "ar" ? "تم حفظ إعدادات الموقع والتنبيهات بنجاح." : "Site and alert settings saved.");
    } catch (err) {
      setSettingsError(getErrorMessage(err, "تعذر حفظ إعدادات التنبيهات"));
    }
  }

  function renderField(field) {
    const value = settingsValues[field.key];
    const label = locale === "ar" ? field.labelAr : field.labelEn;

    if (field.type === "note") {
      return <div className="settings-note">{label}</div>;
    }

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="settings-check">
          <span>{label}</span>
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => updateValue(field.key, event.target.checked)} />
        </label>
      );
    }

    if (field.type === "tags") {
      return (
        <label key={field.key} className="settings-field settings-field--wide">
          <span>{label}</span>
          <div className="settings-tags">
            {(Array.isArray(value) ? value : []).map((tag) => <span key={tag} className="settings-tag">{tag}</span>)}
          </div>
        </label>
      );
    }

    const suffix = locale === "ar" ? field.suffixAr : field.suffixEn;

    return (
      <label key={field.key} className={`settings-field${field.type === "text" && String(value || "").length > 26 ? " settings-field--wide" : ""}`}>
        <span>{label}</span>
        <div className="settings-input-shell">
          {field.type === "select" ? (
            <select value={value ?? ""} onChange={(event) => updateValue(field.key, event.target.value)}>
              {(field.options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {locale === "ar" ? option.labelAr : option.labelEn}
                </option>
              ))}
            </select>
          ) : (
            <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={value ?? ""} onChange={(event) => updateValue(field.key, event.target.value)} />
          )}
          {suffix ? <small>{suffix}</small> : null}
        </div>
      </label>
    );
  }

  return (
    <section className="settings-page-shell">
      <div className="settings-header">
        <h2>{locale === "ar" ? "الإعدادات الرئيسية" : "Main settings"}</h2>
      </div>

      <div className="settings-search-row">
        <select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}>
          {SETTINGS_SECTIONS.map((section) => (
            <option key={section.key} value={section.key}>
              {locale === "ar" ? section.labelAr : section.labelEn}
            </option>
          ))}
        </select>
        <div className="settings-search-box">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === "ar" ? "بحث" : "Search"}
          />
          <span>⌕</span>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {settingsError ? <div className="notice error">{settingsError}</div> : null}

      <section className="settings-alert-card section-card" dir="rtl">
        <div><h3>تنبيهات المخزون والصلاحية</h3><p>تحكم في تشغيل تنبيه الأدوية الراكدة والفترة التي يعتمد عليها.</p></div>
        <label className="settings-check"><span>تشغيل تنبيه الأدوية الراكدة</span><input type="checkbox" checked={alertSettings.stagnantAlertEnabled} onChange={(event) => setAlertSettings((current) => ({ ...current, stagnantAlertEnabled: event.target.checked }))} /></label>
        <label className="settings-field"><span>التنبيه إذا لم يُبع الدواء لمدة</span><div className="settings-input-shell"><select value={alertSettings.stagnantAlertDays} onChange={(event) => setAlertSettings((current) => ({ ...current, stagnantAlertDays: Number(event.target.value) }))}><option value="7">أسبوع</option><option value="14">أسبوعان</option><option value="30">شهر</option><option value="60">شهران</option><option value="90">3 أشهر</option></select></div></label>
        <label className="settings-field"><span>إظهار قرب انتهاء الصلاحية قبل</span><div className="settings-input-shell"><select value={alertSettings.expiryAlertDays} onChange={(event) => setAlertSettings((current) => ({ ...current, expiryAlertDays: Number(event.target.value) }))}><option value="7">7 أيام</option><option value="14">14 يومًا</option><option value="30">30 يومًا</option><option value="60">60 يومًا</option><option value="90">90 يومًا</option></select></div></label>
      </section>

      <div className="settings-workspace section-card">
        <div className="settings-content">
          {currentSection?.groups.map((group, index) => (
            <section key={`${currentSection.key}-${index}`} className="settings-group">
              {group.titleAr || group.titleEn ? (
                <div className="settings-group-head">
                  <h3>{locale === "ar" ? group.titleAr : group.titleEn}</h3>
                </div>
              ) : null}
              <div className="settings-grid">
                {group.fields.map((field) => renderField(field))}
              </div>
            </section>
          ))}
          <div className="settings-footer">
            <button type="button" className="primary-button settings-save-button" onClick={saveSettings}>
              {locale === "ar" ? "تحديث الإعدادات" : "Update settings"}
            </button>
          </div>
        </div>

        <aside className="settings-side-nav">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={section.key === currentSection?.key ? "settings-side-item active" : "settings-side-item"}
              onClick={() => setActiveSection(section.key)}
            >
              {locale === "ar" ? section.labelAr : section.labelEn}
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}

function Medicines({ pendingEditRequest, onConsumePendingEdit }) {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [form, setForm] = useState(emptyMedicineForm);
  const [editId, setEditId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showItemsFilters, setShowItemsFilters] = useState(true);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [activeItemsTab, setActiveItemsTab] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [itemLocationOverrides, setItemLocationOverrides] = useState({});
  const [inactiveItemIds, setInactiveItemIds] = useState([]);

  async function loadMedicinesWorkspace(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      const nextPage = overrides.page ?? page;
      const nextPageSize = overrides.pageSize ?? pageSize;
      const trimmed = (overrides.search ?? search).trim();
      const params = { page: nextPage, pageSize: nextPageSize, searchField: "name" };
      if (trimmed) {
        params.q = trimmed;
        params.searchMode = "contains";
      }
      const response = await API.get("/medicines", { params });
      const loadedMedicines = response.data.data || [];
      setMedicines(loadedMedicines);
      setPagination(response.data.meta || { page: nextPage, pageSize: nextPageSize, total: loadedMedicines.length, totalPages: 1 });
      return loadedMedicines;
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load medicines"));
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMedicinesWorkspace({ search: "", page: 1, pageSize }); }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadMedicinesWorkspace(), search.trim().length >= 2 ? 180 : 0);
    return () => clearTimeout(timer);
  }, [search, page, pageSize]);

  useEffect(() => {
    if (!pendingEditRequest) return;
    setSearch(pendingEditRequest.name || pendingEditRequest.barcode || "");
    onConsumePendingEdit?.();
  }, [pendingEditRequest]);

  function startEdit(medicine) {
    setFeedback("Editing " + medicine.name + ".");
    setError("");
    setEditId(medicine.id);
    setShowItemForm(true);
    setForm({
      name: medicine.name || "",
      nameAr: medicine.nameAr || "",
      nameEn: medicine.nameEn || "",
      searchAliases: medicine.searchAliases || "",
      itemType: medicine.itemType || "MEDICINE",
      packageNameAr: medicine.packageNameAr || (medicine.itemType === "SINGLE" ? "عبوة" : "علبة"),
      packageNameEn: medicine.packageNameEn || (medicine.itemType === "SINGLE" ? "package" : "box"),
      pieceNameAr: medicine.pieceNameAr || "قطعة",
      pieceNameEn: medicine.pieceNameEn || "piece",
      stockUnit: medicine.stockUnit || "علبة",
      barcode: medicine.barcode || "",
      category: medicine.category || "",
      manufacturer: medicine.manufacturer || "",
      description: medicine.description || "",
      purchasePrice: medicine.purchasePrice ?? "",
      sellingPrice: medicine.sellingPrice ?? "",
      stripSellingPrice: medicine.stripSellingPrice ?? "",
      pillSellingPrice: medicine.pillSellingPrice ?? "",
      quantity: medicine.packagingSummary?.mode === "FRACTIONAL" ? (medicine.packagingSummary.availableBoxes ?? 0) : (medicine.quantity ?? 0),
      minStock: medicine.minStock ?? 5,
      stripsPerBox: medicine.stripsPerBox ?? 1,
      pillsPerStrip: medicine.pillsPerStrip ?? 1,
      expiryDate: medicine.expiryDate ? medicine.expiryDate.slice(0, 10) : "",
      batchNumber: medicine.batchNumber || ""
    });
  }

  async function saveMedicine() {
    prepareSuccessSound();
    setFeedback("");
    setError("");
    try {
      const primaryName = String(form.name || form.nameAr || form.nameEn || "").trim();
      if (!primaryName) {
        setError("اكتب اسمًا أساسيًا أو اسم الصنف بالعربي أو بالإنجليزي.");
        return;
      }
      const payload = {
        ...form,
        name: primaryName,
        stripsPerBox: form.itemType === "MEDICINE" ? form.stripsPerBox : 1,
        pillsPerStrip: form.itemType === "SINGLE" ? 1 : form.pillsPerStrip
      };
      if (editId) {
        await API.put("/medicines/" + editId, payload);
        setFeedback("تم تعديل الصنف بنجاح.");
      } else {
        await API.post("/medicines", payload);
        setFeedback("تم إضافة الصنف بنجاح.");
        playSuccessSound("add");
      }
      setForm(emptyMedicineForm);
      setEditId(null);
      setShowItemForm(false);
      setPage(1);
      await loadMedicinesWorkspace({ page: 1 });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save medicine"));
    }
  }

  async function deleteMedicine(id) {
    if (!window.confirm("Delete this medicine?")) return;
    setFeedback("");
    setError("");
    try {
      await API.delete("/medicines/" + id);
      setFeedback("تم حذف الصنف بنجاح.");
      await loadMedicinesWorkspace();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete medicine"));
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setFeedback("");
    setError("");
    try {
      const items = await readMedicineImportItems(file);
      const result = await uploadMedicineImportItems(items, (completed, totalRows) => setFeedback(`جارٍ استيراد الأصناف: ${completed} من ${totalRows}...`));
      setFeedback(`تم الاستيراد بنجاح: إنشاء ${result.createdCount} صنف وتحديث ${result.updatedCount} صنف من إجمالي ${result.total}.`);
      await loadMedicinesWorkspace({ page: 1 });
    } catch (err) {
      setError(getErrorMessage(err, err.message || "Import failed"));
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setFeedback("");
    setError("");
    try {
      const params = { page, pageSize, searchField: "name" };
      if (search.trim()) { params.q = search.trim(); params.searchMode = "contains"; }
      const response = await API.get("/medicines/export", { params, responseType: "blob" });
      downloadBlob(response.data, "medicines-export.xls");
      setFeedback("تم تنزيل ملف Excel بنجاح.");
    } catch (err) {
      setError(getErrorMessage(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }


  function toggleSelectedItem(id) {
    setSelectedItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  }

  async function deleteSelectedItems() {
    if (!selectedItemIds.length) {
      setBulkMessage("اختار صنف واحد على الأقل الأول.");
      return;
    }
    if (!window.confirm("حذف الأصناف المحددة؟")) return;
    setFeedback("");
    setBulkMessage("جاري حذف الأصناف المحددة...");
    setError("");

    const idsToDelete = [...selectedItemIds];
    const failed = [];
    for (const id of idsToDelete) {
      try {
        await API.delete("/medicines/" + id);
      } catch (err) {
        failed.push(id);
      }
    }

    const deletedIds = idsToDelete.filter((id) => !failed.includes(id));
    if (deletedIds.length) {
      setMedicines((current) => current.filter((medicine) => !deletedIds.includes(medicine.id)));
      setPagination((current) => ({ ...current, total: Math.max(0, Number(current.total || 0) - deletedIds.length) }));
    }
    setSelectedItemIds(failed);

    if (failed.length) {
      setError("تعذر حذف بعض الأصناف. أعد تشغيل السيرفر لو لسه شغال على النسخة القديمة ثم حاول مرة أخرى.");
      setBulkMessage("تم حذف " + deletedIds.length + " وتعذر حذف " + failed.length + ".");
    } else {
      setBulkMessage("تم حذف " + deletedIds.length + " صنف بنجاح.");
      setFeedback("تم حذف الأصناف المحددة بنجاح.");
      await loadMedicinesWorkspace();
    }
  }

  async function deleteAllInventory() {
    if (!window.confirm("هل تريد حذف كل الأصناف والمخزون؟ لا يمكن التراجع عن هذه العملية.")) return;
    setBulkMessage("جارٍ حذف جميع الأصناف والمخزون...");
    setError("");
    try {
      const response = await API.delete("/medicines");
      setSelectedItemIds([]);
      setPage(1);
      setBulkMessage(`تم حذف ${response.data.data?.deletedCount || 0} صنف وكل أرصدتها من هذه الصيدلية.`);
      await loadMedicinesWorkspace({ search: "", page: 1 });
    } catch (err) {
      setError(getErrorMessage(err, "تعذر حذف كل المخزون"));
    }
  }

  function addSelectedToLocation() {
    if (!selectedItemIds.length) {
      setBulkMessage("اختار أصناف الأول.");
      return;
    }
    setItemLocationOverrides((current) => {
      const next = { ...current };
      selectedItemIds.forEach((id) => { next[id] = "موقع محدد"; });
      return next;
    });
    setBulkMessage("تمت إضافة " + selectedItemIds.length + " صنف إلى موقع.");
  }

  function removeSelectedFromLocation() {
    if (!selectedItemIds.length) {
      setBulkMessage("اختار أصناف الأول.");
      return;
    }
    setItemLocationOverrides((current) => {
      const next = { ...current };
      selectedItemIds.forEach((id) => { delete next[id]; });
      return next;
    });
    setBulkMessage("تمت إزالة " + selectedItemIds.length + " صنف من الموقع.");
  }

  function deactivateSelectedItems() {
    if (!selectedItemIds.length) {
      setBulkMessage("اختار أصناف الأول.");
      return;
    }
    setInactiveItemIds((current) => Array.from(new Set([...current, ...selectedItemIds])));
    setBulkMessage("تم إلغاء تفعيل " + selectedItemIds.length + " صنف في الشاشة.");
  }

  function applyLowStockFilter() {
    setSearch("");
    setActiveItemsTab("stock");
    setShowItemsFilters(false);
  }

  const pricingPreview = buildPricingPreview(form);
  const itemFormFields = [
    { key: "name", label: "الاسم الأساسي (عربي أو إنجليزي)*", type: "text" },
    { key: "nameAr", label: "اسم الصنف بالعربي", type: "text" },
    { key: "nameEn", label: "اسم الصنف بالإنجليزي", type: "text" },
    { key: "searchAliases", label: "أسماء بحث أخرى (افصل بينها بفاصلة)", type: "text" },
    { key: "barcode", label: "SKU / الباركود", type: "text" },
    { key: "category", label: "المجموعة الرئيسية", type: "text" },
    { key: "manufacturer", label: "الشركة المصنعة", type: "text" },
    { key: "stockUnit", label: "وحدة المخزون (علبة/شريط/أمبول/قطعة)", type: "text" },
    { key: "purchasePrice", label: form.itemType === "SINGLE" ? "سعر شراء الوحدة*" : "سعر شراء العبوة*", type: "number" },
    { key: "sellingPrice", label: form.itemType === "SINGLE" ? "سعر بيع الوحدة*" : "سعر بيع العبوة*", type: "number" },
    { key: "stripSellingPrice", label: "سعر بيع الشريط", type: "number", show: form.itemType === "MEDICINE" },
    { key: "pillSellingPrice", label: form.itemType === "PACK_PIECE" ? "سعر بيع القطعة / القلم" : "سعر بيع القرص / الحبة", type: "number", show: form.itemType !== "SINGLE" },
    { key: "quantity", label: form.itemType === "SINGLE" ? "عدد الوحدات الحالية" : "عدد العبوات الحالية", type: "number" },
    { key: "stripsPerBox", label: "عدد الشرائط داخل العلبة", type: "number", show: form.itemType === "MEDICINE" },
    { key: "pillsPerStrip", label: form.itemType === "PACK_PIECE" ? "عدد القطع / الأقلام داخل العبوة" : "عدد الأقراص داخل الشريط", type: "number", show: form.itemType !== "SINGLE" },
    { key: "packageNameAr", label: "اسم العبوة بالعربي (علبة/زجاجة/عبوة)", type: "text", show: form.itemType !== "MEDICINE" },
    { key: "packageNameEn", label: "اسم العبوة بالإنجليزي", type: "text", show: form.itemType !== "MEDICINE" },
    { key: "pieceNameAr", label: "اسم القطعة بالعربي (قلم/قطعة)", type: "text", show: form.itemType === "PACK_PIECE" },
    { key: "pieceNameEn", label: "اسم القطعة بالإنجليزي", type: "text", show: form.itemType === "PACK_PIECE" },
    { key: "minStock", label: "تنبيه الكمية", type: "number" },
    { key: "expiryDate", label: "تاريخ الصلاحية", type: "date" },
    { key: "batchNumber", label: "رقم التشغيلة", type: "text" }
  ];

  return (
    <section className="items-page-screen" dir="rtl">
      <header className="items-page-header"><h2>الأصناف</h2><span>إدارة اصنافك</span></header>
      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <section className="transaction-filter-panel items-filter-card">
        <button type="button" className="items-filter-button unified-filter-summary" onClick={() => setShowItemsFilters((value) => !value)} aria-expanded={showItemsFilters}><FilterHeading /></button>
        {showItemsFilters ? <div className="transaction-filter-grid items-filter-panel">
          <label className="transaction-filter-search"><span>بحث عن صنف</span><div><input data-unified-medicine-search="true" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /><b aria-hidden="true">⌕</b></div></label>
          <label><span>حالة المخزون</span><select value={activeItemsTab} onChange={(event) => { setSearch(""); setActiveItemsTab(event.target.value); setPage(1); }}><option value="all">كل الأصناف</option><option value="stock">المخزون القليل</option></select></label>
          <button type="button" className="transaction-filter-reset" disabled={!search && activeItemsTab === "all"} onClick={() => { setSearch(""); setPage(1); setActiveItemsTab("all"); loadMedicinesWorkspace({ search: "", page: 1 }); }}>مسح التصفية</button>
        </div> : null}
      </section>

      {showItemForm ? (
        <section className="section-card items-add-form-card">
          <div className="items-add-form-head">
            <div>
              <h3>{editId ? "تعديل صنف" : "إضافة صنف جديد"}</h3>
              <p>اختر نوع الصنف؛ دواء عادي، عبوة تحتوي قطعًا مثل أقلام الإنسولين، أو منتج مفرد مثل الشامبو والكريم.</p>
            </div>
            <button type="button" onClick={() => { setShowItemForm(false); setEditId(null); setForm(emptyMedicineForm); }}>x</button>
          </div>
          <div className="items-type-selector">
            <button type="button" className={form.itemType === "MEDICINE" ? "active" : ""} onClick={() => setForm((current) => ({ ...current, itemType: "MEDICINE", packageNameAr: "علبة", packageNameEn: "box", pieceNameAr: "حبة", pieceNameEn: "pill" }))}>دواء: علبة / شريط / حبة</button>
            <button type="button" className={form.itemType === "PACK_PIECE" ? "active" : ""} onClick={() => setForm((current) => ({ ...current, itemType: "PACK_PIECE", stripsPerBox: 1, packageNameAr: "علبة", packageNameEn: "box", pieceNameAr: "قلم", pieceNameEn: "pen" }))}>عبوة تحتوي قطعًا</button>
            <button type="button" className={form.itemType === "SINGLE" ? "active" : ""} onClick={() => setForm((current) => ({ ...current, itemType: "SINGLE", stripsPerBox: 1, pillsPerStrip: 1, packageNameAr: "عبوة", packageNameEn: "package" }))}>منتج مفرد</button>
          </div>
          <div className="items-add-form-grid">
            {itemFormFields.filter((field) => field.show !== false).map((field) => (
              <label key={field.key} className="items-add-field">
                <span>{field.label}</span>
                <input
                  type={field.type}
                  value={form[field.key] ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  required={["purchasePrice", "sellingPrice"].includes(field.key)}
                />
              </label>
            ))}
            <label className="items-add-field items-add-field-wide">
              <span>الوصف</span>
              <textarea value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <div className="items-unit-preview">
            <article><span>{form.itemType === "MEDICINE" ? "العلبة" : (form.packageNameAr || "العبوة")}</span><strong>{formatCurrency(pricingPreview.box.price)}</strong><small>تكلفة {formatCurrency(pricingPreview.box.cost)} - ربح {formatCurrency(pricingPreview.box.profit)}</small></article>
            {form.itemType === "MEDICINE" ? <article><span>الشريط</span><strong>{form.stripsPerBox || 1} شريط / علبة</strong><small>بيع {formatCurrency(pricingPreview.strip.price)} - ربح {formatCurrency(pricingPreview.strip.profit)}</small></article> : null}
            {form.itemType !== "SINGLE" ? <article><span>{form.itemType === "PACK_PIECE" ? (form.pieceNameAr || "القطعة") : "الأقراص"}</span><strong>{form.itemType === "PACK_PIECE" ? `${form.pillsPerStrip || 1} ${form.pieceNameAr || "قطعة"} / ${form.packageNameAr || "عبوة"}` : `${form.pillsPerStrip || 1} قرص / شريط`}</strong><small>بيع {formatCurrency(pricingPreview.pill.price)} - ربح {formatCurrency(pricingPreview.pill.profit)}</small></article> : null}
          </div>
          <div className="items-add-form-actions">
            <button type="button" className="items-save-item-button" onClick={saveMedicine}>{editId ? "حفظ التعديلات" : "حفظ الصنف"}</button>
            <button type="button" className="items-cancel-item-button" onClick={() => { setShowItemForm(false); setEditId(null); setForm(emptyMedicineForm); }}>إلغاء</button>
          </div>
        </section>
      ) : null}

      <section className="section-card items-list-card">
        <div className="items-tabs"><button type="button" className={activeItemsTab === "all" ? "items-tab active" : "items-tab"} onClick={() => setActiveItemsTab("all")}>⚭ جميع الاصناف</button><button type="button" className={activeItemsTab === "stock" ? "items-tab active" : "items-tab"} onClick={() => setActiveItemsTab("stock")}>⌛ تقرير المخزون</button></div>
        <div className="items-toolbar">
          <div className="items-toolbar-actions"><button type="button" className="items-pill-button items-pill-primary" onClick={() => { setEditId(null); setForm(emptyMedicineForm); setShowItemForm(true); }}><span>＋</span>إضافة</button><button type="button" className="items-pill-button items-pill-primary" disabled={exporting} onClick={handleExport}><span>⇩</span>{exporting ? "جاري التنزيل..." : "تنزيل إكسل"}</button></div>
          <div className="items-export-actions"><button type="button" onClick={() => document.getElementById("medicine-import-file")?.click()} disabled={importing}>{importing ? "جارٍ الاستيراد..." : "استيراد Excel / CSV ▣"}</button><button type="button" disabled={exporting} onClick={handleExport}>تصدير إلى Excel ▣</button><button type="button" onClick={() => window.print()}>طباعة ⎙</button><button type="button" onClick={() => setShowColumnPanel((value) => !value)}>رؤية العمود ▣</button><input id="medicine-import-file" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleImportFile} hidden /></div>
          <label className="items-page-size">عرض<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select>إدخالات</label>
        </div>
        {showColumnPanel ? <div className="items-column-panel">الأعمدة المعروضة: خيار، صنف، الفرع، سعر شراء الوحدة، سعر البيع، مخزون المخزن، وحدة الصنف، المجموعة الرئيسية، SKU الباركود</div> : null}
        {activeItemsTab === "stock" ? <div className="items-stock-report"><strong>تقرير المخزون</strong><span>عدد الأصناف: {pagination.total}</span><span>أصناف منخفضة: {medicines.filter((medicine) => medicine.quantity <= medicine.minStock).length}</span></div> : null}
        <div className="items-table-wrap"><table className="items-products-table"><thead><tr><th className="items-check-col"><input type="checkbox" aria-label="تحديد الصفحة كلها" checked={Boolean(medicines.length) && medicines.every((medicine) => selectedItemIds.includes(medicine.id))} onChange={(event) => setSelectedItemIds((current) => event.target.checked ? Array.from(new Set([...current, ...medicines.map((medicine) => medicine.id)])) : current.filter((id) => !medicines.some((medicine) => medicine.id === id)))} /></th><th>خيار</th><th>صنف ↕</th><th>الفرع ⓘ ↕</th><th>سعر شراء الوحدة ↕</th><th>سعر البيع ↕</th><th>مخزون المخزن ↕</th><th>وحدة الصنف ↕</th><th>المجموعة الرئيسية ↕</th><th>SKU الباركود ↕</th></tr></thead><tbody>{loading ? <tr><td colSpan="10" className="items-empty-row">جاري تحميل الاصناف...</td></tr> : medicines.length ? medicines.map((medicine) => <tr key={medicine.id} className={(medicine.quantity <= medicine.minStock ? "items-warning-row" : "") + (inactiveItemIds.includes(medicine.id) ? " items-inactive-row" : "")}><td><input type="checkbox" checked={selectedItemIds.includes(medicine.id)} onChange={() => toggleSelectedItem(medicine.id)} /></td><td><div className="items-row-actions"><button type="button" onClick={() => startEdit(medicine)}>تعديل</button><button type="button" onClick={() => deleteMedicine(medicine.id)}>حذف</button></div></td><td>{getMedicineDisplayName(medicine)}{inactiveItemIds.includes(medicine.id) ? <span className="items-inactive-badge"> غير مفعل</span> : null}</td><td>{itemLocationOverrides[medicine.id] || "ziad"}</td><td>{formatCurrency(medicine.purchasePrice)}</td><td>{formatCurrency(medicine.sellingPrice)}</td><td><strong>{medicine.quantity ?? 0}</strong></td><td>{medicine.stockUnit || getUnitLabel("BOX", medicine)}</td><td>{medicine.category || "-"}</td><td>{medicine.barcode || "-"}</td></tr>) : <tr><td colSpan="10" className="items-empty-row">لا توجد بيانات متاحة في الجدول</td></tr>}</tbody></table></div>
        <div className="items-table-footer"><div className="items-bulk-actions"><button type="button" className="items-danger-outline" onClick={deleteSelectedItems}>احذف المختار</button><button type="button" className="items-danger-outline" onClick={deleteAllInventory}>حذف كل المخزون</button><button type="button" className="items-cyan-outline" onClick={addSelectedToLocation}>اضف الى موقع</button><button type="button" className="items-gray-outline" onClick={removeSelectedFromLocation}>ازالة من موقع</button><button type="button" className="items-orange-outline" onClick={deactivateSelectedItems}>الغاء تفعيل المحدد</button></div>{bulkMessage ? <div className="items-bulk-message">{bulkMessage}</div> : null}<div className="items-pagination-summary">عرض {(pagination.page - 1) * pagination.pageSize + (medicines.length ? 1 : 0)} إلى {Math.min(pagination.page * pagination.pageSize, pagination.total)} من {pagination.total} إدخالات</div><div className="items-pagination-buttons"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}>التالي</button></div></div>
      </section>
    </section>
  );
}
function LegacyUsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyUserForm);
  const [editId, setEditId] = useState(null);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function loadUsers(query = search) {
    setLoading(true);
    setError("");
    try {
      const params = query.trim() ? { q: query.trim() } : {};
      const response = await API.get("/users", { params });
      setUsers(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(search), 180);
    return () => clearTimeout(timer);
  }, [search]);

  async function saveUser(event) {
    event.preventDefault();
    setFeedback("");
    setError("");
    try {
      if (editId) {
        const payload = { name: form.name, email: form.email, role: form.role };
        await API.put(`/users/${editId}`, payload);
        setFeedback("User updated successfully.");
      } else {
        await API.post("/users", form);
        setFeedback("User created successfully.");
      }
      setEditId(null);
      setForm(emptyUserForm);
      await loadUsers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save user"));
    }
  }

  async function deleteUser(id) {
    if (!window.confirm("Delete this user?")) return;
    setFeedback("");
    setError("");
    try {
      await API.delete(`/users/${id}`);
      setFeedback("User deleted successfully.");
      await loadUsers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete user"));
    }
  }

  async function resetPassword(userId) {
    if (!passwordValue) {
      setError("Enter a new password first.");
      return;
    }
    setFeedback("");
    setError("");
    try {
      await API.patch(`/users/${userId}/password`, { newPassword: passwordValue });
      setPasswordUserId(null);
      setPasswordValue("");
      setFeedback("Password reset successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to reset password"));
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role
    });
  }

  if (currentUser.role !== "ADMIN") {
    return <section className="section-card"><div className="notice error">Only admins can manage users.</div></section>;
  }

  return (
    <section className="stack-lg">
      <div className="hero-banner split">
        <div>
          <p className="eyebrow">Users</p>
          <h2>Authentication and roles</h2>
          <p className="muted">Manage admins, pharmacists, cashiers, and reset passwords when needed.</p>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className="split-grid">
        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>{editId ? "Edit user" : "Create user"}</h3>
              <p className="muted">Roles available: ADMIN, PHARMACIST, CASHIER.</p>
            </div>
          </div>
          <form className="stack-md" onSubmit={saveUser}>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" required />
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" required />
            {!editId ? (
              <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" required />
            ) : null}
            <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <div className="button-row">
              <button type="submit" className="primary-button">{editId ? "Update user" : "Create user"}</button>
              {editId ? (
                <button type="button" className="secondary-button" onClick={() => { setEditId(null); setForm(emptyUserForm); }}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>Users list</h3>
              <p className="muted">Search by name, email, or role.</p>
            </div>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" />
          {loading ? (
            <p className="muted">Loading users...</p>
          ) : users.length ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><span className="role-badge">{roleLabel(user.role)}</span></td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-button" onClick={() => startEdit(user)}>Edit</button>
                          <button type="button" className="ghost-danger" disabled={user.id === currentUser.id} onClick={() => deleteUser(user.id)}>Delete</button>
                        </div>
                        <div className="inline-form">
                          <input
                            type="password"
                            placeholder="New password"
                            value={passwordUserId === user.id ? passwordValue : ""}
                            onChange={(event) => {
                              setPasswordUserId(user.id);
                              setPasswordValue(event.target.value);
                            }}
                          />
                          <button type="button" className="secondary-button" onClick={() => resetPassword(user.id)}>Reset</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No users found.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function LegacySuppliersPage({ currentUser }) {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptySupplierForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function loadSuppliers(query = search) {
    setLoading(true);
    setError("");
    try {
      const params = query.trim() ? { q: query.trim() } : {};
      const response = await API.get("/suppliers", { params });
      setSuppliers(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load suppliers"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadSuppliers(search), 180);
    return () => clearTimeout(timer);
  }, [search]);

  async function saveSupplier(event) {
    event.preventDefault();
    setFeedback("");
    setError("");
    try {
      if (editId) {
        await API.put(`/suppliers/${editId}`, form);
        setFeedback("Supplier updated successfully.");
      } else {
        await API.post("/suppliers", form);
        setFeedback("Supplier created successfully.");
      }
      setEditId(null);
      setForm(emptySupplierForm);
      await loadSuppliers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save supplier"));
    }
  }

  async function deleteSupplier(id) {
    if (!window.confirm("Delete this supplier?")) return;
    setFeedback("");
    setError("");
    try {
      await API.delete(`/suppliers/${id}`);
      setFeedback("Supplier deleted successfully.");
      await loadSuppliers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete supplier"));
    }
  }

  const canWrite = currentUser.role === "ADMIN" || currentUser.role === "PHARMACIST";
  const canDelete = currentUser.role === "ADMIN";

  return (
    <section className="stack-lg">
      <div className="hero-banner split">
        <div>
          <p className="eyebrow">Suppliers</p>
          <h2>Supplier directory</h2>
          <p className="muted">Maintain supplier contact details and inspect how many medicines are linked to each supplier.</p>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className="split-grid">
        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>{editId ? "Edit supplier" : "Create supplier"}</h3>
              <p className="muted">Suppliers are editable by admins and pharmacists.</p>
            </div>
          </div>
          <form className="stack-md" onSubmit={saveSupplier}>
            {Object.keys(emptySupplierForm).map((field) => (
              <input
                key={field}
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={field}
                required={field === "name"}
                disabled={!canWrite}
              />
            ))}
            <div className="button-row">
              <button type="submit" className="primary-button" disabled={!canWrite}>{editId ? "Update supplier" : "Create supplier"}</button>
              {editId ? (
                <button type="button" className="secondary-button" onClick={() => { setEditId(null); setForm(emptySupplierForm); }}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>Suppliers list</h3>
              <p className="muted">Search by name, phone, email, or address.</p>
            </div>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search suppliers" />
          {loading ? (
            <p className="muted">Loading suppliers...</p>
          ) : suppliers.length ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Medicines</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>{supplier.name}</td>
                      <td>{supplier.phone || "-"}</td>
                      <td>{supplier.email || "-"}</td>
                      <td>{supplier.medicines?.length || 0}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-button" disabled={!canWrite} onClick={() => { setEditId(supplier.id); setForm({ name: supplier.name || "", phone: supplier.phone || "", email: supplier.email || "", address: supplier.address || "" }); }}>Edit</button>
                          <button type="button" className="ghost-danger" disabled={!canDelete} onClick={() => deleteSupplier(supplier.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No suppliers found.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function LegacyCustomersPage({ currentUser }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyCustomerForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function loadCustomers(query = search) {
    setLoading(true);
    setError("");
    try {
      const params = query.trim() ? { q: query.trim() } : {};
      const response = await API.get("/customers", { params });
      setCustomers(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load customers"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(search), 180);
    return () => clearTimeout(timer);
  }, [search]);

  async function saveCustomer(event) {
    event.preventDefault();
    setFeedback("");
    setError("");
    try {
      if (editId) {
        await API.put(`/customers/${editId}`, form);
        setFeedback("Customer updated successfully.");
      } else {
        await API.post("/customers", form);
        setFeedback("Customer created successfully.");
      }
      setEditId(null);
      setForm(emptyCustomerForm);
      await loadCustomers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save customer"));
    }
  }

  async function deleteCustomer(id) {
    if (!window.confirm("Delete this customer?")) return;
    setFeedback("");
    setError("");
    try {
      await API.delete(`/customers/${id}`);
      setFeedback("Customer deleted successfully.");
      await loadCustomers(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete customer"));
    }
  }

  const canWrite = ["ADMIN", "PHARMACIST", "CASHIER"].includes(currentUser.role);
  const canDelete = ["ADMIN", "PHARMACIST"].includes(currentUser.role);

  return (
    <section className="stack-lg">
      <div className="hero-banner split">
        <div>
          <p className="eyebrow">Customers</p>
          <h2>Customer directory</h2>
          <p className="muted">Track customer contact information and see linked sales history count.</p>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className="split-grid">
        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>{editId ? "Edit customer" : "Create customer"}</h3>
              <p className="muted">Cashiers can create and edit customers; admins and pharmacists can delete.</p>
            </div>
          </div>
          <form className="stack-md" onSubmit={saveCustomer}>
            {Object.keys(emptyCustomerForm).map((field) => (
              <input
                key={field}
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={field}
                required={field === "name"}
                disabled={!canWrite}
              />
            ))}
            <div className="button-row">
              <button type="submit" className="primary-button" disabled={!canWrite}>{editId ? "Update customer" : "Create customer"}</button>
              {editId ? (
                <button type="button" className="secondary-button" onClick={() => { setEditId(null); setForm(emptyCustomerForm); }}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="section-card">
          <div className="section-title">
            <div>
              <h3>Customers list</h3>
              <p className="muted">Search by name, phone, or address.</p>
            </div>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers" />
          {loading ? (
            <p className="muted">Loading customers...</p>
          ) : customers.length ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Sales</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.phone || "-"}</td>
                      <td>{customer.address || "-"}</td>
                      <td>{customer.sales?.length || 0}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-button" disabled={!canWrite} onClick={() => { setEditId(customer.id); setForm({ name: customer.name || "", phone: customer.phone || "", address: customer.address || "" }); }}>Edit</button>
                          <button type="button" className="ghost-danger" disabled={!canDelete} onClick={() => deleteCustomer(customer.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No customers found.</div>
          )}
        </section>
      </div>
    </section>
  );
}

const CONTACTS_NAV_ITEMS = [
  { key: "contacts-suppliers", labelAr: "الموردين", labelEn: "Suppliers" },
  { key: "contacts-customers", labelAr: "العملاء", labelEn: "Customers" },
  { key: "contacts-import", labelAr: "استيراد Excel / CSV", labelEn: "Import Excel / CSV" },
  { key: "customer-accounts", labelAr: "حسابات ومدفوعات العملاء", labelEn: "Customer accounts" },
  { key: "contacts-users", labelAr: "الموظفين", labelEn: "Employees" },
  { key: "contacts-agents", labelAr: "مندوبي المبيعات", labelEn: "Sales agents" },
  { key: "contacts-roles", labelAr: "الأدوار والصلاحيات", labelEn: "Roles and permissions" },
  { key: "contacts-groups", labelAr: "مجموعات العملاء", labelEn: "Customer groups" },
  { key: "contacts-report", labelAr: "تقرير الموردين والعملاء", labelEn: "Customer and supplier report" },
  { key: "contacts-register-report", labelAr: "تقرير مناوبة الموظفين", labelEn: "Register report" },
  { key: "contacts-sales-agent-report", labelAr: "تقرير مندوبى المبيعات", labelEn: "Sales agent report" }
];

const SALES_NAV_ITEMS = [
  { key: "sales-add", labelAr: "إضافة مبيعات", labelEn: "Add sales" },
  { key: "sales-list", labelAr: "كل المبيعات", labelEn: "All sales" },
  { key: "sales-register", labelAr: "سجل الكاشير", labelEn: "Cash register log" },
  { key: "cashier-shifts", labelAr: "الورديات والصندوق", labelEn: "Cashier shifts" },
  { key: "sales-cashier", labelAr: "الكاشير", labelEn: "Cashier", target: "sales" },
  { key: "sales-drafts", labelAr: "مسودات البيع", labelEn: "Sales drafts" },
  { key: "sales-pricing", labelAr: "عروض الأسعار", labelEn: "Price offers" },
  { key: "sales-returns", labelAr: "مرجع المبيعات", labelEn: "Sales return" },
  { key: "sales-shipping", labelAr: "الشحن والتوصيل", labelEn: "Shipping and delivery" },
  { key: "sales-promotions", labelAr: "خصومات ترويجية", labelEn: "Promotions" },
  { key: "sales-import", labelAr: "استيراد بيانات المبيعات", labelEn: "Import sales data" },
  { key: "sales-detailed-report", labelAr: "تقرير المبيعات مفصل", labelEn: "Detailed sales report" }
];

const PURCHASES_NAV_ITEMS = [
  { key: "purchases-add", labelAr: "إضافة مشتريات", labelEn: "Add purchases" },
  { key: "purchases-list", labelAr: "كل المشتريات", labelEn: "All purchases", target: "purchases" },
  { key: "purchases-return", labelAr: "مرجع المشتريات", labelEn: "Purchase return" },
  { key: "purchases-report", labelAr: "تقرير المشتريات", labelEn: "Purchase report" },
  { key: "expenses-list", labelAr: "قائمة المصاريف", labelEn: "Expenses list" },
  { key: "expenses-add", labelAr: "إضافة المصاريف", labelEn: "Add expense" },
  { key: "expenses-categories", labelAr: "فئات المصاريف", labelEn: "Expense categories" },
  { key: "expenses-report", labelAr: "تقرير المصاريف", labelEn: "Expense report" }
];

const ACCOUNTING_NAV_ITEMS = [
  { key: "accounting-accounts", labelAr: "عرض قائمة الحسابات", labelEn: "Chart of accounts" },
  { key: "accounting-profit-loss", labelAr: "الدخل (الربح / الخسارة)", labelEn: "Profit and loss" },
  { key: "accounting-trading", labelAr: "تقرير المتاجرة", labelEn: "Trading report" },
  { key: "accounting-trial-balance", labelAr: "ميزان المراجعة", labelEn: "Trial balance" },
  { key: "accounting-cash-flow", labelAr: "التدفق النقدي", labelEn: "Cash flow" },
  { key: "accounting-balance-sheet", labelAr: "الميزانية العمومية", labelEn: "Balance sheet" },
  { key: "accounting-movements", labelAr: "سجل حركة الحسابات", labelEn: "Account movements" }
];

function DirectoryField({ label, children, wide = false }) {
  return <label className={wide ? "directory-field wide" : "directory-field"}><span>{label}</span>{children}</label>;
}

function DirectoryCustomFields({ values = {}, onChange }) {
  return <div className="directory-custom-grid">{Array.from({ length: 10 }, (_, index) => {
    const key = `field${index + 1}`;
    return <DirectoryField key={key} label={`حقل مخصص ${index + 1}`}><input value={values[key] || ""} onChange={(event) => onChange({ ...values, [key]: event.target.value })} /></DirectoryField>;
  })}</div>;
}

function PartyEditorModal({ kind, form, setForm, editing, busy, onClose, onSave }) {
  const isSupplier = kind === "supplier";
  const typeKey = isSupplier ? "supplierType" : "customerType";
  const partyLabel = isSupplier ? "المورد" : "العميل";
  const singleRole = isSupplier ? "SUPPLIER" : "CUSTOMER";
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="directory-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="directory-editor-modal" onSubmit={onSave}>
      <header><div><strong>{editing ? `تعديل ${partyLabel}` : `إضافة ${partyLabel}`}</strong><small>الحقول الأساسية أولًا، ويمكن فتح الأقسام الإضافية عند الحاجة.</small></div><button type="button" onClick={onClose}>✕</button></header>
      <div className="directory-editor-scroll">
        <section className="directory-account-role" aria-label="دور الحساب"><div><strong>دور الحساب</strong><small>يحدد أين يظهر هذا الشخص وكيف ترتبط مديونيته.</small></div><div><button type="button" className={form.contactRole === singleRole ? "active" : ""} onClick={() => set("contactRole", singleRole)}>{isSupplier ? "مورد فقط" : "عميل فقط"}</button><button type="button" className={form.contactRole === "BOTH" ? "active both" : ""} onClick={() => set("contactRole", "BOTH")}>عميل ومورد</button></div></section>
        <section className="directory-type-row"><span>التصنيف</span><button type="button" className={form[typeKey] === "PERSON" ? "active" : ""} onClick={() => set(typeKey, "PERSON")}>شخص</button><button type="button" className={form[typeKey] === "BUSINESS" ? "active" : ""} onClick={() => set(typeKey, "BUSINESS")}>مشروع / شركة</button></section>
        <details className="directory-form-section" open><summary>البيانات الأساسية</summary><div className="directory-form-grid">
          {form[typeKey] === "BUSINESS" ? <DirectoryField label="اسم المشروع / الشركة"><input value={form.businessName} onChange={(event) => set("businessName", event.target.value)} /></DirectoryField> : null}
          <DirectoryField label={`اسم ${partyLabel} *`}><input autoFocus required value={form.name} onChange={(event) => set("name", event.target.value)} /></DirectoryField>
          <DirectoryField label="اسم العائلة"><input value={form.familyName} onChange={(event) => set("familyName", event.target.value)} /></DirectoryField>
          <DirectoryField label="الاسم الأوسط"><input value={form.middleName} onChange={(event) => set("middleName", event.target.value)} /></DirectoryField>
          <DirectoryField label="اللقب"><select value={form.title} onChange={(event) => set("title", event.target.value)}><option value="">بدون لقب</option><option value="السيد">السيد</option><option value="السيدة">السيدة</option><option value="دكتور">دكتور</option><option value="شركة">شركة</option></select></DirectoryField>
          <DirectoryField label="رقم الموبايل *"><input required value={form.phone} onChange={(event) => set("phone", event.target.value)} /></DirectoryField>
          <DirectoryField label="موبايل بديل"><input value={form.alternatePhone} onChange={(event) => set("alternatePhone", event.target.value)} /></DirectoryField>
          <DirectoryField label="الهاتف الأرضي"><input value={form.telephone} onChange={(event) => set("telephone", event.target.value)} /></DirectoryField>
          <DirectoryField label="البريد الإلكتروني"><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></DirectoryField>
        </div></details>
        <details className="directory-form-section" open><summary>المعلومات المالية والضريبية</summary><div className="directory-form-grid">
          <DirectoryField label="الرقم الضريبي"><input value={form.taxNumber} onChange={(event) => set("taxNumber", event.target.value)} /></DirectoryField>
          <DirectoryField label="معرف الاتصال"><input value={form.contactCode} onChange={(event) => set("contactCode", event.target.value)} placeholder="يُنشأ تلقائيًا إذا تُرك فارغًا" /></DirectoryField>
          <DirectoryField label={isSupplier ? "رصيد المورد الافتتاحي" : "رصيد العميل الافتتاحي"}><input type="number" step="0.01" value={form.openingBalance} onChange={(event) => set("openingBalance", event.target.value)} /></DirectoryField>
          {form.contactRole === "BOTH" ? <DirectoryField label={isSupplier ? "رصيد العميل الافتتاحي" : "رصيد المورد الافتتاحي"}><input type="number" step="0.01" value={isSupplier ? form.customerOpeningBalance : form.supplierOpeningBalance} onChange={(event) => set(isSupplier ? "customerOpeningBalance" : "supplierOpeningBalance", event.target.value)} /></DirectoryField> : null}
          {!isSupplier ? <DirectoryField label="الحد الائتماني"><input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => set("creditLimit", event.target.value)} /></DirectoryField> : null}
          {isSupplier && form.contactRole === "BOTH" ? <DirectoryField label="الحد الائتماني للعميل"><input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => set("creditLimit", event.target.value)} /></DirectoryField> : null}
          <DirectoryField label="فترة الدفع"><div className="directory-inline-input"><input type="number" min="0" value={form.paymentTermValue} onChange={(event) => set("paymentTermValue", event.target.value)} /><select value={form.paymentTermUnit} onChange={(event) => set("paymentTermUnit", event.target.value)}><option value="DAYS">يوم</option><option value="MONTHS">شهر</option></select></div></DirectoryField>
        </div></details>
        <details className="directory-form-section"><summary>العنوان والتوصيل</summary><div className="directory-form-grid">
          <DirectoryField label="العنوان الأول"><input value={form.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} /></DirectoryField><DirectoryField label="سطر العنوان 2"><input value={form.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} /></DirectoryField><DirectoryField label="الحي"><input value={form.district} onChange={(event) => set("district", event.target.value)} /></DirectoryField><DirectoryField label="المدينة"><input value={form.city} onChange={(event) => set("city", event.target.value)} /></DirectoryField><DirectoryField label="المحافظة"><input value={form.state} onChange={(event) => set("state", event.target.value)} /></DirectoryField><DirectoryField label="الدولة"><input value={form.country} onChange={(event) => set("country", event.target.value)} /></DirectoryField><DirectoryField label="الرمز البريدي"><input value={form.postalCode} onChange={(event) => set("postalCode", event.target.value)} /></DirectoryField><DirectoryField label="عنوان الشحن والتوصيل" wide><textarea value={form.shippingAddress} onChange={(event) => set("shippingAddress", event.target.value)} /></DirectoryField>
        </div></details>
        <details className="directory-form-section"><summary>الحقول المخصصة</summary><DirectoryCustomFields values={form.customFields} onChange={(value) => set("customFields", value)} /></details>
      </div>
      <footer><button type="button" className="directory-close-button" onClick={onClose}>إغلاق</button><button type="submit" className="directory-save-button" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ"}</button></footer>
    </form>
  </div>;
}

function DirectoryPageHeader({ title, subtitle, onAdd, onImport, onExport, onPrint, canAdd, search = "", setSearch, searchPlaceholder = "ابحث..." }) {
  return <><header className="directory-page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></header><details className="transaction-filter-panel directory-filter-bar" open><summary><FilterHeading /></summary>{setSearch ? <div className="transaction-filter-grid"><label className="transaction-filter-search"><span>البحث</span><div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} /><b aria-hidden="true">⌕</b></div></label></div> : null}</details><div className="directory-toolbar"><button type="button" className="directory-add-button" disabled={!canAdd} onClick={onAdd}>＋ إضافة</button><div>{onImport ? <button type="button" className="directory-import-action" onClick={onImport}>⇧ استيراد Excel / CSV</button> : null}<button type="button" onClick={onExport}>تصدير Excel</button><button type="button" onClick={onPrint}>طباعة</button></div></div></>;
}

function cloneDirectoryForm(template, row = null) {
  const next = { ...template, customFields: { ...(template.customFields || {}) } };
  if (!row) return next;
  Object.keys(next).forEach((key) => {
    if (key === "customFields") next.customFields = { ...(row.customFields || {}) };
    else if (key === "hireDate") next[key] = row[key] ? String(row[key]).slice(0, 10) : "";
    else if (row[key] !== undefined && row[key] !== null) next[key] = row[key];
  });
  return next;
}

function DirectoryActions({ onEdit, onDelete, canDelete = true }) {
  return <div className="directory-row-actions"><button type="button" className="directory-edit-action" onClick={onEdit}>✎ تعديل</button>{canDelete ? <button type="button" className="directory-delete-action" onClick={onDelete}>🗑 حذف</button> : null}</div>;
}

function PartyDirectoryPage({ kind, currentUser, onNavigate }) {
  const isSupplier = kind === "supplier";
  const endpoint = isSupplier ? "/suppliers" : "/customers";
  const template = isSupplier ? emptySupplierForm : emptyCustomerForm;
  const label = isSupplier ? "الموردين" : "العملاء";
  const singular = isSupplier ? "المورد" : "العميل";
  const canEdit = isSupplier ? ["ADMIN", "PHARMACIST"].includes(currentUser?.role) : ["ADMIN", "PHARMACIST", "CASHIER"].includes(currentUser?.role);
  const canDelete = isSupplier ? currentUser?.role === "ADMIN" : ["ADMIN", "PHARMACIST"].includes(currentUser?.role);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState(() => cloneDirectoryForm(template));
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function loadRows(query = search) {
    setLoading(true);
    setError("");
    try {
      const response = await API.get(endpoint, { params: query.trim() ? { q: query.trim() } : {} });
      setRows(response.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, `تعذر تحميل ${label}`));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadRows(search), 180);
    return () => clearTimeout(timer);
  }, [search]);

  function openAdd() {
    setEditing(null);
    setForm(cloneDirectoryForm(template));
    setShowEditor(true);
  }

  function openEdit(row) {
    setEditing(row);
    const next = cloneDirectoryForm(template, row);
    next.contactRole = row.contactRole === "BOTH" || row.linkedCustomer || row.supplierProfile ? "BOTH" : (isSupplier ? "SUPPLIER" : "CUSTOMER");
    if (isSupplier && row.linkedCustomer) {
      next.customerOpeningBalance = row.linkedCustomer.openingBalance ?? row.linkedCustomer.accountBalance ?? 0;
      next.creditLimit = row.linkedCustomer.creditLimit ?? 0;
    }
    if (!isSupplier && row.supplierProfile) next.supplierOpeningBalance = row.supplierProfile.openingBalance ?? 0;
    setForm(next);
    setShowEditor(true);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(""); setFeedback("");
    try {
      const payload = { ...form, openingBalance: Number(form.openingBalance || 0), supplierOpeningBalance: Number(form.supplierOpeningBalance || 0), customerOpeningBalance: Number(form.customerOpeningBalance || 0), paymentTermValue: form.paymentTermValue === "" ? null : Number(form.paymentTermValue) };
      if (!isSupplier) payload.creditLimit = Number(form.creditLimit || 0);
      if (editing) await API.put(`${endpoint}/${editing.id}`, payload);
      else await API.post(endpoint, payload);
      setFeedback(`تم ${editing ? "تعديل" : "إضافة"} ${singular} بنجاح.`);
      setShowEditor(false);
      await loadRows();
    } catch (err) { setError(getErrorMessage(err, `تعذر حفظ ${singular}`)); }
    finally { setBusy(false); }
  }

  async function remove(row) {
    if (!window.confirm(`هل تريد حذف ${singular}: ${row.businessName || row.name}؟`)) return;
    setError("");
    try {
      await API.delete(`${endpoint}/${row.id}`);
      setFeedback(`تم حذف ${singular}.`);
      await loadRows();
    } catch (err) { setError(getErrorMessage(err, `تعذر حذف ${singular}`)); }
  }

  const visibleRows = rows.slice(0, pageSize);
  const exportHeaders = isSupplier
    ? ["code", "name", "phone", "email", "openingBalance", "purchasesDue", "returns"]
    : ["code", "name", "phone", "email", "creditLimit", "customerDue", "returns"];
  const exportRows = rows.map((row) => [row.contactCode || "", row.businessName || row.name, row.phone || "", row.email || "", isSupplier ? row.openingBalance || 0 : row.creditLimit || 0, row.stats?.totalDue || 0, isSupplier ? row.stats?.totalPurchaseReturns || 0 : row.stats?.totalReturns || 0]);

  return <section className="directory-page" dir="rtl">
    <DirectoryPageHeader title={label} subtitle={isSupplier ? "إدارة الموردين وحساباتهم ومعلومات التواصل" : "إدارة العملاء والأرصدة والمدفوعات"} canAdd={canEdit} onAdd={openAdd} onImport={() => { window.sessionStorage.setItem("contacts-import-kind", isSupplier ? "SUPPLIER" : "CUSTOMER"); onNavigate?.("contacts-import"); }} onExport={() => downloadRowsAsCsv(`${isSupplier ? "suppliers" : "customers"}.xls`, exportHeaders, exportRows)} onPrint={() => window.print()} search={search} setSearch={setSearch} searchPlaceholder={`ابحث في ${label}...`} />
    <section className="directory-data-card">
      <div className="directory-table-tools"><label>عرض <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select> إدخال</label></div>
      {feedback ? <div className="notice success">{feedback}</div> : null}{error ? <div className="notice error">{error}</div> : null}
      <div className="directory-table-scroll"><table className="directory-table"><thead><tr><th>الإجراءات</th><th>معرف الاتصال</th><th>دور الحساب</th><th>الاسم</th><th>الهاتف</th><th>البريد</th>{isSupplier ? <><th>رصيد افتتاحي</th><th>مشتريات غير مدفوعة</th><th>مرجع المشتريات</th><th>إجمالي المستحق</th></> : <><th>الحد الائتماني</th><th>مستحقات العميل</th><th>إجمالي المبيعات</th><th>مرجع المبيعات</th></>}<th>تاريخ الإضافة</th></tr></thead><tbody>
        {visibleRows.map((row) => { const role = row.contactRole === "BOTH" || row.linkedCustomer || row.supplierProfile ? "BOTH" : (isSupplier ? "SUPPLIER" : "CUSTOMER"); return <tr key={row.id}><td><DirectoryActions onEdit={() => openEdit(row)} onDelete={() => remove(row)} canDelete={canDelete} /></td><td>{row.contactCode || `#${row.id}`}</td><td><span className={`directory-role-badge ${role.toLowerCase()}`}>{role === "BOTH" ? "عميل ومورد" : role === "SUPPLIER" ? "مورد" : "عميل"}</span></td><td><strong>{row.businessName || row.name}</strong>{row.businessName ? <small>{row.name}</small> : null}</td><td>{row.phone || "—"}</td><td>{row.email || "—"}</td>{isSupplier ? <><td>{formatCurrency(row.openingBalance)}</td><td>{formatCurrency(row.stats?.unpaidPurchases)}</td><td>{formatCurrency(row.stats?.totalPurchaseReturns)}</td><td><strong>{formatCurrency(row.stats?.totalDue)}</strong></td></> : <><td>{formatCurrency(row.creditLimit)}</td><td><strong>{formatCurrency(row.stats?.totalDue ?? row.accountBalance)}</strong></td><td>{formatCurrency(row.stats?.totalSales)}</td><td>{formatCurrency(row.stats?.totalReturns)}</td></>}<td>{formatDate(row.createdAt)}</td></tr>; })}
        {!loading && !visibleRows.length ? <tr><td colSpan="10" className="empty-state">لا توجد بيانات متاحة في الجدول</td></tr> : null}{loading ? <tr><td colSpan="10" className="empty-state">جارٍ تحميل البيانات...</td></tr> : null}
      </tbody></table></div>
      <div className="directory-table-footer">عرض {visibleRows.length} من {rows.length} إدخال</div>
    </section>
    {showEditor ? <PartyEditorModal kind={kind} form={form} setForm={setForm} editing={editing} busy={busy} onClose={() => setShowEditor(false)} onSave={save} /> : null}
  </section>;
}

function SuppliersPage({ currentUser, onNavigate }) { return <PartyDirectoryPage kind="supplier" currentUser={currentUser} onNavigate={onNavigate} />; }
function CustomersPage({ currentUser, onNavigate }) { return <PartyDirectoryPage kind="customer" currentUser={currentUser} onNavigate={onNavigate} />; }

function EmployeeEditorModal({ form, setForm, editing, busy, onClose, onSave }) {
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="directory-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="directory-editor-modal" onSubmit={onSave} dir="rtl"><header><div><strong>{editing ? "تعديل الموظف" : "إضافة موظف"}</strong><small>بيانات الدخول والعمل والاتصال في نموذج واحد.</small></div><button type="button" onClick={onClose}>✕</button></header><div className="directory-editor-scroll">
    <details className="directory-form-section" open><summary>بيانات الموظف وتسجيل الدخول</summary><div className="directory-form-grid"><DirectoryField label="الاسم *"><input autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} /></DirectoryField><DirectoryField label="اسم المستخدم"><input value={form.username} onChange={(e) => set("username", e.target.value)} /></DirectoryField><DirectoryField label="البريد الإلكتروني *"><input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></DirectoryField><DirectoryField label={editing ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور *"}><input type="password" required={!editing} minLength="6" value={form.password} onChange={(e) => set("password", e.target.value)} /></DirectoryField><DirectoryField label="الصلاحية"><select value={form.role} onChange={(e) => set("role", e.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></DirectoryField><DirectoryField label="الحالة"><select value={form.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}><option value="1">نشط</option><option value="0">موقوف</option></select></DirectoryField></div></details>
    <details className="directory-form-section" open><summary>بيانات العمل</summary><div className="directory-form-grid"><DirectoryField label="المسمى الوظيفي"><input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></DirectoryField><DirectoryField label="القسم"><input value={form.department} onChange={(e) => set("department", e.target.value)} /></DirectoryField><DirectoryField label="الراتب"><input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => set("salary", e.target.value)} /></DirectoryField><DirectoryField label="تاريخ التعيين"><input type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} /></DirectoryField><DirectoryField label="الرقم القومي"><input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} /></DirectoryField></div></details>
    <details className="directory-form-section"><summary>الاتصال والعنوان</summary><div className="directory-form-grid"><DirectoryField label="الموبايل"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></DirectoryField><DirectoryField label="موبايل بديل"><input value={form.alternatePhone} onChange={(e) => set("alternatePhone", e.target.value)} /></DirectoryField><DirectoryField label="الهاتف"><input value={form.telephone} onChange={(e) => set("telephone", e.target.value)} /></DirectoryField><DirectoryField label="العنوان الأول"><input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} /></DirectoryField><DirectoryField label="العنوان الثاني"><input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} /></DirectoryField><DirectoryField label="الحي"><input value={form.district} onChange={(e) => set("district", e.target.value)} /></DirectoryField><DirectoryField label="المدينة"><input value={form.city} onChange={(e) => set("city", e.target.value)} /></DirectoryField><DirectoryField label="المحافظة"><input value={form.state} onChange={(e) => set("state", e.target.value)} /></DirectoryField><DirectoryField label="الدولة"><input value={form.country} onChange={(e) => set("country", e.target.value)} /></DirectoryField><DirectoryField label="الرمز البريدي"><input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></DirectoryField></div></details>
    <details className="directory-form-section"><summary>الحقول المخصصة</summary><DirectoryCustomFields values={form.customFields} onChange={(value) => set("customFields", value)} /></details>
  </div><footer><button type="button" className="directory-close-button" onClick={onClose}>إغلاق</button><button type="submit" className="directory-save-button" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ"}</button></footer></form></div>;
}

function UsersPage({ currentUser }) {
  const [rows, setRows] = useState([]), [search, setSearch] = useState(""), [form, setForm] = useState(() => cloneDirectoryForm(emptyUserForm)), [editing, setEditing] = useState(null), [showEditor, setShowEditor] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [feedback, setFeedback] = useState("");
  async function loadRows(query = search) { try { const response = await API.get("/users", { params: query.trim() ? { q: query.trim() } : {} }); setRows(response.data.data || []); } catch (err) { setError(getErrorMessage(err, "تعذر تحميل الموظفين")); } }
  useEffect(() => { if (currentUser?.role !== "ADMIN") return; const timer = setTimeout(() => loadRows(search), 180); return () => clearTimeout(timer); }, [search, currentUser?.role]);
  if (currentUser?.role !== "ADMIN") return <section className="section-card"><div className="notice error">هذه الصفحة متاحة للمدير فقط.</div></section>;
  async function save(event) { event.preventDefault(); setBusy(true); setError(""); try { const payload = { ...form, salary: Number(form.salary || 0) }; if (editing) { await API.put(`/users/${editing.id}`, payload); if (form.password) await API.patch(`/users/${editing.id}/password`, { newPassword: form.password }); } else await API.post("/users", payload); setFeedback(`تم ${editing ? "تعديل" : "إضافة"} الموظف بنجاح.`); setShowEditor(false); await loadRows(); } catch (err) { setError(getErrorMessage(err, "تعذر حفظ الموظف")); } finally { setBusy(false); } }
  async function remove(row) { if (!window.confirm(`هل تريد حذف الموظف ${row.name}؟`)) return; try { await API.delete(`/users/${row.id}`); setFeedback("تم حذف الموظف."); await loadRows(); } catch (err) { setError(getErrorMessage(err, "تعذر حذف الموظف")); } }
  return <section className="directory-page" dir="rtl"><DirectoryPageHeader title="الموظفين" subtitle="إدارة الموظفين والصلاحيات وبيانات العمل" canAdd onAdd={() => { setEditing(null); setForm(cloneDirectoryForm(emptyUserForm)); setShowEditor(true); }} onExport={() => downloadRowsAsCsv("employees.xls", ["name", "username", "email", "role", "phone", "jobTitle", "department", "salary"], rows.map((row) => [row.name, row.username || "", row.email, row.role, row.phone || "", row.jobTitle || "", row.department || "", row.salary || 0]))} onPrint={() => window.print()} search={search} setSearch={setSearch} searchPlaceholder="ابحث في الموظفين..." /><section className="directory-data-card"><div className="directory-table-tools"><span>{rows.length} موظف</span></div>{feedback ? <div className="notice success">{feedback}</div> : null}{error ? <div className="notice error">{error}</div> : null}<div className="directory-table-scroll"><table className="directory-table"><thead><tr><th>الإجراءات</th><th>الاسم</th><th>اسم المستخدم</th><th>البريد</th><th>الموبايل</th><th>الوظيفة</th><th>القسم</th><th>الصلاحية</th><th>الحالة</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><DirectoryActions onEdit={() => { setEditing(row); setForm({ ...cloneDirectoryForm(emptyUserForm, row), password: "" }); setShowEditor(true); }} onDelete={() => remove(row)} canDelete={row.id !== currentUser.id} /></td><td><strong>{row.name}</strong></td><td>{row.username || "—"}</td><td>{row.email}</td><td>{row.phone || "—"}</td><td>{row.jobTitle || "—"}</td><td>{row.department || "—"}</td><td>{roleLabel(row.role)}</td><td><span className={row.active === false ? "directory-status inactive" : "directory-status"}>{row.active === false ? "موقوف" : "نشط"}</span></td></tr>)}{!rows.length ? <tr><td colSpan="9" className="empty-state">لا توجد بيانات متاحة في الجدول</td></tr> : null}</tbody></table></div></section>{showEditor ? <EmployeeEditorModal form={form} setForm={setForm} editing={editing} busy={busy} onClose={() => setShowEditor(false)} onSave={save} /> : null}</section>;
}

function ContactsPageShell({ titleAr, titleEn, subtitleAr, subtitleEn, pageKey, currentPage, onNavigate, children, filterBar = true, onFilterClick }) {
  const locale = getActiveLocale();
  const activeNav = CONTACTS_NAV_ITEMS.find((item) => item.key === currentPage);

  return (
    <section className="contacts-module-shell">
      <div className="contacts-module-header">
        <h2>{locale === "ar" ? titleAr : titleEn}</h2>
        <p>{locale === "ar" ? subtitleAr : subtitleEn}</p>
      </div>

      {filterBar ? (
        <section className="transaction-filter-panel contacts-filter-strip">
          <button type="button" className="contacts-filter-button unified-filter-summary" onClick={onFilterClick}>
            <FilterHeading label={locale === "ar" ? "التصفية" : "Filter"} />
          </button>
        </section>
      ) : null}

      <div className="contacts-main-layout">
        <div className="contacts-main-content">
          {children}
        </div>

        <aside className="contacts-subnav">
          {CONTACTS_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activeNav?.key ? "contacts-subnav-item active" : "contacts-subnav-item"}
              onClick={() => onNavigate(item.key)}
            >
              {locale === "ar" ? item.labelAr : item.labelEn}
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}

function SalesPageShell({ titleAr, titleEn, subtitleAr, subtitleEn, currentPage, onNavigate, children, filterBar = true, onFilterClick }) {
  const locale = getActiveLocale();
  const activeNav = SALES_NAV_ITEMS.find((item) => (item.target || item.key) === currentPage || item.key === currentPage);

  return (
    <section className="contacts-module-shell">
      <div className="contacts-module-header">
        <h2>{locale === "ar" ? titleAr : titleEn}</h2>
        <p>{locale === "ar" ? subtitleAr : subtitleEn}</p>
      </div>

      {filterBar ? (
        <section className="transaction-filter-panel contacts-filter-strip">
          <button type="button" className="contacts-filter-button unified-filter-summary" onClick={onFilterClick}>
            <FilterHeading label={locale === "ar" ? "التصفية" : "Filter"} />
          </button>
        </section>
      ) : null}

      <div className="contacts-main-layout">
        <div className="contacts-main-content">
          {children}
        </div>

        <aside className="contacts-subnav">
          {SALES_NAV_ITEMS.map((item) => {
            const target = item.target || item.key;
            const isActive = item.key === activeNav?.key || target === currentPage;
            return (
              <button
                key={item.key}
                type="button"
                className={isActive ? "contacts-subnav-item active" : "contacts-subnav-item"}
                onClick={() => onNavigate(target)}
              >
                {locale === "ar" ? item.labelAr : item.labelEn}
              </button>
            );
          })}
        </aside>
      </div>
    </section>
  );
}

function PurchasesPageShell({ titleAr, titleEn, subtitleAr, subtitleEn, currentPage, onNavigate, children, filterBar = true, onFilterClick }) {
  const locale = getActiveLocale();
  const activeNav = PURCHASES_NAV_ITEMS.find((item) => (item.target || item.key) === currentPage || item.key === currentPage);

  return (
    <section className="contacts-module-shell">
      <div className="contacts-module-header">
        <h2>{locale === "ar" ? titleAr : titleEn}</h2>
        <p>{locale === "ar" ? subtitleAr : subtitleEn}</p>
      </div>

      {filterBar ? (
        <section className="transaction-filter-panel contacts-filter-strip">
          <button type="button" className="contacts-filter-button unified-filter-summary" onClick={onFilterClick}>
            <FilterHeading label={locale === "ar" ? "التصفية" : "Filter"} />
          </button>
        </section>
      ) : null}

      <div className="contacts-main-layout">
        <div className="contacts-main-content">
          {children}
        </div>

        <aside className="contacts-subnav">
          {PURCHASES_NAV_ITEMS.map((item) => {
            const target = item.target || item.key;
            const isActive = item.key === activeNav?.key || target === currentPage;
            return (
              <button
                key={item.key}
                type="button"
                className={isActive ? "contacts-subnav-item active" : "contacts-subnav-item"}
                onClick={() => onNavigate(target)}
              >
                {locale === "ar" ? item.labelAr : item.labelEn}
              </button>
            );
          })}
        </aside>
      </div>
    </section>
  );
}

function ContactsToolbar({
  titleAr,
  titleEn,
  search,
  setSearch,
  addLabelAr = "إضافة",
  addLabelEn = "Add",
  onAdd,
  onExportCsv,
  onExportExcel,
  onPrint,
  onToggleColumns,
  searchInputRef
}) {
  const locale = getActiveLocale();
  const safeAdd = onAdd || (() => window.alert(locale === "ar" ? "سيتم تفعيل هذا الزر بالكامل في الخطوة التالية." : "This action will be expanded next."));
  const safeExportCsv = onExportCsv || (() => window.alert(locale === "ar" ? "لا توجد بيانات جاهزة للتصدير هنا الآن." : "No exportable data here yet."));
  const safeExportExcel = onExportExcel || (() => window.alert(locale === "ar" ? "لا توجد بيانات جاهزة للتصدير هنا الآن." : "No exportable data here yet."));
  const safePrint = onPrint || (() => window.print());
  const safeToggleColumns = onToggleColumns || (() => window.alert(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns action is active."));
  return (
    <div className="contacts-toolbar-head">
      <div className="contacts-toolbar-title">
        <h3>{locale === "ar" ? titleAr : titleEn}</h3>
      </div>
      <button type="button" className="contacts-add-button" onClick={safeAdd}>
        <span>＋</span>
        {locale === "ar" ? addLabelAr : addLabelEn}
      </button>
      <div className="contacts-toolbar-controls">
        <div className="contacts-table-actions">
          <button type="button" className="contacts-pill-button" onClick={safeExportCsv}>CSV</button>
          <button type="button" className="contacts-pill-button" onClick={safeExportExcel}>Excel</button>
          <button type="button" className="contacts-pill-button" onClick={safePrint}>{locale === "ar" ? "طباعة" : "Print"}</button>
          <button type="button" className="contacts-pill-button" onClick={safeToggleColumns}>{locale === "ar" ? "رؤية العمود" : "Columns"}</button>
        </div>
        <div className="contacts-search-line">
          <input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "ar" ? "بحث..." : "Search..."} />
          <div className="contacts-page-size">
            <span>{locale === "ar" ? "عرض" : "Show"}</span>
            <select defaultValue="25">
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactsDataCard({ children }) {
  return <section className="section-card contacts-data-card">{children}</section>;
}

function ContactsSuppliersDirectoryPage({ currentUser, currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const searchInputRef = useRef(null);

  async function loadSuppliers(query = search) {
    setLoading(true);
    const response = await API.get("/suppliers", { params: query.trim() ? { q: query.trim() } : {} });
    setSuppliers(response.data.data || []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    API.get("/suppliers", { params: search.trim() ? { q: search.trim() } : {} })
      .then((response) => { if (active) setSuppliers(response.data.data || []); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search]);

  return (
    <ContactsPageShell
      titleAr="الموردين"
      titleEn="Suppliers"
      subtitleAr="ادارة الموردين والعملاء"
      subtitleEn="Manage customers and suppliers"
      pageKey="contacts-suppliers"
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="الكل"
          titleEn="All suppliers"
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={async () => {
            const values = promptForFields([
              { key: "name", label: locale === "ar" ? "اسم المورد" : "Supplier name" },
              { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
              { key: "email", label: locale === "ar" ? "البريد" : "Email" },
              { key: "address", label: locale === "ar" ? "العنوان" : "Address" }
            ]);
            if (!values?.name) return;
            await API.post("/suppliers", values);
            setFeedback(locale === "ar" ? "تمت إضافة المورد." : "Supplier created.");
            await loadSuppliers();
          }}
          onExportCsv={() => downloadRowsAsCsv("suppliers.csv", ["id", "name", "phone", "email", "address"], suppliers.map((item) => [item.id, item.name, item.phone || "", item.email || "", item.address || ""]))}
          onExportExcel={() => downloadRowsAsCsv("suppliers.xls", ["id", "name", "phone", "email", "address"], suppliers.map((item) => [item.id, item.name, item.phone || "", item.email || "", item.address || ""]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "زر الأعمدة يعمل، وسيتم توسيعه أكثر لاحقًا." : "Columns toggle is active and will be expanded later.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        {loading ? <div className="empty-state">{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</div> : (
          <div className="table-shell contacts-table-shell">
            <table>
              <thead>
                <tr>
                  <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                  <th>{locale === "ar" ? "معرف الاتصال" : "Contact id"}</th>
                  <th>{locale === "ar" ? "اسم المشروع" : "Business name"}</th>
                  <th>{locale === "ar" ? "الإسم" : "Name"}</th>
                  <th>{locale === "ar" ? "الرصيد الافتتاحي" : "Opening balance"}</th>
                  <th>{locale === "ar" ? "أضيف في" : "Added at"}</th>
                  <th>{locale === "ar" ? "العنوان" : "Address"}</th>
                  <th>{locale === "ar" ? "الموبايل" : "Mobile"}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length ? suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><button type="button" className="contacts-option-chip" onClick={async () => {
                      const action = window.prompt(locale === "ar" ? "view / edit / delete" : "view / edit / delete", "view");
                      if (action === "view") {
                        window.alert(`${supplier.name}\n${supplier.phone || "-"}\n${supplier.email || "-"}\n${supplier.address || "-"}`);
                      } else if (action === "edit") {
                        const values = promptForFields([
                          { key: "name", label: locale === "ar" ? "اسم المورد" : "Supplier name" },
                          { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
                          { key: "email", label: locale === "ar" ? "البريد" : "Email" },
                          { key: "address", label: locale === "ar" ? "العنوان" : "Address" }
                        ], supplier);
                        if (!values) return;
                        await API.put(`/suppliers/${supplier.id}`, values);
                        setFeedback(locale === "ar" ? "تم تعديل المورد." : "Supplier updated.");
                        await loadSuppliers();
                      } else if (action === "delete") {
                        await API.delete(`/suppliers/${supplier.id}`);
                        setFeedback(locale === "ar" ? "تم حذف المورد." : "Supplier deleted.");
                        await loadSuppliers();
                      }
                    }}>{locale === "ar" ? "خيارات" : "Options"}</button></td>
                    <td>{supplier.id}</td>
                    <td>{supplier.name || "-"}</td>
                    <td>{supplier.name || "-"}</td>
                    <td className={Number(customer.accountBalance || 0) > 0 ? "ops-negative" : ""}>{formatCurrency(customer.accountBalance || 0)}</td>
                    <td>{supplier.createdAt ? formatDate(supplier.createdAt) : "-"}</td>
                    <td>{supplier.address || "-"}</td>
                    <td>{supplier.phone || "-"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="8" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsCustomersDirectoryPage({ currentUser, currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const searchInputRef = useRef(null);

  async function loadCustomers(query = search) {
    setLoading(true);
    const response = await API.get("/customers", { params: query.trim() ? { q: query.trim() } : {} });
    setCustomers(response.data.data || []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    API.get("/customers", { params: search.trim() ? { q: search.trim() } : {} })
      .then((response) => { if (active) setCustomers(response.data.data || []); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search]);

  return (
    <ContactsPageShell
      titleAr="العملاء"
      titleEn="Customers"
      subtitleAr="ادارة الموردين والعملاء"
      subtitleEn="Manage customers and suppliers"
      pageKey="contacts-customers"
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="الكل"
          titleEn="All customers"
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={async () => {
            const values = promptForFields([
              { key: "name", label: locale === "ar" ? "اسم العميل" : "Customer name" },
              { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
              { key: "address", label: locale === "ar" ? "العنوان" : "Address" }
            ]);
            if (!values?.name) return;
            await API.post("/customers", values);
            setFeedback(locale === "ar" ? "تمت إضافة العميل." : "Customer created.");
            await loadCustomers();
          }}
          onExportCsv={() => downloadRowsAsCsv("customers.csv", ["id", "name", "phone", "address"], customers.map((item) => [item.id, item.name, item.phone || "", item.address || ""]))}
          onExportExcel={() => downloadRowsAsCsv("customers.xls", ["id", "name", "phone", "address"], customers.map((item) => [item.id, item.name, item.phone || "", item.address || ""]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "زر الأعمدة يعمل، وسيتم توسيعه أكثر لاحقًا." : "Columns toggle is active and will be expanded later.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        {loading ? <div className="empty-state">{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</div> : (
          <div className="table-shell contacts-table-shell">
            <table>
              <thead>
                <tr>
                  <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                  <th>{locale === "ar" ? "معرف الاتصال" : "Contact id"}</th>
                  <th>{locale === "ar" ? "اسم المشروع" : "Business name"}</th>
                  <th>{locale === "ar" ? "الإسم" : "Name"}</th>
                  <th>{locale === "ar" ? "فترة الدفع" : "Pay term"}</th>
                  <th>{locale === "ar" ? "الرصيد الافتتاحي" : "Opening balance"}</th>
                  <th>{locale === "ar" ? "أضيف في" : "Added at"}</th>
                </tr>
              </thead>
              <tbody>
                {customers.length ? customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><button type="button" className="contacts-option-chip" onClick={async () => {
                      const action = window.prompt(locale === "ar" ? "view / edit / delete" : "view / edit / delete", "view");
                      if (action === "view") {
                        window.alert(`${customer.name}\n${customer.phone || "-"}\n${customer.address || "-"}`);
                      } else if (action === "edit") {
                        const values = promptForFields([
                          { key: "name", label: locale === "ar" ? "اسم العميل" : "Customer name" },
                          { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
                          { key: "address", label: locale === "ar" ? "العنوان" : "Address" }
                        ], customer);
                        if (!values) return;
                        await API.put(`/customers/${customer.id}`, values);
                        setFeedback(locale === "ar" ? "تم تعديل العميل." : "Customer updated.");
                        await loadCustomers();
                      } else if (action === "delete") {
                        await API.delete(`/customers/${customer.id}`);
                        setFeedback(locale === "ar" ? "تم حذف العميل." : "Customer deleted.");
                        await loadCustomers();
                      }
                    }}>{locale === "ar" ? "خيارات" : "Options"}</button></td>
                    <td>C{String(customer.id).padStart(5, "0")}</td>
                    <td>-</td>
                    <td>{customer.name || "-"}</td>
                    <td>-</td>
                    <td>{formatCurrency(0)}</td>
                    <td>{customer.createdAt ? formatDate(customer.createdAt) : "-"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsUsersDirectoryPage({ currentUser, currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const searchInputRef = useRef(null);

  async function loadUsers(query = search) {
    setLoading(true);
    const response = await API.get("/users", { params: query.trim() ? { q: query.trim() } : {} });
    setUsers(response.data.data || []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    API.get("/users", { params: search.trim() ? { q: search.trim() } : {} })
      .then((response) => { if (active) setUsers(response.data.data || []); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search]);

  return (
    <ContactsPageShell
      titleAr="الموظفين"
      titleEn="Employees"
      subtitleAr="الجهات ذات العلاقة"
      subtitleEn="Related parties"
      pageKey="contacts-users"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="جميع الموظفين"
          titleEn="All employees"
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={async () => {
            const values = promptForFields([
              { key: "name", label: locale === "ar" ? "اسم الموظف" : "Employee name" },
              { key: "email", label: locale === "ar" ? "البريد" : "Email" },
              { key: "password", label: locale === "ar" ? "كلمة المرور" : "Password", defaultValue: "123456" },
              { key: "role", label: locale === "ar" ? "الدور ADMIN/PHARMACIST/CASHIER" : "Role ADMIN/PHARMACIST/CASHIER", defaultValue: "PHARMACIST" }
            ]);
            if (!values?.name || !values?.email || !values?.password) return;
            await API.post("/users", values);
            setFeedback(locale === "ar" ? "تمت إضافة الموظف." : "Employee created.");
            await loadUsers();
          }}
          onExportCsv={() => downloadRowsAsCsv("users.csv", ["id", "name", "email", "role"], users.map((item) => [item.id, item.name, item.email || "", item.role || ""]))}
          onExportExcel={() => downloadRowsAsCsv("users.xls", ["id", "name", "email", "role"], users.map((item) => [item.id, item.name, item.email || "", item.role || ""]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "زر الأعمدة يعمل، وسيتم توسيعه أكثر لاحقًا." : "Columns toggle is active and will be expanded later.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        {loading ? <div className="empty-state">{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</div> : (
          <div className="table-shell contacts-table-shell">
            <table>
              <thead>
                <tr>
                  <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                  <th>{locale === "ar" ? "البريد" : "Email"}</th>
                  <th>{locale === "ar" ? "الصلاحية" : "Role"}</th>
                  <th>{locale === "ar" ? "الإسم" : "Name"}</th>
                  <th>{locale === "ar" ? "اسم المستخدم للدخول" : "Username"}</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="contacts-inline-actions">
                        <button type="button" className="contacts-option-chip" onClick={() => window.alert(`${user.name}\n${user.email}\n${roleLabel(user.role)}`)}>{locale === "ar" ? "فحص" : "View"}</button>
                        <button type="button" className="contacts-option-chip secondary" onClick={async () => {
                          const values = promptForFields([
                            { key: "name", label: locale === "ar" ? "اسم الموظف" : "Employee name" },
                            { key: "email", label: locale === "ar" ? "البريد" : "Email" },
                            { key: "role", label: locale === "ar" ? "الدور ADMIN/PHARMACIST/CASHIER" : "Role ADMIN/PHARMACIST/CASHIER" }
                          ], user);
                          if (!values) return;
                          await API.put(`/users/${user.id}`, values);
                          setFeedback(locale === "ar" ? "تم تعديل الموظف." : "Employee updated.");
                          await loadUsers();
                        }}>{locale === "ar" ? "تعديل" : "Edit"}</button>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td>{user.name}</td>
                    <td>{String(user.email || "").split("@")[0] || user.name}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsRolesPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [rows, setRows] = useState(() => readLocalCollection("pharmacore-contact-roles", ROLE_OPTIONS));

  return (
    <ContactsPageShell
      titleAr="الأدوار والصلاحيات"
      titleEn="Roles and permissions"
      subtitleAr="ادارة الادوار والصلاحيات"
      subtitleEn="Manage roles and permissions"
      pageKey="contacts-roles"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="كل الادوار والصلاحيات"
          titleEn="All roles and permissions"
          search={search}
          setSearch={setSearch}
          onAdd={() => {
            const value = window.prompt(locale === "ar" ? "اسم الدور الجديد" : "New role name", "");
            if (!value) return;
            const next = [...rows, value];
            setRows(next);
            writeLocalCollection("pharmacore-contact-roles", next);
            setFeedback(locale === "ar" ? "تمت إضافة الدور." : "Role added.");
          }}
          onExportCsv={() => downloadRowsAsCsv("roles.csv", ["role"], rows.map((row) => [row]))}
          onExportExcel={() => downloadRowsAsCsv("roles.xls", ["role"], rows.map((row) => [row]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns action is active.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                <th>{locale === "ar" ? "الأدوار والصلاحيات" : "Roles and permissions"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((role) => !search.trim() || roleLabel(role).toLowerCase().includes(search.trim().toLowerCase()) || String(role).toLowerCase().includes(search.trim().toLowerCase())).map((role) => (
                <tr key={role}>
                  <td>
                    <div className="contacts-inline-actions">
                      <button type="button" className="contacts-option-chip secondary" onClick={() => {
                        const value = window.prompt(locale === "ar" ? "تعديل الدور" : "Edit role", role);
                        if (!value) return;
                        const next = rows.map((item) => item === role ? value : item);
                        setRows(next);
                        writeLocalCollection("pharmacore-contact-roles", next);
                        setFeedback(locale === "ar" ? "تم تعديل الدور." : "Role updated.");
                      }}>{locale === "ar" ? "تعديل" : "Edit"}</button>
                      <button type="button" className="contacts-option-chip danger" onClick={() => {
                        const next = rows.filter((item) => item !== role);
                        setRows(next);
                        writeLocalCollection("pharmacore-contact-roles", next);
                        setFeedback(locale === "ar" ? "تم حذف الدور." : "Role deleted.");
                      }}>{locale === "ar" ? "حذف" : "Delete"}</button>
                    </div>
                  </td>
                  <td>{roleLabel(role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsGroupsPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [groups, setGroups] = useState(() => readLocalCollection("pharmacore-customer-groups", []));
  return (
    <ContactsPageShell
      titleAr="مجموعات العملاء"
      titleEn="Customer groups"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-groups"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="جميع مجموعات العملاء"
          titleEn="All customer groups"
          search={search}
          setSearch={setSearch}
          onAdd={() => {
            const values = promptForFields([
              { key: "name", label: locale === "ar" ? "اسم المجموعة" : "Group name" },
              { key: "rate", label: locale === "ar" ? "النسبة %" : "Rate %" },
              { key: "priceGroup", label: locale === "ar" ? "مجموعة الأسعار" : "Price group" }
            ]);
            if (!values?.name) return;
            const next = [...groups, { id: Date.now(), ...values }];
            setGroups(next);
            writeLocalCollection("pharmacore-customer-groups", next);
            setFeedback(locale === "ar" ? "تمت إضافة المجموعة." : "Group added.");
          }}
          onExportCsv={() => downloadRowsAsCsv("customer-groups.csv", ["name", "rate", "priceGroup"], groups.map((row) => [row.name, row.rate, row.priceGroup]))}
          onExportExcel={() => downloadRowsAsCsv("customer-groups.xls", ["name", "rate", "priceGroup"], groups.map((row) => [row.name, row.rate, row.priceGroup]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns action is active.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                <th>{locale === "ar" ? "مجموعات الأسعار" : "Price groups"}</th>
                <th>{locale === "ar" ? "النسبة المئوية للحساب (%)" : "Calculation percentage (%)"}</th>
                <th>{locale === "ar" ? "اسم مجموعة العملاء" : "Customer group"}</th>
              </tr>
            </thead>
            <tbody>
              {groups.filter((item) => !search.trim() || item.name?.includes(search.trim())).length ? groups.filter((item) => !search.trim() || item.name?.includes(search.trim())).map((group) => (
                <tr key={group.id}>
                  <td><button type="button" className="contacts-option-chip danger" onClick={() => {
                    const next = groups.filter((item) => item.id !== group.id);
                    setGroups(next);
                    writeLocalCollection("pharmacore-customer-groups", next);
                    setFeedback(locale === "ar" ? "تم حذف المجموعة." : "Group deleted.");
                  }}>{locale === "ar" ? "حذف" : "Delete"}</button></td>
                  <td>{group.priceGroup || "-"}</td>
                  <td>{group.rate || "-"}</td>
                  <td>{group.name}</td>
                </tr>
              )) : <tr><td colSpan="4" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsAgentsPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [agents, setAgents] = useState(() => readLocalCollection("pharmacore-sales-agents", []));
  return (
    <ContactsPageShell
      titleAr="مندوبي المبيعات"
      titleEn="Sales agents"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-agents"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="الكل"
          titleEn="All agents"
          search={search}
          setSearch={setSearch}
          onAdd={() => {
            const values = promptForFields([
              { key: "name", label: locale === "ar" ? "اسم المندوب" : "Agent name" },
              { key: "email", label: locale === "ar" ? "البريد" : "Email" },
              { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
              { key: "address", label: locale === "ar" ? "العنوان" : "Address" },
              { key: "commission", label: locale === "ar" ? "نسبة العمولة %" : "Commission %" }
            ]);
            if (!values?.name) return;
            const next = [...agents, { id: Date.now(), ...values }];
            setAgents(next);
            writeLocalCollection("pharmacore-sales-agents", next);
            setFeedback(locale === "ar" ? "تمت إضافة المندوب." : "Agent added.");
          }}
          onExportCsv={() => downloadRowsAsCsv("sales-agents.csv", ["name", "email", "phone", "address", "commission"], agents.map((row) => [row.name, row.email, row.phone, row.address, row.commission]))}
          onExportExcel={() => downloadRowsAsCsv("sales-agents.xls", ["name", "email", "phone", "address", "commission"], agents.map((row) => [row.name, row.email, row.phone, row.address, row.commission]))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns action is active.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "خيار" : "Actions"}</th>
                <th>{locale === "ar" ? "نسبة عمولة المبيعات (%)" : "Sales commission (%)"}</th>
                <th>{locale === "ar" ? "العنوان" : "Address"}</th>
                <th>{locale === "ar" ? "رقم الاتصال" : "Phone"}</th>
                <th>{locale === "ar" ? "الايميل" : "Email"}</th>
                <th>{locale === "ar" ? "الاسم" : "Name"}</th>
              </tr>
            </thead>
            <tbody>
              {agents.filter((item) => !search.trim() || item.name?.includes(search.trim())).length ? agents.filter((item) => !search.trim() || item.name?.includes(search.trim())).map((agent) => (
                <tr key={agent.id}>
                  <td><button type="button" className="contacts-option-chip danger" onClick={() => {
                    const next = agents.filter((item) => item.id !== agent.id);
                    setAgents(next);
                    writeLocalCollection("pharmacore-sales-agents", next);
                    setFeedback(locale === "ar" ? "تم حذف المندوب." : "Agent deleted.");
                  }}>{locale === "ar" ? "حذف" : "Delete"}</button></td>
                  <td>{agent.commission || "-"}</td>
                  <td>{agent.address || "-"}</td>
                  <td>{agent.phone || "-"}</td>
                  <td>{agent.email || "-"}</td>
                  <td>{agent.name}</td>
                </tr>
              )) : <tr><td colSpan="6" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsSummaryReportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  return (
    <ContactsPageShell
      titleAr="العملاء & الموردين تقارير اضافية"
      titleEn="Customer and supplier extra reports"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-report"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <ContactsDataCard>
        <ContactsToolbar titleAr="" titleEn="" search={search} setSearch={setSearch} />
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "الدين" : "Due"}</th>
                <th>{locale === "ar" ? "الرصيد الافتتاحي المستحق" : "Opening due"}</th>
                <th>{locale === "ar" ? "إجمالي مرجع المبيعات" : "Sales return total"}</th>
                <th>{locale === "ar" ? "إجمالي المبيعات" : "Sales total"}</th>
                <th>{locale === "ar" ? "إجمالي مرجع المشتريات" : "Purchase return total"}</th>
                <th>{locale === "ar" ? "إجمالي المشتريات" : "Purchase total"}</th>
                <th>{locale === "ar" ? "جهات الاتصال" : "Contacts"}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan="7" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
              <tr className="contacts-total-row">
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{locale === "ar" ? "المجموع:" : "Total:"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsRegisterReportPage({ currentUser, currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  return (
    <ContactsPageShell
      titleAr="تقرير مناوبة الموظفين"
      titleEn="Register report"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-register-report"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <ContactsDataCard>
        <ContactsToolbar titleAr="" titleEn="" search={search} setSearch={setSearch} />
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "وقت البداية" : "Start time"}</th>
                <th>{locale === "ar" ? "وقت الانتهاء" : "End time"}</th>
                <th>{locale === "ar" ? "الفرع" : "Branch"}</th>
                <th>{locale === "ar" ? "المستخدم" : "User"}</th>
                <th>{locale === "ar" ? "مجموع الدفع عن طريق البطاقة" : "Card total"}</th>
                <th>{locale === "ar" ? "مجموع الشبكات" : "Network total"}</th>
                <th>{locale === "ar" ? "مجموع النقد" : "Cash total"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatDate(new Date())}</td>
                <td>{formatDate(new Date())}</td>
                <td>ziad</td>
                <td>{currentUser.name}<br />{currentUser.email}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
              </tr>
              <tr className="contacts-total-row">
                <td colSpan="4">{locale === "ar" ? "المجموع:" : "Total:"}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function ContactsSalesAgentReportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  return (
    <ContactsPageShell
      titleAr="تقرير مندوبى المبيعات"
      titleEn="Sales agent report"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-sales-agent-report"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <section className="section-card contacts-summary-banner">
        <h3>{locale === "ar" ? "ملخص" : "Summary"}</h3>
        <p>{locale === "ar" ? `إجمالي المبيعات: ${formatCurrency(0)} - إجمالي مرجع المبيعات: ${formatCurrency(0)} - مجموع المصاريف: ${formatCurrency(0)}` : `Sales total: ${formatCurrency(0)} - Sales returns: ${formatCurrency(0)} - Expenses: ${formatCurrency(0)}`}</p>
      </section>
      <ContactsDataCard>
        <ContactsToolbar titleAr="" titleEn="" search={search} setSearch={setSearch} />
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "تاريخ" : "Date"}</th>
                <th>{locale === "ar" ? "الفاتورة رقم" : "Invoice #"}</th>
                <th>{locale === "ar" ? "اسم العميل" : "Customer"}</th>
                <th>{locale === "ar" ? "الفرع" : "Branch"}</th>
                <th>{locale === "ar" ? "حالة الدفع" : "Payment status"}</th>
                <th>{locale === "ar" ? "المبلغ" : "Amount"}</th>
                <th>{locale === "ar" ? "مدفوعات المبيعات" : "Sales payments"}</th>
                <th>{locale === "ar" ? "المتبقى" : "Remaining"}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan="8" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
              <tr className="contacts-total-row">
                <td colSpan="5">{locale === "ar" ? "المجموع:" : "Total:"}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
                <td>{formatCurrency(0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function parseContactImportMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\(([^)]+)\)/, "-$1");
  const numericParts = normalized.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  const parsed = Number(String(numericParts.at(-1) || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapContactImportRows(rows, fileName, forcedKind = "AUTO") {
  const extractedRows = Array.isArray(rows?.[0]?.data)
    ? rows[0].data
    : Array.isArray(rows?.data)
      ? rows.data
      : Array.isArray(rows?.rows)
        ? rows.rows
        : rows;
  const matrix = (Array.isArray(extractedRows) ? extractedRows : []).map((row) =>
    Array.isArray(row) ? row : (row && typeof row === "object" ? Object.values(row) : [row])
  );
  if (!matrix.length) return [];
  const nameHeaders = new Set(["name", "الاسم", "الإسم", "اسمالعميل", "اسمالمورد"]);
  let headerIndex = matrix.slice(0, 12).findIndex((row) => row.some((cell) => nameHeaders.has(normalizeImportHeader(cell))));
  if (headerIndex < 0) headerIndex = 0;
  const headers = matrix[headerIndex].map(normalizeImportHeader);
  const findColumn = (...aliases) => headers.findIndex((header) => aliases.map(normalizeImportHeader).includes(header));
  const columns = {
    type: findColumn("type", "classification", "التصنيف", "نوع السجل", "النوع"),
    contactCode: findColumn("contactCode", "contact id", "معرف الاتصال", "كود الاتصال"),
    businessName: findColumn("businessName", "company", "اسم المشروع", "اسم الشركة"),
    name: findColumn("name", "الاسم", "الإسم", "اسم العميل", "اسم المورد"),
    phone: findColumn("phone", "mobile", "الموبايل", "الهاتف", "رقم الموبايل"),
    email: findColumn("email", "البريد", "البريد الإلكتروني"),
    address: findColumn("address", "العنوان"),
    openingBalance: findColumn("openingBalance", "الرصيد الافتتاحي"),
    totalDue: findColumn("totalDue", "اجمالي المستحق", "إجمالي المستحق"),
    paymentTerm: findColumn("paymentTerm", "فترة الدفع"),
    custom1: findColumn("custom1", "حقل مخصص 1"),
    custom2: findColumn("custom2", "حقل مخصص 2")
  };
  const read = (row, column) => column >= 0 ? row[column] : "";
  const sourceText = `${fileName} ${matrix.slice(0, headerIndex + 1).flat().join(" ")}`.toLowerCase();
  const inferredKind = sourceText.includes("مورد") || sourceText.includes("supplier") ? "SUPPLIER" : "CUSTOMER";

  function normalizeRowKind(value) {
    if (forcedKind !== "AUTO") return forcedKind;
    const text = String(value || "").trim().toLowerCase();
    if (["2", "supplier", "مورد"].includes(text)) return "SUPPLIER";
    if (["3", "both", "كلاهما", "عميل ومورد", "مورد وعميل"].includes(text)) return "BOTH";
    if (["1", "customer", "عميل"].includes(text)) return "CUSTOMER";
    return inferredKind;
  }

  return matrix.slice(headerIndex + 1).map((row, index) => {
    const name = String(read(row, columns.name) || "").trim();
    if (!name || normalizeImportHeader(name).includes("المجموع")) return null;
    const openingBalance = parseContactImportMoney(read(row, columns.openingBalance));
    const totalDue = parseContactImportMoney(read(row, columns.totalDue));
    const paymentTermText = String(read(row, columns.paymentTerm) || "").trim();
    const normalizedTerm = paymentTermText.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    return {
      _row: headerIndex + index + 2,
      kind: normalizeRowKind(read(row, columns.type)),
      name,
      contactCode: String(read(row, columns.contactCode) || "").trim(),
      businessName: String(read(row, columns.businessName) || "").trim(),
      phone: String(read(row, columns.phone) || "").trim(),
      email: String(read(row, columns.email) || "").trim(),
      addressLine1: String(read(row, columns.address) || "").trim(),
      openingBalance: totalDue !== 0 ? totalDue : openingBalance,
      paymentTermValue: Math.max(0, Number(normalizedTerm.match(/\d+/)?.[0] || 0)),
      paymentTermUnit: paymentTermText.includes("شهر") || paymentTermText.toLowerCase().includes("month") ? "MONTHS" : "DAYS",
      customFields: { field1: String(read(row, columns.custom1) || "").trim(), field2: String(read(row, columns.custom2) || "").trim() }
    };
  }).filter(Boolean);
}

function ContactsImportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [importKind, setImportKind] = useState(() => {
    const savedKind = window.sessionStorage.getItem("contacts-import-kind");
    window.sessionStorage.removeItem("contacts-import-kind");
    return ["CUSTOMER", "SUPPLIER", "BOTH"].includes(savedKind) ? savedKind : "AUTO";
  });
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState([]);
  const importColumns = [
    ["1", "الإسم", "إلزامي — ويُكتشف حتى لو كان رأس الجدول في الصف الثاني"],
    ["2", "معرف الاتصال / الموبايل", "يُستخدمان لمنع تكرار العميل أو المورد"],
    ["3", "إجمالي المستحق", "يُعتمد كرصد الحساب الحالي عند وجوده"],
    ["4", "الرصيد الافتتاحي", "يُستخدم إذا لم يوجد إجمالي مستحق"],
    ["5", "فترة الدفع / العنوان / الحقول المخصصة", "تُحفظ تلقائيًا عند وجودها"]
  ];

  function downloadTemplate() {
    const csv = "type,contactCode,businessName,name,phone,email,address,openingBalance,totalDue,paymentTerm,custom1,custom2\n1,CUS-001,,عميل نقدي,01000000000,,,0,0,0 يوم,,\n2,SUP-001,,مورد افتراضي,01100000000,,,0,0,30 يوم,,";
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "contacts-import-template.csv");
  }

  async function readImportFile(file) {
    setSelectedFileName(file?.name || "");
    setPreviewRows([]);
    setFeedback("");
    setError("");
    setRowErrors([]);
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("حجم الملف أكبر من 20 ميجابايت.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const rows = extension === "csv" || extension === "txt" ? parseImportRows(await file.text()) : await readXlsxFile(file, { sheet: 1 });
      const mapped = mapContactImportRows(rows, file.name, importKind);
      if (!mapped.length) throw new Error("لم يتم العثور على صفوف صالحة. تأكد من وجود عمود الإسم.");
      setPreviewRows(mapped);
      setFeedback(`تمت قراءة ${mapped.length} سجل وجاهزة للمراجعة قبل الاستيراد.`);
    } catch (err) {
      setError(getErrorMessage(err, err.message || "تعذر قراءة الملف"));
    }
  }

  async function importRecords() {
    if (!previewRows.length) return;
    setImporting(true);
    setError("");
    setFeedback("");
    setRowErrors([]);
    let imported = 0;
    let skipped = 0;
    const failures = [];
    try {
      const [customersResponse, suppliersResponse] = await Promise.all([API.get("/customers"), API.get("/suppliers")]);
      const duplicateKeys = (rows) => new Set(rows.flatMap((row) => [
        row.contactCode ? `code:${String(row.contactCode).trim().toLowerCase()}` : "",
        row.phone ? `phone:${String(row.phone).trim()}` : "",
        `name:${String(row.name || "").trim().toLowerCase()}`
      ]).filter(Boolean));
      const customers = customersResponse.data.data || [];
      const suppliers = suppliersResponse.data.data || [];
      const customerKeys = duplicateKeys(customers);
      const supplierKeys = duplicateKeys(suppliers);
      const normalized = (value) => String(value || "").trim().toLowerCase();
      const matchingParty = (parties, row) => parties.find((party) =>
        (row.contactCode && normalized(party.contactCode) === normalized(row.contactCode)) ||
        (row.phone && normalized(party.phone) === normalized(row.phone)) ||
        (row.name && normalized(party.name) === normalized(row.name))
      );

      for (const row of previewRows) {
        try {
          const endpoint = row.kind === "SUPPLIER" || row.kind === "BOTH" ? "/suppliers" : "/customers";
          const keySet = endpoint === "/suppliers" ? supplierKeys : customerKeys;
          const candidateKeys = [
            row.contactCode ? `code:${row.contactCode.toLowerCase()}` : "",
            row.phone ? `phone:${row.phone}` : "",
            `name:${row.name.toLowerCase()}`
          ].filter(Boolean);
          if (candidateKeys.some((key) => keySet.has(key))) { skipped += 1; continue; }
          const linkedCustomer = endpoint === "/suppliers" ? matchingParty(customers, row) : null;
          const linkedSupplier = endpoint === "/customers" ? matchingParty(suppliers, row) : null;
          const linkedAsBoth = Boolean(linkedCustomer || linkedSupplier || row.kind === "BOTH");
          await API.post(endpoint, {
            name: row.name,
            businessName: row.businessName,
            phone: row.phone,
            email: row.email,
            addressLine1: row.addressLine1,
            contactCode: row.contactCode,
            contactRole: linkedAsBoth ? "BOTH" : (endpoint === "/suppliers" ? "SUPPLIER" : "CUSTOMER"),
            linkedCustomerId: linkedCustomer?.id,
            linkedSupplierId: linkedSupplier?.id,
            openingBalance: row.openingBalance,
            customerOpeningBalance: row.kind === "BOTH" ? 0 : undefined,
            paymentTermValue: row.paymentTermValue,
            paymentTermUnit: row.paymentTermUnit,
            customFields: row.customFields
          });
          candidateKeys.forEach((key) => keySet.add(key));
          imported += 1;
        } catch (err) {
          failures.push(`صف ${row._row} — ${row.name}: ${getErrorMessage(err, err.message || "فشل الاستيراد")}`);
        }
      }
      setRowErrors(failures);
      setFeedback(`اكتمل الاستيراد: تمت إضافة ${imported}، وتخطي ${skipped} مكرر${failures.length ? `، وفشل ${failures.length}` : ""}.`);
      if (!failures.length) setPreviewRows([]);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر بدء الاستيراد"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <ContactsPageShell
      titleAr="استيراد العملاء والموردين"
      titleEn="Import customers and suppliers"
      subtitleAr=""
      subtitleEn=""
      pageKey="contacts-import"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <section className="section-card contacts-import-card">
        <div className="contacts-import-head">
          <div className="contacts-import-file">
            <strong>{locale === "ar" ? "ملف للاستيراد:" : "Import file:"}</strong>
            <select value={importKind} onChange={(event) => { setImportKind(event.target.value); setPreviewRows([]); setSelectedFileName(""); }}>
              <option value="AUTO">تحديد النوع تلقائيًا من اسم ومحتوى الملف</option>
              <option value="CUSTOMER">عملاء</option>
              <option value="SUPPLIER">موردون</option>
              <option value="BOTH">عميل ومورد</option>
            </select>
            <input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => readImportFile(event.target.files?.[0])} />
            <small>{selectedFileName || (locale === "ar" ? "لم يتم اختيار ملف" : "No file chosen")}</small>
            <small className="danger-text">{locale === "ar" ? "الحد الأقصى لحجم الملف: 20 ميجابايت" : "Maximum file size: 20 MB"}</small>
          </div>
          <button type="button" className="contacts-template-button" onClick={downloadTemplate}>
            {locale === "ar" ? "تنزيل ملف القالب" : "Download template"}
          </button>
        </div>
        {feedback ? <div className="notice success">{feedback}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {previewRows.length ? <>
          <div className="contacts-import-preview-head"><strong>معاينة قبل الحفظ — {previewRows.length} سجل</strong><button type="button" className="primary-button" disabled={importing} onClick={importRecords}>{importing ? "جارٍ الاستيراد..." : "بدء الاستيراد وربط الحسابات"}</button></div>
          <div className="table-shell contacts-import-preview"><table><thead><tr><th>الصف</th><th>النوع</th><th>معرف الاتصال</th><th>الاسم</th><th>الموبايل</th><th>رصيد الحساب المستورد</th></tr></thead><tbody>{previewRows.slice(0, 100).map((row) => <tr key={`${row._row}-${row.name}`}><td>{row._row}</td><td>{{ CUSTOMER: "عميل", SUPPLIER: "مورد", BOTH: "عميل ومورد" }[row.kind]}</td><td>{row.contactCode || "—"}</td><td><strong>{row.name}</strong></td><td>{row.phone || "—"}</td><td>{formatCurrency(row.openingBalance)}</td></tr>)}</tbody></table></div>
          {previewRows.length > 100 ? <small>يتم عرض أول 100 سجل فقط، وسيتم استيراد جميع السجلات.</small> : null}
        </> : null}
        {rowErrors.length ? <div className="contacts-import-errors"><strong>صفوف تحتاج مراجعة</strong>{rowErrors.slice(0, 30).map((message) => <span key={message}>{message}</span>)}</div> : null}
      </section>

      <ContactsDataCard>
        <div className="contacts-import-guide">
          <h3>{locale === "ar" ? "تعليمات" : "Instructions"}</h3>
          <p>{locale === "ar" ? "يمكن رفع ملف العملاء أو الموردين الذي أرسلته كما هو. يكتشف النظام صف العناوين تلقائيًا، ويعمل أيضًا مع CSV حتى لو اختلف ترتيب الأعمدة." : "Upload customer or supplier Excel/CSV files. Headers and column order are detected automatically."}</p>
        </div>
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "رقم العمود" : "Column #"}</th>
                <th>{locale === "ar" ? "اسم العمود" : "Column name"}</th>
                <th>{locale === "ar" ? "تعليم" : "Instruction"}</th>
              </tr>
            </thead>
            <tbody>
              {importColumns.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </ContactsPageShell>
  );
}

function SalesSimpleRecordsPage({
  titleAr,
  titleEn,
  subtitleAr,
  subtitleEn,
  currentPage,
  onNavigate,
  toolbarTitleAr,
  toolbarTitleEn,
  addLabelAr,
  addLabelEn,
  addFields = [],
  storageKey,
  exportName,
  columns,
  emptyMessageAr,
  emptyMessageEn
}) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [records, setRecords] = useState(() => readLocalCollection(storageKey, []));
  const [filters, setFilters] = useState({ ...emptyTransactionFilters });
  const searchInputRef = useRef(null);

  function saveRecords(nextRecords) {
    setRecords(nextRecords);
    writeLocalCollection(storageKey, nextRecords);
  }

  const dateKeys = columns.filter((column) => String(column.key).toLowerCase().includes("date")).map((column) => column.key);
  const amountKeys = columns.filter((column) => /(amount|total|price|salary)/i.test(column.key)).map((column) => column.key);
  const showPaymentFilter = columns.some((column) => /(paymentmethod|paymentstatus)/i.test(column.key));
  const paymentOptions = Array.from(new Set(records.map((record) => record.paymentMethod || record.paymentStatus).filter(Boolean)));
  const visibleRecords = records.filter((record) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || columns.some((column) => String(record[column.key] ?? "").toLowerCase().includes(term));
    return matchesSearch && transactionRecordMatchesFilters(record, filters, dateKeys, amountKeys);
  });

  return (
    <SalesPageShell
      titleAr={titleAr}
      titleEn={titleEn}
      subtitleAr={subtitleAr}
      subtitleEn={subtitleEn}
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr={toolbarTitleAr}
          titleEn={toolbarTitleEn}
          addLabelAr={addLabelAr}
          addLabelEn={addLabelEn}
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={addFields.length ? () => {
            const values = promptForFields(addFields.map((field) => ({ key: field.key, label: locale === "ar" ? field.labelAr : field.labelEn })));
            if (!values) return;
            saveRecords([
              {
                id: `${storageKey}-${Date.now()}`,
                date: formatDateInput(new Date()),
                addedBy: "Admin",
                ...values
              },
              ...records
            ]);
            setFeedback(locale === "ar" ? "تمت إضافة سجل جديد." : "New record added.");
          } : undefined}
          onExportCsv={() => downloadRowsAsCsv(`${exportName}.csv`, columns.map((column) => locale === "ar" ? column.labelAr : column.labelEn), visibleRecords.map((record) => columns.map((column) => record[column.key] ?? "")))}
          onExportExcel={() => downloadRowsAsCsv(`${exportName}.xls`, columns.map((column) => locale === "ar" ? column.labelAr : column.labelEn), visibleRecords.map((record) => columns.map((column) => record[column.key] ?? "")))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns button is active.")}
        />

        {feedback ? <div className="notice success">{feedback}</div> : null}

        <TransactionFilterPanel filters={filters} setFilters={setFilters} showDate={Boolean(dateKeys.length)} showAmount={Boolean(amountKeys.length)} showPayment={showPaymentFilter} paymentOptions={paymentOptions} />

        <div className="contacts-toolbar-controls" style={{ paddingTop: 0 }}>
          <div className="contacts-page-size">
            <span>{locale === "ar" ? "عرض" : "Show"}</span>
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
          </div>
        </div>

        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{locale === "ar" ? column.labelAr : column.labelEn}</th>
                ))}
                <th>{locale === "ar" ? "خيار" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length ? visibleRecords.slice(0, Number(pageSize)).map((record) => (
                <tr key={record.id}>
                  {columns.map((column) => (
                    <td key={column.key}>{record[column.key] ?? "-"}</td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="contacts-option-chip danger"
                      onClick={() => {
                        saveRecords(records.filter((item) => item.id !== record.id));
                        setFeedback(locale === "ar" ? "تم حذف السجل." : "Record deleted.");
                      }}
                    >
                      {locale === "ar" ? "حذف" : "Delete"}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length + 1} className="empty-state">
                    {locale === "ar" ? emptyMessageAr : emptyMessageEn}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </SalesPageShell>
  );
}

function SalesPricingPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="عروض الأسعار"
      titleEn="Price offers"
      subtitleAr="قائمة عروض الأسعار"
      subtitleEn="Quotation list"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="الكل"
      toolbarTitleEn="All quotations"
      addLabelAr="إضافة عرض سعر"
      addLabelEn="Add quotation"
      storageKey="pharmacore-sales-pricing"
      exportName="sales-pricing"
      addFields={[
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "phone", labelAr: "رقم الاتصال", labelEn: "Phone" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "quantity", labelAr: "الكمية", labelEn: "Quantity" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "phone", labelAr: "رقم الاتصال", labelEn: "Phone" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "quantity", labelAr: "الكمية", labelEn: "Quantity" },
        { key: "addedBy", labelAr: "أضيفت بواسطة", labelEn: "Added by" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesReturnsPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="مرجع المبيعات"
      titleEn="Sales return"
      subtitleAr="إدارة فواتير المرتجع"
      subtitleEn="Manage sales returns"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="مرجع المبيعات"
      toolbarTitleEn="Sales return"
      addLabelAr="إضافة مرتجع"
      addLabelEn="Add return"
      storageKey="pharmacore-sales-returns"
      exportName="sales-returns"
      addFields={[
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "originalSale", labelAr: "المبيعات الأصل", labelEn: "Original sale" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "originalSale", labelAr: "المبيعات الأصل", labelEn: "Original sale" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesDetailedReportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [activeTab, setActiveTab] = useState("detailed");
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ ...emptyTransactionFilters });
  const searchInputRef = useRef(null);

  const tabs = locale === "ar"
    ? [
      { key: "detailed", label: "مفصلة" },
      { key: "with-purchase", label: "مفصل (مع الشراء)" },
      { key: "summary", label: "تقرير مجمع" },
      { key: "by-group", label: "فرز حسب المجموعة" },
      { key: "by-brand", label: "حسب الماركة" }
    ]
    : [
      { key: "detailed", label: "Detailed" },
      { key: "with-purchase", label: "With purchase" },
      { key: "summary", label: "Summary" },
      { key: "by-group", label: "By group" },
      { key: "by-brand", label: "By brand" }
    ];

  async function loadSalesReport() {
    setLoading(true);
    setError("");
    try {
      const response = await API.get("/sales");
      setSales(response.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sales report"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSalesReport();
  }, []);

  const rows = sales.flatMap((sale) => (sale.items || []).map((item) => ({
    id: sale.id + "-" + item.id,
    itemName: item.medicine?.name || "-",
    barcode: item.medicine?.barcode || "-",
    category: item.medicine?.category || "",
    manufacturer: item.medicine?.manufacturer || "",
    customerName: sale.customer?.name || (locale === "ar" ? "زبون نقدي" : "Cash customer"),
    contactId: sale.customer?.phone || "-",
    invoiceNumber: sale.invoiceNumber,
    date: sale.createdAt,
    quantity: item.quantity,
    saleUnit: item.saleUnit,
    unitPrice: item.unitPrice,
    discount: sale.discount || 0,
    tax: 0,
    priceWithTax: item.unitPrice,
    total: item.totalPrice,
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    branch: "ziad (BL0001)"
  })));

  const visibleRows = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [row.itemName, row.barcode, row.customerName, row.invoiceNumber, row.paymentMethod, row.status]
      .some((value) => String(value || "").toLowerCase().includes(needle));
    return matchesSearch && transactionRecordMatchesFilters(row, filters, ["date"], ["total"]);
  });
  const paymentOptions = Array.from(new Set(rows.map((row) => row.paymentMethod).filter(Boolean)));
  const partyOptions = Array.from(new Set(rows.map((row) => row.customerName).filter(Boolean)));
  const branchOptions = Array.from(new Set(rows.map((row) => row.branch).filter(Boolean)));
  const customerGroupOptions = Array.from(new Set(rows.map((row) => row.customerGroup).filter(Boolean)));
  const categoryOptions = Array.from(new Set(rows.map((row) => row.category).filter(Boolean)));
  const brandOptions = Array.from(new Set(rows.map((row) => row.manufacturer).filter(Boolean)));

  const total = visibleRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const exportRows = visibleRows.map((row) => [
    row.itemName,
    row.barcode,
    row.customerName,
    row.contactId,
    row.invoiceNumber,
    formatDate(row.date),
    row.quantity + " " + getUnitLabel(row.saleUnit),
    row.unitPrice,
    row.discount,
    row.tax,
    row.priceWithTax,
    row.total,
    row.paymentMethod
  ]);
  const headers = locale === "ar"
    ? ["صنف", "SKU الباركود", "اسم العميل", "معرف الاتصال", "الفاتورة رقم", "تاريخ", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "السعر شامل الضريبة", "المجموع", "طريقة الدفع"]
    : ["Item", "SKU barcode", "Customer", "Contact id", "Invoice #", "Date", "Quantity", "Unit price", "Discount", "Tax", "Price incl. tax", "Total", "Payment method"];

  return (
    <SalesPageShell
      titleAr="تقرير المبيعات مفصل"
      titleEn="Detailed sales report"
      subtitleAr="تقارير المبيعات التفصيلية"
      subtitleEn="Detailed sales reports"
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
      filterBar={false}
    >
      <ContactsDataCard>
        <div className="sales-report-tabs">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className={activeTab === tab.key ? "sales-report-tab active" : "sales-report-tab"} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        <TransactionFilterPanel filters={filters} setFilters={setFilters} showDate search={search} setSearch={setSearch} partyOptions={partyOptions} customerGroupOptions={customerGroupOptions} showCustomerGroup branchOptions={branchOptions} categoryOptions={categoryOptions} brandOptions={brandOptions} referenceLayout />

        <div className="contacts-toolbar-controls" style={{ paddingTop: 0 }}>
          <div className="contacts-table-actions">
            <button type="button" className="contacts-pill-button" onClick={() => downloadRowsAsCsv("sales-detailed-report.csv", headers, exportRows)}>CSV</button>
            <button type="button" className="contacts-pill-button" onClick={() => downloadRowsAsCsv("sales-detailed-report.xls", headers, exportRows)}>Excel</button>
            <button type="button" className="contacts-pill-button" onClick={() => window.print()}>{locale === "ar" ? "طباعة" : "Print"}</button>
            <button type="button" className="contacts-pill-button" onClick={loadSalesReport}>{locale === "ar" ? "تحديث" : "Refresh"}</button>
          </div>
          <div className="contacts-search-line">
            <div className="contacts-page-size">
              <span>{locale === "ar" ? "عرض" : "Show"}</span>
              <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
            </div>
          </div>
        </div>

        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                {headers.map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="empty-state">{locale === "ar" ? "جارٍ تحميل المبيعات..." : "Loading sales..."}</td></tr>
              ) : visibleRows.length ? visibleRows.slice(0, Number(pageSize)).map((row) => (
                <tr key={row.id}>
                  <td>{row.itemName}</td>
                  <td>{row.barcode}</td>
                  <td>{row.customerName}</td>
                  <td>{row.contactId}</td>
                  <td>{row.invoiceNumber}</td>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.quantity} {getUnitLabel(row.saleUnit)}</td>
                  <td>{formatCurrency(row.unitPrice)}</td>
                  <td>{formatCurrency(row.discount)}</td>
                  <td>{formatCurrency(row.tax)}</td>
                  <td>{formatCurrency(row.priceWithTax)}</td>
                  <td>{formatCurrency(row.total)}</td>
                  <td>{row.paymentMethod}</td>
                </tr>
              )) : (
                <tr><td colSpan="13" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="contacts-total-row">
                <td colSpan="11">{locale === "ar" ? "المجموع:" : "Total:"}</td>
                <td>{formatCurrency(total)}</td>
                <td>-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ContactsDataCard>
    </SalesPageShell>
  );
}

function SalesAddPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  return (
    <SalesPageShell
      titleAr="إضافة مبيعات"
      titleEn="Add sales"
      subtitleAr="بدء عملية بيع جديدة"
      subtitleEn="Start a new sale"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <ContactsDataCard>
        <div className="contacts-summary-banner">
          <h3>{locale === "ar" ? "إضافة مبيعات" : "Add sales"}</h3>
          <p>{locale === "ar" ? "استخدم هذا القسم لبدء عملية جديدة، ثم افتح شاشة الكاشير لتنفيذ البيع بسرعة." : "Use this section to start a new sale, then open cashier to complete it quickly."}</p>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => onNavigate("sales")}>
            {locale === "ar" ? "فتح الكاشير" : "Open cashier"}
          </button>
        </div>
      </ContactsDataCard>
    </SalesPageShell>
  );
}

function SalesListPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="كل المبيعات"
      titleEn="All sales"
      subtitleAr="جميع فواتير البيع"
      subtitleEn="All sales invoices"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="كل المبيعات"
      toolbarTitleEn="All sales"
      addLabelAr="إضافة مبيعات"
      addLabelEn="Add sale"
      storageKey="pharmacore-sales-list"
      exportName="sales-list"
      addFields={[
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesRegisterPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="سجل الكاشير"
      titleEn="Cash register log"
      subtitleAr="عمليات الصندوق والكاشير"
      subtitleEn="Cashier register activity"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="سجل الكاشير"
      toolbarTitleEn="Cash register"
      addLabelAr="إضافة حركة"
      addLabelEn="Add entry"
      storageKey="pharmacore-sales-register"
      exportName="sales-register"
      addFields={[
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "cashierName", labelAr: "اسم الكاشير", labelEn: "Cashier name" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
        { key: "paymentMethod", labelAr: "طريقة الدفع", labelEn: "Payment method" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "invoiceNumber", labelAr: "الفاتورة رقم", labelEn: "Invoice number" },
        { key: "cashierName", labelAr: "اسم الكاشير", labelEn: "Cashier name" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
        { key: "paymentMethod", labelAr: "طريقة الدفع", labelEn: "Payment method" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesDraftsPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="مسودات البيع"
      titleEn="Sales drafts"
      subtitleAr="المسودات غير المكتملة"
      subtitleEn="Incomplete sale drafts"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="مسودات البيع"
      toolbarTitleEn="Sales drafts"
      addLabelAr="إضافة مسودة"
      addLabelEn="Add draft"
      storageKey="pharmacore-sales-drafts"
      exportName="sales-drafts"
      addFields={[
        { key: "draftNumber", labelAr: "رقم المسودة", labelEn: "Draft number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "draftNumber", labelAr: "رقم المسودة", labelEn: "Draft number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesShippingPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="الشحن والتوصيل"
      titleEn="Shipping and delivery"
      subtitleAr="متابعة الطلبات المشحونة"
      subtitleEn="Track shipped orders"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="الشحن والتوصيل"
      toolbarTitleEn="Shipping and delivery"
      addLabelAr="إضافة شحنة"
      addLabelEn="Add shipment"
      storageKey="pharmacore-sales-shipping"
      exportName="sales-shipping"
      addFields={[
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "address", labelAr: "العنوان", labelEn: "Address" },
        { key: "status", labelAr: "الحالة", labelEn: "Status" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "customerName", labelAr: "اسم العميل", labelEn: "Customer name" },
        { key: "address", labelAr: "العنوان", labelEn: "Address" },
        { key: "status", labelAr: "الحالة", labelEn: "Status" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesPromotionsPage({ currentPage, onNavigate }) {
  return (
    <SalesSimpleRecordsPage
      titleAr="خصومات ترويجية"
      titleEn="Promotions"
      subtitleAr="إدارة العروض والخصومات"
      subtitleEn="Manage offers and discounts"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="خصومات ترويجية"
      toolbarTitleEn="Promotions"
      addLabelAr="إضافة خصم"
      addLabelEn="Add promotion"
      storageKey="pharmacore-sales-promotions"
      exportName="sales-promotions"
      addFields={[
        { key: "title", labelAr: "اسم الخصم", labelEn: "Promotion title" },
        { key: "discount", labelAr: "نسبة الخصم", labelEn: "Discount %" },
        { key: "startDate", labelAr: "تاريخ البدء", labelEn: "Start date" },
        { key: "endDate", labelAr: "تاريخ الانتهاء", labelEn: "End date" }
      ]}
      columns={[
        { key: "title", labelAr: "اسم الخصم", labelEn: "Promotion title" },
        { key: "discount", labelAr: "نسبة الخصم", labelEn: "Discount %" },
        { key: "startDate", labelAr: "تاريخ البدء", labelEn: "Start date" },
        { key: "endDate", labelAr: "تاريخ الانتهاء", labelEn: "End date" },
        { key: "addedBy", labelAr: "أضيفت بواسطة", labelEn: "Added by" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function SalesImportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [selectedFileName, setSelectedFileName] = useState("");

  return (
    <SalesPageShell
      titleAr="استيراد بيانات المبيعات"
      titleEn="Import sales data"
      subtitleAr="رفع ملف مبيعات واستعراض القالب"
      subtitleEn="Upload sales file and review template"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <ContactsDataCard>
        <div className="contacts-import-card">
          <label className="contacts-import-upload">
            <span>{locale === "ar" ? "ملف الاستيراد" : "Import file"}</span>
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name || "")}
            />
            <small>{selectedFileName || (locale === "ar" ? "لم يتم اختيار ملف بعد" : "No file selected yet")}</small>
          </label>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => window.alert(locale === "ar" ? "تم تفعيل الإرسال، أرفق الملف أولاً." : "Import action is active. Attach file first.")}>
              {locale === "ar" ? "إرسال" : "Upload"}
            </button>
            <button type="button" className="secondary-button" onClick={() => downloadRowsAsCsv("sales-import-template.csv", ["invoice_number", "customer_name", "amount"], [])}>
              {locale === "ar" ? "تنزيل ملف القالب" : "Download template"}
            </button>
          </div>
        </div>
      </ContactsDataCard>
    </SalesPageShell>
  );
}

function PurchaseSimpleRecordsPage({
  titleAr,
  titleEn,
  subtitleAr,
  subtitleEn,
  currentPage,
  onNavigate,
  toolbarTitleAr,
  toolbarTitleEn,
  addLabelAr,
  addLabelEn,
  addFields = [],
  storageKey,
  exportName,
  columns,
  emptyMessageAr,
  emptyMessageEn
}) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [records, setRecords] = useState(() => readLocalCollection(storageKey, []));
  const [filters, setFilters] = useState({ ...emptyTransactionFilters });
  const searchInputRef = useRef(null);

  function saveRecords(nextRecords) {
    setRecords(nextRecords);
    writeLocalCollection(storageKey, nextRecords);
  }

  const dateKeys = columns.filter((column) => String(column.key).toLowerCase().includes("date")).map((column) => column.key);
  const amountKeys = columns.filter((column) => /(amount|total|price|salary)/i.test(column.key)).map((column) => column.key);
  const showPaymentFilter = columns.some((column) => /(paymentmethod|paymentstatus)/i.test(column.key));
  const paymentOptions = Array.from(new Set(records.map((record) => record.paymentMethod || record.paymentStatus).filter(Boolean)));
  const visibleRecords = records.filter((record) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || columns.some((column) => String(record[column.key] ?? "").toLowerCase().includes(term));
    return matchesSearch && transactionRecordMatchesFilters(record, filters, dateKeys, amountKeys);
  });

  return (
    <PurchasesPageShell
      titleAr={titleAr}
      titleEn={titleEn}
      subtitleAr={subtitleAr}
      subtitleEn={subtitleEn}
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
      filterBar={false}
    >
      <ContactsDataCard>
        <ContactsToolbar
          titleAr={toolbarTitleAr}
          titleEn={toolbarTitleEn}
          addLabelAr={addLabelAr}
          addLabelEn={addLabelEn}
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={addFields.length ? () => {
            const values = promptForFields(addFields.map((field) => ({ key: field.key, label: locale === "ar" ? field.labelAr : field.labelEn })));
            if (!values) return;
            saveRecords([
              { id: `${storageKey}-${Date.now()}`, date: formatDateInput(new Date()), addedBy: "Admin", ...values },
              ...records
            ]);
            setFeedback(locale === "ar" ? "تمت إضافة سجل جديد." : "New record added.");
          } : undefined}
          onExportCsv={() => downloadRowsAsCsv(`${exportName}.csv`, columns.map((column) => locale === "ar" ? column.labelAr : column.labelEn), visibleRecords.map((record) => columns.map((column) => record[column.key] ?? "")))}
          onExportExcel={() => downloadRowsAsCsv(`${exportName}.xls`, columns.map((column) => locale === "ar" ? column.labelAr : column.labelEn), visibleRecords.map((record) => columns.map((column) => record[column.key] ?? "")))}
          onPrint={() => window.print()}
          onToggleColumns={() => setFeedback(locale === "ar" ? "تم تفعيل زر الأعمدة." : "Columns button is active.")}
        />
        {feedback ? <div className="notice success">{feedback}</div> : null}
        <TransactionFilterPanel filters={filters} setFilters={setFilters} showDate={Boolean(dateKeys.length)} showAmount={Boolean(amountKeys.length)} showPayment={showPaymentFilter} paymentOptions={paymentOptions} />
        <div className="contacts-toolbar-controls" style={{ paddingTop: 0 }}>
          <div className="contacts-page-size">
            <span>{locale === "ar" ? "عرض" : "Show"}</span>
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
          </div>
        </div>
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{locale === "ar" ? column.labelAr : column.labelEn}</th>
                ))}
                <th>{locale === "ar" ? "خيار" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length ? visibleRecords.slice(0, Number(pageSize)).map((record) => (
                <tr key={record.id}>
                  {columns.map((column) => (
                    <td key={column.key}>{record[column.key] ?? "-"}</td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="contacts-option-chip danger"
                      onClick={() => {
                        saveRecords(records.filter((item) => item.id !== record.id));
                        setFeedback(locale === "ar" ? "تم حذف السجل." : "Record deleted.");
                      }}
                    >
                      {locale === "ar" ? "حذف" : "Delete"}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length + 1} className="empty-state">
                    {locale === "ar" ? emptyMessageAr : emptyMessageEn}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ContactsDataCard>
    </PurchasesPageShell>
  );
}

function PurchasesListPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [purchases, setPurchases] = useState([]);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ ...emptyTransactionFilters });
  const searchInputRef = useRef(null);

  async function loadPurchases() {
    setLoading(true);
    setError("");
    try {
      const response = await API.get("/purchases");
      setPurchases(response.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load purchases"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  const rows = purchases.map((purchase) => ({
    id: purchase.id,
    date: purchase.createdAt,
    referenceNumber: purchase.invoiceNumber,
    branch: "ziad",
    supplier: purchase.supplier?.name || "-",
    purchaseStatus: purchase.status || "COMPLETED",
    paymentStatus: purchase.paymentStatus || "-",
    total: purchase.totalAmount || 0,
    addedBy: "Admin"
  }));

  const visibleRows = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [row.referenceNumber, row.supplier, row.purchaseStatus, row.paymentStatus]
      .some((value) => String(value || "").toLowerCase().includes(needle));
    return matchesSearch && transactionRecordMatchesFilters(row, filters, ["date"], ["total"]);
  });
  const paymentOptions = Array.from(new Set(rows.map((row) => row.paymentStatus).filter(Boolean)));
  const total = visibleRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const headers = locale === "ar"
    ? ["تاريخ", "الرقم المرجعي", "الفرع", "المورد", "حالة الشراء", "حالة الدفع", "المجموع", "أضيفت بواسطة"]
    : ["Date", "Reference number", "Branch", "Supplier", "Purchase status", "Payment status", "Total", "Added by"];
  const exportRows = visibleRows.map((row) => [formatDate(row.date), row.referenceNumber, row.branch, row.supplier, row.purchaseStatus, row.paymentStatus, row.total, row.addedBy]);

  return (
    <PurchasesPageShell titleAr="المشتريات" titleEn="Purchases" subtitleAr="جميع فواتير المشتريات" subtitleEn="All purchase invoices" currentPage={currentPage} onNavigate={onNavigate} onFilterClick={() => searchInputRef.current?.focus()} filterBar={false}>
      <ContactsDataCard>
        <ContactsToolbar
          titleAr="جميع المشتريات"
          titleEn="All purchases"
          addLabelAr="إضافة مشتريات"
          addLabelEn="Add purchase"
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          onAdd={() => onNavigate("purchases-add")}
          onExportCsv={() => downloadRowsAsCsv("purchases-list.csv", headers, exportRows)}
          onExportExcel={() => downloadRowsAsCsv("purchases-list.xls", headers, exportRows)}
          onPrint={() => window.print()}
          onToggleColumns={loadPurchases}
        />
        {error ? <div className="notice error">{error}</div> : null}
        <TransactionFilterPanel filters={filters} setFilters={setFilters} showDate showAmount showPayment paymentOptions={paymentOptions} />
        <div className="contacts-toolbar-controls" style={{ paddingTop: 0 }}>
          <div className="contacts-page-size">
            <span>{locale === "ar" ? "عرض" : "Show"}</span>
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
          </div>
        </div>
        <div className="table-shell contacts-table-shell">
          <table>
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">{locale === "ar" ? "جارٍ تحميل المشتريات..." : "Loading purchases..."}</td></tr>
              ) : visibleRows.length ? visibleRows.slice(0, Number(pageSize)).map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.referenceNumber}</td>
                  <td>{row.branch}</td>
                  <td>{row.supplier}</td>
                  <td>{row.purchaseStatus}</td>
                  <td>{row.paymentStatus}</td>
                  <td>{formatCurrency(row.total)}</td>
                  <td>{row.addedBy}</td>
                </tr>
              )) : (
                <tr><td colSpan="8" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td></tr>
              )}
            </tbody>
            <tfoot><tr className="contacts-total-row"><td colSpan="6">{locale === "ar" ? "المجموع:" : "Total:"}</td><td>{formatCurrency(total)}</td><td>-</td></tr></tfoot>
          </table>
        </div>
      </ContactsDataCard>
    </PurchasesPageShell>
  );
}

function PurchasesReturnPage({ currentPage, onNavigate }) {
  return (
    <PurchaseSimpleRecordsPage
      titleAr="مرجع مشتريات"
      titleEn="Purchase return"
      subtitleAr="جميع مراجعات المشتريات"
      subtitleEn="All purchase returns"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="جميع مراجعات المشتريات"
      toolbarTitleEn="All purchase returns"
      addLabelAr="إضافة مرجع"
      addLabelEn="Add return"
      storageKey="pharmacore-purchases-return"
      exportName="purchases-return"
      addFields={[
        { key: "returnNumber", labelAr: "الرقم المرجعي", labelEn: "Return number" },
        { key: "originalPurchase", labelAr: "المشتريات الأصل", labelEn: "Original purchase" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "supplier", labelAr: "المورد", labelEn: "Supplier" },
        { key: "total", labelAr: "المجموع", labelEn: "Total" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "returnNumber", labelAr: "الرقم المرجعي", labelEn: "Return number" },
        { key: "originalPurchase", labelAr: "المشتريات الأصل", labelEn: "Original purchase" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "supplier", labelAr: "المورد", labelEn: "Supplier" },
        { key: "total", labelAr: "المجموع", labelEn: "Total" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function PurchasesReportPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const searchInputRef = useRef(null);

  return (
    <PurchasesPageShell
      titleAr="تقرير المشتريات"
      titleEn="Purchase report"
      subtitleAr="تقرير المنتجات المشتراة"
      subtitleEn="Purchased items report"
      currentPage={currentPage}
      onNavigate={onNavigate}
      onFilterClick={() => searchInputRef.current?.focus()}
    >
      <ContactsDataCard>
        <div className="contacts-toolbar-controls" style={{ paddingTop: 0 }}>
          <div className="contacts-table-actions">
            <button type="button" className="contacts-pill-button" onClick={() => downloadRowsAsCsv("purchase-report.csv", ["item"], [])}>CSV</button>
            <button type="button" className="contacts-pill-button" onClick={() => downloadRowsAsCsv("purchase-report.xls", ["item"], [])}>Excel</button>
            <button type="button" className="contacts-pill-button" onClick={() => window.print()}>{locale === "ar" ? "طباعة" : "Print"}</button>
            <button type="button" className="contacts-pill-button" onClick={() => window.alert(locale === "ar" ? "زر الأعمدة يعمل." : "Columns button is active.")}>{locale === "ar" ? "رؤية العمود" : "Columns"}</button>
          </div>
          <div className="contacts-search-line">
            <input ref={searchInputRef} data-unified-medicine-search="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "ar" ? MEDICINE_SEARCH_PLACEHOLDER_AR : MEDICINE_SEARCH_PLACEHOLDER_EN} />
            <div className="contacts-page-size">
              <span>{locale === "ar" ? "عرض" : "Show"}</span>
              <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
            </div>
          </div>
        </div>
        <div className="table-shell contacts-table-shell">
          <table>
            <thead>
              <tr>
                <th>{locale === "ar" ? "صنف" : "Item"}</th>
                <th>{locale === "ar" ? "SKU الباركود" : "SKU barcode"}</th>
                <th>{locale === "ar" ? "المورد" : "Supplier"}</th>
                <th>{locale === "ar" ? "الرقم المرجعي" : "Reference number"}</th>
                <th>{locale === "ar" ? "تاريخ" : "Date"}</th>
                <th>{locale === "ar" ? "الكمية" : "Quantity"}</th>
                <th>{locale === "ar" ? "مجموع الوحدات المملوكة" : "Owned units total"}</th>
                <th>{locale === "ar" ? "سعر شراء الوحدة" : "Unit purchase price"}</th>
                <th>{locale === "ar" ? "المجموع" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="9" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="contacts-total-row">
                <td colSpan="8">{locale === "ar" ? "المجموع:" : "Total:"}</td>
                <td>{formatCurrency(0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ContactsDataCard>
    </PurchasesPageShell>
  );
}

function ExpensesListPage({ currentPage, onNavigate }) {
  return (
    <PurchaseSimpleRecordsPage
      titleAr="المصاريف"
      titleEn="Expenses"
      subtitleAr="كل المصاريف"
      subtitleEn="All expenses"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="كل المصاريف"
      toolbarTitleEn="All expenses"
      addLabelAr="إضافة"
      addLabelEn="Add"
      storageKey="pharmacore-expenses-list"
      exportName="expenses-list"
      addFields={[
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "expenseCategory", labelAr: "فئة المصروف", labelEn: "Expense category" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "paymentStatus", labelAr: "حالة الدفع", labelEn: "Payment status" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
        { key: "amountDue", labelAr: "المبلغ المستحق", labelEn: "Amount due" },
        { key: "paidBy", labelAr: "صرف بواسطة", labelEn: "Paid by" },
        { key: "vendor", labelAr: "مورد او عميل", labelEn: "Vendor or customer" },
        { key: "reason", labelAr: "سبب الصرف", labelEn: "Reason" }
      ]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "referenceNumber", labelAr: "الرقم المرجعي", labelEn: "Reference number" },
        { key: "expenseCategory", labelAr: "فئة المصروف", labelEn: "Expense category" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "paymentStatus", labelAr: "حالة الدفع", labelEn: "Payment status" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
        { key: "amountDue", labelAr: "المبلغ المستحق", labelEn: "Amount due" },
        { key: "paidBy", labelAr: "صرف بواسطة", labelEn: "Paid by" },
        { key: "vendor", labelAr: "مورد او عميل", labelEn: "Vendor or customer" },
        { key: "reason", labelAr: "سبب الصرف", labelEn: "Reason" },
        { key: "addedBy", labelAr: "أضيفت بواسطة", labelEn: "Added by" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function ExpensesAddPage({ currentPage, onNavigate }) {
  const locale = getActiveLocale();
  const [form, setForm] = useState({
    branch: "ziad (BL0001)",
    expenseCategory: "",
    subCategory: "",
    paidTo: "",
    paidBy: "غير ذلك",
    date: new Date().toLocaleString(locale === "ar" ? "ar-EG" : "en-GB"),
    referenceNumber: "",
    amount: "",
    reason: "",
    paymentMethod: "نقدا",
    paidOn: new Date().toLocaleString(locale === "ar" ? "ar-EG" : "en-GB"),
    amountPaid: "0.00",
    account: locale === "ar" ? "الصندوق الرئيسي (الرصيد:0.00)" : "Main cashbox (balance: 0.00)"
  });
  const [feedback, setFeedback] = useState("");

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitExpense(event) {
    event.preventDefault();
    const expenses = readLocalCollection("pharmacore-expenses-list", []);
    writeLocalCollection("pharmacore-expenses-list", [
      {
        id: `expense-${Date.now()}`,
        date: form.date,
        referenceNumber: form.referenceNumber || `EX-${Date.now()}`,
        expenseCategory: form.expenseCategory,
        branch: form.branch,
        paymentStatus: form.amountPaid && Number(form.amountPaid) > 0 ? (locale === "ar" ? "مدفوع" : "Paid") : (locale === "ar" ? "معلق" : "Pending"),
        amount: form.amount,
        amountDue: Number(form.amount || 0) - Number(form.amountPaid || 0),
        paidBy: form.paidBy,
        vendor: form.paidTo,
        reason: form.reason,
        addedBy: "Admin"
      },
      ...expenses
    ]);
    setFeedback(locale === "ar" ? "تمت إضافة المصروف." : "Expense added.");
  }

  return (
    <PurchasesPageShell
      titleAr="إضافة المصاريف"
      titleEn="Add expense"
      subtitleAr="إنشاء قيد صرف جديد"
      subtitleEn="Create a new expense entry"
      currentPage={currentPage}
      onNavigate={onNavigate}
      filterBar={false}
    >
      <form className="section-card purchases-expense-form" onSubmit={submitExpense}>
        <div className="purchases-expense-grid">
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "الفرع*" : "Branch*"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.branch} onChange={(event) => updateField("branch", event.target.value)} />
              <small>⌄</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "فئة المصروف:" : "Expense category:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.expenseCategory} onChange={(event) => updateField("expenseCategory", event.target.value)} placeholder={locale === "ar" ? "يرجى الاختيار" : "Choose"} />
              <small>⌄</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "المجموعة الفرعية:" : "Subcategory:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.subCategory} onChange={(event) => updateField("subCategory", event.target.value)} placeholder={locale === "ar" ? "يرجى الاختيار" : "Choose"} />
              <small>⌄</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "صرف الى:" : "Paid to:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.paidTo} onChange={(event) => updateField("paidTo", event.target.value)} placeholder={locale === "ar" ? "يرجى الاختيار" : "Choose"} />
              <small>⌄</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "صرف بواسطة:" : "Paid by:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.paidBy} onChange={(event) => updateField("paidBy", event.target.value)} />
              <small>ⓘ</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "تاريخ*:" : "Date*:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.date} onChange={(event) => updateField("date", event.target.value)} />
              <small>📅</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "الرقم المرجعي:" : "Reference number:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.referenceNumber} onChange={(event) => updateField("referenceNumber", event.target.value)} />
              <small>#</small>
            </div>
          </label>
          <label className="inventory-audit-field purchases-expense-amount-field">
            <span>{locale === "ar" ? "المبلغ*:" : "Amount*:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.amount} onChange={(event) => updateField("amount", event.target.value)} placeholder={locale === "ar" ? "المبلغ" : "Amount"} />
              <small>£</small>
            </div>
          </label>
          <label className="inventory-audit-field purchases-expense-reason-field">
            <span>{locale === "ar" ? "سبب الصرف:" : "Reason:"}</span>
            <textarea value={form.reason} onChange={(event) => updateField("reason", event.target.value)} />
          </label>
        </div>
        <div className="purchases-expense-extra-bar">{locale === "ar" ? "خيارات اضافية" : "Additional options"}</div>
        <div className="purchases-expense-grid purchases-expense-grid--secondary">
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "طريقة الدفع*:" : "Payment method*:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.paymentMethod} onChange={(event) => updateField("paymentMethod", event.target.value)} />
              <small>⌄</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "المدفوعه على*:" : "Paid on*:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.paidOn} onChange={(event) => updateField("paidOn", event.target.value)} />
              <small>📅</small>
            </div>
          </label>
          <label className="inventory-audit-field">
            <span>{locale === "ar" ? "المبلغ المدفوع*:" : "Paid amount*:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.amountPaid} onChange={(event) => updateField("amountPaid", event.target.value)} />
              <small>£</small>
            </div>
          </label>
          <label className="inventory-audit-field purchases-expense-account-field">
            <span>{locale === "ar" ? "حساب:" : "Account:"}</span>
            <div className="inventory-audit-input-shell">
              <input value={form.account} onChange={(event) => updateField("account", event.target.value)} />
              <small>⌄</small>
            </div>
          </label>
        </div>
        {feedback ? <div className="notice success">{feedback}</div> : null}
        <div className="inventory-audit-actions">
          <button type="submit" className="primary-button inventory-audit-save-button">{locale === "ar" ? "حفظ" : "Save"}</button>
        </div>
      </form>
    </PurchasesPageShell>
  );
}

function ExpensesCategoriesPage({ currentPage, onNavigate }) {
  return (
    <PurchaseSimpleRecordsPage
      titleAr="فئات المصاريف"
      titleEn="Expense categories"
      subtitleAr="تصنيفات المصروفات"
      subtitleEn="Expense classifications"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="فئات المصاريف"
      toolbarTitleEn="Expense categories"
      addLabelAr="إضافة فئة"
      addLabelEn="Add category"
      storageKey="pharmacore-expenses-categories"
      exportName="expenses-categories"
      addFields={[
        { key: "name", labelAr: "اسم الفئة", labelEn: "Category name" },
        { key: "description", labelAr: "الوصف", labelEn: "Description" }
      ]}
      columns={[
        { key: "name", labelAr: "اسم الفئة", labelEn: "Category name" },
        { key: "description", labelAr: "الوصف", labelEn: "Description" },
        { key: "addedBy", labelAr: "أضيفت بواسطة", labelEn: "Added by" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function ExpensesReportPage({ currentPage, onNavigate }) {
  return (
    <PurchaseSimpleRecordsPage
      titleAr="تقرير المصاريف"
      titleEn="Expense report"
      subtitleAr="ملخص مصروفات الفروع"
      subtitleEn="Branch expense summary"
      currentPage={currentPage}
      onNavigate={onNavigate}
      toolbarTitleAr="تقرير المصاريف"
      toolbarTitleEn="Expense report"
      addLabelAr="إضافة"
      addLabelEn="Add"
      storageKey="pharmacore-expenses-report"
      exportName="expenses-report"
      addFields={[]}
      columns={[
        { key: "date", labelAr: "تاريخ", labelEn: "Date" },
        { key: "expenseCategory", labelAr: "فئة المصروف", labelEn: "Expense category" },
        { key: "branch", labelAr: "الفرع", labelEn: "Branch" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
        { key: "reason", labelAr: "السبب", labelEn: "Reason" }
      ]}
      emptyMessageAr="لا توجد بيانات متاحة في الجدول"
      emptyMessageEn="No data available in table"
    />
  );
}

function PurchasesPage() {
  const locale = getActiveLocale();
  const isArabic = locale === "ar";
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [purchaseDate, setPurchaseDate] = useState(() => formatDateInput(new Date()));
  const [search, setSearch] = useState("");
  const [invoiceDraft, setInvoiceDraft] = useState(emptyInvoiceItem);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [shippingAmount, setShippingAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const subtotal = useMemo(() => invoiceItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.purchasePrice || 0), 0), [invoiceItems]);
  const total = Math.max(0, subtotal - Number(discountAmount || 0) + Number(shippingAmount || 0));
  const due = Math.max(0, total - Number(paidAmount || 0));
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => String(supplier.id) === String(supplierId)) || null,
    [suppliers, supplierId]
  );

  async function loadPurchasesWorkspace() {
    setLoading(true);
    setError("");
    try {
      const [suppliersResponse, purchasesResponse, medicinesResponse] = await Promise.all([API.get("/suppliers"), API.get("/purchases"), API.get("/medicines", { params: { pageSize: 100 } })]);
      setSuppliers(suppliersResponse.data.data || []);
      setPurchases(purchasesResponse.data.data || []);
      setMedicines(medicinesResponse.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load purchases workspace"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPurchasesWorkspace(); }, []);

  function fillDraftFromMedicine(medicine) {
    if (!medicine) return;
    setInvoiceDraft({ ...emptyInvoiceItem, name: medicine.name || "", barcode: medicine.barcode || "", category: medicine.category || "", manufacturer: medicine.manufacturer || "", purchasePrice: medicine.purchasePrice ?? "", sellingPrice: medicine.sellingPrice ?? "", stripSellingPrice: medicine.stripSellingPrice ?? "", pillSellingPrice: medicine.pillSellingPrice ?? "", quantity: 1, minStock: medicine.minStock ?? 5, stripsPerBox: medicine.stripsPerBox ?? 1, pillsPerStrip: medicine.pillsPerStrip ?? 1, expiryDate: medicine.expiryDate ? formatDateInput(medicine.expiryDate) : "", batchNumber: medicine.batchNumber || "" });
    setSearch(medicine.name || medicine.barcode || "");
  }


  function createSupplierQuick() {
    window.location.hash = "#contacts-suppliers";
  }

  function importFirstMedicineToDraft() {
    if (filteredMedicines[0]) {
      fillDraftFromMedicine(filteredMedicines[0]);
      setFeedback(isArabic ? "تم استيراد أول صنف مطابق للبحث." : "First matching item imported.");
      return;
    }
    setError(isArabic ? "اكتب اسم صنف أو باركود للبحث ثم اضغط استيراد." : "Type item name or barcode first, then import.");
  }

  function addInvoiceDraft() {
    if (!invoiceDraft.name || invoiceDraft.purchasePrice === "" || invoiceDraft.sellingPrice === "") {
      setError(isArabic ? "الصنف يحتاج اسم وسعر شراء وسعر بيع." : "Purchase item requires name, purchase price, and selling price.");
      return;
    }
    setError("");
    setInvoiceItems((current) => [...current, { ...invoiceDraft, quantity: Number(invoiceDraft.quantity || 1) }]);
    setInvoiceDraft(emptyInvoiceItem);
    setSearch("");
  }

  function updateInvoiceItem(index, field, value) {
    setInvoiceItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  async function createPurchaseInvoice() {
    if (!invoiceItems.length) {
      setError(isArabic ? "أضف صنف واحد على الأقل قبل الحفظ." : "Add at least one item before saving.");
      return;
    }
    setFeedback("");
    setError("");
    try {
      const response = await API.post("/purchases", { invoiceNumber: invoiceNumber || undefined, supplierId: supplierId || null, paymentStatus, notes: purchaseDate ? "Purchase date: " + purchaseDate : undefined, items: invoiceItems });
      setInvoiceItems([]);
      setInvoiceDraft(emptyInvoiceItem);
      setInvoiceNumber(response.data.data.invoiceNumber || "");
      setSupplierId("");
      setPaymentStatus("PENDING");
      setDiscountAmount(0);
      setShippingAmount(0);
      setPaidAmount(0);
      setFeedback(isArabic ? "تم حفظ فاتورة " + response.data.data.invoiceNumber + " بنجاح." : "Purchase " + response.data.data.invoiceNumber + " created successfully.");
      await loadPurchasesWorkspace();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create purchase invoice"));
    }
  }

  const filteredMedicines = medicines.filter((medicine) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [medicine.name, medicine.barcode, medicine.category].some((value) => String(value || "").toLowerCase().includes(needle));
  }).slice(0, 8);

  return (
    <PurchasesPageShell titleAr="إضافة مشتريات" titleEn="Add Purchase" subtitleAr="فاتورة شراء بنفس ترتيب الشاشة المرجعية" subtitleEn="Purchase invoice entry" currentPage="purchases-add" onNavigate={(page) => { window.location.hash = "#" + page; }} filterBar={false}>
      <section className="purchase-create-screen" dir={isArabic ? "rtl" : "ltr"}>
        {feedback ? <div className="notice success">{feedback}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="section-card purchase-create-card purchase-header-card">
          <div className="purchase-header-grid">
            <label className="purchase-field purchase-supplier-field"><span>{isArabic ? "المورد:*" : "Supplier:*"}</span><div className="purchase-select-with-action"><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">{isArabic ? "يرجى الاختيار" : "Please select"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><button type="button" onClick={createSupplierQuick}>+</button></div>{selectedSupplier ? <div className="purchase-supplier-balance" role="status" aria-live="polite"><span className="purchase-supplier-balance-icon" aria-hidden="true">{isArabic ? "ج.م" : "E£"}</span><span className="purchase-supplier-balance-copy"><small>{isArabic ? `الرصيد الحالي — ${selectedSupplier.name}` : `Current balance — ${selectedSupplier.name}`}</small><strong>{formatCurrency(selectedSupplier.stats?.totalDue ?? selectedSupplier.openingBalance ?? 0)}</strong></span><small className="purchase-supplier-opening-balance">{isArabic ? "الرصيد الافتتاحي" : "Opening balance"}: <b>{formatCurrency(selectedSupplier.openingBalance ?? 0)}</b></small></div> : null}</label>
            <label className="purchase-field"><span>{isArabic ? "الرقم المرجعي:" : "Reference no:"}</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
            <label className="purchase-field"><span>{isArabic ? "تاريخ الشراء:*" : "Purchase date:*"}</span><input type="datetime-local" value={purchaseDate + "T12:34"} onChange={(event) => setPurchaseDate(event.target.value.slice(0, 10))} /></label>
            <label className="purchase-field"><span>{isArabic ? "حالة الشراء:*" : "Purchase status:*"}</span><select><option>{isArabic ? "استلم" : "Received"}</option></select></label>
            <label className="purchase-field purchase-field--half"><span>{isArabic ? "الفروع:*" : "Branch:*"}</span><select><option>ziad (BL0001)</option></select></label>
          </div>
        </section>

        <section className="section-card purchase-create-card purchase-items-card">
          <div className="purchase-item-toolbar"><button type="button" className="purchase-import-button" onClick={importFirstMedicineToDraft}>{isArabic ? "استيراد بيانات الاصناف" : "Import item data"}</button><div className="purchase-search-box"><input data-unified-medicine-search="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isArabic ? MEDICINE_SEARCH_PLACEHOLDER_AR : MEDICINE_SEARCH_PLACEHOLDER_EN} list="purchase-medicine-options" /><kbd>F4</kbd><button type="button" onClick={() => fillDraftFromMedicine(filteredMedicines[0])}>⌕</button><datalist id="purchase-medicine-options">{filteredMedicines.map((medicine) => <option key={medicine.id} value={medicine.name}>{medicine.barcode || medicine.category || ""}</option>)}</datalist></div><button type="button" className="purchase-new-item" onClick={addInvoiceDraft}>+ {isArabic ? "صنف جديد" : "New item"}</button></div>
          {search && filteredMedicines.length ? <div className="purchase-search-results">{filteredMedicines.map((medicine) => <button type="button" key={medicine.id} onClick={() => fillDraftFromMedicine(medicine)}><strong>{medicine.name}</strong><span>{medicine.barcode || "SKU"} - {formatCurrency(medicine.purchasePrice)}</span></button>)}</div> : null}
          <div className="purchase-draft-row"><input value={invoiceDraft.name} onChange={(event) => setInvoiceDraft((current) => ({ ...current, name: event.target.value }))} placeholder={isArabic ? "اسم الصنف او الخدمة" : "Item or service name"} /><input type="number" value={invoiceDraft.quantity} onChange={(event) => setInvoiceDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder={isArabic ? "كمية المشتريات" : "Quantity"} /><input type="number" value={invoiceDraft.purchasePrice} onChange={(event) => setInvoiceDraft((current) => ({ ...current, purchasePrice: event.target.value }))} placeholder={isArabic ? "سعر الشراء" : "Purchase price"} /><input type="number" value={invoiceDraft.sellingPrice} onChange={(event) => setInvoiceDraft((current) => ({ ...current, sellingPrice: event.target.value }))} placeholder={isArabic ? "سعر البيع شامل الضريبة" : "Sale price inc. tax"} /><button type="button" onClick={addInvoiceDraft}>{isArabic ? "إضافة" : "Add"}</button></div>
          <div className="purchase-table-shell"><table className="purchase-items-table"><thead><tr><th>#</th><th>{isArabic ? "اسم الصنف او الخدمة" : "Item or service name"}</th><th>{isArabic ? "كمية المشتريات" : "Purchase qty"}</th><th>{isArabic ? "سعر الشراء" : "Purchase price"}</th><th>{isArabic ? "نسبة الخصم %" : "Discount %"}</th><th>{isArabic ? "إجمالي" : "Total"}</th><th>{isArabic ? "سعر البيع (شامل الضريبة)" : "Sale price inc. tax"}</th><th>⌫</th></tr></thead><tbody>{invoiceItems.map((item, index) => <tr key={(item.barcode || item.name) + index}><td>{index + 1}</td><td><input value={item.name} onChange={(event) => updateInvoiceItem(index, "name", event.target.value)} /></td><td><input type="number" value={item.quantity} onChange={(event) => updateInvoiceItem(index, "quantity", event.target.value)} /></td><td><input type="number" value={item.purchasePrice} onChange={(event) => updateInvoiceItem(index, "purchasePrice", event.target.value)} /></td><td><input type="number" value={item.discountPercent || 0} onChange={(event) => updateInvoiceItem(index, "discountPercent", event.target.value)} /></td><td>{formatCurrency(Number(item.quantity || 0) * Number(item.purchasePrice || 0))}</td><td><input type="number" value={item.sellingPrice} onChange={(event) => updateInvoiceItem(index, "sellingPrice", event.target.value)} /></td><td><button type="button" onClick={() => setInvoiceItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>x</button></td></tr>)}</tbody></table>{!invoiceItems.length ? <div className="purchase-empty-line">{loading ? (isArabic ? "جاري التحميل..." : "Loading...") : (isArabic ? "لا توجد أصناف في الفاتورة حتى الآن." : "No invoice items yet.")}</div> : null}</div>
          <div className="purchase-table-totals"><span>{isArabic ? "الكمية:" : "Quantity:"} <strong>{invoiceItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toFixed(2)}</strong></span><span>{isArabic ? "الإجمالي:" : "Total:"} <strong>{formatCurrency(subtotal)}</strong></span></div>
        </section>

        <button type="button" className="purchase-wide-action purchase-wide-action--green" onClick={() => setDiscountAmount((value) => Number(value || 0) + 1)}>{isArabic ? "إضافة خصومات" : "Add discounts"}</button>
        <button type="button" className="purchase-wide-action purchase-wide-action--blue" onClick={() => setShippingAmount((value) => Number(value || 0) + 1)}>{isArabic ? "إضافة شحن وتوصيل" : "Add shipping and delivery"}</button>
        <section className="section-card purchase-create-card purchase-payment-card"><h3>{isArabic ? "إضافة صرف" : "Add payment"}</h3><div className="purchase-total-badge">{isArabic ? "الإجمالي:" : "Total:"} <strong>{formatCurrency(total)}</strong></div><div className="purchase-payment-grid"><label className="purchase-field"><span>{isArabic ? "المبلغ المدفوع:*" : "Paid amount:*"}</span><input type="number" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} /></label><label className="purchase-field"><span>{isArabic ? "المدفوعة على:*" : "Paid on:*"}</span><input type="datetime-local" value={purchaseDate + "T12:34"} onChange={(event) => setPurchaseDate(event.target.value.slice(0, 10))} /></label><label className="purchase-field"><span>{isArabic ? "طريقة الدفع:*" : "Payment method:*"}</span><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="PAID">{isArabic ? "نقدا" : "Cash"}</option><option value="PARTIAL">{isArabic ? "جزئي" : "Partial"}</option><option value="PENDING">{isArabic ? "آجل" : "Credit"}</option></select></label><label className="purchase-field purchase-field--wide"><span>{isArabic ? "حساب:" : "Account:"}</span><select><option>{isArabic ? "الصندوق الرئيسي" : "Main cashbox"}</option></select></label><label className="purchase-field purchase-field--wide purchase-note-field"><span>{isArabic ? "ملاحظة الدفع:" : "Payment note:"}</span><textarea /></label></div></section>
        <section className="section-card purchase-save-card"><div className="purchase-due-badge">{isArabic ? "المبلغ المستحق:" : "Amount due:"} {formatCurrency(due)}</div><button type="button" className="primary-button purchase-save-button" onClick={createPurchaseInvoice}>{isArabic ? "حفظ" : "Save"}</button><small>{isArabic ? "آخر الفواتير: " + purchases.length : "Recent invoices: " + purchases.length}</small></section>
      </section>
    </PurchasesPageShell>
  );
}
function InventoryPage({ currentUser }) {
  const locale = getActiveLocale();
  const [inventoryAuditView, setInventoryAuditView] = useState("create");
  const [periods, setPeriods] = useState(() => readLocalCollection("pharmacore-inventory-periods", []));
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [auditForm, setAuditForm] = useState({
    startDate: "",
    endDate: "",
    branch: "ziad"
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  function savePeriods(nextPeriods) {
    setPeriods(nextPeriods);
    writeLocalCollection("pharmacore-inventory-periods", nextPeriods);
  }

  function submitAuditPeriod(event) {
    event.preventDefault();
    setFeedback("");
    setError("");

    if (!auditForm.startDate || !auditForm.endDate) {
      setError(locale === "ar" ? "من فضلك أدخل تاريخ البدء وتاريخ الإغلاق." : "Please enter start and end dates.");
      return;
    }

    const nextPeriods = [
      {
        id: `INV-${Date.now()}`,
        startDate: auditForm.startDate,
        endDate: auditForm.endDate,
        branch: auditForm.branch,
        status: locale === "ar" ? "مفتوح" : "Open",
        createdAt: new Date().toISOString()
      },
      ...periods
    ];

    savePeriods(nextPeriods);
    setAuditForm({ startDate: "", endDate: "", branch: "ziad" });
    setFeedback(locale === "ar" ? "تم حفظ فترة الجرد بنجاح." : "Inventory period created successfully.");
    setInventoryAuditView("list");
  }

  const filteredPeriods = periods.filter((period) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [
      period.id,
      period.branch,
      period.status,
      period.startDate,
      period.endDate
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });

  return (
    <section className="contacts-module-shell">
      <div className="contacts-module-header">
        <h2>{locale === "ar" ? "جرد المخزون" : "Inventory counting"}</h2>
        <p>{locale === "ar" ? (inventoryAuditView === "create" ? "إنشاء فترة جرد" : "عمليات جرد المخزون") : (inventoryAuditView === "create" ? "Create stock count period" : "Inventory count operations")}</p>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <div className="contacts-main-layout">
        <div className="contacts-main-content">
          {inventoryAuditView === "create" ? (
            <section className="section-card inventory-audit-form-card">
              <form className="inventory-audit-form" onSubmit={submitAuditPeriod}>
                <label className="inventory-audit-field">
                  <span>{locale === "ar" ? "تاريخ البدء" : "Start date"}</span>
                  <div className="inventory-audit-input-shell">
                    <input type="date" value={auditForm.startDate} onChange={(event) => setAuditForm((current) => ({ ...current, startDate: event.target.value }))} />
                    <small>📅</small>
                  </div>
                </label>

                <label className="inventory-audit-field">
                  <span>{locale === "ar" ? "تاريخ الإغلاق" : "End date"}</span>
                  <div className="inventory-audit-input-shell">
                    <input type="date" value={auditForm.endDate} onChange={(event) => setAuditForm((current) => ({ ...current, endDate: event.target.value }))} />
                    <small>📅</small>
                  </div>
                </label>

                <label className="inventory-audit-field">
                  <span>{locale === "ar" ? "الفرع" : "Branch"}</span>
                  <div className="inventory-audit-input-shell">
                    <select value={auditForm.branch} onChange={(event) => setAuditForm((current) => ({ ...current, branch: event.target.value }))}>
                      <option value="ziad">ziad</option>
                    </select>
                    <small>⎇</small>
                  </div>
                </label>

                <div className="inventory-audit-actions">
                  <button type="submit" className="primary-button inventory-audit-save-button">
                    {locale === "ar" ? "حفظ" : "Save"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="section-card inventory-audit-list-card">
              <div className="inventory-audit-list-banner">
                <strong>{locale === "ar" ? "كل العمليات" : "All operations"}</strong>
              </div>

              <div className="inventory-audit-list-tools">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "ar" ? "بحث..." : "Search..."} />
                <div className="contacts-page-size">
                  <span>{locale === "ar" ? "عرض" : "Show"}</span>
                  <select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                  </select>
                  <span>{locale === "ar" ? "إدخالات" : "entries"}</span>
                </div>
              </div>

              <div className="table-shell contacts-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>{locale === "ar" ? "رقم العملية" : "Operation #"}</th>
                      <th>{locale === "ar" ? "تاريخ البدء" : "Start date"}</th>
                      <th>{locale === "ar" ? "تاريخ الإغلاق" : "End date"}</th>
                      <th>{locale === "ar" ? "الحالة" : "Status"}</th>
                      <th>{locale === "ar" ? "الفرع" : "Branch"}</th>
                      <th>{locale === "ar" ? "خيارات" : "Options"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeriods.length ? filteredPeriods.slice(0, Number(pageSize)).map((period) => (
                      <tr key={period.id}>
                        <td>{period.id}</td>
                        <td>{formatDate(period.startDate)}</td>
                        <td>{formatDate(period.endDate)}</td>
                        <td>{period.status}</td>
                        <td>{period.branch}</td>
                        <td>
                          <button
                            type="button"
                            className="contacts-option-chip danger"
                            onClick={() => {
                              const nextPeriods = periods.filter((item) => item.id !== period.id);
                              savePeriods(nextPeriods);
                              setFeedback(locale === "ar" ? "تم حذف عملية الجرد." : "Inventory operation deleted.");
                            }}
                          >
                            {locale === "ar" ? "حذف" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="6" className="empty-state">{locale === "ar" ? "لا توجد بيانات متاحة في الجدول" : "No data available in table"}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="contacts-subnav">
          <button
            type="button"
            className={inventoryAuditView === "create" ? "contacts-subnav-item active" : "contacts-subnav-item"}
            onClick={() => setInventoryAuditView("create")}
          >
            {locale === "ar" ? "إنشاء فترة جرد" : "Create count period"}
          </button>
          <button
            type="button"
            className={inventoryAuditView === "list" ? "contacts-subnav-item active" : "contacts-subnav-item"}
            onClick={() => setInventoryAuditView("list")}
          >
            {locale === "ar" ? "عمليات جرد المخزون" : "Inventory operations"}
          </button>
        </aside>
      </div>
    </section>
  );
}

function sessionItemName(item) {
  return getActiveLocale() === "ar" ? item.nameAr || item.name || item.nameEn : item.nameEn || item.name || item.nameAr;
}

function sessionDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(getActiveLocale() === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function CashierSessionReport({ shift, currentUser, onClose, onEndShift }) {
  const summary = shift?.summary || {};
  const soldItems = summary.soldItems || [];
  const expenses = shift?.expenses || [];
  const customerTransactions = shift?.customerTransactions || [];
  const brandRows = Object.values(soldItems.reduce((result, item) => {
    const brand = item.manufacturer || "بدون ماركة";
    result[brand] ||= { brand, quantity: 0, total: 0 };
    result[brand].quantity += Number(item.quantity || 0);
    result[brand].total += Number(item.total || 0);
    return result;
  }, {}));

  return <div className="cashier-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cashier-modal cashier-session-modal" role="dialog" aria-modal="true" aria-label="تفاصيل الجلسة الحالية">
      <div className="cashier-modal-head cashier-session-head"><div><strong>تفاصيل الجلسة الحالية</strong><small>{shift ? `${sessionDateTime(shift.openedAt)} — حتى الآن` : "لا توجد جلسة مفتوحة"}</small></div><button type="button" className="cashier-modal-close" onClick={onClose}>✕</button></div>
      {!shift ? <div className="cashier-report-empty">افتح وردية حتى تظهر تفاصيل الجلسة.</div> : <div className="cashier-session-scroll">
        <div className="cashier-session-kpis">
          <article><span>النقدية المتوقعة في الدرج</span><strong>{formatCurrency(summary.expectedCash)}</strong></article>
          <article><span>إجمالي المبيعات</span><strong>{formatCurrency(summary.netSales)}</strong></article>
          <article><span>مجموع المصروفات</span><strong className="negative-text">{formatCurrency(summary.totalExpenses)}</strong></article>
          <article><span>عدد الفواتير</span><strong>{summary.invoiceCount || 0}</strong></article>
        </div>

        <section className="cashier-report-section"><h3>طرق الدفع والمصروفات</h3><div className="cashier-report-table payment"><div className="head"><span>طريقة الدفع</span><span>المبيعات</span><span>المصروف</span></div>
          <div><span>الدفع نقدًا</span><strong>{formatCurrency(Number(summary.cashSales || 0) - Number(summary.cashRefunds || 0))}</strong><strong>{formatCurrency(summary.cashExpenses)}</strong></div>
          <div><span>الدفع عن طريق البطاقة</span><strong>{formatCurrency(summary.cardSales)}</strong><strong>{formatCurrency(summary.cardExpenses)}</strong></div>
          <div><span>تحويل بنكي</span><strong>{formatCurrency(summary.otherSales)}</strong><strong>{formatCurrency(summary.transferExpenses)}</strong></div>
          <div><span>المبيعات الآجلة</span><strong>{formatCurrency(summary.creditSales)}</strong><strong>—</strong></div>
          <div className="total"><span>المبلغ الإجمالي</span><strong>{formatCurrency(summary.netSales)}</strong><strong>{formatCurrency(summary.totalExpenses)}</strong></div>
        </div></section>

        <section className="cashier-report-section"><h3>تفاصيل الأصناف المباعة</h3><div className="cashier-report-table items"><div className="head"><span>#</span><span>SKU / الباركود</span><span>الصنف</span><span>الكمية</span><span>المبلغ</span></div>
          {soldItems.map((item, index) => <div key={`${item.medicineId}-${item.saleUnit}`}><span>{index + 1}</span><span>{item.barcode || "—"}</span><span><strong>{sessionItemName(item)}</strong><small>{item.saleUnit}{item.serials?.length ? ` · ${item.serials.join("، ")}` : ""}</small></span><strong>{item.quantity || 0}</strong><strong>{formatCurrency(item.total)}</strong></div>)}
          {!soldItems.length ? <div className="empty"><span>لا توجد أصناف مباعة في هذه الجلسة.</span></div> : null}
          <div className="total"><span /><span /><span>الإجمالي</span><strong>{soldItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong><strong>{formatCurrency(summary.netSales)}</strong></div>
        </div></section>

        <section className="cashier-report-section"><h3>تفاصيل الأصناف المباعة حسب الماركة</h3><div className="cashier-report-table brands"><div className="head"><span>#</span><span>ماركة الصنف</span><span>الكمية</span><span>المبلغ</span></div>
          {brandRows.map((row, index) => <div key={row.brand}><span>{index + 1}</span><strong>{row.brand}</strong><strong>{row.quantity}</strong><strong>{formatCurrency(row.total)}</strong></div>)}
          {!brandRows.length ? <div className="empty"><span>لا توجد بيانات.</span></div> : null}
        </div></section>

        <div className="cashier-session-two-columns">
          <section className="cashier-report-section"><h3>المصروفات المسجلة</h3>{expenses.length ? <div className="cashier-report-list">{expenses.map((expense) => <article key={expense.id}><div><strong>{expense.note || "مصروف"}</strong><small>{expense.category} · {sessionDateTime(expense.createdAt)}</small></div><strong>{formatCurrency(expense.amount)}</strong></article>)}</div> : <p className="cashier-report-empty">لا توجد مصروفات.</p>}</section>
          <section className="cashier-report-section"><h3>دفعات الزبائن والموردين</h3><div className="cashier-payment-totals"><span>إجمالي دفعات الزبائن <strong>{formatCurrency(summary.customerPayments)}</strong></span><span>إجمالي دفعات الموردين <strong>{formatCurrency(summary.supplierPayments)}</strong></span></div>{customerTransactions.map((transaction) => <small key={transaction.id}>{transaction.customer?.name}: {formatCurrency(Math.abs(transaction.amount))}</small>)}</section>
        </div>

        <footer className="cashier-session-footer"><div><span>المستخدم: <strong>{currentUser.name}</strong></span><span>الإيميل: <strong>{currentUser.email}</strong></span><span>عنوان المشروع: <strong>{currentUser.workspaceName || "الصيدلية"}</strong></span></div><button type="button" className="cashier-toolbar-danger" onClick={onEndShift}>مراجعة وإنهاء الجلسة</button></footer>
      </div>}
    </section>
  </div>;
}

function CashierSalesReference({ sales, selectedSale, onSelect, onReturn, onClose }) {
  return <div className="cashier-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cashier-modal cashier-sales-reference-modal" role="dialog" aria-modal="true" aria-label="مرجع المبيعات">
      <div className="cashier-modal-head"><div><strong>مرجع المبيعات</strong><small>راجع الفواتير السابقة وتفاصيل الأصناف والسيريال.</small></div><button type="button" className="cashier-modal-close" onClick={onClose}>✕</button></div>
      <div className="cashier-reference-layout"><div className="cashier-reference-list">{sales.map((sale) => <button type="button" key={sale.id} className={selectedSale?.id === sale.id ? "active" : ""} onClick={() => onSelect(sale.id)}><div><strong>{sale.invoiceNumber}</strong><small>{sessionDateTime(sale.createdAt)} · {sale.paymentMethod}</small></div><span>{formatCurrency(sale.finalAmount)}</span></button>)}{!sales.length ? <p className="cashier-report-empty">لا توجد مبيعات مسجلة.</p> : null}</div>
        <div className="cashier-reference-details">{selectedSale ? <><header><div><strong>{selectedSale.invoiceNumber}</strong><small>{sessionDateTime(selectedSale.createdAt)}</small></div><strong>{formatCurrency(selectedSale.finalAmount)}</strong></header><div className="cashier-reference-items">{(selectedSale.items || []).map((item) => <article key={item.id}><div><strong>{getMedicineDisplayName(item.medicine || {})}</strong><small>{item.saleUnit} × {item.quantity}</small></div><strong>{formatCurrency(item.totalPrice)}</strong></article>)}</div>{selectedSale.status !== "RETURNED" ? <button type="button" className="cashier-toolbar-danger" onClick={() => onReturn(selectedSale.id)}>استرجاع هذه الفاتورة</button> : <div className="notice error">تم استرجاع هذه الفاتورة.</div>}</> : <div className="cashier-report-empty">اختر فاتورة لعرض تفاصيلها.</div>}</div>
      </div>
    </section>
  </div>;
}

function CashierToolModal({ title, subtitle, onClose, children, wide = false }) {
  return <div className="cashier-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`cashier-modal cashier-tool-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="cashier-modal-head"><div><strong>{title}</strong>{subtitle ? <small>{subtitle}</small> : null}</div><button type="button" className="cashier-modal-close" onClick={onClose}>✕</button></div>
      <div className="cashier-tool-modal-body">{children}</div>
    </section>
  </div>;
}

function CashierToolbarIcon({ name }) {
  const props = { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" };
  if (name === "search") return <svg {...props}><circle cx="10" cy="10" r="5.5" /><path d="m14.2 14.2 4.8 4.8" /></svg>;
  if (name === "pause") return <svg {...props}><circle cx="12" cy="12" r="8.5" className="icon-soft-fill" /><path d="M9.5 8.5v7M14.5 8.5v7" /></svg>;
  if (name === "fullscreen") return <svg {...props}><rect x="5" y="4.5" width="14" height="15" rx="1.5" className="icon-soft-fill" /><path d="M8 8h8M8 16h8" /></svg>;
  if (name === "return") return <svg {...props}><path d="M8 7H4V3" /><path d="M4.5 7C7 4.5 11 4 14.2 5.7A7 7 0 1 1 7.1 17" /></svg>;
  if (name === "calculator") return <svg {...props}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 6.5h8v3H8zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" /></svg>;
  if (name === "session") return <svg {...props}><path d="M4 9h16v10H4z" className="icon-soft-fill" /><path d="M9 9V6h6v3M4 13h16M10 13v2h4v-2" /></svg>;
  if (name === "close") return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" className="icon-solid-fill" /><path d="m9 9 6 6m0-6-6 6" className="icon-white-stroke" /></svg>;
  if (name === "back") return <svg {...props}><path d="m12 6-6 6 6 6M19 6l-6 6 6 6" /></svg>;
  if (name === "expense") return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7" /></svg>;
  return null;
}

function SalesPage({ currentUser }) {
  const suspendedStorageKey = `pharmacy-suspended-sales-${currentUser.workspaceId || currentUser.id}`;
  const [medicines, setMedicines] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null);
  const [search, setSearch] = useState("");
  const [medicineResultsQuery, setMedicineResultsQuery] = useState("");
  const [activeSearchSuggestionIndex, setActiveSearchSuggestionIndex] = useState(-1);
  const [scannedMedicine, setScannedMedicine] = useState(null);
  const [quickSaleUnit, setQuickSaleUnit] = useState("BOX");
  const [quickSaleQuantity, setQuickSaleQuantity] = useState(1);
  const [retailConfigMedicine, setRetailConfigMedicine] = useState(null);
  const [retailConfigForm, setRetailConfigForm] = useState({
    quantity: 0,
    stripsPerBox: 1,
    pillsPerStrip: 1,
    stripSellingPrice: "",
    pillSellingPrice: ""
  });
  const [savingRetailConfig, setSavingRetailConfig] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartItemEditor, setCartItemEditor] = useState(null);
  const [productsPanelCollapsed, setProductsPanelCollapsed] = useState(true);
  const [priceGroups] = useState(() => readLocalCollection(PRICE_GROUPS_STORAGE_KEY, []).filter((group) => group.active !== false));
  const [selectedPriceGroupId, setSelectedPriceGroupId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [counterpartyType, setCounterpartyType] = useState("CASH");
  const [counterpartySupplierId, setCounterpartySupplierId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [activeShift, setActiveShift] = useState(null);
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);
  const [shiftCloseRequest, setShiftCloseRequest] = useState(0);
  const [cashierNow, setCashierNow] = useState(() => new Date());
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showSalesReference, setShowSalesReference] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculator, setCalculator] = useState({ display: "0", stored: null, operator: null, replace: true });
  const [suspendedCheckouts, setSuspendedCheckouts] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(suspendedStorageKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [activeCashierTool, setActiveCashierTool] = useState("");
  const [treasuryData, setTreasuryData] = useState(null);
  const [treasuryAdjustment, setTreasuryAdjustment] = useState({ direction: "IN", amount: "", paymentMethod: "CASH", note: "" });
  const [customerPaymentForm, setCustomerPaymentForm] = useState({ customerId: "", amount: "", paymentMethod: "CASH", note: "" });
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({ supplierId: "", amount: "", paymentMethod: "CASH", note: "" });
  const [cashierToolBusy, setCashierToolBusy] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [inquiryMedicines, setInquiryMedicines] = useState([]);
  const [freeReturnItems, setFreeReturnItems] = useState([]);
  const [freeReturnPaymentMethod, setFreeReturnPaymentMethod] = useState("CASH");
  const [freeReturnSupplierId, setFreeReturnSupplierId] = useState("");
  const [sessionReport, setSessionReport] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ amount: "", category: "GENERAL", paymentMethod: "CASH", note: "" });
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [completingSale, setCompletingSale] = useState(false);
  const quickSaleRef = useRef(null);
  const retailConfigRef = useRef(null);
  const retailConfigInputRef = useRef(null);
  const cartSectionRef = useRef(null);
  const cartQuantityInputRefs = useRef(new Map());
  const cashierSearchInputRef = useRef(null);
  const medicineSearchRequestRef = useRef(0);
  const cashierCounterpartyPickerRef = useRef(null);
  const cashierPriceGroupRef = useRef(null);
  const calculatorAnchorRef = useRef(null);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0),
    [cart]
  );
  const finalAmount = Math.max(0, subtotal - Number(discount || 0));
  const counterpartyReady = counterpartyType === "CASH"
    || (counterpartyType === "CUSTOMER" && Boolean(customerId))
    || (counterpartyType === "SUPPLIER" && Boolean(counterpartySupplierId))
    || (counterpartyType === "BOTH" && Boolean(customerId) && Boolean(counterpartySupplierId));
  const counterpartyPickerValue = counterpartyType === "CUSTOMER" && customerId
    ? `CUSTOMER:${customerId}`
    : counterpartyType === "CUSTOMER"
      ? "CUSTOMER"
    : counterpartyType === "SUPPLIER" && counterpartySupplierId
      ? `SUPPLIER:${counterpartySupplierId}`
      : counterpartyType === "SUPPLIER"
        ? "SUPPLIER"
      : counterpartyType === "BOTH" && counterpartySupplierId
        ? `BOTH:${counterpartySupplierId}`
        : counterpartyType === "BOTH"
          ? "BOTH"
        : "CASH";
  const searchSuggestions = useMemo(
    () => search.trim() && medicineResultsQuery === search.trim() ? medicines.slice(0, 20) : [],
    [medicines, medicineResultsQuery, search]
  );
  const cashierTopDate = formatTopBarDate(getActiveLocale(), cashierNow, true);

  useEffect(() => {
    const timer = window.setInterval(() => setCashierNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("cashier-fixed-viewport");
    return () => document.documentElement.classList.remove("cashier-fixed-viewport");
  }, []);

  useEffect(() => {
    setActiveSearchSuggestionIndex(search.trim() && searchSuggestions.length ? 0 : -1);
  }, [search, searchSuggestions.length]);

  function handleCounterpartyPickerChange(value) {
    if (value === "CASH") {
      setCounterpartyType("CASH");
      setCustomerId("");
      setCounterpartySupplierId("");
      return;
    }

    const [type, id] = String(value).split(":");
    if (type === "CUSTOMER") {
      setCounterpartyType("CUSTOMER");
      setCustomerId(id || "");
      setCounterpartySupplierId("");
      return;
    }
    if (type === "SUPPLIER") {
      setCounterpartyType("SUPPLIER");
      setCounterpartySupplierId(id || "");
      setCustomerId("");
      return;
    }
    if (type === "BOTH") {
      const supplier = suppliers.find((item) => String(item.id) === String(id));
      setCounterpartyType("BOTH");
      setCounterpartySupplierId(id || "");
      setCustomerId(supplier?.linkedCustomer?.id || "");
    }
  }

  useEffect(() => {
    if (!selectedPriceGroupId) return;
    const group = priceGroups.find((item) => String(item.id) === String(selectedPriceGroupId));
    setDiscount(group ? roundMoney(subtotal * Number(group.discountPercent || 0) / 100) : 0);
  }, [selectedPriceGroupId, subtotal, priceGroups]);

  useEffect(() => {
    window.localStorage.setItem(suspendedStorageKey, JSON.stringify(suspendedCheckouts));
  }, [suspendedCheckouts, suspendedStorageKey]);

  async function refreshSessionReport(openModal = false) {
    try {
      const response = await API.get("/shifts/current");
      const currentShift = response.data.data || null;
      setActiveShift(currentShift);
      setSessionReport(currentShift);
      if (openModal) setShowSessionDetails(true);
      return currentShift;
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تحميل تفاصيل الجلسة"));
      return null;
    }
  }

  async function addShiftExpense(event) {
    event.preventDefault();
    if (!activeShift) {
      setError("افتح وردية أولًا قبل تسجيل المصروف.");
      return;
    }
    setExpenseBusy(true);
    setError("");
    try {
      const response = await API.post(`/shifts/${activeShift.id}/expenses`, {
        ...expenseForm,
        amount: Number(expenseForm.amount)
      });
      setActiveShift(response.data.data);
      setSessionReport(response.data.data);
      setExpenseForm({ amount: "", category: "GENERAL", paymentMethod: "CASH", note: "" });
      setShowExpenseForm(false);
      setFeedback("تمت إضافة المصروف إلى الجلسة الحالية.");
      setShiftRefreshKey((value) => value + 1);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر إضافة المصروف"));
    } finally {
      setExpenseBusy(false);
    }
  }

  async function requestShiftClose() {
    const currentShift = await refreshSessionReport(false);
    if (!currentShift) {
      setError("لا توجد جلسة مفتوحة لإنهائها.");
      return;
    }
    setShiftCloseRequest((value) => value + 1);
    window.setTimeout(() => document.querySelector(".cashier-sales-screen > .ops-shift-widget")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function toggleCashierFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setError("المتصفح لم يسمح بوضع ملء الشاشة.");
    }
  }

  function toggleSuspendedCheckout() {
    if (cart.length) {
      setSuspendedCheckouts((current) => [{ id: Date.now(), createdAt: new Date().toISOString(), cart, discount, customerId, counterpartyType, counterpartySupplierId, selectedPriceGroupId, paymentMethod }, ...current]);
      setCart([]);
      setDiscount(0);
      setCustomerId("");
      setCounterpartyType("CASH");
      setCounterpartySupplierId("");
      setPaymentMethod("CASH");
      setSelectedPriceGroupId("");
      setFeedback("تم تعليق الفاتورة الحالية وحفظها في قائمة المبيعات المعلقة.");
      return;
    }
    setActiveCashierTool("suspended");
  }

  function resumeSuspendedCheckout(checkout) {
    if (cart.length && !window.confirm("السلة الحالية غير فارغة. هل تريد استبدالها بالفاتورة المعلقة؟")) return;
    setCart(checkout.cart || []);
    setDiscount(checkout.discount || 0);
    setCustomerId(checkout.customerId || "");
    setCounterpartyType(checkout.counterpartyType || (checkout.customerId ? "CUSTOMER" : "CASH"));
    setCounterpartySupplierId(checkout.counterpartySupplierId || "");
    setPaymentMethod(checkout.paymentMethod || "CASH");
    setSelectedPriceGroupId(checkout.selectedPriceGroupId || "");
    setSuspendedCheckouts((current) => current.filter((item) => item.id !== checkout.id));
    setActiveCashierTool("");
    setFeedback("تم استرجاع الفاتورة المعلقة إلى السلة.");
  }

  function pressCalculator(key) {
    setCalculator((current) => {
      if (key === "C") return { display: "0", stored: null, operator: null, replace: true };
      if (key === "⌫") {
        if (current.replace || current.display.length <= 1) return { ...current, display: "0", replace: true };
        return { ...current, display: current.display.slice(0, -1) };
      }
      if (/^\d$/.test(key) || key === ".") {
        if (key === "." && !current.replace && current.display.includes(".")) return current;
        const nextDisplay = current.replace ? (key === "." ? "0." : key) : current.display + key;
        return { ...current, display: nextDisplay, replace: false };
      }
      const calculate = (left, right, operator) => {
        if (operator === "+") return left + right;
        if (operator === "−") return left - right;
        if (operator === "×") return left * right;
        if (operator === "÷") return right === 0 ? 0 : left / right;
        return right;
      };
      const value = Number(current.display || 0);
      if (["+", "−", "×", "÷"].includes(key)) {
        const result = current.stored !== null && current.operator && !current.replace
          ? calculate(current.stored, value, current.operator)
          : value;
        return { display: String(Number(result.toFixed(8))), stored: result, operator: key, replace: true };
      }
      if (key === "=" && current.stored !== null && current.operator) {
        const result = calculate(current.stored, value, current.operator);
        return { display: String(Number(result.toFixed(8))), stored: null, operator: null, replace: true };
      }
      return current;
    });
  }

  useEffect(() => {
    if (!showCalculator) return undefined;

    const handleCalculatorKeyboard = (event) => {
      const mappedKeys = {
        Enter: "=",
        "=": "=",
        "+": "+",
        "-": "−",
        "*": "×",
        "/": "÷",
        Backspace: "⌫",
        Delete: "C",
        c: "C",
        C: "C",
        x: "×",
        X: "×",
        Escape: "CLOSE",
        ",": "."
      };
      const key = /^\d$/.test(event.key) || event.key === "." ? event.key : mappedKeys[event.key];
      if (!key) return;
      event.preventDefault();
      if (key === "CLOSE") {
        setShowCalculator(false);
        return;
      }
      pressCalculator(key);
    };

    const handleOutsideClick = (event) => {
      if (!calculatorAnchorRef.current?.contains(event.target)) setShowCalculator(false);
    };

    window.addEventListener("keydown", handleCalculatorKeyboard);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("keydown", handleCalculatorKeyboard);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showCalculator]);

  useEffect(() => {
    const handleCashierShortcuts = (event) => {
      if (event.key === "F3") {
        event.preventDefault();
        setToolSearch("");
        setActiveCashierTool("inquiry");
      }
      if (event.key === "F2") {
        event.preventDefault();
        cashierPriceGroupRef.current?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        cashierSearchInputRef.current?.focus();
        cashierSearchInputRef.current?.select();
      }
      if (event.key === "Escape" && activeCashierTool) setActiveCashierTool("");
    };
    window.addEventListener("keydown", handleCashierShortcuts);
    return () => window.removeEventListener("keydown", handleCashierShortcuts);
  }, [activeCashierTool]);

  useEffect(() => {
    if (!["inquiry", "free-sale-return", "free-purchase-return"].includes(activeCashierTool) || !toolSearch.trim()) {
      setInquiryMedicines([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await API.get("/medicines", { params: { q: toolSearch.trim(), searchMode: "contains", pageSize: 100 } });
        if (active) setInquiryMedicines(response.data.data || []);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "تعذر البحث عن الصنف"));
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeCashierTool, toolSearch]);

  async function loadSalesWorkspace(query = search) {
    setLoading(true);
    setError("");
    try {
      const trimmed = query.trim();
      const medicineParams = trimmed.length >= 1 ? { q: trimmed, searchMode: "contains" } : {};
      const [medicinesResponse, customersResponse, suppliersResponse, salesResponse, purchasesResponse, summaryResponse] = await Promise.all([
        API.get("/medicines", { params: medicineParams }),
        API.get("/customers"),
        API.get("/suppliers"),
        API.get("/sales"),
        API.get("/purchases"),
        API.get("/sales/summary/daily")
      ]);
      setMedicines(medicinesResponse.data.data);
      setCustomers(customersResponse.data.data);
      setSuppliers(suppliersResponse.data.data || []);
      setSales(salesResponse.data.data);
      setPurchases(purchasesResponse.data.data || []);
      setDailySummary(summaryResponse.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sales workspace"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSalesWorkspace("");
  }, []);

  useEffect(() => {
    const requestId = medicineSearchRequestRef.current + 1;
    medicineSearchRequestRef.current = requestId;
    const query = search.trim();
    setMedicineResultsQuery("");
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await API.get("/medicines", {
          params: query
            ? { q: query, searchMode: "contains", pageSize: 50 }
            : { pageSize: 50 }
        });
        if (active && medicineSearchRequestRef.current === requestId) {
          setMedicines(response.data.data || []);
          setMedicineResultsQuery(query);
        }
      } catch (err) {
        if (active && medicineSearchRequestRef.current === requestId) {
          setError(getErrorMessage(err, "تعذر البحث عن الصنف"));
        }
      }
    }, query ? 90 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (!retailConfigMedicine) return undefined;

    const timer = window.setTimeout(() => {
      retailConfigRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      retailConfigInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [retailConfigMedicine]);

  function addToCart(medicine, saleUnit = "BOX", requestedQuantity = 1, { focusQuantity = false } = {}) {
    const unitPrice = getMedicineUnitPrice(medicine, saleUnit);
    const stock = getMedicineUnitAvailability(medicine, saleUnit);
    const safeQuantity = Math.max(1, Number(requestedQuantity || 1));
    const existingCartItem = cart.find((item) => item.medicineId === medicine.id && item.saleUnit === saleUnit);
    if (stock <= 0) {
      playErrorSound();
      setFeedback("");
      setError(`المتاح 0 من ${getMedicineDisplayName(medicine)} — الصنف غير متوفر.`);
      window.setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    if (safeQuantity > stock) {
      playErrorSound();
      setFeedback("");
      setError(`المتاح فقط ${stock} ${getUnitLabel(saleUnit, medicine)} من ${getMedicineDisplayName(medicine)}.`);
      window.setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    if (existingCartItem && Number(existingCartItem.quantity || 0) + safeQuantity > stock) {
      playErrorSound();
      setFeedback("");
      setError(`لا يمكن إضافة كمية أخرى من ${getMedicineDisplayName(medicine)} — المتاح ${stock} ${getUnitLabel(saleUnit, medicine)} فقط.`);
      window.setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.medicineId === medicine.id && item.saleUnit === saleUnit);
      if (existing) {
        return current.map((item) =>
          item.medicineId === medicine.id && item.saleUnit === saleUnit
            ? { ...item, quantity: Math.min(item.quantity + safeQuantity, stock) }
            : item
        );
      }
      return [
        ...current,
        {
          medicineId: medicine.id,
          name: getMedicineDisplayName(medicine),
          unitLabel: getUnitLabel(saleUnit, medicine),
          barcode: medicine.barcode || "",
          itemType: medicine.itemType || "MEDICINE",
          stockUnit: medicine.stockUnit || "",
          packageNameAr: medicine.packageNameAr || "",
          packageNameEn: medicine.packageNameEn || "",
          pieceNameAr: medicine.pieceNameAr || "",
          pieceNameEn: medicine.pieceNameEn || "",
          stripsPerBox: Number(medicine.stripsPerBox || 1),
          pillsPerStrip: Number(medicine.pillsPerStrip || 1),
          packagingSummary: medicine.packagingSummary || null,
          medicineQuantity: Number(medicine.quantity || 0),
          sellingPrice: Number(medicine.sellingPrice || 0),
          stripSellingPrice: medicine.stripSellingPrice ?? null,
          pillSellingPrice: medicine.pillSellingPrice ?? null,
          saleUnit,
          stock,
          baseUnitPrice: unitPrice,
          unitPrice,
          itemDiscountType: "FIXED",
          itemDiscountValue: 0,
          itemNote: "",
          expiryDate: medicine.expiryDate || null,
          batchNumber: medicine.batchNumber || "",
          packagingLabel: getPackagingLabel(medicine),
          stockNote: getStockRemainderText(medicine, saleUnit, safeQuantity),
          quantity: safeQuantity
        }
      ];
    });
    setFeedback(`تمت إضافة ${getMedicineDisplayName(medicine)} إلى السلة.`);
    setError("");
    window.setTimeout(() => {
      if (focusQuantity) {
        const quantityInput = cartQuantityInputRefs.current.get(`${medicine.id}-${saleUnit}`);
        quantityInput?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        quantityInput?.focus();
        quantityInput?.select();
        return;
      }
      cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openQuickSaleSelector(medicine) {
    const availableUnit = getAvailableSaleUnits(medicine).find((unit) => getMedicineUnitAvailability(medicine, unit) > 0);
    const defaultUnit = availableUnit || "BOX";

    setScannedMedicine(medicine);
    setQuickSaleUnit(defaultUnit);
    setQuickSaleQuantity(1);
    if (!availableUnit) {
      setFeedback("");
      setError(`المتاح 0 من ${getMedicineDisplayName(medicine)} — الصنف غير متوفر.`);
      window.setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } else {
      setFeedback(`${getMedicineDisplayName(medicine)} جاهز — اختر الوحدة والكمية ثم أضفه للسلة.`);
      setError("");
    }

    window.setTimeout(() => {
      quickSaleRef.current?.focus();
    }, 0);
  }

  function openSuggestion(medicine) {
    setSearch("");
    setActiveSearchSuggestionIndex(-1);
    openQuickSaleSelector(medicine);
  }

  function moveSearchSuggestion(direction) {
    if (!searchSuggestions.length) return;
    setActiveSearchSuggestionIndex((current) => {
      const next = current < 0
        ? 0
        : (current + direction + searchSuggestions.length) % searchSuggestions.length;
      window.setTimeout(() => {
        document.querySelector(`[data-cashier-suggestion-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
      }, 0);
      return next;
    });
  }

  function syncSearchSuggestionWithScroll(event) {
    const container = event.currentTarget;
    const containerTop = container.getBoundingClientRect().top;
    const buttons = Array.from(container.querySelectorAll("[data-cashier-suggestion-index]"));
    const visibleButton = buttons.find((button) => button.getBoundingClientRect().bottom > containerTop + 6);
    if (visibleButton) setActiveSearchSuggestionIndex(Number(visibleButton.dataset.cashierSuggestionIndex));
  }

  function openRetailConfigurator(medicine) {
    setRetailConfigMedicine(medicine);
    setRetailConfigForm({
      quantity: getMedicineInputQuantity(medicine),
      stripsPerBox: Number(medicine.stripsPerBox || 1),
      pillsPerStrip: Number(medicine.pillsPerStrip || 1),
      stripSellingPrice: medicine.stripSellingPrice ?? "",
      pillSellingPrice: medicine.pillSellingPrice ?? ""
    });
    setFeedback("");
    setError("");
  }

  async function handleUnifiedMedicineSearch() {
    const query = search.trim();
    if (!query) {
      cashierSearchInputRef.current?.focus();
      return;
    }
    setFeedback("");
    setError("");
    try {
      const normalized = query.toLowerCase();
      let medicine = medicines.find((item) => String(item.barcode || "").toLowerCase() === normalized || getMedicineDisplayName(item).toLowerCase() === normalized);
      if (!medicine) {
        const response = await API.get("/medicines", { params: { q: query, searchMode: "contains", pageSize: 50 } });
        const matches = response.data.data || [];
        medicine = matches.find((item) => String(item.barcode || "").toLowerCase() === normalized || getMedicineDisplayName(item).toLowerCase() === normalized) || matches[0];
      }
      if (!medicine) throw new Error("لم يتم العثور على صنف مطابق.");
      const isExactBarcode = String(medicine.barcode || "").trim().toLowerCase() === normalized;
      if (isExactBarcode) {
        const saleUnit = getAvailableSaleUnits(medicine)
          .find((unit) => getMedicineUnitAvailability(medicine, unit) > 0) || "BOX";
        addToCart(medicine, saleUnit, 1, { focusQuantity: true });
        setScannedMedicine(null);
        setQuickSaleQuantity(1);
        setSearch("");
        setMedicineResultsQuery("");
        return;
      }
      openQuickSaleSelector(medicine);
    } catch (err) {
      setError(getErrorMessage(err, err.message || "لم يتم العثور على صنف مطابق"));
    }
  }

  function confirmQuickSale() {
    if (!scannedMedicine) return;
    addToCart(scannedMedicine, quickSaleUnit, quickSaleQuantity);
    setScannedMedicine(null);
    setQuickSaleQuantity(1);
  }

  useEffect(() => {
    if (!scannedMedicine) return undefined;

    function handleQuickSaleKey(event) {
      if (!quickSaleRef.current) return;
      if (document.activeElement !== quickSaleRef.current) return;

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        setQuickSaleQuantity(Number(event.key));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        confirmQuickSale();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setScannedMedicine(null);
        return;
      }
    }

    window.addEventListener("keydown", handleQuickSaleKey);
    return () => window.removeEventListener("keydown", handleQuickSaleKey);
  }, [scannedMedicine, quickSaleUnit, quickSaleQuantity]);

  function updateCartQuantity(medicineId, saleUnit, quantity) {
    const currentCartItem = cart.find((item) => item.medicineId === medicineId && item.saleUnit === saleUnit);
    const stockLimit = getLiveCartStockLimit(medicineId, saleUnit, currentCartItem?.quantity || 0);
    const requestedQuantity = Math.max(1, Number(quantity || 1));
    if (requestedQuantity > stockLimit) {
      const medicine = medicines.find((item) => item.id === medicineId);
      playErrorSound();
      setFeedback("");
      setError(`لا يمكن زيادة الكمية — المتاح ${stockLimit} ${getUnitLabel(saleUnit, medicine)} فقط.`);
      return;
    }
    setCart((current) =>
      current.map((item) =>
        item.medicineId === medicineId && item.saleUnit === saleUnit
          ? { ...item, quantity: requestedQuantity }
          : item
      )
    );
  }

  function removeFromCart(medicineId, saleUnit) {
    setCart((current) => current.filter((item) => !(item.medicineId === medicineId && item.saleUnit === saleUnit)));
  }

  async function loadSaleDetails(saleId) {
    setError("");
    try {
      const response = await API.get(`/sales/${saleId}`);
      setSelectedSale(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load invoice details"));
    }
  }

  async function completeSale(method = paymentMethod) {
    if (!cart.length || completingSale) return;
    if (!counterpartyReady) { setError("اختر جهة التعامل والحساب قبل إتمام الفاتورة."); return; }
    prepareSuccessSound();
    setFeedback("");
    setError("");
    setCompletingSale(true);
    try {
      const response = await API.post("/sales", {
        customerId: customerId || null,
        supplierId: counterpartySupplierId || null,
        counterpartyType,
        discount: Number(discount || 0),
        paymentMethod: method,
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          quantity: Number(item.quantity),
          saleUnit: item.saleUnit,
          baseUnitPrice: Number(item.baseUnitPrice ?? item.unitPrice),
          discountType: item.itemDiscountType || "FIXED",
          discountValue: Number(item.itemDiscountValue || 0),
          note: item.itemNote || ""
        }))
      });

      setCart([]);
      setScannedMedicine(null);
      setQuickSaleQuantity(1);
      setSearch("");
      setMedicineResultsQuery("");
      setCustomerId("");
      setCounterpartyType("CASH");
      setCounterpartySupplierId("");
      setDiscount(0);
      setPaymentMethod("CASH");
      setSelectedPriceGroupId("");
      const soldDetails = (response.data.data.items || []).map((item) => {
        const medicineName = getMedicineDisplayName(item.medicine || {});
        const serials = (item.allocations || [])
          .map((allocation) => allocation.medicineBox?.batchNumber || allocation.medicineBox?.boxCode)
          .filter(Boolean);
        const fallbackSerial = item.medicine?.batchNumber || item.medicine?.barcode || "بدون سيريال";
        return `${medicineName} — سيريال ${Array.from(new Set(serials)).join("، ") || fallbackSerial}`;
      });
      setFeedback(`تم البيع بنجاح: ${soldDetails.join(" | ")}`);
      playSuccessSound("sale");
      setSelectedSale(response.data.data);
      setShiftRefreshKey((value) => value + 1);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to complete sale"));
    } finally {
      setCompletingSale(false);
    }
  }

  useEffect(() => {
    function handleCashPaymentEnter(event) {
      if (event.key !== "Enter" || event.repeat || !cart.length || scannedMedicine || completingSale) return;
      if (activeCashierTool || showExpenseForm || showSalesReference || showCalculator || showSessionDetails) return;

      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, button, [contenteditable='true']")) return;

      event.preventDefault();
      if (currentUser.role === "CASHIER" && !activeShift) {
        setFeedback("");
        setError("افتح الوردية أولًا قبل تنفيذ الدفع النقدي.");
        return;
      }
      setPaymentMethod("CASH");
      completeSale("CASH");
    }

    window.addEventListener("keydown", handleCashPaymentEnter);
    return () => window.removeEventListener("keydown", handleCashPaymentEnter);
  }, [cart, scannedMedicine, completingSale, activeCashierTool, showExpenseForm, showSalesReference, showCalculator, showSessionDetails, activeShift, currentUser.role, counterpartyReady, customerId, counterpartySupplierId, counterpartyType, discount]);

  async function returnSale(saleId) {
    if (!window.confirm("Return this sale and restore stock?")) return;
    setFeedback("");
    setError("");
    try {
      const response = await API.post(`/sales/${saleId}/return`);
      setFeedback(`Sale ${response.data.data.invoiceNumber} returned successfully.`);
      setSelectedSale(response.data.data);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to return sale"));
    }
  }

  function changeCartItemUnit(item, nextUnit) {
    if (!nextUnit || nextUnit === item.saleUnit) return;

    const medicine = getCartMedicine(item);
    if (!medicine) return;

    const available = getMedicineUnitAvailability(medicine, nextUnit);
    const matchingItem = cart.find((row) => row.medicineId === item.medicineId && row.saleUnit === nextUnit);
    const requestedQuantity = Number(item.quantity || 1) + Number(matchingItem?.quantity || 0);

    if (available <= 0 || requestedQuantity > available) {
      playErrorSound();
      setFeedback("");
      setError(available <= 0
        ? `لا يوجد مخزون متاح بوحدة ${getUnitLabel(nextUnit, medicine)}.`
        : `المتاح فقط ${available} ${getUnitLabel(nextUnit, medicine)} من ${getMedicineDisplayName(medicine)}.`);
      return;
    }

    setCart((current) => {
      const sourceKey = `${item.medicineId}-${item.saleUnit}`;
      const target = current.find((row) => row.medicineId === item.medicineId && row.saleUnit === nextUnit);

      if (target) {
        return current
          .filter((row) => `${row.medicineId}-${row.saleUnit}` !== sourceKey)
          .map((row) => row === target ? { ...row, quantity: Number(row.quantity) + Number(item.quantity) } : row);
      }

      return current.map((row) => `${row.medicineId}-${row.saleUnit}` === sourceKey
        ? (() => {
            const nextPrice = getMedicineUnitPrice(medicine, nextUnit);
            return {
            ...row,
            saleUnit: nextUnit,
            unitLabel: getUnitLabel(nextUnit, medicine),
            baseUnitPrice: nextPrice,
            unitPrice: nextPrice,
            itemDiscountType: "FIXED",
            itemDiscountValue: 0,
            stock: available
            };
          })()
        : row);
    });
    setFeedback(`تم تغيير وحدة ${getMedicineDisplayName(medicine)} إلى ${getUnitLabel(nextUnit, medicine)}.`);
    setError("");
  }

  function openCartItemEditor(item) {
    setCartItemEditor({
      medicineId: item.medicineId,
      saleUnit: item.saleUnit,
      name: item.name,
      barcode: item.barcode || "",
      baseUnitPrice: String(item.baseUnitPrice ?? item.unitPrice ?? 0),
      discountType: item.itemDiscountType || "FIXED",
      discountValue: String(item.itemDiscountValue || 0),
      note: item.itemNote || ""
    });
  }

  function saveCartItemEditor(event) {
    event.preventDefault();
    if (!cartItemEditor) return;
    const baseUnitPrice = Math.max(0, Number(cartItemEditor.baseUnitPrice || 0));
    const discountType = cartItemEditor.discountType === "PERCENT" ? "PERCENT" : "FIXED";
    const rawDiscount = Math.max(0, Number(cartItemEditor.discountValue || 0));
    const discountValue = discountType === "PERCENT" ? Math.min(100, rawDiscount) : rawDiscount;
    const unitPrice = discountType === "PERCENT"
      ? Math.max(0, baseUnitPrice * (1 - discountValue / 100))
      : Math.max(0, baseUnitPrice - discountValue);
    const targetKey = `${cartItemEditor.medicineId}-${cartItemEditor.saleUnit}`;

    setCart((current) => current.map((item) => `${item.medicineId}-${item.saleUnit}` === targetKey
      ? {
          ...item,
          baseUnitPrice: Number(baseUnitPrice.toFixed(2)),
          unitPrice: Number(unitPrice.toFixed(2)),
          itemDiscountType: discountType,
          itemDiscountValue: Number(discountValue.toFixed(2)),
          itemNote: cartItemEditor.note.trim()
        }
      : item));
    setCartItemEditor(null);
    setFeedback("تم تحديث سعر وخصم وبيانات الصنف داخل الفاتورة.");
    setError("");
  }

  async function openTreasury() {
    setCashierToolBusy(true);
    setError("");
    try {
      const response = await API.get("/treasury", { params: { limit: 200 } });
      setTreasuryData(response.data.data);
      setActiveCashierTool("treasury");
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تحميل الخزينة"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  async function saveTreasuryAdjustment(event) {
    event.preventDefault();
    setCashierToolBusy(true);
    setError("");
    try {
      await API.post("/treasury/adjustments", { ...treasuryAdjustment, amount: Number(treasuryAdjustment.amount) });
      setTreasuryAdjustment({ direction: "IN", amount: "", paymentMethod: "CASH", note: "" });
      setFeedback("تم تسجيل حركة الخزينة بنجاح.");
      const response = await API.get("/treasury", { params: { limit: 200 } });
      setTreasuryData(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تسجيل حركة الخزينة"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  async function recordCustomerPayment(event) {
    event.preventDefault();
    if (!customerPaymentForm.customerId) return;
    setCashierToolBusy(true);
    setError("");
    try {
      await API.post(`/customers/${customerPaymentForm.customerId}/payments`, {
        amount: Number(customerPaymentForm.amount),
        paymentMethod: customerPaymentForm.paymentMethod,
        note: customerPaymentForm.note
      });
      setCustomerPaymentForm({ customerId: "", amount: "", paymentMethod: "CASH", note: "" });
      setActiveCashierTool("");
      setFeedback("تم تسجيل دفعة العميل وإضافتها إلى الخزينة.");
      setShiftRefreshKey((value) => value + 1);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تسجيل دفعة العميل"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  async function recordSupplierPayment(event) {
    event.preventDefault();
    if (!supplierPaymentForm.supplierId) return;
    setCashierToolBusy(true);
    setError("");
    try {
      await API.post(`/suppliers/${supplierPaymentForm.supplierId}/payments`, {
        amount: Number(supplierPaymentForm.amount),
        paymentMethod: supplierPaymentForm.paymentMethod,
        note: supplierPaymentForm.note
      });
      setSupplierPaymentForm({ supplierId: "", amount: "", paymentMethod: "CASH", note: "" });
      setActiveCashierTool("");
      setFeedback("تم تسجيل سداد المورد وخصمه من الخزينة.");
      setShiftRefreshKey((value) => value + 1);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تسجيل سداد المورد"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  async function returnPurchase(purchaseId) {
    if (!window.confirm("هل تريد إرجاع فاتورة المشتريات وإخراج أصنافها من المخزون؟")) return;
    setCashierToolBusy(true);
    setError("");
    try {
      const response = await API.post(`/purchases/${purchaseId}/return`);
      setFeedback(`تم إرجاع فاتورة المشتريات ${response.data.data.invoiceNumber}.`);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر إرجاع فاتورة المشتريات"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  function addFreeReturnItem(medicine, saleUnit = "BOX") {
    setFreeReturnItems((current) => {
      const existing = current.find((item) => item.medicineId === medicine.id && item.saleUnit === saleUnit);
      if (existing) return current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { medicineId: medicine.id, name: getMedicineDisplayName(medicine), barcode: medicine.barcode || "", saleUnit, unitLabel: getUnitLabel(saleUnit, medicine), quantity: 1 }];
    });
  }

  async function submitFreeReturn(kind) {
    if (!freeReturnItems.length) return;
    setCashierToolBusy(true);
    setError("");
    try {
      const path = kind === "sale" ? "/sales/free-return" : "/purchases/free-return";
      const response = await API.post(path, {
        paymentMethod: freeReturnPaymentMethod,
        supplierId: kind === "purchase" ? (freeReturnSupplierId || null) : undefined,
        items: freeReturnItems.map(({ medicineId, quantity, saleUnit }) => ({ medicineId, quantity: Number(quantity), saleUnit }))
      });
      setFeedback(`${kind === "sale" ? "تم تسجيل مرتجع المبيعات الحر" : "تم تسجيل مرتجع المشتريات الحر"}: ${response.data.data.invoiceNumber}`);
      setFreeReturnItems([]);
      setFreeReturnPaymentMethod("CASH");
      setFreeReturnSupplierId("");
      setToolSearch("");
      setActiveCashierTool("");
      setShiftRefreshKey((value) => value + 1);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "تعذر تسجيل المرتجع الحر"));
    } finally {
      setCashierToolBusy(false);
    }
  }

  async function saveRetailConfiguration() {
    if (!retailConfigMedicine) return;
    setSavingRetailConfig(true);
    setFeedback("");
    setError("");

    try {
      const payload = {
        name: retailConfigMedicine.name,
        barcode: retailConfigMedicine.barcode || "",
        category: retailConfigMedicine.category || "",
        manufacturer: retailConfigMedicine.manufacturer || "",
        description: retailConfigMedicine.description || "",
        purchasePrice: retailConfigMedicine.purchasePrice,
        sellingPrice: retailConfigMedicine.sellingPrice,
        quantity: Number(retailConfigForm.quantity || getMedicineInputQuantity(retailConfigMedicine)),
        minStock: retailConfigMedicine.minStock || 0,
        expiryDate: retailConfigMedicine.expiryDate ? retailConfigMedicine.expiryDate.slice(0, 10) : "",
        batchNumber: retailConfigMedicine.batchNumber || "",
        stripsPerBox: Number(retailConfigForm.stripsPerBox || 1),
        pillsPerStrip: Number(retailConfigForm.pillsPerStrip || 1),
        stripSellingPrice: retailConfigForm.stripSellingPrice === "" ? null : Number(retailConfigForm.stripSellingPrice),
        pillSellingPrice: retailConfigForm.pillSellingPrice === "" ? null : Number(retailConfigForm.pillSellingPrice)
      };

      const response = await API.put(`/medicines/${retailConfigMedicine.id}`, payload);
      const updatedMedicine = response.data.data;
      setRetailConfigMedicine(null);
      setFeedback(`${updatedMedicine.name} is now ready for box, strip, and pill sales.`);
      openQuickSaleSelector(updatedMedicine);
      await loadSalesWorkspace(search);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to configure retail sale for this medicine"));
    } finally {
      setSavingRetailConfig(false);
    }
  }

  const retailPreviewStrips = Math.max(1, Number(retailConfigForm.stripsPerBox || 1));
  const retailPreviewPills = Math.max(1, Number(retailConfigForm.pillsPerStrip || 1));
  const retailPreviewTotalPills = retailPreviewStrips * retailPreviewPills;
  const retailPricingPreview = buildPricingPreview({
    purchasePrice: retailConfigMedicine?.purchasePrice || 0,
    sellingPrice: retailConfigMedicine?.sellingPrice || 0,
    stripsPerBox: retailConfigForm.stripsPerBox || 1,
    pillsPerStrip: retailConfigForm.pillsPerStrip || 1,
    stripSellingPrice: retailConfigForm.stripSellingPrice,
    pillSellingPrice: retailConfigForm.pillSellingPrice
  });

  function getLiveCartStockLimit(medicineId, saleUnit, currentQuantity = 0) {
    const cartItem = cart.find((item) => item.medicineId === medicineId && item.saleUnit === saleUnit);
    const medicine = medicines.find((item) => item.id === medicineId) || getCartMedicine(cartItem);
    if (!medicine) return Math.max(1, Number(currentQuantity || 1));
    const liveStock = getMedicineUnitAvailability(medicine, saleUnit);
    const reservedBySameUnit = cart
      .filter((item) => item.medicineId === medicineId && item.saleUnit === saleUnit)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    return Math.max(1, liveStock - Math.max(0, reservedBySameUnit - Number(currentQuantity || 0)));
  }

  function getCartMedicine(item) {
    if (!item) return null;
    const liveMedicine = medicines.find((medicine) => medicine.id === item.medicineId);
    if (liveMedicine) return liveMedicine;
    return {
      ...item,
      quantity: Number(item.medicineQuantity ?? item.stock ?? 0),
      packagingSummary: item.packagingSummary || null
    };
  }

  function getCartRemaining(item) {
    const medicine = getCartMedicine(item);
    const available = medicine
      ? getMedicineUnitAvailability(medicine, item.saleUnit)
      : Number(item.stock || 0);
    return Math.max(0, available - Number(item.quantity || 0));
  }

  function getCartExpiry(item) {
    const medicine = getCartMedicine(item);
    const expiryDate = medicine?.expiryDate || item.expiryDate;
    return expiryDate ? formatDate(expiryDate) : "غير مسجل";
  }

  return (
    <section className="cashier-sales-screen">
      <div className="cashier-sales-topbar section-card">
        <div className="cashier-branch-meta">
          <strong>الفرع:</strong>
          <span>{currentUser.workspaceName || currentUser.name || "الفرع الرئيسي"}</span>
          <span className="cashier-date-chip"><span aria-hidden="true">⌨</span>{cashierTopDate}</span>
        </div>
        <div className="cashier-sales-topbar-actions" role="toolbar" aria-label="أدوات الكاشير">
          <button type="button" className="cashier-expense-wide-button" title="إضافة مصروف" disabled={!activeShift} onClick={() => setShowExpenseForm(true)}><span>إضافة المصاريف</span><CashierToolbarIcon name="expense" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-blue" title="بحث" aria-label="بحث" data-tooltip="بحث" onClick={() => { cashierSearchInputRef.current?.focus(); cashierSearchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><CashierToolbarIcon name="search" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-slate" title={cart.length ? "تعليق الفاتورة الحالية" : "المبيعات المعلقة"} aria-label={cart.length ? "تعليق الفاتورة الحالية" : "المبيعات المعلقة"} data-tooltip={cart.length ? "تعليق الفاتورة" : `المبيعات المعلقة (${suspendedCheckouts.length})`} onClick={toggleSuspendedCheckout}><CashierToolbarIcon name="pause" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-blue" title="ملء الشاشة" aria-label="ملء الشاشة" data-tooltip="ملء الشاشة" onClick={toggleCashierFullscreen}><CashierToolbarIcon name="fullscreen" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-red" title="مرجع المبيعات" aria-label="مرجع المبيعات" data-tooltip="مرجع المبيعات" onClick={() => { setSelectedSale(null); setShowSalesReference(true); }}><CashierToolbarIcon name="return" /></button>
          <div className="cashier-calculator-anchor" ref={calculatorAnchorRef}>
            <button type="button" className="cashier-toolbar-icon-button tone-green" title="الآلة الحاسبة" aria-label="الآلة الحاسبة" aria-expanded={showCalculator} data-tooltip="الآلة الحاسبة" onClick={() => setShowCalculator((value) => !value)}><CashierToolbarIcon name="calculator" /></button>
            {showCalculator ? <section className="cashier-calculator-popover" role="dialog" aria-label="الآلة الحاسبة">
              <div className="cashier-calculator-popover-head"><div><strong>الآلة الحاسبة</strong><small>استخدم الأرقام و + − × ÷ ثم Enter</small></div><button type="button" aria-label="إغلاق الآلة الحاسبة" onClick={() => setShowCalculator(false)}>✕</button></div>
              <output className="cashier-calculator-display" aria-live="polite">{calculator.display}</output>
              <div className="cashier-calculator-keys">
                {["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", "."].map((key) => <button key={key} type="button" className={key === "=" ? "equals" : (["C", "⌫", "÷", "×", "−", "+"].includes(key) ? "operator" : "")} onClick={() => pressCalculator(key)}>{key}</button>)}
              </div>
            </section> : null}
          </div>
          <button type="button" className="cashier-toolbar-icon-button tone-green" title="تفاصيل الجلسة" aria-label="تفاصيل الجلسة" data-tooltip="تفاصيل الجلسة" onClick={() => refreshSessionReport(true)}><CashierToolbarIcon name="session" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-red" title="إنهاء الجلسة" aria-label="إنهاء الجلسة" data-tooltip="إنهاء الجلسة" disabled={!activeShift} onClick={requestShiftClose}><CashierToolbarIcon name="close" /></button>
          <button type="button" className="cashier-toolbar-icon-button tone-blue" title="رجوع" aria-label="رجوع" data-tooltip="رجوع" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.hash = "#dashboard"; }}><CashierToolbarIcon name="back" /></button>
        </div>
      </div>

      <div className="cashier-operations-ribbon section-card" role="toolbar" aria-label="عمليات نقطة البيع">
        <button type="button" className="op-red" disabled={!activeShift} onClick={() => setShowExpenseForm(true)}><span>▣</span>إضافة مصروفات</button>
        <button type="button" className="op-violet" onClick={() => { setToolSearch(""); setActiveCashierTool("inquiry"); }}><span>ⓘ</span>استعلام أصناف <kbd>F3</kbd></button>
        <button type="button" className="op-orange" onClick={() => setActiveCashierTool("quick")}><span>▦</span>أصناف سريعة</button>
        <button type="button" className="op-blue" onClick={() => setActiveCashierTool("recent")}><span>◷</span>آخر العمليات</button>
        <button type="button" className="op-slate" onClick={() => setActiveCashierTool("suspended")}><span>▣</span>مبيعات معلقة <b>{suspendedCheckouts.length}</b></button>
        <button type="button" className="op-green" onClick={() => setActiveCashierTool("sales-return-options")}><span>↩</span>مرتجع مبيعات</button>
        <button type="button" className="op-brown" onClick={() => setActiveCashierTool("purchase-return-options")}><span>↪</span>مرتجع مشتريات</button>
        <button type="button" className="op-magenta" onClick={() => refreshSessionReport(true)}><span>▤</span>تفاصيل الجلسة</button>
        <button type="button" className="op-emerald" onClick={() => setActiveCashierTool("customer-payment")}><span>▣</span>تحصيل عميل</button>
        <button type="button" className="op-burgundy" disabled={!activeShift} onClick={() => setActiveCashierTool("supplier-payment")}><span>▣</span>دفع لمورد</button>
        <button type="button" className="op-gold" disabled={cashierToolBusy} onClick={openTreasury}><span>▰</span>الخزينة الرئيسية</button>
        <button type="button" className="op-darkred" disabled={!activeShift} onClick={requestShiftClose}><span>⇥</span>إغلاق الوردية</button>
      </div>

      {showExpenseForm ? <div className="cashier-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExpenseForm(false); }}>
        <form className="cashier-modal cashier-expense-modal" onSubmit={addShiftExpense}>
          <div className="cashier-modal-head"><div><strong>إضافة مصروف للجلسة</strong><small>سيُخصم المصروف النقدي من النقد المتوقع في الدرج.</small></div><button type="button" className="cashier-modal-close" onClick={() => setShowExpenseForm(false)}>✕</button></div>
          <label><span>المبلغ</span><input autoFocus required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label><span>نوع المصروف</span><select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}><option value="GENERAL">مصروف عام</option><option value="DELIVERY">توصيل</option><option value="UTILITIES">مرافق</option><option value="SUPPLIER_PAYMENT">دفعة مورد</option><option value="OTHER">أخرى</option></select></label>
          <label><span>طريقة الدفع</span><select value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل بنكي</option></select></label>
          <label className="cashier-modal-wide"><span>البيان أو الملاحظة</span><input required value={expenseForm.note} onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))} placeholder="مثال: شراء أكياس أو دفع فاتورة" /></label>
          <div className="cashier-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowExpenseForm(false)}>إلغاء</button><button type="submit" className="primary-button" disabled={expenseBusy}>{expenseBusy ? "جارٍ الحفظ..." : "حفظ المصروف"}</button></div>
        </form>
      </div> : null}

      {cartItemEditor ? <CashierToolModal
        title={`${cartItemEditor.name} — ${cartItemEditor.barcode || "بدون باركود"}`}
        subtitle="تعديل بيانات هذا الصنف داخل الفاتورة الحالية فقط"
        onClose={() => setCartItemEditor(null)}
      >
        <form className="cashier-item-editor" onSubmit={saveCartItemEditor}>
          <label className="wide"><span>سعر الوحدة</span><input autoFocus required type="number" min="0" step="0.01" value={cartItemEditor.baseUnitPrice} onChange={(event) => setCartItemEditor((current) => ({ ...current, baseUnitPrice: event.target.value }))} /></label>
          <label><span>نوع الخصم</span><select value={cartItemEditor.discountType} onChange={(event) => setCartItemEditor((current) => ({ ...current, discountType: event.target.value }))}><option value="FIXED">ثابت</option><option value="PERCENT">نسبة مئوية</option></select></label>
          <label><span>{cartItemEditor.discountType === "PERCENT" ? "نسبة الخصم %" : "مبلغ الخصم"}</span><input type="number" min="0" max={cartItemEditor.discountType === "PERCENT" ? "100" : undefined} step="0.01" value={cartItemEditor.discountValue} onChange={(event) => setCartItemEditor((current) => ({ ...current, discountValue: event.target.value }))} /></label>
          <label className="wide"><span>الوصف / الرقم التسلسلي / IMEI</span><textarea rows="4" value={cartItemEditor.note} onChange={(event) => setCartItemEditor((current) => ({ ...current, note: event.target.value }))} placeholder="أدخل السيريال أو IMEI أو أي ملاحظة تخص هذا الصنف" /><small>تُحفظ هذه المعلومة مع الصنف داخل الفاتورة.</small></label>
          <div className="cashier-item-editor-actions"><button type="button" className="secondary-button" onClick={() => setCartItemEditor(null)}>إغلاق</button><button type="submit" className="primary-button">حفظ التعديل</button></div>
        </form>
      </CashierToolModal> : null}

      {activeCashierTool === "inquiry" ? <CashierToolModal title="استعلام عن صنف" subtitle="ابحث بالاسم العربي أو الإنجليزي أو الباركود" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-tool-search"><span>⌕</span><input autoFocus data-unified-medicine-search="true" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /></div>
        <div className="cashier-inquiry-results">
          {inquiryMedicines.slice(0, 30).map((medicine) => <article key={medicine.id}>
            <div><strong>{getMedicineDisplayName(medicine)}</strong><small>{medicine.barcode || "بدون باركود"} · {getPackagingLabel(medicine)}</small></div>
            <div><span>المخزون <b>{medicine.quantity} {medicine.stockUnit || getUnitLabel("BOX", medicine)}</b></span><span>البيع <b>{formatCurrency(medicine.sellingPrice)}</b></span></div>
            <button type="button" onClick={() => { openQuickSaleSelector(medicine); setActiveCashierTool(""); }}>إضافة للسلة</button>
          </article>)}
          {!toolSearch.trim() ? <div className="cashier-tool-empty">ابدأ بكتابة اسم الصنف أو الباركود لعرض تفاصيله.</div> : null}
        </div>
      </CashierToolModal> : null}

      {activeCashierTool === "quick" ? <CashierToolModal title="الأصناف السريعة" subtitle="اضغط على الصنف لإضافته مباشرة إلى السلة" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-quick-products">{medicines.filter((medicine) => Number(medicine.quantity || 0) > 0).slice(0, 24).map((medicine) => <button type="button" key={medicine.id} onClick={() => { addToCart(medicine, getAvailableSaleUnits(medicine).find((unit) => getMedicineUnitAvailability(medicine, unit) > 0) || "BOX"); setActiveCashierTool(""); }}><strong>{getMedicineDisplayName(medicine)}</strong><small>{medicine.barcode || "بدون باركود"}</small><span>{formatCurrency(medicine.sellingPrice)}</span></button>)}</div>
      </CashierToolModal> : null}

      {activeCashierTool === "recent" ? <CashierToolModal title="آخر العمليات" subtitle="آخر فواتير البيع المسجلة على النظام" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-operation-list">{sales.slice(0, 40).map((sale) => <article key={sale.id}><div><strong>{sale.invoiceNumber}</strong><small>{sessionDateTime(sale.createdAt)} · {sale.customer?.name || "زبون نقدي"}</small></div><span className={`cashier-status-pill ${sale.status === "RETURNED" ? "returned" : "done"}`}>{sale.status === "RETURNED" ? "مرتجعة" : "مكتملة"}</span><strong>{formatCurrency(sale.finalAmount)}</strong><button type="button" onClick={() => { loadSaleDetails(sale.id); setShowSalesReference(true); setActiveCashierTool(""); }}>التفاصيل</button></article>)}{!sales.length ? <div className="cashier-tool-empty">لا توجد عمليات مسجلة.</div> : null}</div>
      </CashierToolModal> : null}

      {activeCashierTool === "suspended" ? <CashierToolModal title="المبيعات المعلقة (المسودة)" subtitle="يمكنك استرجاع أي فاتورة معلقة ومتابعة البيع" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-operation-list">{suspendedCheckouts.map((checkout) => <article key={checkout.id}><div><strong>فاتورة معلقة #{checkout.id}</strong><small>{sessionDateTime(checkout.createdAt)} · {(checkout.cart || []).length} أصناف</small></div><strong>{formatCurrency((checkout.cart || []).reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0) - Number(checkout.discount || 0))}</strong><button type="button" onClick={() => resumeSuspendedCheckout(checkout)}>استرجاع</button><button type="button" className="danger-link" onClick={() => setSuspendedCheckouts((current) => current.filter((item) => item.id !== checkout.id))}>حذف</button></article>)}{!suspendedCheckouts.length ? <div className="cashier-tool-empty">لا توجد فواتير معلقة.</div> : null}</div>
      </CashierToolModal> : null}

      {activeCashierTool === "sales-return-options" ? <CashierToolModal title="خيارات مرتجع المبيعات" subtitle="اختر نوع عملية المرتجع التي تريد تنفيذها" onClose={() => setActiveCashierTool("")}>
        <div className="cashier-return-options"><button type="button" className="invoice" onClick={() => { setSelectedSale(null); setShowSalesReference(true); setActiveCashierTool(""); }}><span>▤</span><strong>مرتجع من فاتورة</strong><small>استرجاع أصناف من فاتورة بيع مسجلة</small></button><button type="button" className="free" onClick={() => { setFreeReturnItems([]); setToolSearch(""); setActiveCashierTool("free-sale-return"); }}><span>↩</span><strong>مرتجع مبيعات حر</strong><small>إرجاع صنف بدون فاتورة أصلية</small></button></div>
      </CashierToolModal> : null}

      {activeCashierTool === "purchase-return-options" ? <CashierToolModal title="خيارات مرتجع المشتريات" subtitle="اختر فاتورة المورد أو أنشئ مرتجعًا حرًا" onClose={() => setActiveCashierTool("")}>
        <div className="cashier-return-options"><button type="button" className="invoice" onClick={() => setActiveCashierTool("purchase-return")}><span>▤</span><strong>مرتجع من فاتورة</strong><small>إرجاع أصناف من فاتورة مشتريات مسجلة</small></button><button type="button" className="free" onClick={() => { setFreeReturnItems([]); setToolSearch(""); setActiveCashierTool("free-purchase-return"); }}><span>↪</span><strong>مرتجع مشتريات حر</strong><small>إرجاع أصناف للمورد بدون فاتورة أصلية</small></button></div>
      </CashierToolModal> : null}

      {["free-sale-return", "free-purchase-return"].includes(activeCashierTool) ? <CashierToolModal title={activeCashierTool === "free-sale-return" ? "مرتجع مبيعات حر" : "مرتجع مشتريات حر"} subtitle="ابحث عن الصنف، اختر وحدته وكميته، ثم سجل المرتجع" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-free-return-layout">
          <section><div className="cashier-tool-search"><span>⌕</span><input autoFocus data-unified-medicine-search="true" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR} /></div><div className="cashier-return-search-results">{inquiryMedicines.slice(0, 12).map((medicine) => <article key={medicine.id}><div><strong>{getMedicineDisplayName(medicine)}</strong><small>{medicine.barcode || "بدون باركود"} · متاح {medicine.quantity}</small></div><div>{getAvailableSaleUnits(medicine).map((unit) => <button type="button" key={unit} onClick={() => addFreeReturnItem(medicine, unit)}>{getUnitLabel(unit, medicine)}</button>)}</div></article>)}</div></section>
          <section className="cashier-free-return-cart"><h3>أصناف المرتجع</h3>{freeReturnItems.map((item) => <article key={`${item.medicineId}-${item.saleUnit}`}><div><strong>{item.name}</strong><small>{item.unitLabel} · {item.barcode || "بدون باركود"}</small></div><input type="number" min="1" value={item.quantity} onChange={(event) => setFreeReturnItems((current) => current.map((row) => row === item ? { ...row, quantity: Math.max(1, Number(event.target.value || 1)) } : row))} /><button type="button" onClick={() => setFreeReturnItems((current) => current.filter((row) => row !== item))}>✕</button></article>)}{!freeReturnItems.length ? <div className="cashier-tool-empty">لم تتم إضافة أصناف بعد.</div> : null}<div className="cashier-free-return-controls">{activeCashierTool === "free-purchase-return" ? <select value={freeReturnSupplierId} onChange={(event) => setFreeReturnSupplierId(event.target.value)}><option value="">بدون مورد محدد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select> : null}<select value={freeReturnPaymentMethod} onChange={(event) => setFreeReturnPaymentMethod(event.target.value)}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل بنكي</option></select><button type="button" disabled={!freeReturnItems.length || !activeShift || cashierToolBusy} onClick={() => submitFreeReturn(activeCashierTool === "free-sale-return" ? "sale" : "purchase")}>{cashierToolBusy ? "جارٍ التسجيل..." : "تسجيل المرتجع"}</button>{!activeShift ? <small>افتح وردية أولًا لتسجيل المرتجع.</small> : null}</div></section>
        </div>
      </CashierToolModal> : null}

      {activeCashierTool === "purchase-return" ? <CashierToolModal title="مرتجع مشتريات" subtitle="اختر فاتورة المورد الأصلية لإرجاع الأصناف وتحديث المخزون والخزينة" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-operation-list">{purchases.slice(0, 60).map((purchase) => <article key={purchase.id}><div><strong>{purchase.invoiceNumber}</strong><small>{purchase.supplier?.name || "بدون مورد"} · {sessionDateTime(purchase.createdAt)} · {(purchase.items || []).length} أصناف</small></div><span className={`cashier-status-pill ${purchase.status === "RETURNED" ? "returned" : "done"}`}>{purchase.status === "RETURNED" ? "مرتجعة" : purchase.paymentStatus === "PAID" ? "مدفوعة" : "غير مدفوعة"}</span><strong>{formatCurrency(purchase.totalAmount)}</strong><button type="button" disabled={purchase.status === "RETURNED" || cashierToolBusy} onClick={() => returnPurchase(purchase.id)}>إرجاع</button></article>)}{!purchases.length ? <div className="cashier-tool-empty">لا توجد فواتير مشتريات.</div> : null}</div>
      </CashierToolModal> : null}

      {activeCashierTool === "customer-payment" ? <CashierToolModal title="تسجيل دفعة من عميل" subtitle="تُخصم من مديونية العميل وتُضاف إلى الخزينة الرئيسية" onClose={() => setActiveCashierTool("")}>
        <form className="cashier-tool-form" onSubmit={recordCustomerPayment}>
          <label><span>العميل</span><select required value={customerPaymentForm.customerId} onChange={(event) => setCustomerPaymentForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">اختر العميل</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — مديونية {formatCurrency(customer.accountBalance || 0)}</option>)}</select></label>
          <label><span>المبلغ</span><input required min="0.01" step="0.01" type="number" value={customerPaymentForm.amount} onChange={(event) => setCustomerPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label><span>طريقة الدفع</span><select value={customerPaymentForm.paymentMethod} onChange={(event) => setCustomerPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل بنكي</option></select></label>
          <label><span>ملاحظة</span><input value={customerPaymentForm.note} onChange={(event) => setCustomerPaymentForm((current) => ({ ...current, note: event.target.value }))} placeholder="رقم إيصال أو ملاحظة" /></label>
          <button type="submit" className="primary-button" disabled={cashierToolBusy}>{cashierToolBusy ? "جارٍ التسجيل..." : "تسجيل الدفعة"}</button>
        </form>
      </CashierToolModal> : null}

      {activeCashierTool === "supplier-payment" ? <CashierToolModal title="تسجيل سداد لمورد" subtitle="يُسجل كمصروف في الوردية ويُخصم من الخزينة الرئيسية" onClose={() => setActiveCashierTool("")}>
        <form className="cashier-tool-form" onSubmit={recordSupplierPayment}>
          <label><span>المورد</span><select required value={supplierPaymentForm.supplierId} onChange={(event) => setSupplierPaymentForm((current) => ({ ...current, supplierId: event.target.value }))}><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label><span>المبلغ</span><input required min="0.01" step="0.01" type="number" value={supplierPaymentForm.amount} onChange={(event) => setSupplierPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label><span>طريقة الدفع</span><select value={supplierPaymentForm.paymentMethod} onChange={(event) => setSupplierPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل بنكي</option></select></label>
          <label><span>ملاحظة</span><input value={supplierPaymentForm.note} onChange={(event) => setSupplierPaymentForm((current) => ({ ...current, note: event.target.value }))} placeholder="رقم إيصال أو بيان السداد" /></label>
          {!activeShift ? <div className="notice error">افتح وردية أولًا لتسجيل سداد المورد.</div> : null}
          <button type="submit" className="primary-button" disabled={cashierToolBusy || !activeShift}>{cashierToolBusy ? "جارٍ التسجيل..." : "تسجيل السداد"}</button>
        </form>
      </CashierToolModal> : null}

      {activeCashierTool === "treasury" ? <CashierToolModal title={treasuryData?.account?.name || "الخزينة الرئيسية"} subtitle="كل المبيعات والمصروفات والتحصيلات والسداد والمرتجعات تظهر هنا" onClose={() => setActiveCashierTool("")} wide>
        <div className="cashier-treasury-summary"><article><span>الرصيد الحالي</span><strong>{formatCurrency(treasuryData?.summary?.balance || 0)}</strong></article><article className="income"><span>إجمالي الداخل</span><strong>{formatCurrency(treasuryData?.summary?.totalIncome || 0)}</strong></article><article className="expense"><span>إجمالي الخارج</span><strong>{formatCurrency(treasuryData?.summary?.totalExpenses || 0)}</strong></article></div>
        {["ADMIN", "PHARMACIST"].includes(currentUser.role) ? <form className="cashier-treasury-adjustment" onSubmit={saveTreasuryAdjustment}><select value={treasuryAdjustment.direction} onChange={(event) => setTreasuryAdjustment((current) => ({ ...current, direction: event.target.value }))}><option value="IN">إيداع / إضافة</option><option value="OUT">سحب / خصم</option></select><input required min="0.01" step="0.01" type="number" value={treasuryAdjustment.amount} onChange={(event) => setTreasuryAdjustment((current) => ({ ...current, amount: event.target.value }))} placeholder="المبلغ" /><select value={treasuryAdjustment.paymentMethod} onChange={(event) => setTreasuryAdjustment((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل</option></select><input required value={treasuryAdjustment.note} onChange={(event) => setTreasuryAdjustment((current) => ({ ...current, note: event.target.value }))} placeholder="سبب الحركة" /><button type="submit" disabled={cashierToolBusy}>حفظ الحركة</button></form> : null}
        <div className="cashier-treasury-ledger"><div className="head"><span>الوقت</span><span>الحركة</span><span>المرجع</span><span>الدفع</span><span>المبلغ</span><span>الرصيد بعد الحركة</span></div>{(treasuryData?.transactions || []).map((transaction) => <div key={transaction.id}><span>{sessionDateTime(transaction.createdAt)}</span><span><b className={transaction.direction === "IN" ? "money-in" : "money-out"}>{transaction.direction === "IN" ? "داخل" : "خارج"}</b><small>{transaction.note || transaction.type}</small></span><span>{transaction.referenceNumber || "—"}</span><span>{transaction.paymentMethod || "—"}</span><strong className={transaction.direction === "IN" ? "money-in" : "money-out"}>{transaction.direction === "IN" ? "+" : "−"}{formatCurrency(transaction.amount)}</strong><strong>{formatCurrency(transaction.balanceAfter)}</strong></div>)}{!(treasuryData?.transactions || []).length ? <div className="cashier-tool-empty">لا توجد حركات خزينة حتى الآن.</div> : null}</div>
      </CashierToolModal> : null}

      {showSessionDetails ? <CashierSessionReport shift={sessionReport} currentUser={currentUser} onClose={() => setShowSessionDetails(false)} onEndShift={() => { setShowSessionDetails(false); requestShiftClose(); }} /> : null}
      {showSalesReference ? <CashierSalesReference sales={sales} selectedSale={selectedSale} onSelect={loadSaleDetails} onReturn={returnSale} onClose={() => setShowSalesReference(false)} /> : null}
      <CashierShiftWidget key={shiftRefreshKey} user={currentUser} onChange={setActiveShift} requestClose={shiftCloseRequest} />

      <section className="section-card cashier-reference-cart" aria-label="سلة البيع">
      <div className={`cashier-sales-layout${productsPanelCollapsed ? " products-collapsed" : ""}`}>
        {!productsPanelCollapsed ? <section className="section-card cashier-sales-panel">
          <div className="cashier-products-panel-head"><strong>المنتجات</strong><small>اختر صنفًا أو استخدم البحث والباركود داخل السلة</small></div>
          <div className="cashier-results-grid">
            {loading ? (
              <div className="empty-state">جارٍ تحميل الأصناف...</div>
            ) : medicines.length ? (
              medicines.slice(0, 12).map((medicine) => (
                <button key={medicine.id} type="button" className="cashier-result-card" onClick={() => openSuggestion(medicine)}>
                  <strong>{getMedicineDisplayName(medicine)}</strong>
                  <span>{medicine.barcode || "بدون باركود"}</span>
                  <small>{getAvailableSaleUnits(medicine).map((unit) => getUnitLabel(unit, medicine)).join(" / ")}</small>
                  <CashierStockBadge remaining={getMedicineUnitAvailability(medicine, "BOX")} compact />
                </button>
              ))
            ) : (
              <div className="empty-state">لا توجد أصناف مطابقة.</div>
            )}
          </div>
        </section> : null}

        <section ref={cartSectionRef} className="section-card cashier-bill-panel">
        <div className="cashier-sale-search-card">
          <div className="cashier-sales-entry-row">
            <div className="cashier-reference-customer-picker">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.5-4.1 2.7-6.2 6.5-6.2s6 2.1 6.5 6.2" /></svg>
              </span>
              <select
                ref={cashierCounterpartyPickerRef}
                aria-label="نوع الزبون أو الحساب"
                value={counterpartyPickerValue}
                onChange={(event) => handleCounterpartyPickerChange(event.target.value)}
              >
                <option value="CASH">زبون نقدي</option>
                <option value="CUSTOMER">عميل</option>
                <option value="SUPPLIER">مورد</option>
                <option value="BOTH">عميل ومورد</option>
                {customers.length ? <optgroup label="العملاء">{customers.filter((customer) => customer.contactRole !== "BOTH").map((customer) => <option key={`customer-${customer.id}`} value={`CUSTOMER:${customer.id}`}>{customer.name}</option>)}</optgroup> : null}
                {suppliers.length ? <optgroup label="الموردون">{suppliers.filter((supplier) => supplier.contactRole !== "BOTH").map((supplier) => <option key={`supplier-${supplier.id}`} value={`SUPPLIER:${supplier.id}`}>{supplier.name}</option>)}</optgroup> : null}
                {suppliers.some((supplier) => supplier.contactRole === "BOTH" && supplier.linkedCustomer?.id) ? <optgroup label="عميل ومورد">{suppliers.filter((supplier) => supplier.contactRole === "BOTH" && supplier.linkedCustomer?.id).map((supplier) => <option key={`both-${supplier.id}`} value={`BOTH:${supplier.id}`}>{supplier.name}</option>)}</optgroup> : null}
              </select>
            </div>
            <button
              type="button"
              className="cashier-plus-button cashier-counterparty-plus"
              title="اختيار زبون أو حساب"
              aria-label="فتح قائمة الزبائن والحسابات"
              onClick={() => {
                cashierCounterpartyPickerRef.current?.focus();
                cashierCounterpartyPickerRef.current?.showPicker?.();
              }}
            >＋</button>
            <div className="cashier-search-inline cashier-unified-search">
              <input
                ref={cashierSearchInputRef}
                data-unified-medicine-search="true"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveSearchSuggestion(1);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveSearchSuggestion(-1);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSearch("");
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const activeSuggestion = searchSuggestions[activeSearchSuggestionIndex];
                    const query = search.trim().toLowerCase();
                    const activeIsExactBarcode = activeSuggestion
                      && String(activeSuggestion.barcode || "").trim().toLowerCase() === query;
                    if (activeIsExactBarcode) handleUnifiedMedicineSearch();
                    else if (activeSuggestion) openSuggestion(activeSuggestion);
                    else handleUnifiedMedicineSearch();
                  }
                }}
                placeholder={MEDICINE_SEARCH_PLACEHOLDER_AR}
              />
              <kbd>F4</kbd>
              <button type="button" className="cashier-search-button" onClick={handleUnifiedMedicineSearch}>⌕</button>
            </div>
            <button type="button" className={`cashier-products-toggle${productsPanelCollapsed ? " collapsed" : ""}`} onClick={() => setProductsPanelCollapsed((value) => !value)} title={productsPanelCollapsed ? "إظهار المنتجات" : "توسيع السلة"} aria-label={productsPanelCollapsed ? "إظهار لوحة المنتجات" : "إخفاء لوحة المنتجات وتوسيع السلة"} aria-expanded={!productsPanelCollapsed}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                <path d="M10 5v14" />
                {productsPanelCollapsed ? <path d="m13.5 9 3 3-3 3M16.5 12h-5" /> : <path d="m7.5 9-3 3 3 3M4.5 12h5" />}
              </svg>
            </button>
          </div>

          {search.trim() ? <div className="cashier-search-suggestions" aria-label="نتائج البحث السريعة" onScroll={syncSearchSuggestionWithScroll}>{searchSuggestions.map((medicine, index) => <button key={medicine.id} type="button" data-cashier-suggestion-index={index} className={activeSearchSuggestionIndex === index ? "active" : ""} onMouseEnter={() => setActiveSearchSuggestionIndex(index)} onFocus={() => setActiveSearchSuggestionIndex(index)} onClick={() => openSuggestion(medicine)}><span><strong>{getMedicineDisplayName(medicine)}</strong><small>{medicine.barcode || "بدون باركود"} · {getPackagingLabel(medicine)}</small></span><span><b>{formatCurrency(medicine.sellingPrice)}</b><em className="cashier-available-quantity">المتاح: {getMedicineAvailabilityLabel(medicine)}</em></span></button>)}{!loading && !searchSuggestions.length ? <div>لا توجد أصناف مطابقة.</div> : null}</div> : null}

          {scannedMedicine ? (
            <div ref={quickSaleRef} tabIndex={-1} className="cashier-selected-strip">
              <div className="cashier-selected-name">
                <div className="cashier-selected-title-line"><strong>{getMedicineDisplayName(scannedMedicine)}</strong><em className="cashier-available-quantity">المتاح: {getMedicineAvailabilityLabel(scannedMedicine, quickSaleUnit)}</em></div>
                <span>{scannedMedicine.barcode || "بدون باركود"}</span>
              </div>
              <div className="cashier-selected-controls">
                <div className="quick-sale-units cashier-unit-tabs">
                  {getAvailableSaleUnits(scannedMedicine).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={quickSaleUnit === unit ? "primary-button" : "secondary-button"}
                      disabled={getMedicineUnitAvailability(scannedMedicine, unit) <= 0}
                      onClick={() => setQuickSaleUnit(unit)}
                    >
                      {getUnitLabel(unit, scannedMedicine)}
                    </button>
                  ))}
                </div>
                <div className="cashier-qty-stepper">
                  <button
                    type="button"
                    className="cashier-step-button"
                    onClick={() => setQuickSaleQuantity((current) => Math.max(1, current - 1))}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={getMedicineUnitAvailability(scannedMedicine, quickSaleUnit)}
                    value={quickSaleQuantity}
                    onChange={(event) => setQuickSaleQuantity(Math.max(1, Math.min(Number(event.target.value || 1), getMedicineUnitAvailability(scannedMedicine, quickSaleUnit))))}
                  />
                  <button
                    type="button"
                    className="cashier-step-button"
                    onClick={() => setQuickSaleQuantity((current) => Math.min(getMedicineUnitAvailability(scannedMedicine, quickSaleUnit), current + 1))}
                  >
                    +
                  </button>
                </div>
                <div className="cashier-selected-price">{formatCurrency(getMedicineUnitPrice(scannedMedicine, quickSaleUnit))}</div>
                <button type="button" className="primary-button" onClick={confirmQuickSale}>إضافة</button>
              </div>
            </div>
          ) : null}
        </div>

          <div className="cashier-bill-table">
            <div className="cashier-bill-head">
              <span>الصنف</span>
              <span>سعر الوحدة</span>
              <span>الكمية</span>
              <span>المجموع</span>
              <span aria-label="حذف">✕</span>
            </div>
            {cart.length ? cart.map((item) => (
              <div key={`${item.medicineId}-${item.saleUnit}`} className="cashier-bill-row">
                <div className="cashier-bill-item-name">
                  <button type="button" className="cashier-bill-item-edit" onClick={() => openCartItemEditor(item)} title="تعديل السعر والخصم وإضافة سيريال أو ملاحظة"><span aria-hidden="true">i</span><strong>{item.name}</strong><em className="cashier-available-quantity">المتاح: {getMedicineAvailabilityLabel(getCartMedicine(item), item.saleUnit)}</em></button>
                  <small>{item.barcode || "بدون باركود"} · الصلاحية: {getCartExpiry(item)}{item.batchNumber ? ` · تشغيلة ${item.batchNumber}` : ""}{item.itemNote ? ` · ${item.itemNote}` : ""}</small>
                </div>
                <span>{formatCurrency(item.unitPrice)}</span>
                <div className="cashier-bill-qty">
                  <div className="cashier-reference-qty-line">
                    <select
                      aria-label={`وحدة ${item.name}`}
                      value={item.saleUnit}
                      onChange={(event) => changeCartItemUnit(item, event.target.value)}
                    >
                      {getAvailableSaleUnits(getCartMedicine(item) || item).map((unit) => (
                        <option key={unit} value={unit}>{getUnitLabel(unit, getCartMedicine(item))}</option>
                      ))}
                    </select>
                    <div className="cashier-bill-qty-controls">
                      <button
                        type="button"
                        className="cashier-step-button cashier-minus-button"
                        onClick={() => updateCartQuantity(item.medicineId, item.saleUnit, Math.max(1, item.quantity - 1))}
                      >
                        −
                      </button>
                      <input
                        ref={(element) => {
                          const key = `${item.medicineId}-${item.saleUnit}`;
                          if (element) cartQuantityInputRefs.current.set(key, element);
                          else cartQuantityInputRefs.current.delete(key);
                        }}
                        type="number"
                        min="1"
                        max={getLiveCartStockLimit(item.medicineId, item.saleUnit, item.quantity)}
                        value={item.quantity}
                        onChange={(event) => updateCartQuantity(item.medicineId, item.saleUnit, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          const step = event.key === "ArrowUp" ? 1 : -1;
                          updateCartQuantity(item.medicineId, item.saleUnit, Math.max(1, Number(item.quantity || 1) + step));
                        }}
                      />
                      <button
                        type="button"
                        className="cashier-step-button cashier-add-button"
                        onClick={() => updateCartQuantity(item.medicineId, item.saleUnit, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <strong className="cashier-line-total">{formatCurrency(Number(item.unitPrice) * Number(item.quantity))}</strong>
                <button type="button" className="cashier-remove-button" onClick={() => removeFromCart(item.medicineId, item.saleUnit)}>✕</button>
              </div>
            )) : (
              <div className="cashier-empty-bill">السلة فارغة. اختر صنفًا من الأعلى.</div>
            )}
          </div>

          {feedback || error ? (
            <div className={`cashier-cart-notice ${error ? "error" : "success"}`} role="status" aria-live="polite">
              <span className="cashier-cart-notice-icon" aria-hidden="true">{error ? "!" : "✓"}</span>
              <strong>{error || feedback}</strong>
              <button type="button" aria-label="إغلاق الرسالة" onClick={() => { setFeedback(""); setError(""); }}>✕</button>
            </div>
          ) : null}

          <div className="cashier-discount-row">
            <label className="cashier-reference-price-group"><span>فئة السعر <kbd>F2</kbd></span><select ref={cashierPriceGroupRef} value={selectedPriceGroupId} onChange={(event) => { setSelectedPriceGroupId(event.target.value); if (!event.target.value) setDiscount(0); }}><option value="">السعر الافتراضي</option>{priceGroups.map((group) => <option key={group.id} value={group.id}>{group.name} — خصم {group.discountPercent}%</option>)}</select></label>
            <label><span>الخصم</span><input type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" /></label>
            <label><span>طريقة الدفع المتعدد</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="CASH">نقدي</option>
              <option value="CARD">بطاقة</option>
              <option value="TRANSFER">تحويل</option>
              <option value="CREDIT" disabled={!customerId || !["CUSTOMER", "BOTH"].includes(counterpartyType)}>آجل على حساب العميل</option>
            </select></label>
            <div className="cashier-bill-summary cashier-bill-summary-inline">
              <strong className="cashier-sold-quantity">الكمية المباعة: {cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} وحدة</strong>
              <strong className="cashier-grand-total">المجموع: {formatCurrency(finalAmount)}</strong>
            </div>
          </div>

          <div className="cashier-reference-checkout-footer">
          <div className="cashier-reference-shortcuts" role="toolbar" aria-label="اختصارات السلة">
            <button type="button" onClick={() => setActiveCashierTool("suspended")}>
              <span className="cashier-reference-action-icon draft" aria-hidden="true">▤</span>
              <b>مسودة فاتورة</b>
            </button>
            <button type="button" disabled={!cart.length} onClick={() => setFeedback("تم تجهيز الفاتورة الحالية كعرض سعر قبل إتمام الدفع.")}>
              <span className="cashier-reference-action-icon quote" aria-hidden="true">✎</span>
              <b>عرض سعر</b>
            </button>
            <button type="button" disabled={!cart.length} onClick={toggleSuspendedCheckout}>
              <span className="cashier-reference-action-icon suspend" aria-hidden="true">Ⅱ</span>
              <b>تعليق</b>
            </button>
            <button type="button" disabled={completingSale || !cart.length || !customerId || !["CUSTOMER", "BOTH"].includes(counterpartyType) || (currentUser.role === "CASHIER" && !activeShift)} onClick={() => { setPaymentMethod("CREDIT"); completeSale("CREDIT"); }}>
              <span className="cashier-reference-action-icon credit" aria-hidden="true">✓</span>
              <b>بيع آجل</b>
            </button>
            <button type="button" disabled={completingSale || !cart.length || !counterpartyReady || (currentUser.role === "CASHIER" && !activeShift)} onClick={() => { setPaymentMethod("CARD"); completeSale("CARD"); }}>
              <span className="cashier-reference-action-icon card" aria-hidden="true">▰</span>
              <b>بطاقة</b>
            </button>
          </div>

          <div className="cashier-pay-actions">
            <button type="button" className="cashier-cancel-button" disabled={completingSale} onClick={() => { setCart([]); setScannedMedicine(null); setQuickSaleQuantity(1); setSearch(""); setMedicineResultsQuery(""); setDiscount(0); }}>
              <span aria-hidden="true">☒</span> إلغاء
            </button>
            <button type="button" className="cashier-cash-button" disabled={completingSale || !cart.length || !counterpartyReady || (currentUser.role === "CASHIER" && !activeShift)} onClick={() => { setPaymentMethod("CASH"); completeSale("CASH"); }}>
              <span aria-hidden="true">▣</span> {completingSale ? "جارٍ الدفع..." : "دفع نقدي (Enter)"}
            </button>
            <button type="button" className="cashier-card-button cashier-multi-button" disabled={completingSale || !cart.length || !counterpartyReady || (paymentMethod === "CREDIT" && (!customerId || !["CUSTOMER", "BOTH"].includes(counterpartyType))) || (currentUser.role === "CASHIER" && !activeShift)} onClick={() => completeSale(paymentMethod)}>
              <span aria-hidden="true">▦</span> دفع متعدد
            </button>
          </div>
          </div>
        </section>
      </div>
      </section>
    </section>
  );
}

function Alerts() {
  const [lowStock, setLowStock] = useState([]);
  const [expiringSoon, setExpiringSoon] = useState([]);
  const [expired, setExpired] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([API.get("/medicines/low-stock"), API.get("/medicines/expiring-soon"), API.get("/inventory/expired")])
      .then(([lowResponse, expiringResponse, expiredResponse]) => {
        if (active) {
          setLowStock(lowResponse.data.data);
          setExpiringSoon(expiringResponse.data.data);
          setExpired(expiredResponse.data.data);
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "Failed to load alerts"));
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <section className="section-card"><div className="notice error">{error}</div></section>;
  }

  return (
    <section className="section-card">
      <p className="eyebrow">Alerts</p>
      <h2>Inventory alerts</h2>
      <div className="split-grid">
        <div>
          <h3>Low stock</h3>
          {lowStock.length ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Quantity</th>
                    <th>Minimum stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((medicine) => (
                    <tr key={medicine.id} className="warn-row">
                      <td>{medicine.name}</td>
                      <td>{medicine.quantity}</td>
                      <td>{medicine.minStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No low stock alerts right now.</div>
          )}
        </div>
        <div>
          <h3>Expiring soon</h3>
          {expiringSoon.length ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Expiry date</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringSoon.map((medicine) => (
                    <tr key={medicine.id}>
                      <td>{medicine.name}</td>
                      <td>{formatDate(medicine.expiryDate)}</td>
                      <td>{medicine.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No medicines expiring in the next 30 days.</div>
          )}
        </div>
      </div>
      <div className="section-card" style={{ marginTop: 20 }}>
        <h3>Expired medicines</h3>
        {expired.length ? (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Expiry date</th>
                  <th>Stock</th>
                  <th>Batch</th>
                </tr>
              </thead>
              <tbody>
                {expired.map((medicine) => (
                  <tr key={medicine.id} className="warn-row">
                    <td>{medicine.name}</td>
                    <td>{formatDate(medicine.expiryDate)}</td>
                    <td>{medicine.quantity}</td>
                    <td>{medicine.batchNumber || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No expired medicines right now.</div>
        )}
      </div>
    </section>
  );
}

function ReportsPage() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [range, setRange] = useState({
    from: formatDateInput(monthStart),
    to: formatDateInput(today)
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [exportingType, setExportingType] = useState("");

  async function loadReports(nextRange = range) {
    setLoading(true);
    setError("");
    try {
      const response = await API.get("/reports/overview", { params: nextRange });
      setReport(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load reports"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports({
      from: formatDateInput(monthStart),
      to: formatDateInput(today)
    });
  }, []);

  async function exportReport(type) {
    setExportingType(type);
    setFeedback("");
    setError("");
    try {
      const response = await API.get(`/reports/export/${type}`, {
        params: range,
        responseType: "blob"
      });
      downloadBlob(response.data, type === "pdf" ? "pharmacore-reports.pdf" : "pharmacore-reports.xls");
      setFeedback(`${type.toUpperCase()} report exported successfully.`);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to export ${type.toUpperCase()} report`));
    } finally {
      setExportingType("");
    }
  }

  return (
    <section className="stack-lg">
      <div className="hero-banner split">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Sales, purchases, profit, suppliers, and stock reports</h2>
          <p className="muted">Review revenue trends, estimated profit, best-selling medicines, supplier performance, and stock health in one reports workspace.</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" disabled={exportingType === "excel"} onClick={() => exportReport("excel")}>
            {exportingType === "excel" ? "Exporting Excel..." : "Export Excel"}
          </button>
          <button type="button" className="secondary-button" disabled={exportingType === "pdf"} onClick={() => exportReport("pdf")}>
            {exportingType === "pdf" ? "Exporting PDF..." : "Export PDF"}
          </button>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="section-card">
        <div className="section-title">
          <div>
            <h3>Report range</h3>
            <p className="muted">Choose a date range for sales and purchase reporting, then refresh the dashboard.</p>
          </div>
        </div>
        <div className="input-grid compact">
          <input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
          <input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => loadReports()}>
            Refresh reports
          </button>
        </div>
      </section>

      {loading || !report ? (
        <section className="section-card">Loading reports...</section>
      ) : (
        <>
          <div className="stats-grid">
            <article className="section-card stat-card"><span className="muted">Sales count</span><strong>{report.summary.salesCount}</strong></article>
            <article className="section-card stat-card"><span className="muted">Purchase count</span><strong>{report.summary.purchaseCount}</strong></article>
            <article className="section-card stat-card"><span className="muted">Revenue</span><strong>{formatCurrency(report.summary.totalRevenue)}</strong></article>
            <article className="section-card stat-card"><span className="muted">Refunded</span><strong>{formatCurrency(report.summary.totalRefunded)}</strong></article>
            <article className="section-card stat-card"><span className="muted">Net revenue</span><strong>{formatCurrency(report.summary.netRevenue)}</strong></article>
            <article className="section-card stat-card"><span className="muted">Purchase spend</span><strong>{formatCurrency(report.summary.totalPurchaseSpend)}</strong></article>
            <article className="section-card stat-card"><span className="muted">Estimated profit</span><strong>{formatCurrency(report.summary.estimatedProfit)}</strong></article>
          </div>

          <div className="split-grid">
            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Daily sales report</h3>
                  <p className="muted">Revenue and invoice count grouped by day.</p>
                </div>
              </div>
              {report.dailySales.length ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoices</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.dailySales.map((item) => (
                        <tr key={item.date}>
                          <td>{item.date}</td>
                          <td>{item.invoiceCount}</td>
                          <td>{formatCurrency(item.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No daily sales in the selected range.</div>
              )}
            </section>

            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Monthly sales report</h3>
                  <p className="muted">Revenue grouped by month from the selected report period.</p>
                </div>
              </div>
              {report.monthlySales.length ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Invoices</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.monthlySales.map((item) => (
                        <tr key={item.month}>
                          <td>{item.month}</td>
                          <td>{item.invoiceCount}</td>
                          <td>{formatCurrency(item.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No monthly sales to summarize.</div>
              )}
            </section>
          </div>

          <div className="split-grid">
            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Best-selling medicines</h3>
                  <p className="muted">Top medicines by quantity sold with revenue and estimated profit.</p>
                </div>
              </div>
              {report.bestSelling.length ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Qty sold</th>
                        <th>Revenue</th>
                        <th>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.bestSelling.map((item) => (
                        <tr key={item.medicineId}>
                          <td>{item.name}</td>
                          <td>{item.quantitySold}</td>
                          <td>{formatCurrency(item.revenue)}</td>
                          <td>{formatCurrency(item.estimatedProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No best-selling data available yet.</div>
              )}
            </section>

            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Supplier report</h3>
                  <p className="muted">Supplier medicines, invoice volume, and total purchase spending.</p>
                </div>
              </div>
              {report.suppliers.length ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th>Medicines</th>
                        <th>Invoices</th>
                        <th>Purchases</th>
                        <th>Last purchase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.suppliers.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.medicineCount}</td>
                          <td>{item.purchaseInvoicesCount}</td>
                          <td>{formatCurrency(item.totalPurchases)}</td>
                          <td>{item.lastPurchaseAt ? formatDate(item.lastPurchaseAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No supplier report data available yet.</div>
              )}
            </section>
          </div>

          <div className="split-grid">
            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Low stock report</h3>
                  <p className="muted">Medicines that need replenishment soon.</p>
                </div>
              </div>
              {report.lowStock.length ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Stock</th>
                        <th>Min stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lowStock.map((medicine) => (
                        <tr key={medicine.id} className="warn-row">
                          <td>{medicine.name}</td>
                          <td>{medicine.quantity}</td>
                          <td>{medicine.minStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">No low stock medicines in the report.</div>
              )}
            </section>

            <section className="section-card">
              <div className="section-title">
                <div>
                  <h3>Expiry report</h3>
                  <p className="muted">Expired and expiring-soon medicines for stock safety review.</p>
                </div>
              </div>
              <div className="stack-md">
                <div className="mini-panel">
                  <strong>Expired</strong>
                  <span>{report.expiry.expired.map((medicine) => medicine.name).join(", ") || "None"}</span>
                </div>
                <div className="mini-panel">
                  <strong>Expiring soon</strong>
                  <span>{report.expiry.expiringSoon.map((medicine) => medicine.name).join(", ") || "None"}</span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function AccountPage({ user }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setFeedback("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      await API.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback("Password changed successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to change password"));
    }
  }

  return (
    <section className="stack-lg">
      <div className="hero-banner split">
        <div>
          <p className="eyebrow">My account</p>
          <h2>{user.name}</h2>
          <p className="muted">{user.email} | {roleLabel(user.role)}</p>
        </div>
      </div>

      {feedback ? <div className="notice success">{feedback}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="section-card">
        <div className="section-title">
          <div>
            <h3>Change password</h3>
            <p className="muted">Use your current password to set a new one.</p>
          </div>
        </div>
        <form className="stack-md" onSubmit={submit}>
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" required />
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" required />
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" required />
          <button type="submit" className="primary-button">Update password</button>
        </form>
      </section>
    </section>
  );
}

function WorkspaceHome({ user, sections, onOpen, locale }) {
  const sectionByKey = Object.fromEntries(sections.map((section) => [section.key, section]));
  const boardGroups = [
    {
      title: locale === "ar" ? "المبيعات" : "Sales",
      headerTone: "#d9ebff",
      headerText: "#2f72e8",
      tiles: [
        { key: "cashier", pageKey: "sales", sectionKey: "sales", label: locale === "ar" ? "الكاشير" : "Cashier", glyph: "▦", size: "wide", tone: "#227ea7" },
        { key: "sales-report", pageKey: "sales-detailed-report", sectionKey: "sales", label: locale === "ar" ? "تقرير المبيعات" : "Sales report", glyph: "🧾", tone: "#247fa8" },
        { key: "sales-return", pageKey: "sales-returns", sectionKey: "sales", label: locale === "ar" ? "مرتجع البيع" : "Sales return", glyph: "↺", tone: "#247fa8" },
        { key: "sales-customers", pageKey: "customer-accounts", sectionKey: "contacts-users", label: locale === "ar" ? "حسابات الزبائن" : "Customer accounts", glyph: "♟", tone: "#247fa8" },
        { key: "sales-shifts", pageKey: "cashier-shifts", sectionKey: "sales", label: locale === "ar" ? "الورديات" : "Shifts", glyph: "▤", tone: "#247fa8" }
      ]
    },
    {
      title: locale === "ar" ? "المشتريات" : "Purchases",
        headerTone: "#fff0bf",
        headerText: "#9b7a11",
        tiles: [
        { key: "purchase-add", pageKey: "purchases-add", sectionKey: "purchases", label: locale === "ar" ? "إضافة شراء" : "Add purchase", glyph: "🧾", size: "wide", tone: "#d9be00" },
        { key: "purchase-suppliers", sectionKey: "suppliers", label: locale === "ar" ? "الموردين" : "Suppliers", glyph: "👤", tone: "#d9be00" },
        { key: "purchase-return", pageKey: "purchases-return", sectionKey: "purchases", label: locale === "ar" ? "مرجع شراء" : "Purchase return", glyph: "✱", tone: "#d9be00" },
        { key: "purchase-expense", pageKey: "expenses-list", sectionKey: "purchases", label: locale === "ar" ? "المصاريف" : "Expenses", glyph: "💵", size: "wide", tone: "#d9be00" }
      ]
    },
    {
      title: locale === "ar" ? "المخزون" : "Inventory",
      headerTone: "#e4f8db",
      headerText: "#4d9322",
      tiles: [
        { key: "stock-add", sectionKey: "medicines", label: locale === "ar" ? "إضافة صنف" : "Add item", glyph: "◈", size: "wide", tone: "#24b6c7" },
        { key: "stock-items", sectionKey: "medicines", label: locale === "ar" ? "الاصناف" : "Items", glyph: "▣", size: "wide", tone: "#24b6c7" },
        { key: "stock-move", sectionKey: "inventory", label: locale === "ar" ? "جرد سريع" : "Fast stocktake", glyph: "▦", tone: "#24b6c7" },
        { key: "stock-barcode", sectionKey: "medicines", label: locale === "ar" ? "ملصق باركود" : "Barcode label", glyph: "▥", tone: "#24b6c7" }
      ]
    },
    {
      title: locale === "ar" ? "الشؤون الادارية والمالية" : "Admin and finance",
      headerTone: "#def6ff",
      headerText: "#3d6ecf",
      tiles: [
        { key: "admin-settings", pageKey: "settings", sectionKey: "dashboard", label: locale === "ar" ? "الإعدادات" : "Settings", glyph: "⚙", size: "wide", tone: "#4c80ef" },
        { key: "admin-activity", sectionKey: "dashboard", label: locale === "ar" ? "سجل النشاط" : "Activity log", glyph: "☷", tone: "#4c80ef" },
        { key: "admin-users", sectionKey: "contacts-users", label: locale === "ar" ? "المستخدمين" : "Users", glyph: "👥", tone: "#4c80ef" },
        { key: "admin-profit", sectionKey: "dashboard", label: locale === "ar" ? "الربح / الخسارة" : "Profit / loss", glyph: "$", tone: "#4c80ef" },
        { key: "admin-expiry", sectionKey: "inventory", label: locale === "ar" ? "الصلاحيات" : "Expiry", glyph: "⚙", tone: "#4c80ef" }
      ]
    }
  ];

  return (
    <section className="cash-home stack-lg">
      <div className="cash-home-greeting-bar">
        <h2>{locale === "ar" ? `أهلاً وسهلاً، ${user.name}` : `Welcome, ${user.name}`}</h2>
      </div>

      <div className="cash-board-grid exact-board">
        {boardGroups.map((group) => (
          <section key={group.title} className="cash-board-column">
            <div className="cash-board-header">
              <span style={{ "--board-header-bg": group.headerTone, "--board-header-text": group.headerText }}>{group.title}</span>
            </div>
            <div className="cash-board-tiles">
              {group.tiles.map((tile) => {
                const linkedSection = sectionByKey[tile.sectionKey] || sections[0];
                return (
                  <button
                    key={tile.key}
                    type="button"
                    className={`cash-module-tile ${tile.size === "wide" ? "wide" : ""}`}
                    style={{ "--section-accent": tile.tone || linkedSection.accent }}
                    onClick={() => onOpen(tile.pageKey || linkedSection.key)}
                  >
                    <span className="cash-module-icon">
                      <HomeGlyph symbol={tile.glyph} />
                    </span>
                    <strong>{tile.label}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

    </section>
  );
}

function GlobalUtilityWidget({ locale }) {
  const [open, setOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [calculator, setCalculator] = useState({ display: "0", stored: null, operator: null, replace: true });
  const anchorRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function press(key) {
    setCalculator((current) => {
      if (key === "C") return { display: "0", stored: null, operator: null, replace: true };
      if (key === "⌫") return current.replace || current.display.length <= 1 ? { ...current, display: "0", replace: true } : { ...current, display: current.display.slice(0, -1) };
      if (/^\d$/.test(key) || key === ".") {
        if (key === "." && !current.replace && current.display.includes(".")) return current;
        return { ...current, display: current.replace ? (key === "." ? "0." : key) : current.display + key, replace: false };
      }
      const calculate = (left, right, operator) => operator === "+" ? left + right : operator === "−" ? left - right : operator === "×" ? left * right : operator === "÷" ? (right === 0 ? 0 : left / right) : right;
      const value = Number(current.display || 0);
      if (["+", "−", "×", "÷"].includes(key)) {
        const result = current.stored !== null && current.operator && !current.replace ? calculate(current.stored, value, current.operator) : value;
        return { display: String(Number(result.toFixed(8))), stored: result, operator: key, replace: true };
      }
      if (key === "=" && current.stored !== null && current.operator) {
        const result = calculate(current.stored, value, current.operator);
        return { display: String(Number(result.toFixed(8))), stored: null, operator: null, replace: true };
      }
      return current;
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      const keyMap = { Enter: "=", "=": "=", "+": "+", "-": "−", "*": "×", "/": "÷", Backspace: "⌫", Delete: "C", c: "C", C: "C", x: "×", X: "×", Escape: "CLOSE", ",": "." };
      const key = /^\d$/.test(event.key) || event.key === "." ? event.key : keyMap[event.key];
      if (!key) return;
      event.preventDefault();
      if (key === "CLOSE") setOpen(false); else press(key);
    }
    function handleOutside(event) { if (!anchorRef.current?.contains(event.target)) setOpen(false); }
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => { window.removeEventListener("keydown", handleKey); document.removeEventListener("mousedown", handleOutside); };
  }, [open]);

  return <div className="global-utility-widget" ref={anchorRef}>
    <time dateTime={currentTime.toISOString()} title={locale === "ar" ? "التاريخ والوقت الحالي" : "Current date and time"}>◫ {formatTopBarDate(locale, currentTime, true)}</time>
    <button type="button" className="global-calculator-button" title={locale === "ar" ? "الآلة الحاسبة" : "Calculator"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>▦</button>
    {open ? <section className="global-calculator-popover" role="dialog" aria-label={locale === "ar" ? "الآلة الحاسبة" : "Calculator"}><header><div><strong>{locale === "ar" ? "الآلة الحاسبة" : "Calculator"}</strong><small>{locale === "ar" ? "تعمل بالماوس والكيبورد" : "Mouse and keyboard enabled"}</small></div><button type="button" onClick={() => setOpen(false)}>✕</button></header><output>{calculator.display}</output><div>{["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", "."].map((key) => <button key={key} type="button" className={key === "=" ? "equals" : (["C", "⌫", "÷", "×", "−", "+"].includes(key) ? "operator" : "")} onClick={() => press(key)}>{key}</button>)}</div></section> : null}
  </div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [locale, setLocale] = useState(getInitialLocale);
  const [railGroupExpansion, setRailGroupExpansion] = useState({});
  const pageShellRef = useRef(null);

  useEffect(() => {
    const normalizeMedicineSearchInputs = (root = document) => {
      const candidates = root.matches?.("input") ? [root] : Array.from(root.querySelectorAll?.("input") || []);
      candidates.forEach((input) => {
        const hint = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
        const isMedicineSearch = /(الصنف|الدواء|باركود|barcode|medicine|item|sku)/i.test(hint) && /(بحث|ابحث|اسم|جزء|مسح|اكتب|search|scan|enter)/i.test(hint);
        if (!isMedicineSearch && input.dataset.unifiedMedicineSearch !== "true") return;
        input.dataset.unifiedMedicineSearch = "true";
        input.placeholder = document.documentElement.lang?.startsWith("ar") ? MEDICINE_SEARCH_PLACEHOLDER_AR : MEDICINE_SEARCH_PLACEHOLDER_EN;
      });
    };
    const focusUnifiedMedicineSearch = (event) => {
      if (event.key !== "F4") return;
      const input = Array.from(document.querySelectorAll('input[data-unified-medicine-search="true"]'))
        .find((candidate) => !candidate.disabled && candidate.offsetParent !== null);
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    normalizeMedicineSearchInputs(document);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) normalizeMedicineSearchInputs(node);
    })));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("keydown", focusUnifiedMedicineSearch);
    return () => { observer.disconnect(); window.removeEventListener("keydown", focusUnifiedMedicineSearch); };
  }, [page, locale]);

  function navigateToPage(nextPage, options = {}) {
    const resolvedPage = APP_PAGE_KEYS.includes(nextPage) ? nextPage : "dashboard";
    setPage(resolvedPage);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      pageShellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    if (!authReady || !user) return;

    const nextHash = `#${resolvedPage}`;
    const updateMethod = options.replace ? "replaceState" : "pushState";

    if (window.location.hash !== nextHash || window.history.state?.appPage !== resolvedPage || options.replace) {
      window.history[updateMethod]({ appPage: resolvedPage }, "", nextHash);
    }
  }

  useEffect(() => {
    const localeConfig = LOCALES[locale] || LOCALES.en;
    document.documentElement.lang = localeConfig.code;
    document.documentElement.dir = localeConfig.dir;
    setLocalePreference(locale);
  }, [locale]);

  useEffect(() => {
    applyButtonTooltips(document.body, locale);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) applyButtonTooltips(node, locale);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale, page, user]);

  useEffect(() => {
    function handleLogout() {
      setUser(null);
      setAuthReady(true);
    }

    window.addEventListener("auth:logout", handleLogout);

    const token = localStorage.getItem("token");
    if (!token) {
      setAuthReady(true);
      return () => window.removeEventListener("auth:logout", handleLogout);
    }

    API.get("/auth/me")
      .then((response) => {
        setUser(response.data.user);
      })
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => {
        setAuthReady(true);
      });

    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    pageShellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);

  useEffect(() => {
    if (!authReady || !user) return;

    const statePage = window.history.state?.appPage;
    const hashPage = window.location.hash.replace("#", "");
    const initialPage = APP_PAGE_KEYS.includes(statePage) && statePage !== "home"
      ? statePage
      : APP_PAGE_KEYS.includes(hashPage) && hashPage !== "home"
        ? hashPage
        : "dashboard";

    setPage(initialPage);
    window.history.replaceState({ appPage: initialPage }, "", `#${initialPage}`);

    function handlePopState() {
      const nextStatePage = window.history.state?.appPage;
      const nextHashPage = window.location.hash.replace("#", "");
      const nextPage = APP_PAGE_KEYS.includes(nextStatePage)
        ? nextStatePage
        : APP_PAGE_KEYS.includes(nextHashPage)
          ? nextHashPage
          : "dashboard";

      setPage(nextPage);

      if (!APP_PAGE_KEYS.includes(nextStatePage) && !APP_PAGE_KEYS.includes(nextHashPage)) {
        window.history.replaceState({ appPage: "dashboard" }, "", "#dashboard");
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [authReady, user]);

  if (!authReady) {
    return (
      <div className="login-screen">
        <LocaleSwitch locale={locale} onToggle={() => setLocale((current) => current === "ar" ? "en" : "ar")} className="locale-switch-floating" />
        <div className="auth-card">Checking session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LocaleSwitch locale={locale} onToggle={() => setLocale((current) => current === "ar" ? "en" : "ar")} className="locale-switch-floating" />
        <Login onLogin={setUser} />
      </>
    );
  }

  const toggleLocale = () => setLocale((current) => current === "ar" ? "en" : "ar");
  const primarySections = [
    { key: "dashboard", label: locale === "ar" ? "لوحة المتابعة" : "Follow-up board", badge: "DB", tag: "Overview", icon: "dashboard", accent: "#0f8c6b", softAccent: "rgba(15, 140, 107, 0.16)", detail: locale === "ar" ? "نظرة عامة سريعة" : "Quick overview", element: <FollowUpBoard locale={locale} user={user} onNavigate={navigateToPage} /> },
    { key: "medicines", label: "Medicines", badge: "MD", tag: "Stock", icon: "medicines", accent: "#d17127", softAccent: "rgba(209, 113, 39, 0.16)", detail: "Stock and items", element: <Medicines /> },
    { key: "sales", label: "Sales", badge: "SL", tag: "Checkout", icon: "sales", accent: "#5468d9", softAccent: "rgba(84, 104, 217, 0.16)", detail: "Cashier workflow", element: <SalesPage currentUser={user} /> },
    { key: "purchases", label: "Purchases", badge: "PI", tag: "Invoices", icon: "purchases", accent: "#c94f69", softAccent: "rgba(201, 79, 105, 0.16)", detail: "Supplier invoices", element: <PurchasesListPage currentPage="purchases" onNavigate={navigateToPage} /> },
    { key: "inventory", label: "Inventory", badge: "IV", tag: "Warehouse", icon: "inventory", accent: "#1286a6", softAccent: "rgba(18, 134, 166, 0.16)", detail: "Movements and stock", element: <InventoryCountWorkspace currentUser={user} /> },
    { key: "suppliers", label: "Suppliers", badge: "SU", tag: "Vendors", icon: "suppliers", accent: "#6d8c2d", softAccent: "rgba(109, 140, 45, 0.16)", detail: "Vendor records", element: <SuppliersPage currentUser={user} onNavigate={navigateToPage} /> },
    { key: "contacts-users", label: "Users", badge: "US", tag: "People", icon: "suppliers", accent: "#4c80ef", softAccent: "rgba(76, 128, 239, 0.16)", detail: "Users and contacts", element: <UsersPage currentUser={user} /> },
    { key: "accounting-accounts", label: locale === "ar" ? "إدارة الحسابات" : "Accounting", badge: "AC", tag: "Finance", icon: "inventory", accent: "#16a765", softAccent: "rgba(22, 167, 101, 0.16)", detail: locale === "ar" ? "الحسابات والتقارير المالية" : "Accounts and financial reports", element: <AccountingAccountsPage /> }
  ];

  const topBarQuickLinks = locale === "ar"
    ? [
      { key: "cashier", label: "الكاشير", target: "sales", icon: "▦" },
      { key: "purchases", label: "المشتريات", target: "purchases", icon: "🧾" },
      { key: "inventory", label: "المخزون", target: "inventory", icon: "◈" },
      { key: "user", label: user.name, target: "home", icon: "◉" }
    ]
    : [
      { key: "cashier", label: "Cashier", target: "sales", icon: "▦" },
      { key: "purchases", label: "Purchases", target: "purchases", icon: "🧾" },
      { key: "inventory", label: "Inventory", target: "inventory", icon: "◈" },
      { key: "user", label: user.name, target: "home", icon: "◉" }
    ];

  const rightRailItems = locale === "ar"
    ? [
      { key: "home", label: locale === "ar" ? "الرئيسية" : "Home", target: "home" },
      { key: "dashboard", label: "لوحة المتابعة", target: "dashboard" },
      { key: "medicines", label: "الأدوية", target: "medicines", children: [
        { key: "selling-price-group", label: "مجموعات الأسعار", target: "selling-price-group" },
        { key: "update-product-price", label: "تحديث الأسعار", target: "update-product-price" },
        { key: "stock-adjustments", label: "المخزون التالف", target: "stock-adjustments" },
        { key: "labels-show", label: "طباعة الملصقات", target: "labels-show" }
      ] },
      { key: "inventory", label: "الجرد والمخزون", target: "inventory", children: [
        { key: "inventory-low-stock", label: "نواقص المخزون", target: "inventory-low-stock" },
        { key: "inventory-expiring", label: "قريبة انتهاء الصلاحية", target: "inventory-expiring" },
        { key: "inventory-expired", label: "منتهية الصلاحية", target: "inventory-expired" },
        { key: "inventory-stale", label: "الأدوية الراكدة", target: "inventory-stale" }
      ] },
      { key: "sales", label: "المبيعات والكاشير", target: "sales", children: SALES_NAV_ITEMS.map((item) => ({ ...item, label: item.labelAr, target: item.target || item.key })) },
      { key: "purchases", label: "المشتريات والمصاريف", target: "purchases", children: PURCHASES_NAV_ITEMS.map((item) => ({ ...item, label: item.labelAr, target: item.target || item.key })) },
      { key: "contacts", label: "العملاء والموردين", target: "contacts-customers", children: CONTACTS_NAV_ITEMS.map((item) => ({ ...item, label: item.labelAr })) },
      { key: "accounting", label: "إدارة الحسابات", target: "accounting-accounts", children: ACCOUNTING_NAV_ITEMS.map((item) => ({ ...item, label: item.labelAr, target: item.key })) },
      { key: "settings", label: "الإعدادات", target: "settings" }
    ]
    : [
      { key: "home", label: "Home", target: "home" },
      { key: "dashboard", label: "Follow-up board", target: "dashboard" },
      { key: "medicines", label: "Medicines", target: "medicines", children: [
        { key: "selling-price-group", label: "Price groups", target: "selling-price-group" },
        { key: "update-product-price", label: "Update prices", target: "update-product-price" },
        { key: "stock-adjustments", label: "Damaged stock", target: "stock-adjustments" },
        { key: "labels-show", label: "Print labels", target: "labels-show" }
      ] },
      { key: "inventory", label: "Inventory", target: "inventory", children: [
        { key: "inventory-low-stock", label: "Low stock", target: "inventory-low-stock" },
        { key: "inventory-expiring", label: "Expiring soon", target: "inventory-expiring" },
        { key: "inventory-expired", label: "Expired", target: "inventory-expired" },
        { key: "inventory-stale", label: "Stale medicines", target: "inventory-stale" }
      ] },
      { key: "sales", label: "Sales & cashier", target: "sales", children: SALES_NAV_ITEMS.map((item) => ({ ...item, label: item.labelEn, target: item.target || item.key })) },
      { key: "purchases", label: "Purchases & expenses", target: "purchases", children: PURCHASES_NAV_ITEMS.map((item) => ({ ...item, label: item.labelEn, target: item.target || item.key })) },
      { key: "contacts", label: "Customers & suppliers", target: "contacts-customers", children: CONTACTS_NAV_ITEMS.map((item) => ({ ...item, label: item.labelEn })) },
      { key: "accounting", label: "Accounting", target: "accounting-accounts", children: ACCOUNTING_NAV_ITEMS.map((item) => ({ ...item, label: item.labelEn, target: item.key })) },
      { key: "settings", label: "Settings", target: "settings" }
    ];

  function itemContainsPage(item, currentPage) {
    return item.target === currentPage || item.children?.some((child) => (child.target || child.key) === currentPage);
  }

  function handleRailItemClick(item, isExpanded) {
    if (!item.children) {
      navigateToPage(item.target);
      return;
    }

    setRailGroupExpansion((current) => ({ ...current, [item.key]: !isExpanded }));
    if (!itemContainsPage(item, page)) navigateToPage(item.target);
  }

  const pages = {
    home: {
      label: "Home",
      badge: "HM",
      detail: "Choose a section",
      element: <WorkspaceHome user={user} sections={primarySections} onOpen={navigateToPage} locale={locale} />
    },
    settings: { label: "Settings", detail: "Main settings", element: <SettingsPage /> },
    "selling-price-group": { label: "Price groups", detail: "Price group management", element: <SellingPriceGroupsPage currentPage="selling-price-group" onNavigate={navigateToPage} /> },
    "update-product-price": { label: "Update prices", detail: "Bulk price update", element: <UpdateProductPricePage currentPage="update-product-price" onNavigate={navigateToPage} /> },
    "stock-adjustments": { label: "Damaged stock", detail: "Stock adjustments", element: <DamagedStockPage currentPage="stock-adjustments" onNavigate={navigateToPage} /> },
    "labels-show": { label: "Labels", detail: "Print labels", element: <LabelsShowPage currentPage="labels-show" onNavigate={navigateToPage} /> },
    "sales-add": { label: "Sales add", detail: "Add sales", element: <SalesAddPage currentPage="sales-add" onNavigate={navigateToPage} /> },
    "sales-list": { label: "Sales list", detail: "All sales", element: <SalesListPage currentPage="sales-list" onNavigate={navigateToPage} /> },
    "sales-register": { label: "Sales register", detail: "Cash register log", element: <SalesRegisterPage currentPage="sales-register" onNavigate={navigateToPage} /> },
    "sales-drafts": { label: "Sales drafts", detail: "Drafts", element: <SalesDraftsPage currentPage="sales-drafts" onNavigate={navigateToPage} /> },
    "sales-pricing": { label: "Sales pricing", detail: "Quotations", element: <SalesPricingPage currentPage="sales-pricing" onNavigate={navigateToPage} /> },
    "sales-returns": { label: "Sales returns", detail: "Returns", element: <SalesReturnsPage currentPage="sales-returns" onNavigate={navigateToPage} /> },
    "sales-shipping": { label: "Sales shipping", detail: "Shipping", element: <SalesShippingPage currentPage="sales-shipping" onNavigate={navigateToPage} /> },
    "sales-promotions": { label: "Sales promotions", detail: "Promotions", element: <SalesPromotionsPage currentPage="sales-promotions" onNavigate={navigateToPage} /> },
    "sales-import": { label: "Sales import", detail: "Import", element: <SalesImportPage currentPage="sales-import" onNavigate={navigateToPage} /> },
    "sales-detailed-report": { label: "Sales detailed report", detail: "Detailed report", element: <SalesDetailedReportPage currentPage="sales-detailed-report" onNavigate={navigateToPage} /> },
    "cashier-shifts": { label: "Cashier shifts", detail: "Shift reconciliation", element: <CashierShiftsPage user={user} /> },
    "purchases-add": { label: "Purchases add", detail: "Add purchase", element: <PurchasesPage /> },
    "purchases-list": { label: "Purchases list", detail: "All purchases", element: <PurchasesListPage currentPage="purchases-list" onNavigate={navigateToPage} /> },
    "purchases-return": { label: "Purchases return", detail: "Purchase return", element: <PurchasesReturnPage currentPage="purchases-return" onNavigate={navigateToPage} /> },
    "purchases-report": { label: "Purchases report", detail: "Purchase report", element: <PurchasesReportPage currentPage="purchases-report" onNavigate={navigateToPage} /> },
    "expenses-list": { label: "Expenses list", detail: "Expenses", element: <ExpensesListPage currentPage="expenses-list" onNavigate={navigateToPage} /> },
    "expenses-add": { label: "Expenses add", detail: "Add expense", element: <ExpensesAddPage currentPage="expenses-add" onNavigate={navigateToPage} /> },
    "expenses-categories": { label: "Expenses categories", detail: "Expense categories", element: <ExpensesCategoriesPage currentPage="expenses-categories" onNavigate={navigateToPage} /> },
    "expenses-report": { label: "Expenses report", detail: "Expense report", element: <ExpensesReportPage currentPage="expenses-report" onNavigate={navigateToPage} /> },
    "inventory-low-stock": { label: "Low stock details", detail: "Low and critical stock", element: <MonitoringDetailsPage kind="inventory-low-stock" onNavigate={navigateToPage} /> },
    "inventory-expiring": { label: "Expiring medicines", detail: "Expiring soon", element: <MonitoringDetailsPage kind="inventory-expiring" onNavigate={navigateToPage} /> },
    "inventory-expired": { label: "Expired medicines", detail: "Expired inventory", element: <MonitoringDetailsPage kind="inventory-expired" onNavigate={navigateToPage} /> },
    "inventory-stale": { label: "Stale medicines", detail: "No recent sales", element: <MonitoringDetailsPage kind="inventory-stale" onNavigate={navigateToPage} /> },
    "contacts-suppliers": { label: "Contacts suppliers", detail: "Suppliers", element: <SuppliersPage currentUser={user} onNavigate={navigateToPage} /> },
    "contacts-customers": { label: "Contacts customers", detail: "Customers", element: <CustomersPage currentUser={user} onNavigate={navigateToPage} /> },
    "customer-accounts": { label: "Customer accounts", detail: "Credit and payments", element: <CustomerAccountsPage /> },
    "contacts-users": { label: "Contacts users", detail: "Employees", element: <UsersPage currentUser={user} /> },
    "contacts-agents": { label: "Contacts agents", detail: "Agents", element: <ContactsAgentsPage currentPage="contacts-agents" onNavigate={navigateToPage} /> },
    "contacts-roles": { label: "Contacts roles", detail: "Roles", element: <ContactsRolesPage currentPage="contacts-roles" onNavigate={navigateToPage} /> },
    "contacts-groups": { label: "Contacts groups", detail: "Groups", element: <ContactsGroupsPage currentPage="contacts-groups" onNavigate={navigateToPage} /> },
    "contacts-report": { label: "Contacts report", detail: "Summary report", element: <ContactsSummaryReportPage currentPage="contacts-report" onNavigate={navigateToPage} /> },
    "contacts-register-report": { label: "Contacts register report", detail: "Register report", element: <ContactsRegisterReportPage currentUser={user} currentPage="contacts-register-report" onNavigate={navigateToPage} /> },
    "contacts-sales-agent-report": { label: "Contacts sales agent report", detail: "Agent report", element: <ContactsSalesAgentReportPage currentPage="contacts-sales-agent-report" onNavigate={navigateToPage} /> },
    "contacts-import": { label: "Contacts import", detail: "Import", element: <ContactsImportPage currentPage="contacts-import" onNavigate={navigateToPage} /> },
    "accounting-accounts": { label: "Accounting accounts", detail: "Chart of accounts", element: <AccountingAccountsPage /> },
    "accounting-profit-loss": { label: "Profit and loss", detail: "Income report", element: <AccountingProfitLossPage /> },
    "accounting-trading": { label: "Trading report", detail: "Purchases and sales", element: <AccountingTradingPage /> },
    "accounting-trial-balance": { label: "Trial balance", detail: "Debit and credit", element: <AccountingTrialBalancePage /> },
    "accounting-cash-flow": { label: "Cash flow", detail: "Treasury movements", element: <AccountingCashFlowPage /> },
    "accounting-balance-sheet": { label: "Balance sheet", detail: "Assets and liabilities", element: <AccountingBalanceSheetPage /> },
    "accounting-movements": { label: "Account movements", detail: "Accounting ledger", element: <AccountingMovementsPage /> }
  };

  primarySections.forEach((section) => {
    pages[section.key] = section;
  });

  const isSalesFocusPage = page === "sales";

  return (
    <div className={`app-shell cash-app-shell${isSalesFocusPage ? " sales-focus-mode" : ""}`}>
      <header className="cash-topbar">
        <div className="cash-topbar-brand">
          <button type="button" className="cash-brand-button" onClick={() => navigateToPage("home")}>
            <BrandLockup compact />
          </button>
        </div>

        {isSalesFocusPage ? <div className="cash-topbar-center cash-topbar-center--sales" /> : (
          <div className="cash-topbar-center">
            <div className="cash-topbar-shortcuts">
              {topBarQuickLinks.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="cash-top-shortcut"
                  onClick={() => navigateToPage(item.target)}
                >
                  <span className="cash-top-shortcut-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cash-topbar-tools">
          <GlobalUtilityWidget locale={locale} />
          <LocaleSwitch locale={locale} onToggle={toggleLocale} className="cash-inline-locale" />
          <button
            type="button"
            className="cash-logout-button"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <div className={`cash-main-layout${isSalesFocusPage ? " cash-main-layout--sales" : ""}`}>
        <main ref={pageShellRef} className={`page-shell cash-page-shell ${page === "home" ? "home-mode" : ""}`}>{pages[page].element}</main>
        {!isSalesFocusPage ? (
        <aside className="cash-right-rail">
          <div className="cash-right-rail-head">
            <div className="cash-right-user">
              <strong>{user.name}</strong>
              <span>{roleLabel(user.role)}</span>
            </div>
          </div>
          <div className="cash-right-list">
            {rightRailItems.map((item) => {
              const groupActive = itemContainsPage(item, page);
              const isExpanded = item.children
                ? (Object.prototype.hasOwnProperty.call(railGroupExpansion, item.key) ? railGroupExpansion[item.key] : groupActive)
                : false;
              return (
                <div key={item.key} className={groupActive ? "cash-right-group active" : "cash-right-group"}>
                  <button type="button" className="cash-right-item" aria-expanded={item.children ? isExpanded : undefined} onClick={() => handleRailItemClick(item, isExpanded)}>
                    <span>{item.label}</span>
                    <small>{item.children ? (isExpanded ? "⌃" : "⌄") : "‹"}</small>
                  </button>
                  {item.children && isExpanded ? (
                    <div className="cash-right-sublist">
                      {item.children.map((child) => (
                        <button
                          key={child.key}
                          type="button"
                          className={(child.target || child.key) === page ? "cash-right-subitem active" : "cash-right-subitem"}
                          onClick={() => navigateToPage(child.target || child.key)}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>
        ) : null}
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="login-screen">
          <div className="auth-card">
            <BrandLockup />
            <h1>حدث خطأ في عرض الصفحة</h1>
            <p className="muted">اضغط الزر للرجوع إلى لوحة المتابعة وتشغيل الموقع مرة أخرى.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                window.history.replaceState({ appPage: "dashboard" }, "", "#dashboard");
                window.location.reload();
              }}
            >
              فتح لوحة المتابعة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(<AppErrorBoundary><App /></AppErrorBoundary>);






