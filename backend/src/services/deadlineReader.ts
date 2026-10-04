/**
 * Reads the bid submission deadline out of an e-GP invitation PDF.
 * e-GP's API has no deadline field; the date only appears in the PDF text,
 * e.g. "เสนอราคา...ในวันที่ ๘ ตุลาคม ๒๕๖๙ ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น.".
 * Some PDFs leave those blanks unfilled; those return null.
 *
 * The model only transcribes the day, month and time as written. The year is
 * not read at all: in scanned PDFs it misread "๒๕๖๙" as "๒๕๖๕" (Thai ๙ and ๕
 * look alike), putting deadlines four years early. Deadlines fall a few weeks
 * after the invitation, so the year comes from the announcement date instead.
 */
import { askAboutPdf, MAX_PDF_BYTES } from "./genai.js";

/** A deadline further than this after the invitation is treated as a misread. */
const MAX_DAYS_AFTER_ANNOUNCEMENT = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

const PROMPT = [
  "จากประกาศเชิญชวนนี้ หาวันที่และเวลาสิ้นสุดการยื่นข้อเสนอ/เสนอราคา",
  "คัดลอกจากเอกสารตามที่เขียนไว้ ห้ามแปลงตัวเลขหรือรูปแบบ",
  "ตอบเป็น JSON เท่านั้น:",
  '{"day":"วันที่ตามที่เขียน เช่น ๘","month":"ชื่อเดือนตามที่เขียน เช่น ตุลาคม หรือ ต.ค.","endTime":"เวลาสิ้นสุดตามที่เขียน เช่น ๑๒.๐๐ หรือ null","quote":"ประโยคที่ระบุวันนั้นตามตัวอักษร"}',
  "- ถ้าเอกสารไม่ได้กรอกวันที่ (เว้นช่องว่างไว้) หรือหาไม่เจอ ให้ day เป็น null ห้ามเดา",
].join("\n");

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function toArabicDigits(text: string) {
  return text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/** Full and abbreviated Thai month names, January first. */
const MONTHS: [string, string][] = [
  ["มกราคม", "ม.ค."], ["กุมภาพันธ์", "ก.พ."], ["มีนาคม", "มี.ค."], ["เมษายน", "เม.ย."],
  ["พฤษภาคม", "พ.ค."], ["มิถุนายน", "มิ.ย."], ["กรกฎาคม", "ก.ค."], ["สิงหาคม", "ส.ค."],
  ["กันยายน", "ก.ย."], ["ตุลาคม", "ต.ค."], ["พฤศจิกายน", "พ.ย."], ["ธันวาคม", "ธ.ค."],
];

/** 0-based month index, or -1. */
function monthIndex(text: string) {
  const t = text.replace(/\s/g, "");
  return MONTHS.findIndex(([full, short]) => t.includes(full) || t.includes(short.replace(/\s/g, "")));
}

/** Year/month/day of a date as seen in Bangkok. */
function bangkokParts(date: Date) {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

function bangkokDate(year: number, month: number, day: number, time: string) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T${time}:00+07:00`);
}

export type DeadlineResult = { deadline: Date; quote: string } | { deadline: null; reason: string };

/** `announcedAt` is the invitation's publish date; the deadline's year is taken from it. */
export async function readDeadline(pdf: Buffer, announcedAt: Date | undefined): Promise<DeadlineResult> {
  if (!announcedAt) {
    return { deadline: null, reason: "no announcement date to anchor the year" };
  }
  if (pdf.length > MAX_PDF_BYTES) {
    return { deadline: null, reason: `PDF too large (${(pdf.length / 1e6).toFixed(1)} MB)` };
  }

  const reply = await askAboutPdf(pdf, PROMPT, true);

  let parsed: { day?: string | null; month?: string | null; endTime?: string | null; quote?: string };
  try {
    parsed = JSON.parse(reply);
  } catch {
    return { deadline: null, reason: "model did not return JSON" };
  }
  // The model sometimes wraps the object in an array: [{"day": ...}].
  if (Array.isArray(parsed)) parsed = parsed[0] ?? {};

  const day = Number(toArabicDigits(String(parsed.day ?? "")).replace(/\D/g, ""));
  const month = monthIndex(parsed.month ?? "");
  if (!day || day > 31 || month < 0) {
    return { deadline: null, reason: "no deadline in PDF" };
  }

  // Closing time in Thai time; without one, bids are accepted all day.
  const timeMatch = toArabicDigits(parsed.endTime ?? "").match(/(\d{1,2})[.:](\d{2})/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "23:59";

  // Same year as the invitation, or the next one if the deadline crosses New Year.
  const announced = bangkokParts(announcedAt);
  let deadline = bangkokDate(announced.year, month, day, time);
  if (deadline.getTime() < bangkokDate(announced.year, announced.month, announced.day, "00:00").getTime()) {
    deadline = bangkokDate(announced.year + 1, month, day, time);
  }

  if (Number.isNaN(deadline.getTime())) {
    return { deadline: null, reason: `unparseable date ${parsed.day} ${parsed.month} ${time}` };
  }
  if (deadline.getTime() - announcedAt.getTime() > MAX_DAYS_AFTER_ANNOUNCEMENT * DAY_MS) {
    return { deadline: null, reason: `deadline more than ${MAX_DAYS_AFTER_ANNOUNCEMENT} days after the announcement` };
  }

  return { deadline, quote: parsed.quote ?? "" };
}
