/**
 * Summarises an e-GP TOR document (ร่างขอบเขตของงาน) into the project details
 * shown on the detail page. BMA records get their details from structured
 * data (items, contracts); e-GP's equivalent only exists inside the PDF.
 */
import { askAboutPdf, MAX_PDF_BYTES } from "./genai.js";
import { toArabicDigits } from "./thaiDigits.js";

const PROMPT = [
  "สรุปเอกสารจัดซื้อจัดจ้างนี้เป็นภาษาไทยแบบสั้น ให้อ่านแล้วจับใจความได้ในไม่กี่วินาที",
  "",
  "รูปแบบ:",
  "- ประโยคแรก 1 ประโยคสั้นๆ ว่าซื้อหรือจ้างอะไร",
  "- ตามด้วยไม่เกิน 4 ข้อ ขึ้นต้นด้วย \"- \" แต่ละข้อไม่เกิน 1 บรรทัด เลือกเฉพาะที่สำคัญที่สุด:",
  "  ของหรืองานหลักพร้อมจำนวนรวม, ระยะเวลาส่งมอบหรือดำเนินการ, การรับประกัน, เงื่อนไขที่ไม่ปกติ",
  "",
  "กติกา:",
  // No item quantities: in scanned PDFs the model read the same line as 31,
  // 33 and 36 on different runs (Thai digits look alike). Durations were stable.
  "- รายการสินค้า: บอกเฉพาะประเภทของหลัก 2-3 อย่าง เช่น \"คอมพิวเตอร์สำนักงาน โน้ตบุ๊ก และเครื่องพิมพ์\" ไม่ต้องใส่จำนวนชิ้นหรือสเปก",
  "- ห้ามบวกหรือคำนวณตัวเลขเอง",
  "- ไม่ต้องใส่งบประมาณ วิธีจัดซื้อ หรือคุณสมบัติผู้ยื่นทั่วไปที่ทุกประกาศมีเหมือนกัน (หน้าเว็บแสดงอยู่แล้วหรือไม่ช่วยตัดสินใจ)",
  "- ใช้เฉพาะข้อมูลในเอกสาร ห้ามเดา ถ้าเรื่องไหนไม่มีในเอกสารไม่ต้องเขียนข้อนั้น",
  "- ตอบเป็นข้อความธรรมดา ไม่ใช้ markdown อื่นนอกจาก \"- \" นำหน้าข้อ",
].join("\n");

/** Returns the summary, or null if the PDF is unusable. */
export async function summarizeTorDocument(pdf: Buffer): Promise<string | null> {
  if (pdf.length > MAX_PDF_BYTES) return null;
  const text = toArabicDigits((await askAboutPdf(pdf, PROMPT, false)).trim());
  return text || null;
}
