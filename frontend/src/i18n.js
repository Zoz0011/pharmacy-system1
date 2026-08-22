export const LOCALE_STORAGE_KEY = "pharmacy-locale";

export const LOCALES = {
  en: { code: "en", dir: "ltr", label: "English" },
  ar: { code: "ar", dir: "rtl", label: "العربية" }
};

const EXACT_TRANSLATIONS = {
  ar: {
    PharmaCore: "فارما كور",
    "Sign in": "تسجيل الدخول",
    "Access the pharmacy dashboard, medicines workspace, and user management tools.": "ادخل إلى لوحة الصيدلية ومساحة الأدوية وأدوات إدارة المستخدمين.",
    Email: "البريد الإلكتروني",
    Password: "كلمة المرور",
    "Signing in...": "جارٍ تسجيل الدخول...",
    Login: "دخول",
    "Seed accounts": "حسابات تجريبية",
    "Checking session...": "جارٍ التحقق من الجلسة...",
    Dashboard: "لوحة التحكم",
    "A quick snapshot of stock, sales activity, user count, and expiring medicines.": "نظرة سريعة على المخزون والمبيعات وعدد المستخدمين والأدوية القريبة من الانتهاء.",
    "Loading dashboard...": "جارٍ تحميل لوحة التحكم...",
    "Total medicines": "إجمالي الأدوية",
    "Show medicines": "عرض الأدوية",
    "Low stock": "مخزون منخفض",
    "Show low stock list": "عرض قائمة المخزون المنخفض",
    "Expiring soon": "قريب الانتهاء",
    "Show expiring list": "عرض قائمة المنتهي قريبًا",
    "Total quantity": "إجمالي الكمية",
    "Show quantities": "عرض الكميات",
    "Today sales": "مبيعات اليوم",
    "Show today sales": "عرض مبيعات اليوم",
    "Monthly revenue": "إيراد الشهر",
    "Show month sales": "عرض مبيعات الشهر",
    Users: "المستخدمون",
    "Show users": "عرض المستخدمين",
    Invoices: "الفواتير",
    "Show invoices": "عرض الفواتير",
    "Hide details": "إخفاء التفاصيل",
    "Medicines needing attention": "أدوية تحتاج متابعة",
    "See the medicines that are close to running out.": "شاهد الأدوية التي أوشكت على النفاد.",
    "Hide medicines": "إخفاء الأدوية",
    "medicine needs restocking": "دواء واحد يحتاج إعادة تزويد",
    "medicines need restocking": "أدوية تحتاج إعادة تزويد",
    "Loading details...": "جارٍ تحميل التفاصيل...",
    "Loading the selected dashboard details.": "جارٍ تحميل تفاصيل البطاقة المختارة.",
    "No records available for this section right now.": "لا توجد سجلات متاحة لهذا القسم حاليًا.",
    "Recent sales": "أحدث المبيعات",
    "Latest sales activity from the backend summary endpoint.": "آخر نشاط مبيعات من ملخص الخادم.",
    "No sales recorded yet.": "لا توجد مبيعات مسجلة بعد.",
    "All medicines": "كل الأدوية",
    "Current medicines available in the pharmacy system.": "الأدوية المتاحة حاليًا داخل النظام.",
    Medicine: "الدواء",
    Barcode: "الباركود",
    Category: "الفئة",
    Quantity: "الكمية",
    "Min stock": "الحد الأدنى للمخزون",
    Manufacturer: "الشركة المصنعة",
    Expiry: "الصلاحية",
    Batch: "التشغيلة",
    "Low stock medicines": "أدوية منخفضة المخزون",
    "Medicines with quantity at or below the minimum stock level.": "الأدوية التي وصلت كميتها إلى الحد الأدنى أو أقل.",
    "Expiring soon medicines": "أدوية قريبة الانتهاء",
    "Medicines that will expire within the next 30 days.": "الأدوية التي ستنتهي خلال 30 يومًا القادمة.",
    "Medicine quantities": "كميات الأدوية",
    "Stock quantities for medicines currently in inventory.": "كميات مخزون الأدوية الموجودة حاليًا.",
    "Today's sales": "مبيعات اليوم",
    "Monthly sales": "مبيعات الشهر",
    "All invoices": "كل الفواتير",
    "Sales recorded since the start of today.": "المبيعات المسجلة منذ بداية اليوم.",
    "Sales recorded since the start of the current month.": "المبيعات المسجلة منذ بداية الشهر الحالي.",
    "All saved sales invoices in the system.": "كل فواتير البيع المحفوظة في النظام.",
    Invoice: "الفاتورة",
    Customer: "العميل",
    Cashier: "الكاشير",
    Amount: "المبلغ",
    Payment: "الدفع",
    Date: "التاريخ",
    "Walk-in": "عميل مباشر",
    Unknown: "غير معروف",
    "System users": "مستخدمو النظام",
    "All users who can log in to the pharmacy system.": "كل المستخدمين المسموح لهم بالدخول إلى نظام الصيدلية.",
    Name: "الاسم",
    Role: "الدور",
    Created: "تاريخ الإنشاء",
    Details: "تفاصيل",
    "No details available for this card yet.": "لا توجد تفاصيل متاحة لهذه البطاقة بعد.",
    "No data available.": "لا توجد بيانات متاحة.",
    Home: "الرئيسية",
    "The Main Page": "الصفحة الرئيسية",
    "Welcome back,": "مرحبًا بعودتك،",
    "Main sections": "الأقسام الرئيسية",
    "Current role": "الدور الحالي",
    "Pharmacy overview": "نظرة عامة على الصيدلية",
    "Low stock alerts": "تنبيهات المخزون المنخفض",
    Overview: "نظرة عامة",
    Stock: "المخزون",
    Checkout: "البيع",
    Warehouse: "المستودع",
    Vendors: "الموردون",
    "Quick overview": "ملخص سريع",
    "Stock and items": "المخزون والأصناف",
    "Cashier workflow": "مسار الكاشير",
    "Supplier invoices": "فواتير الموردين",
    "Movements and stock": "الحركات والمخزون",
    "Vendor records": "بيانات الموردين",
    "Choose a section": "اختر قسمًا",
    "Open Home, then choose the section you want directly.": "افتح الرئيسية ثم اختر القسم الذي تريد الوصول إليه مباشرة.",
    "Pharmacy System": "نظام الصيدلية",
    Logout: "تسجيل الخروج",
    "Medicines Workspace": "مساحة الأدوية",
    "Full medicines management with import, export, filters, and paging": "إدارة كاملة للأدوية مع الاستيراد والتصدير والفلاتر والتنقل بين الصفحات",
    "Search by name, barcode, category, or manufacturer, then import from Excel CSV, export to Excel, and manage stock-ready medicine records.": "ابحث بالاسم أو الباركود أو الفئة أو الشركة المصنعة، ثم استورد من CSV خاص بإكسل أو صدّر لإكسل وادِر سجلات الأدوية الجاهزة للمخزون.",
    "Visible results": "النتائج الظاهرة",
    "Low stock items": "أصناف منخفضة المخزون",
    "Search, barcode, and filters": "البحث والباركود والفلاتر",
    "Filter medicines by name, barcode, category, and manufacturer, then scan a barcode for an instant match.": "صفِّ الأدوية بالاسم أو الباركود أو الفئة أو الشركة المصنعة، ثم امسح باركود للحصول على النتيجة فورًا.",
    "Search text": "نص البحث",
    "Search by name": "بحث بالاسم",
    "Search by barcode": "بحث بالباركود",
    "Search by category": "بحث بالفئة",
    "Search by manufacturer": "بحث بالشركة المصنعة",
    "All categories": "كل الفئات",
    "All manufacturers": "كل الشركات المصنعة",
    "Barcode input": "إدخال الباركود",
    Scan: "مسح",
    "No barcode": "بدون باركود",
    "Add to purchase invoice": "إضافة إلى فاتورة الشراء",
    "Clear filters": "مسح الفلاتر",
    "Edit medicine": "تعديل الدواء",
    "Update the selected medicine only when you need to change its details.": "عدّل الدواء المحدد فقط عندما تحتاج لتغيير بياناته.",
    "Update medicine": "تحديث الدواء",
    "Cancel edit": "إلغاء التعديل",
    "Excel import and export": "استيراد وتصدير إكسل",
    "Import medicines from an Excel-saved CSV file and export the current filtered medicines list as an Excel file.": "استورد الأدوية من ملف CSV محفوظ من إكسل وصدّر قائمة الأدوية الحالية كملف إكسل.",
    "Importing...": "جارٍ الاستيراد...",
    "Choose Excel CSV": "اختر ملف CSV من إكسل",
    "Exporting...": "جارٍ التصدير...",
    "Export current view to Excel": "تصدير العرض الحالي إلى إكسل",
    "Supported import format: CSV exported from Excel with headers like `name`, `barcode`, `purchasePrice`, `sellingPrice`, `quantity`, `stripsPerBox`, `pillsPerStrip`, `stripSellingPrice`, `pillSellingPrice`, `expiryDate`, and `batchNumber`.": "صيغة الاستيراد المدعومة: ملف CSV مُصدَّر من إكسل بعناوين مثل `name` و`barcode` و`purchasePrice` و`sellingPrice` و`quantity` و`stripsPerBox` و`pillsPerStrip` و`stripSellingPrice` و`pillSellingPrice` و`expiryDate` و`batchNumber`.",
    "My account": "حسابي",
    "Change password": "تغيير كلمة المرور",
    "Use your current password to set a new one.": "استخدم كلمة المرور الحالية لتعيين كلمة جديدة.",
    "Current password": "كلمة المرور الحالية",
    "New password": "كلمة المرور الجديدة",
    "Confirm new password": "تأكيد كلمة المرور الجديدة",
    "Update password": "تحديث كلمة المرور",
    "Full sale creation with box, strip and pill support": "إتمام البيع الكامل مع دعم العلبة والشريط والحبة",
    "Search medicines, scan barcodes, sell a full box or a strip or even one pill, and let the system track which specific box the quantity came from.": "ابحث عن الأدوية وامسح الباركود وبِع علبة كاملة أو شريطًا أو حتى حبة واحدة، ودع النظام يتتبع العلبة التي خرجت منها الكمية.",
    "Recorded sales": "المبيعات المسجلة",
    "Cart items": "عناصر السلة",
    "Today invoices": "فواتير اليوم",
    "Items sold": "الأصناف المباعة",
    Revenue: "الإيراد",
    Refunded: "المرتجع",
    "Net revenue": "صافي الإيراد",
    "Medicine search": "البحث عن دواء",
    "Search by medicine name or use barcode input for cashier speed.": "ابحث باسم الدواء أو استخدم إدخال الباركود لتسريع عمل الكاشير.",
    "Search medicine name": "ابحث باسم الدواء",
    "Scan barcode": "امسح الباركود",
    "Cart and checkout": "السلة وإتمام البيع",
    "Adjust quantities, select customer, add discount, and choose the payment method.": "عدّل الكميات واختر العميل وأضف الخصم وحدد طريقة الدفع.",
    "Walk-in customer": "عميل مباشر",
    Discount: "الخصم",
    Cash: "نقدًا",
    Card: "بطاقة",
    Transfer: "تحويل",
    "Cart is empty. Add medicines from the search list.": "السلة فارغة. أضف الأدوية من قائمة البحث.",
    Subtotal: "الإجمالي الفرعي",
    "Final amount": "المبلغ النهائي",
    Total: "الإجمالي",
    Final: "النهائي",
    "No low stock alerts right now.": "لا توجد تنبيهات مخزون منخفض الآن.",
    "Latest invoices created by admins, pharmacists, or cashiers.": "أحدث الفواتير التي أنشأها المديرون أو الصيادلة أو الكاشير.",
    "Set the package breakdown once for": "حدّد تقسيم العبوة مرة واحدة لـ",
    "Search medicines, scan barcodes, sell a full box or a strip or even one pill, and let the system track which specific box the quantity came from.": "ابحث عن الأدوية وامسح الباركود وبِع علبة أو شريطًا أو حتى حبة واحدة مع تتبع مصدر الكمية.",
    ADMIN: "مدير",
    PHARMACIST: "صيدلي",
    CASHIER: "كاشير",
    name: "الاسم",
    barcode: "الباركود",
    category: "الفئة",
    manufacturer: "الشركة المصنعة",
    description: "الوصف",
    purchasePrice: "سعر الشراء",
    sellingPrice: "سعر البيع",
    stripSellingPrice: "سعر الشريط",
    pillSellingPrice: "سعر الحبة",
    quantity: "الكمية",
    stripsPerBox: "عدد الشرائط في العلبة",
    pillsPerStrip: "عدد الحبات في الشريط",
    minStock: "الحد الأدنى للمخزون",
    expiryDate: "تاريخ الصلاحية",
    batchNumber: "رقم التشغيلة"
  }
};

