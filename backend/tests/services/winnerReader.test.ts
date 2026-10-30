import { askAboutPdf, MAX_PDF_BYTES } from "../../src/services/genai.js";
import { readWinners } from "../../src/services/winnerReader.js";

/**
 * Reading the winners and winning prices out of an e-GP winner announcement.
 * The model's reply is mocked; what's under test is how the reply becomes
 * names and a total price.
 */

jest.mock("../../src/services/genai.js", () => ({
  ...jest.requireActual("../../src/services/genai.js"),
  askAboutPdf: jest.fn(),
}));

const mockAskAboutPdf = askAboutPdf as jest.MockedFunction<typeof askAboutPdf>;

const PDF = Buffer.from("%PDF winner announcement");
const NONE = { names: [], amount: undefined };

/** What the model "reads" from the PDF. */
function modelReplies(reply: unknown) {
  mockAskAboutPdf.mockResolvedValue(typeof reply === "string" ? reply : JSON.stringify(reply));
}

beforeEach(() => {
  mockAskAboutPdf.mockReset();
});

describe("readWinners", () => {
  describe("names and prices", () => {
    it("reads a winner and a price written in Thai digits", async () => {
      modelReplies({ winners: [{ name: "บริษัท ตัวอย่าง จำกัด", price: "๔,๕๐๘,๔๘๐.๐๐" }] });

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท ตัวอย่าง จำกัด"], amount: 4_508_480 });
    });

    it.each([
      ["1,192,000.00", 1_192_000],
      ["1,192,000.00 บาท", 1_192_000],
      ["755,869.75", 755_869.75],
      [944570, 944_570],
    ])("reads the price %j", async (price, amount) => {
      modelReplies({ winners: [{ name: "บริษัท ตัวอย่าง จำกัด", price }] });

      expect((await readWinners(PDF)).amount).toBe(amount);
    });

    it("tidies spacing and converts Thai digits in names", async () => {
      modelReplies({ winners: [{ name: "  บริษัท  ๑๒๓\nเทคโนโลยี จำกัด ", price: "100" }] });

      expect((await readWinners(PDF)).names).toEqual(["บริษัท 123 เทคโนโลยี จำกัด"]);
    });

    it("adds up the prices of several winners", async () => {
      modelReplies({
        winners: [
          { name: "บริษัท เอ จำกัด", price: "1,000,000" },
          { name: "ห้างหุ้นส่วนจำกัด บี", price: "๕๐๐,๐๐๐" },
        ],
      });

      expect(await readWinners(PDF)).toEqual({
        names: ["บริษัท เอ จำกัด", "ห้างหุ้นส่วนจำกัด บี"],
        amount: 1_500_000,
      });
    });

    it("lists a company that won several lots once, but counts every lot's price", async () => {
      modelReplies({
        winners: [
          { name: "บริษัท เอ จำกัด", price: "200,000" },
          { name: "บริษัท  เอ จำกัด", price: "300,000" },
        ],
      });

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท เอ จำกัด"], amount: 500_000 });
    });

    it("accepts a reply wrapped in an array", async () => {
      modelReplies([{ winners: [{ name: "บริษัท ตัวอย่าง จำกัด", price: "100" }] }]);

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท ตัวอย่าง จำกัด"], amount: 100 });
    });

    it("returns only names, never other fields such as a tax ID", async () => {
      modelReplies({ winners: [{ name: "บริษัท ตัวอย่าง จำกัด", taxId: "0105561234567", price: "100" }] });

      expect(JSON.stringify(await readWinners(PDF))).not.toContain("0105561234567");
    });
  });

  describe("prices that can't be read", () => {
    it("keeps the names but drops the total when any price is missing", async () => {
      modelReplies({
        winners: [
          { name: "บริษัท เอ จำกัด", price: "1,000,000" },
          { name: "บริษัท บี จำกัด", price: null },
        ],
      });

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท เอ จำกัด", "บริษัท บี จำกัด"], amount: undefined });
    });

    it.each([["0"], ["ไม่ระบุ"], [""], [{ value: 100 }]])("treats the price %j as unreadable", async (price) => {
      modelReplies({ winners: [{ name: "บริษัท ตัวอย่าง จำกัด", price }] });

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท ตัวอย่าง จำกัด"], amount: undefined });
    });
  });

  describe("no winners", () => {
    it("returns nothing when the announcement has no winner", async () => {
      modelReplies({ winners: [] });

      expect(await readWinners(PDF)).toEqual(NONE);
    });

    it("skips entries without a name, and their prices", async () => {
      modelReplies({
        winners: [
          { name: "บริษัท เอ จำกัด", price: "100" },
          { name: "   ", price: "999" },
          { price: "999" },
          null,
        ],
      });

      expect(await readWinners(PDF)).toEqual({ names: ["บริษัท เอ จำกัด"], amount: 100 });
    });

    it.each<[unknown, string]>([
      ["ไม่พบผู้ชนะ", "text that isn't JSON"],
      [{}, "no winners field"],
      [{ winners: "บริษัท เอ จำกัด" }, "winners that isn't a list"],
      [[], "an empty array"],
    ])("returns nothing for %j (%s)", async (reply) => {
      modelReplies(reply);

      expect(await readWinners(PDF)).toEqual(NONE);
    });

    it("doesn't call the model for a PDF over the size limit", async () => {
      expect(await readWinners(Buffer.alloc(MAX_PDF_BYTES + 1))).toEqual(NONE);
      expect(mockAskAboutPdf).not.toHaveBeenCalled();
    });
  });

  it("asks the model about the given PDF for a JSON reply", async () => {
    modelReplies({ winners: [] });

    await readWinners(PDF);

    const [pdf, prompt, json] = mockAskAboutPdf.mock.calls[0];
    expect(pdf).toBe(PDF);
    expect(json).toBe(true);
    expect(prompt).toContain("JSON");
  });
});
