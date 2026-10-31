import { askAboutPdf, MAX_PDF_BYTES } from "../../src/services/genai.js";
import { readDeadline } from "../../src/services/deadlineReader.js";

/**
 * Reading the bid deadline out of an e-GP invitation (FR-07). The model's
 * reply is mocked; what's under test is how the reply becomes a date.
 */

jest.mock("../../src/services/genai.js", () => ({
  ...jest.requireActual("../../src/services/genai.js"),
  askAboutPdf: jest.fn(),
}));

const mockAskAboutPdf = askAboutPdf as jest.MockedFunction<typeof askAboutPdf>;

const PDF = Buffer.from("%PDF invitation");
/** Invitation published 1 Oct 2026, 09:00 Bangkok time. */
const ANNOUNCED = new Date("2026-10-01T09:00:00+07:00");

/** What the model "reads" from the PDF. */
function modelReplies(reply: Record<string, unknown> | unknown[] | string) {
  mockAskAboutPdf.mockResolvedValue(typeof reply === "string" ? reply : JSON.stringify(reply));
}

/** The deadline, or the reason there isn't one. */
async function read(announcedAt: Date | undefined = ANNOUNCED, pdf = PDF) {
  const result = await readDeadline(pdf, announcedAt);
  return result.deadline ? result.deadline.toISOString() : result.reason;
}

beforeEach(() => {
  mockAskAboutPdf.mockReset();
});

