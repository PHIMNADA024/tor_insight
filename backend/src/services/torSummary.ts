/**
 * AI summaries for the TOR detail page, via Gemini on Vertex AI.
 * A summary is generated the first time a TOR is viewed and stored on the
 * record, so each TOR costs one model call until its data changes.
 */
import { Tor } from "../models/index.js";
import { GEMINI_MODEL as MODEL, getGenAI as getClient } from "./genai.js";
import { NonRetryableError, withRetry } from "./http.js";

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
 * Bumped when the prompt changes, so summaries written by an older prompt
 * are regenerated on their next view.
 */
const PROMPT_VERSION = 2;
const SUMMARY_MODEL = `${MODEL}#v${PROMPT_VERSION}`;

/** A winning price this far below the reference price is likely bad data, not a discount. */
const MIN_PLAUSIBLE_SHARE = 0.5;

/**
 * Facts for the summary. Comparisons are worked out here, not by the model,
 * which mis-adds. Keys are descriptive Thai labels: with bare names like
 * "tenderAmount" the model reported the estimated price as the contract value.
 */
function buildFacts(tor: any) {
  const contracts: any[] = tor.contracts ?? [];
  const contractTotal = contracts.some((c) => c.amount != null)
    ? contracts.reduce((sum, c) => sum + (c.amount ?? 0), 0)
    : undefined;
  const spent = contracts.some((c) => c.amountSpent != null)
    ? contracts.reduce((sum, c) => sum + (c.amountSpent ?? 0), 0)
    : undefined;
  // BMA: the signed contract; e-GP: the winning bid (no contract records).
  const finalPrice = contractTotal ?? tor.awardAmount ?? undefined;

  const reference = tor.tenderAmount;
  const share = finalPrice != null && reference ? finalPrice / reference : undefined;
  const discount =
    share != null && share <= 1 && share >= MIN_PLAUSIBLE_SHARE
      ? share === 1
        ? "เท่ากับราคากลาง"
        : `ต่ำกว่าราคากลาง ${((1 - share) * 100).toFixed(1)}%`
      : undefined;

  return {
    ชื่อรายการ: tor.title,
    หน่วยงาน: tor.agency,
    ปีงบประมาณ: tor.fiscalYear ? tor.fiscalYear + 543 : undefined,
    วิธีจัดซื้อจัดจ้าง: tor.procurementMethod,
    // BMA's budget is a whole budget line, often shared, so it isn't compared.
    งบประมาณ: tor.sourceId === "egp" ? tor.budgetAmount : undefined,
    // Withheld when it can't be compared sensibly, or the model compares it anyway.
    ราคากลาง: finalPrice == null || discount ? reference : undefined,
    เปิดรับข้อเสนอ: thaiDate(tor.tenderStartDate),
    ปิดรับข้อเสนอ: thaiDate(tor.submissionDeadline),
    เนื้อหาจากเอกสาร_TOR: tor.detailSummary,
    รายการที่จัดซื้อ: (tor.items ?? []).map((i: any) => ({
      รายละเอียด: i.description,
      จำนวน: i.quantity,
      หน่วย: i.unit,
    })),
    ผู้ชนะ: tor.suppliers?.length ? tor.suppliers : undefined,
    ราคาที่ได้: finalPrice,
    เทียบราคากลาง: discount,
    สถานะสัญญา: tor.contractStatus,
    ระยะเวลาสัญญา: contracts
      // Some BMA contracts end before they start; such a period is left out.
      .filter((c) => (c.startDate || c.endDate) && !(c.startDate && c.endDate && c.endDate < c.startDate))
      .map((c) => `${thaiDate(c.startDate) ?? "?"} ถึง ${thaiDate(c.endDate) ?? "?"}`),
    เบิกจ่ายแล้ว:
      spent != null && contractTotal
        ? `${spent.toLocaleString("th-TH")} บาท (${Math.round((spent / contractTotal) * 100)}% ของสัญญา)`
        : undefined,
  };
}

