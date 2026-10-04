/**
 * Reads the winning bidders and their prices out of an e-GP winner
 * announcement PDF (ประกาศรายชื่อผู้ชนะการเสนอราคา). e-GP's API only links
 * the file; neither appears anywhere else.
 */
import { askAboutPdf, MAX_PDF_BYTES } from "./genai.js";

const PROMPT = [
  "จากประกาศรายชื่อผู้ชนะการเสนอราคานี้ ระบุผู้ชนะ (ผู้ได้รับการคัดเลือก) ทุกราย พร้อมราคาที่ชนะ",
  "คัดลอกชื่อตามที่เขียนในเอกสาร เช่น \"บริษัท ตัวอย่าง จำกัด\" ไม่ต้องใส่เลขประจำตัวผู้เสียภาษี หรือที่อยู่",
  "คัดลอกราคาเป็นตัวเลขตามที่เขียน (ตัวเลขไทยหรืออารบิกก็ได้) ห้ามคำนวณเอง ถ้าไม่มีให้เป็น null",
  "ตอบเป็น JSON เท่านั้น: {\"winners\":[{\"name\":\"ชื่อ\",\"price\":\"ราคาตามที่เขียน เช่น ๔,๕๐๘,๔๘๐.๐๐\"}]}",
  "- ถ้าเอกสารไม่มีผู้ชนะ (เช่น ยกเลิก หรือไม่มีผู้เสนอราคา) ให้ winners เป็น [] ห้ามเดา",
].join("\n");

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** "๔,๕๐๘,๔๘๐.๐๐" → 4508480, or undefined. */
function parsePrice(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value)
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/[^\d.]/g, "");
  const n = Number(text);
  return text && Number.isFinite(n) && n > 0 ? n : undefined;
}

export type WinnerResult = {
  names: string[];
  /** Sum of the winning prices; undefined if any price couldn't be read. */
  amount: number | undefined;
};

export async function readWinners(pdf: Buffer): Promise<WinnerResult> {
  const none = { names: [], amount: undefined };
  if (pdf.length > MAX_PDF_BYTES) return none;

  let parsed: { winners?: unknown };
  try {
    parsed = JSON.parse(await askAboutPdf(pdf, PROMPT, true));
  } catch {
    return none;
  }
  // The model sometimes wraps the object in an array: [{"winners": [...]}].
  if (Array.isArray(parsed)) parsed = parsed[0] ?? {};
  if (!Array.isArray(parsed.winners)) return none;

  const winners = (parsed.winners as { name?: unknown; price?: unknown }[])
    .map((w) => ({
      name: typeof w?.name === "string" ? w.name.replace(/\s+/g, " ").trim() : "",
      price: parsePrice(w?.price),
    }))
    .filter((w) => w.name);

  const prices = winners.map((w) => w.price);
  return {
    // One company can win several lots; list it once.
    names: [...new Set(winners.map((w) => w.name))],
    amount: prices.length > 0 && prices.every((p) => p != null)
      ? prices.reduce((sum, p) => sum! + p!, 0)
      : undefined,
  };
}
