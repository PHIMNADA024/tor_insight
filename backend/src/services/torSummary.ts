/**
 * AI summaries for the TOR detail page, via Gemini on Vertex AI.
 * A summary is generated the first time a TOR is viewed and stored on the
 * record, so each TOR costs one model call until its data changes.
 */
import { GoogleGenAI } from "@google/genai";
import { Tor } from "../models/index.js";

const MODEL = "gemini-3.5-flash-lite";

/** Thrown when VERTEX_API_KEY isn't configured, so the route can answer 503. */
export class SummaryUnavailableError extends Error {}

let client: GoogleGenAI | undefined;

// Created on first use so the server still starts for anyone without a key.
function getClient(): GoogleGenAI {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    throw new SummaryUnavailableError("VERTEX_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ vertexai: true, apiKey });
  return client;
}

// Dates and years are converted here rather than by the model, which
// dropped month names when asked to convert Gregorian dates itself.
function thaiDate(value?: Date | null) {
  return value
    ? value.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Bangkok",
      })
    : undefined;
}

/**
 * Only the fields shown on the detail page, so the summary can't cite anything
 * else. Keys are descriptive Thai labels: with bare names like "tenderAmount"
 * the model reported the estimated price as the contract value.
 */
function buildPrompt(tor: any): string {
  const data = {
    ชื่อรายการ: tor.title,
    หน่วยงาน: tor.agency,
    ปีงบประมาณ: tor.fiscalYear ? tor.fiscalYear + 543 : undefined,
    วิธีจัดซื้อจัดจ้าง: tor.procurementMethod,
    งบประมาณที่ตั้งไว้: tor.budgetAmount,
    ราคากลางตอนประกาศจัดซื้อ: tor.tenderAmount,
    รายการที่จัดซื้อ: (tor.items ?? []).map((i: any) => ({
      รายละเอียด: i.description,
      จำนวน: i.quantity,
      หน่วย: i.unit,
    })),
    ผู้ได้รับสัญญา: tor.suppliers,
    สัญญา: (tor.contracts ?? []).map((c: any) => ({
      ชื่อสัญญา: c.title,
      วันเริ่มสัญญา: thaiDate(c.startDate),
      วันสิ้นสุดสัญญา: thaiDate(c.endDate),
      มูลค่าสัญญา: c.amount,
      เบิกจ่ายแล้ว: c.amountSpent,
    })),
  };

  return [
    "สรุปข้อมูลการจัดซื้อจัดจ้างของกรุงเทพมหานครด้านล่างเป็นภาษาไทย สำหรับคนที่อยากรู้เร็วๆ ว่ารายการนี้คืออะไร",
    "",
    "รูปแบบ:",
    "- ย่อหน้าแรก 1-2 ประโยค: ซื้อหรือจ้างอะไร หน่วยงานไหน",
    "- ตามด้วยประเด็นสำคัญเป็นข้อๆ ขึ้นต้นแต่ละบรรทัดด้วย \"- \" ไม่เกิน 5 ข้อ เช่น วิธีจัดซื้อ งบประมาณที่ตั้งไว้เทียบกับมูลค่าสัญญา ผู้ได้รับสัญญา ระยะเวลาสัญญา และการเบิกจ่าย",
    "- ใช้ชื่อตัวเลขให้ตรงกับชื่อ field เช่น มูลค่าสัญญาคือ \"มูลค่าสัญญา\" เท่านั้น ห้ามเอา \"ราคากลางตอนประกาศจัดซื้อ\" มาเรียกว่ามูลค่าสัญญา",
    "",
    "กติกา:",
    "- ใช้เฉพาะข้อมูลที่ให้มา ห้ามเดาหรือเพิ่มข้อมูลที่ไม่มี",
    "- ถ้า field ไหนว่างหรือไม่มี ไม่ต้องเขียนข้อนั้นเลย ห้ามเขียนว่า \"ไม่พบข้อมูล\" หรือ \"ไม่ระบุ\"",
    "- จำนวนเงินเขียนเป็นบาท มีจุลภาคคั่นหลักพัน",
    "- วันที่และปีงบประมาณในข้อมูลเป็น พ.ศ. แล้ว ให้ใช้ตามที่ให้มาเลย ห้ามแปลงหรือตัดส่วนใดออก",
    "- ตอบเป็นข้อความธรรมดา ไม่ใช้ markdown อื่นนอกจาก \"- \" นำหน้าข้อ",
    "",
    "ข้อมูล (JSON):",
    JSON.stringify(data),
  ].join("\n");
}

/**
 * Returns the stored summary for a published TOR, generating it first if
 * there isn't one or the TOR has changed since. Returns null if not found.
 */
export async function getTorSummary(id: string) {
  const tor = await Tor.findOne({ _id: id, status: "published" }).lean();
  if (!tor) return null;

  const cached = tor.aiSummary;
  const isFresh =
    cached?.text &&
    cached.generatedAt &&
    (!tor.updatedAt || cached.generatedAt >= tor.updatedAt);
  if (isFresh) {
    return { text: cached.text, generatedAt: cached.generatedAt };
  }

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: buildPrompt(tor),
    config: { temperature: 0.2, maxOutputTokens: 800 },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("Model returned an empty summary");
  }

  const generatedAt = new Date();
  // timestamps: false so saving the summary doesn't count as the TOR changing.
  await Tor.updateOne(
    { _id: tor._id },
    { $set: { aiSummary: { text, model: MODEL, generatedAt } } },
    { timestamps: false },
  );

  return { text, generatedAt };
}