const REGEX_TRANSLATIONS = {
  ar: [
    {
      pattern: /^Welcome back,\s*(.+)\.\s*Choose the section you want to open from the main page\.$/,
      replace: (_, name) => `مرحبًا بعودتك، ${name}. اختر القسم الذي تريد فتحه من الصفحة الرئيسية.`
    },
    {
      pattern: /^Barcode:\s*(.+)$/,
      replace: (_, value) => `الباركود: ${value}`
    },
    {
      pattern: /^(.+)\s+is ready\.$/,
      replace: (_, name) => `${name} جاهز الآن.`
    },
    {
      pattern: /^Box:\s*(.+)$/,
      replace: (_, value) => `علبة: ${value}`
    },
    {
      pattern: /^Strip:\s*(.+)$/,
      replace: (_, value) => `شريط: ${value}`
    },
    {
      pattern: /^Pill:\s*(.+)$/,
      replace: (_, value) => `حبة: ${value}`
    },
    {
      pattern: /^Box only$/,
      replace: () => "علب فقط"
    },
    {
      pattern: /^Retail enabled$/,
      replace: () => "البيع بالتجزئة مفعّل"
    },
    {
      pattern: /^Box \((.+)\)$/,
      replace: (_, count) => `علبة (${count})`
    },
    {
      pattern: /^Strip \((.+)\)$/,
      replace: (_, count) => `شريط (${count})`
    },
    {
      pattern: /^Pill \((.+)\)$/,
      replace: (_, count) => `حبة (${count})`
    },
    {
      pattern: /^Set the package breakdown once for (.+), then the cashier can sell by box, strip, or pill from the same barcode\.$/,
      replace: (_, name) => `حدّد تقسيم العبوة مرة واحدة لـ ${name}، وبعدها يستطيع الكاشير البيع بالعلبة أو الشريط أو الحبة من نفس الباركود.`
    }
  ]
};

