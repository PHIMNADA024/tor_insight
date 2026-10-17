import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../src/models/tor.js";
import { GenAIUnavailableError } from "../../src/services/genai.js";
import torRoutes from "../../src/routes/tor.js";

/**
 * GET /api/tors/:id/summary against a throwaway in-memory MongoDB. Gemini and
 * the PDF download are mocked, so no paid model call or network request runs.
 */

const mockGenerateContent = jest.fn();
const mockGetGenAI = jest.fn(() => ({ models: { generateContent: mockGenerateContent } }));

jest.mock("../../src/services/genai.js", () => ({
  ...jest.requireActual("../../src/services/genai.js"),
  getGenAI: () => mockGetGenAI(),
}));

// The summary limiter allows 20 requests a minute; this file makes more than that.
jest.mock("../../src/middleware/rateLimit.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { generalLimiter: pass, authLimiter: pass, otpLimiter: pass, searchLimiter: pass, summaryLimiter: pass };
});

const app = express();
app.use("/api/tors", torRoutes);

let mongo: MongoMemoryServer;
let fetchSpy: jest.SpiedFunction<typeof fetch>;

beforeAll(async () => {
  // The first run downloads a MongoDB binary, which can take a while.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Tor.deleteMany({});
  mockGenerateContent.mockReset();
  mockGetGenAI.mockClear();
  // No real downloads: a test that wants a PDF sets its own response.
  fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in tests"));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createTor(overrides: Record<string, unknown> = {}) {
  return Tor.create({
    ocid: `egp-${new mongoose.Types.ObjectId()}`,
    sourceId: "egp",
    title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
    agency: "สำนักการจราจรและขนส่ง",
    budgetAmount: 5_000_000,
    tenderAmount: 4_900_000,
    fiscalYear: 2026,
    procurementMethod: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
    status: "published",
    ...overrides,
  });
}

function getSummary(id: unknown) {
  return request(app).get(`/api/tors/${String(id)}/summary`);
}

/** Every model call returns `text`. */
function modelReplies(text: string | undefined) {
  mockGenerateContent.mockResolvedValue({ text });
}

/** What the route sent to the model on the nth call: the prompt and any attached PDF. */
function sentToModel(call = 0) {
  const { contents } = mockGenerateContent.mock.calls[call][0];
  if (typeof contents === "string") return { prompt: contents, pdf: undefined };
  const parts = contents[0].parts;
  return { prompt: parts.find((p: { text?: string }) => p.text).text as string, pdf: parts[0].inlineData };
}

/** Facts JSON at the end of the prompt. */
function factsSent(call = 0) {
  const { prompt } = sentToModel(call);
  return JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
}

/** Makes withRetry's 2s/4s waits instant, keeping other timers real. */
function skipRetryDelays() {
  const realSetTimeout = globalThis.setTimeout;
  jest.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) =>
    realSetTimeout(fn, ms !== undefined && ms >= 2000 ? 0 : ms)) as typeof setTimeout);
}

function pdfResponse() {
  return new Response(Buffer.from("%PDF-1.7 fake tor document"), { status: 200 });
}

