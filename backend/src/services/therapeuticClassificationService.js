const prisma = require("../config/prisma");

const THERAPEUTIC_GROUPS = [
  ["DIGEST", "الجهاز الهضمي"],
  ["RESP", "الجهاز التنفسي"],
  ["CARDIO", "القلب والأوعية الدموية"],
  ["NEURO", "الجهاز العصبي"],
  ["ENDO", "الغدد الصماء والسكري"],
  ["MUSCLE", "العظام والمفاصل"],
  ["DERM", "الجلدية"],
  ["URO", "المسالك البولية والتناسلية"],
  ["EYE", "العيون"],
  ["ENT", "الأنف والأذن والحنجرة"],
  ["IMMUNE", "المناعة والعدوى"],
  ["VIT", "الفيتامينات والمكملات"]
];

const MATCHERS = [
  ["RESP", ["ventolin", "salbutamol", "montelukast", "bromhexine", "ambroxol", "bronch", "asthma", "inhaler", "cough", "respir", "تنفسي", "كحه", "سعال", "بلغم", "استنشاق", "بخاخ", "جيوب"]],
  ["DIGEST", ["omeprazole", "esomeprazole", "pantoprazole", "lansoprazole", "famotidine", "gaviscon", "maalox", "antacid", "colospasmin", "domperidone", "metoclopramide", "lactulose", "gastro", "digest", "هضمي", "معده", "مغص", "قولون", "انتينال"]],
  ["CARDIO", ["aspirin", "aspocid", "clopidogrel", "amlodipine", "bisoprolol", "atorvastatin", "rosuvastatin", "captopril", "losartan", "valsartan", "قلب", "ضغط", "كوليسترول"]],
  ["ENDO", ["insulin", "metformin", "glimepiride", "gliclazide", "thyroid", "levothyroxine", "سكري", "غده", "انسولين"]],
  ["NEURO", ["pregabalin", "gabapentin", "carbamazepine", "sertraline", "fluoxetine", "اعصاب", "مخ", "صداع", "صرع", "اكتئاب"]],
  ["URO", ["tamsulosin", "urinary", "prostate", "مسالك", "بول", "بروستاتا"]],
  ["EYE", ["ophthalm", "eye drop", "عين", "قطره"]],
  ["ENT", ["otic", "ear", "throat", "اذن", "أذن", "حلق", "لوز"]],
  ["DERM", ["ointment", "lotion", "acne", "derma", "skin", "جلديه", "كريم", "مرهم"]],
  ["MUSCLE", ["ibuprofen", "diclofenac", "celecoxib", "naproxen", "muscle", "arthritis", "مفاصل", "عظام", "مسكن"]],
  ["VIT", ["vitamin", "omega", "iron", "zinc", "calcium", "فيتامين", "مكمل", "حديد"]],
  ["IMMUNE", ["amoxicillin", "azithromycin", "cef", "antibiotic", "antiviral", "مضاد", "عدوي"]]
];

const cachedGroupsByWorkspace = new Map();

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function detectGroupCode(medicine) {
  const searchable = normalize([
    medicine.name,
    medicine.nameAr,
    medicine.nameEn,
    medicine.searchAliases,
    medicine.category,
    medicine.description
  ].filter(Boolean).join(" "));

  return MATCHERS.find(([, terms]) => terms.some((term) => searchable.includes(normalize(term))))?.[0] || null;
}

async function ensureTherapeuticClassification(requestedWorkspaceId) {
  const workspaceId = Number(requestedWorkspaceId || prisma.getWorkspaceId?.() || 1);
  if (cachedGroupsByWorkspace.has(workspaceId)) return cachedGroupsByWorkspace.get(workspaceId);

  const groups = await Promise.all(THERAPEUTIC_GROUPS.map(([code, name]) => prisma.therapeuticGroup.upsert({
    where: { workspaceId_code: { workspaceId, code } },
    update: {},
    create: { workspaceId, code, name, active: true }
  })));

  const groupIdByCode = new Map(groups.map((group) => [group.code, group.id]));
  const uncategorizedMedicines = await prisma.medicine.findMany({
    where: { workspaceId, therapeuticGroupId: null },
    select: {
      id: true,
      name: true,
      nameAr: true,
      nameEn: true,
      searchAliases: true,
      category: true,
      description: true
    }
  });

  const updates = uncategorizedMedicines.map((medicine) => {
    const code = detectGroupCode(medicine);
    const therapeuticGroupId = code ? groupIdByCode.get(code) : null;
    return therapeuticGroupId
      ? prisma.medicine.update({ where: { id: medicine.id }, data: { therapeuticGroupId } })
      : null;
  }).filter(Boolean);

  if (updates.length) await Promise.all(updates);
  cachedGroupsByWorkspace.set(workspaceId, groups);
  return groups;
}

function getDetectedTherapeuticGroupCode(payload) {
  return detectGroupCode(payload);
}

module.exports = {
  THERAPEUTIC_GROUPS,
  ensureTherapeuticClassification,
  getDetectedTherapeuticGroupCode
};