function shouldSkipNode(node) {
  const parentTag = node?.parentElement?.tagName;
  return parentTag === "SCRIPT" || parentTag === "STYLE" || parentTag === "NOSCRIPT";
}

export function getInitialLocale() {
  if (typeof window === "undefined") return "ar";
  return "ar";
}

export function setLocalePreference(locale) {
  if (typeof window === "undefined" || !LOCALES[locale]) return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function translateText(text, locale) {
  if (!text || locale === "en") return text;

  const exact = EXACT_TRANSLATIONS[locale]?.[text];
  if (exact) return exact;

  const patterns = REGEX_TRANSLATIONS[locale] || [];
  for (const entry of patterns) {
    if (entry.pattern.test(text)) {
      return text.replace(entry.pattern, entry.replace);
    }
  }

  return text;
}

function translateTextNode(node, locale) {
  if (shouldSkipNode(node)) return;

  if (node.__i18nOriginalText === undefined) {
    node.__i18nOriginalText = node.nodeValue;
  }

  const source = node.__i18nOriginalText;
  if (!source || !source.trim()) return;
  const nextValue = locale === "ar" ? translateText(source, locale) : source;
  if (node.nodeValue === nextValue) return;
  node.__i18nApplying = true;
  node.nodeValue = nextValue;
}

function translateAttribute(element, attribute, locale) {
  const value = element.getAttribute(attribute);
  if (!value) return;

  const key = `i18nOriginal${attribute.charAt(0).toUpperCase()}${attribute.slice(1)}`;
  if (!element.dataset[key]) {
    element.dataset[key] = value;
  }

  const source = element.dataset[key];
  const nextValue = locale === "ar" ? translateText(source, locale) : source;
  if (element.getAttribute(attribute) !== nextValue) {
    element.setAttribute(attribute, nextValue);
  }
}

export function localizeTree(root, locale) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    translateTextNode(currentNode, locale);
    currentNode = walker.nextNode();
  }

  root.querySelectorAll("input[placeholder], textarea[placeholder], button[title], [aria-label], option").forEach((element) => {
    if (element.hasAttribute("placeholder")) translateAttribute(element, "placeholder", locale);
    if (element.hasAttribute("title")) translateAttribute(element, "title", locale);
    if (element.hasAttribute("aria-label")) translateAttribute(element, "aria-label", locale);

    if (element.tagName === "OPTION") {
      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) translateTextNode(textNode, locale);
    }
  });
}

export function installLocalization(root, locale) {
  if (!root) return () => {};

  localizeTree(root, locale);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        if (mutation.target.__i18nApplying) {
          mutation.target.__i18nApplying = false;
          return;
        }

        mutation.target.__i18nOriginalText = mutation.target.nodeValue;
        translateTextNode(mutation.target, locale);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node, locale);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          localizeTree(node, locale);
        }
      });
    });
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  return () => observer.disconnect();
}