describe("GET /api/tors/:id/summary", () => {
  describe("finding the TOR", () => {
    it("rejects an invalid id with 400", async () => {
      const res = await getSummary("not-an-id");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid TOR id");
    });

    it("returns 404 for an unknown id", async () => {
      const res = await getSummary(new mongoose.Types.ObjectId());
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("TOR not found");
    });

    it("returns 404 for a draft, without calling the model", async () => {
      const tor = await createTor({ status: "draft" });
      const res = await getSummary(tor._id);

      expect(res.status).toBe(404);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe("generating and caching", () => {
    it("generates a summary on first view and stores it", async () => {
      modelReplies("งานนี้เป็นการบำรุงรักษาระบบกล้อง CCTV\n- ขอบเขตงาน: ดูแลกล้อง 120 จุด");
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("งานนี้เป็นการบำรุงรักษาระบบกล้อง CCTV\n- ขอบเขตงาน: ดูแลกล้อง 120 จุด");
      expect(new Date(res.body.generatedAt).getTime()).not.toBeNaN();

      const saved = await Tor.findById(tor._id).lean();
      expect(saved?.aiSummary?.text).toBe(res.body.text);
      expect(saved?.aiSummary?.model).toMatch(/^gemini-.+#v\d+$/);
    });

    it("serves the stored summary on later views without calling the model again", async () => {
      modelReplies("สรุปครั้งแรก");
      const tor = await createTor();

      await getSummary(tor._id);
      modelReplies("สรุปครั้งที่สอง");
      const res = await getSummary(tor._id);

      expect(res.body.text).toBe("สรุปครั้งแรก");
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("doesn't change the TOR's updatedAt when saving the summary", async () => {
      modelReplies("สรุป");
      const tor = await createTor();

      await getSummary(tor._id);

      const saved = await Tor.findById(tor._id).lean();
      expect(saved?.updatedAt?.getTime()).toBe(tor.updatedAt.getTime());
    });

    it("regenerates when the TOR changed after the summary was written", async () => {
      modelReplies("สรุปเก่า");
      const tor = await createTor();
      await getSummary(tor._id);

      await Tor.updateOne({ _id: tor._id }, { $set: { title: "ชื่อใหม่", updatedAt: new Date(Date.now() + 1000) } }, { timestamps: false });
      modelReplies("สรุปใหม่");
      const res = await getSummary(tor._id);

      expect(res.body.text).toBe("สรุปใหม่");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("regenerates a summary written by an older prompt version", async () => {
      const tor = await createTor();
      await Tor.updateOne(
        { _id: tor._id },
        { $set: { aiSummary: { text: "สรุปจาก prompt เก่า", model: "gemini-3.5-flash-lite#v0", generatedAt: new Date(Date.now() + 1000) } } },
        { timestamps: false },
      );
      modelReplies("สรุปจาก prompt ปัจจุบัน");

      const res = await getSummary(tor._id);

      expect(res.body.text).toBe("สรุปจาก prompt ปัจจุบัน");
    });

    it("converts Thai digits in the model's reply to Arabic digits", async () => {
      modelReplies("- การรับประกัน: รับประกัน ๑ ปี ตอบสนองภายใน ๔ ชั่วโมง");
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.body.text).toBe("- การรับประกัน: รับประกัน 1 ปี ตอบสนองภายใน 4 ชั่วโมง");
    });
  });

  describe("what is sent to the model", () => {
    it("sends the TOR's facts, with the fiscal year in Buddhist Era", async () => {
      modelReplies("สรุป");
      const tor = await createTor();

      await getSummary(tor._id);
      const facts = factsSent();

      expect(facts.ชื่อรายการ).toBe("จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)");
      expect(facts.หน่วยงาน).toBe("สำนักการจราจรและขนส่ง");
      expect(facts.ปีงบประมาณ).toBe(2569);
      expect(facts.งบประมาณ).toBe(5_000_000);
      expect(facts.ราคากลาง).toBe(4_900_000);
    });

    it("leaves out BMA's budget, which is a shared budget line", async () => {
      modelReplies("สรุป");
      const tor = await createTor({ sourceId: "bma", ocid: "ocds-bma-1" });

      await getSummary(tor._id);

      expect(factsSent().งบประมาณ).toBeUndefined();
    });

    it("works out the discount from the reference price itself", async () => {
      modelReplies("สรุป");
      const tor = await createTor({ tenderAmount: 1_000_000, awardAmount: 900_000, suppliers: ["บริษัท ตัวอย่าง จำกัด"] });

      await getSummary(tor._id);
      const facts = factsSent();

      expect(facts.ราคาที่ได้).toBe(900_000);
      expect(facts.เทียบราคากลาง).toBe("ต่ำกว่าราคากลาง 10.0%");
    });

    it("tells the model not to repeat the project details box", async () => {
      modelReplies("สรุป");
      const tor = await createTor({ detailSummary: "ซื้อกล้อง CCTV พร้อมติดตั้ง 120 จุด" });

      await getSummary(tor._id);
      const { prompt } = sentToModel();

      expect(prompt).toContain("ห้ามเขียนซ้ำ");
      expect(prompt).toContain("ซื้อกล้อง CCTV พร้อมติดตั้ง 120 จุด");
    });
  });

  describe("attaching the TOR document", () => {
    it("attaches the TOR PDF, preferring it over the invitation", async () => {
      modelReplies("สรุปจากเอกสาร");
      fetchSpy.mockResolvedValue(pdfResponse());
      const tor = await createTor({
        torPdfUrl: "https://egp.example/tor.pdf",
        invitationPdfUrl: "https://egp.example/invitation.pdf",
      });

      const res = await getSummary(tor._id);
      const { prompt, pdf } = sentToModel();

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith("https://egp.example/tor.pdf", expect.anything());
      expect(pdf).toEqual({
        mimeType: "application/pdf",
        data: Buffer.from("%PDF-1.7 fake tor document").toString("base64"),
      });
      expect(prompt).toContain("แนบเอกสาร TOR");
    });

    it("falls back to the invitation PDF when there is no TOR PDF", async () => {
      modelReplies("สรุป");
      fetchSpy.mockResolvedValue(pdfResponse());
      const tor = await createTor({ invitationPdfUrl: "https://egp.example/invitation.pdf" });

      await getSummary(tor._id);

      expect(fetchSpy).toHaveBeenCalledWith("https://egp.example/invitation.pdf", expect.anything());
      expect(sentToModel().pdf).toBeDefined();
    });

    it("ignores a download that isn't a PDF and summarises from the fields", async () => {
      modelReplies("สรุปจากข้อมูล");
      fetchSpy.mockResolvedValue(new Response("<html>login page</html>", { status: 200 }));
      const tor = await createTor({ torPdfUrl: "https://egp.example/tor.pdf" });

      const res = await getSummary(tor._id);
      const { prompt, pdf } = sentToModel();

      expect(res.status).toBe(200);
      expect(pdf).toBeUndefined();
      expect(prompt).not.toContain("แนบเอกสาร TOR");
    });

    it("still summarises when the download fails", async () => {
      modelReplies("สรุปจากข้อมูล");
      const tor = await createTor({ torPdfUrl: "https://egp.example/tor.pdf" });

      const res = await getSummary(tor._id);

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("สรุปจากข้อมูล");
      expect(sentToModel().pdf).toBeUndefined();
    });

    it("doesn't download anything for a TOR without document links", async () => {
      modelReplies("สรุป");
      const tor = await createTor();

      await getSummary(tor._id);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("errors", () => {
    it("returns 503 when the AI key isn't configured", async () => {
      mockGetGenAI.mockImplementationOnce(() => {
        throw new GenAIUnavailableError("VERTEX_API_KEY is not set");
      });
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.status).toBe(503);
      expect(res.body.message).toBe("TOR summary is not available");
    });

    it("returns 500 when the model fails and there is no earlier summary", async () => {
      mockGenerateContent.mockRejectedValue(Object.assign(new Error("model error"), { status: 500 }));
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Failed to summarize TOR");
      // Only 429 is retried.
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("serves the earlier summary when regenerating fails", async () => {
      const tor = await createTor();
      await Tor.updateOne(
        { _id: tor._id },
        { $set: { aiSummary: { text: "สรุปเดิม", model: "gemini-3.5-flash-lite#v0", generatedAt: new Date() } } },
        { timestamps: false },
      );
      mockGenerateContent.mockRejectedValue(Object.assign(new Error("model error"), { status: 500 }));

      const res = await getSummary(tor._id);

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("สรุปเดิม");
    });

    it("returns 500 and stores nothing when the model replies with empty text", async () => {
      modelReplies("   ");
      const tor = await createTor();

      const res = await getSummary(tor._id);
      const saved = await Tor.findById(tor._id).lean();

      expect(res.status).toBe(500);
      expect(saved?.aiSummary?.text).toBeUndefined();
    });

    it("retries when the model is rate-limited (429), then succeeds", async () => {
      skipRetryDelays();
      mockGenerateContent
        .mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }))
        .mockResolvedValueOnce({ text: "สรุปหลังลองใหม่" });
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("สรุปหลังลองใหม่");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("gives up after 3 rate-limited attempts", async () => {
      skipRetryDelays();
      mockGenerateContent.mockRejectedValue(Object.assign(new Error("quota"), { status: 429 }));
      const tor = await createTor();

      const res = await getSummary(tor._id);

      expect(res.status).toBe(500);
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
  });
});