function buildPrompt(tor: any): string {
  return [
    "เขียนสรุป TOR การจัดซื้อจัดจ้างของกรุงเทพมหานครด้านล่างเป็นภาษาไทย ให้ผู้ประกอบการที่สนใจงานภาครัฐอ่านแล้วเข้าใจภาพรวมในไม่กี่วินาที",
    "หน้าเว็บแสดงชื่อ หน่วยงาน วิธีจัดซื้อ งบประมาณ และวันที่เป็นตารางอยู่แล้ว ห้ามทวนเป็นรายการ field แบบ \"วิธีจัดซื้อจัดจ้าง: ...\"",
    "",
    "รูปแบบ:",
    "- ประโยคแรก 1-2 ประโยค: งานนี้คือการซื้อหรือจ้างอะไร เพื่ออะไร ขนาดงานแค่ไหน (ใช้เนื้อหาจากเอกสาร TOR หรือรายการที่จัดซื้อ)",
    "- ตามด้วย 2-4 ข้อ ขึ้นต้นด้วย \"- \" เลือกเฉพาะที่มีข้อมูล:",
    "  ผลการจัดซื้อ: ใครได้ไป ในราคาเท่าไร และ \"เทียบราคากลาง\" ตามที่ให้มา",
    "  ระยะเวลา: ช่วงเปิด-ปิดรับข้อเสนอ หรือระยะเวลาสัญญาและการเบิกจ่าย",
    "  ขอบเขตหรือเงื่อนไขที่น่าสนใจจากเอกสาร TOR เช่น ระยะเวลาส่งมอบ การรับประกัน",
    "",
    "กติกา:",
    "- ราคากลางไม่ใช่งบประมาณ ถ้าไม่มี field งบประมาณ ห้ามเขียนถึงงบประมาณ",
    "- ใช้เฉพาะข้อมูลที่ให้มา ห้ามเดา ห้ามคำนวณตัวเลขเอง (ใช้ \"เทียบราคากลาง\" ตามที่ให้มาเท่านั้น)",
    "- ถ้า field ไหนว่างหรือไม่มี ไม่ต้องเขียนเรื่องนั้นเลย ห้ามเขียนว่า \"ไม่พบข้อมูล\" หรือ \"ไม่ระบุ\"",
    "- จำนวนเงินเขียนเป็นบาท มีจุลภาคคั่นหลักพัน ใช้เลขอารบิก",
    "- วันที่และปีในข้อมูลเป็น พ.ศ. แล้ว ใช้ตามที่ให้มา",
    "- ตอบเป็นข้อความธรรมดา ไม่ใช้ markdown อื่นนอกจาก \"- \" นำหน้าข้อ",
    "",
    "ข้อมูล (JSON):",
    JSON.stringify(buildFacts(tor)),
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
    cached.model === SUMMARY_MODEL &&
    (!tor.updatedAt || cached.generatedAt >= tor.updatedAt);
  if (isFresh) {
    return { text: cached.text, generatedAt: cached.generatedAt };
  }

  // Outside the retry: a missing key won't fix itself (the route returns 503).
  const client = getClient();
  let text: string | undefined;
  try {
    // Vertex's per-minute quota is shared with the sync jobs, which can use it
    // up (429). A visitor is waiting, so retry only briefly (2s, 4s).
    const response = await withRetry(
      async () => {
        try {
          return await client.models.generateContent({
            model: MODEL,
            contents: buildPrompt(tor),
            config: { temperature: 0.2, maxOutputTokens: 800 },
          });
        } catch (error) {
          if ((error as { status?: number }).status !== 429) throw new NonRetryableError(String(error));
          throw error;
        }
      },
      3,
      2000,
    );
    text = response.text?.trim();
  } catch (error) {
    // An older summary beats an error message; it's replaced on a later view.
    if (cached?.text && cached.generatedAt) {
      console.warn("TOR summary: serving the previous summary,", error instanceof Error ? error.message : error);
      return { text: cached.text, generatedAt: cached.generatedAt };
    }
    throw error;
  }

  if (!text) {
    throw new Error("Model returned an empty summary");
  }

  const generatedAt = new Date();
  // timestamps: false so saving the summary doesn't count as the TOR changing.
  await Tor.updateOne(
    { _id: tor._id },
    { $set: { aiSummary: { text, model: SUMMARY_MODEL, generatedAt } } },
    { timestamps: false },
  );

  return { text, generatedAt };
}
