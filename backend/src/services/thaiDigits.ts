/**
 * Government documents often use Thai digits (๐-๙). Stored text uses Arabic
 * digits so the site reads consistently and searching "8 รายการ" matches.
 */
export function toArabicDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/** Same, passing through undefined/null for optional fields. */
export function toArabicDigitsOpt<T extends string | null | undefined>(text: T): T {
  return (typeof text === "string" ? toArabicDigits(text) : text) as T;
}