describe("readDeadline", () => {
  describe("reading the date and time", () => {
    it("reads Thai digits and a full month name, in Bangkok time", async () => {
      modelReplies({ day: "๘", month: "ตุลาคม", endTime: "๑๒.๐๐", quote: "เสนอราคาในวันที่ ๘ ตุลาคม ๒๕๖๙" });

      const result = await readDeadline(PDF, ANNOUNCED);

      expect(result).toEqual({
        deadline: new Date("2026-10-08T12:00:00+07:00"),
        quote: "เสนอราคาในวันที่ ๘ ตุลาคม ๒๕๖๙",
      });
    });

    it.each([
      ["ต.ค.", "abbreviated"],
      ["ต. ค.", "abbreviated with a space"],
      [" ตุลาคม ", "padded with spaces"],
    ])("reads the month %s (%s)", async (month) => {
      modelReplies({ day: "15", month, endTime: "16.30" });
      expect(await read()).toBe("2026-10-15T09:30:00.000Z");
    });

    it.each([
      ["มกราคม", 0],
      ["ก.พ.", 1],
      ["มี.ค.", 2],
      ["เมษายน", 3],
      ["พ.ค.", 4],
      ["มิ.ย.", 5],
      ["กรกฎาคม", 6],
      ["ส.ค.", 7],
      ["กันยายน", 8],
      ["พฤศจิกายน", 10],
      ["ธ.ค.", 11],
    ])("knows the month %s", async (month, index) => {
      // Announced on the 1st of that month, so the deadline is the same month and year.
      const announced = new Date(Date.UTC(2026, index, 1, 2));
      modelReplies({ day: "10", month, endTime: "12.00" });

      const result = await readDeadline(PDF, announced);

      expect(result.deadline?.getUTCMonth()).toBe(index);
    });

    it("reads a time written with a colon", async () => {
      modelReplies({ day: "8", month: "ตุลาคม", endTime: "13:30 น." });
      expect(await read()).toBe("2026-10-08T06:30:00.000Z");
    });

    it("pads a one-digit hour", async () => {
      modelReplies({ day: "8", month: "ตุลาคม", endTime: "๙.๓๐" });
      expect(await read()).toBe("2026-10-08T02:30:00.000Z");
    });

    it("accepts bids all day when no closing time is given", async () => {
      modelReplies({ day: "8", month: "ตุลาคม", endTime: null });
      expect(await read()).toBe("2026-10-08T16:59:00.000Z");
    });

    it("accepts a reply wrapped in an array", async () => {
      modelReplies([{ day: "๘", month: "ตุลาคม", endTime: "๑๒.๐๐" }]);
      expect(await read()).toBe("2026-10-08T05:00:00.000Z");
    });

    it("returns an empty quote when the model gives none", async () => {
      modelReplies({ day: "8", month: "ตุลาคม", endTime: "12.00" });

      const result = await readDeadline(PDF, ANNOUNCED);

      expect(result).toMatchObject({ quote: "" });
    });
  });

  describe("the year", () => {
    it("takes the year from the announcement, not the PDF", async () => {
      // Scanned PDFs misread ๒๕๖๙ as ๒๕๖๕; the year is never read from the reply.
      modelReplies({ day: "8", month: "ตุลาคม", endTime: "12.00", year: "๒๕๖๕" });
      expect(await read()).toBe("2026-10-08T05:00:00.000Z");
    });

    it("moves to the next year when the deadline crosses New Year", async () => {
      modelReplies({ day: "๕", month: "มกราคม", endTime: "๑๒.๐๐" });
      expect(await read(new Date("2026-12-20T09:00:00+07:00"))).toBe("2027-01-05T05:00:00.000Z");
    });

    it("keeps a deadline on the announcement day in the same year", async () => {
      modelReplies({ day: "1", month: "ตุลาคม", endTime: "16.00" });
      expect(await read()).toBe("2026-10-01T09:00:00.000Z");
    });

    it("uses the announcement's Bangkok date, not its UTC date", async () => {
      // 1 Oct 01:00 in Bangkok is still 30 Sep in UTC.
      modelReplies({ day: "1", month: "ตุลาคม", endTime: "12.00" });
      expect(await read(new Date("2026-09-30T18:00:00Z"))).toBe("2026-10-01T05:00:00.000Z");
    });
  });

  describe("no deadline", () => {
    it("doesn't call the model without an announcement date", async () => {
      expect(await read(null as unknown as undefined)).toBe("no announcement date to anchor the year");
      expect(mockAskAboutPdf).not.toHaveBeenCalled();
    });

    it("doesn't call the model for a PDF over the size limit", async () => {
      const big = Buffer.alloc(MAX_PDF_BYTES + 1);

      expect(await read(ANNOUNCED, big)).toMatch(/^PDF too large/);
      expect(mockAskAboutPdf).not.toHaveBeenCalled();
    });

    it("gives up when the model doesn't answer in JSON", async () => {
      modelReplies("ไม่พบวันที่ในเอกสาร");
      expect(await read()).toBe("model did not return JSON");
    });

    it.each<[Record<string, unknown> | unknown[], string]>([
      [{ day: null, month: null }, "blanks left unfilled"],
      [{ day: "", month: "ตุลาคม" }, "no day"],
      [{ day: "๓๒", month: "ตุลาคม" }, "day over 31"],
      [{ day: "8", month: "October" }, "a month that isn't Thai"],
      [{}, "an empty reply"],
      [[], "an empty array"],
    ])("finds no deadline in %j (%s)", async (reply) => {
      modelReplies(reply);
      expect(await read()).toBe("no deadline in PDF");
    });

    it("rejects a date that doesn't exist", async () => {
      modelReplies({ day: "๓๑", month: "กุมภาพันธ์", endTime: "12.00" });
      expect(await read(new Date("2026-02-01T09:00:00+07:00"))).toMatch(/^unparseable date/);
    });

    it("rejects a deadline more than 120 days after the announcement as a misread", async () => {
      // 1 March is before 1 October, so it would land in 2027: five months away.
      modelReplies({ day: "1", month: "มีนาคม", endTime: "12.00" });
      expect(await read()).toBe("deadline more than 120 days after the announcement");
    });

    it("accepts a deadline just inside 120 days", async () => {
      modelReplies({ day: "28", month: "มกราคม", endTime: "09.00" });
      expect(await read()).toBe("2027-01-28T02:00:00.000Z");
    });
  });

  it("asks the model about the given PDF for a JSON reply", async () => {
    modelReplies({ day: "8", month: "ตุลาคม" });

    await readDeadline(PDF, ANNOUNCED);

    const [pdf, prompt, json] = mockAskAboutPdf.mock.calls[0];
    expect(pdf).toBe(PDF);
    expect(json).toBe(true);
    expect(prompt).toContain("JSON");
  });
});
