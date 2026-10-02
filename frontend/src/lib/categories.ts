/**
 * Labels for the TOR `category` values, which come from the budget code
 * (backend/src/services/bmaFetcher.ts, budgetCategory). Order here is the
 * order shown in pickers.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  // e-GP invitations to bid (backend/src/services/egpFetcher.ts), not a budget category.
  tender_invitation: "ประกาศเชิญชวน",
  materials: "ค่าวัสดุ",
  equipment: "ค่าครุภัณฑ์",
  services: "ค่าใช้สอย",
  construction: "ค่าที่ดินและสิ่งก่อสร้าง",
  utilities: "ค่าสาธารณูปโภค",
  compensation: "ค่าตอบแทน",
  subsidies: "เงินอุดหนุน",
  other_expenses: "รายจ่ายอื่น",
  personnel: "เงินเดือน",
};

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS);

/** Puts categories in CATEGORY_LABELS order; unknown values go last. */
export function sortCategories(categories: string[]) {
  const rank = (c: string) => {
    const i = CATEGORY_OPTIONS.indexOf(c);
    return i === -1 ? CATEGORY_OPTIONS.length : i;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b));
}

export function categoryLabel(category: string) {
  if (category === "uncategorized") return "ไม่ระบุหมวดหมู่";
  return CATEGORY_LABELS[category] ?? category;
}
