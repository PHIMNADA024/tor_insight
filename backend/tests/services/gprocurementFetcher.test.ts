import { SyncLog, Tor } from "../../src/models/index.js";
import { runGprocurementSync } from "../../src/services/gprocurementFetcher.js";
import { askAboutPdf } from "../../src/services/genai.js";
import { readDeadline } from "../../src/services/deadlineReader.js";
import { summarizeTorDocument } from "../../src/services/torDocumentSummary.js";
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from "../helpers/database.js";

/**
 * National e-GP sync (FR-07, FR-08) against a fake RSS feed and a throwaway
 * in-memory MongoDB. The AI calls are mocked, so no model is called; each fake
 * PDF is just its name, which the mocks can tell apart.
 */

// The fetcher waits 1.5s between requests; tests don't need to.
jest.mock("../../src/services/http.js", () => ({
  ...jest.requireActual("../../src/services/http.js"),
  sleep: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/genai.js", () => ({
  ...jest.requireActual("../../src/services/genai.js"),
  askAboutPdf: jest.fn(),
}));
jest.mock("../../src/services/deadlineReader.js", () => ({ readDeadline: jest.fn() }));
jest.mock("../../src/services/torDocumentSummary.js", () => ({ summarizeTorDocument: jest.fn() }));
jest.mock("../../src/jobs/notify-matches.js", () => ({
  notifyMatchingUsers: jest.fn().mockResolvedValue({ usersNotified: 0 }),
}));

const mockAskAboutPdf = askAboutPdf as jest.MockedFunction<typeof askAboutPdf>;
const mockReadDeadline = readDeadline as jest.MockedFunction<typeof readDeadline>;
const mockSummarize = summarizeTorDocument as jest.MockedFunction<typeof summarizeTorDocument>;

const FEED_URL = "https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType=D0";
const PDF_BASE = "https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A deadline a week ahead, so a new invitation is still open. */
const DEADLINE = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS + 7 * DAY_MS + 5 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Fake feed and PDFs
// ---------------------------------------------------------------------------

type FeedItem = {
  title: string;
  projectNumber: string;
  method?: string;
  pubDate?: string;
  /** The template id in the PDF link; also the fake PDF's content. */
  pdf?: string;
};

const feed = {
  items: [] as FeedItem[],
  /** What each PDF link returns, by template id. Default: a small PDF. */
  pdfs: new Map<string, Response | (() => Response)>(),
  /** The feed's own response, when a test needs it to fail. */
  status: 200,
};

let itemCount = 0;

/** An IT invitation in today's feed; tests override what they need. */
function addItem(overrides: Partial<FeedItem> = {}): Required<FeedItem> {
  itemCount++;
  const item = {
    title: "ประกวดราคาซื้อเครื่องคอมพิวเตอร์ ๒ เครื่อง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
    projectNumber: `691090${String(itemCount).padStart(5, "0")}`,
    method: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
    pubDate: "2026-10-21",
    pdf: `invitation-${itemCount}`,
    ...overrides,
  };
  feed.items.push(item);
  return item;
}

/**
 * The feed is Windows-874 (Thai) encoded, like the real one: ASCII as is,
 * Thai U+0E01–U+0E5B as bytes 0xA1–0xFB.
 */
function windows874(text: string) {
  return Buffer.from(
    [...text].map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0x80) return code;
      if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0d60;
      throw new Error(`not encodable in Windows-874: ${ch}`);
    }),
  );
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function feedXml() {
  const items = feed.items.map(
    (item) =>
      `<item><title>${escapeXml(item.title)}</title>` +
      `<link>${escapeXml(`${PDF_BASE}?templateId=${item.pdf}&lang=th`)}</link>` +
      `<description>${item.projectNumber}, ${item.method}, ประกาศเชิญชวน</description>` +
      `<pubDate>${item.pubDate}</pubDate></item>`,
  );
  return `<?xml version="1.0" encoding="windows-874"?><rss><channel><title>ประกาศจัดซื้อจัดจ้าง</title>${items.join("")}</channel></rss>`;
}

const fetchMock = jest.fn(async (input: string | URL | Request, _init?: RequestInit) => {
  const url = String(input);
  if (url === FEED_URL) {
    return new Response(windows874(feedXml()), { status: feed.status });
  }
  const templateId = new URL(url).searchParams.get("templateId") ?? "";
  const pdf = feed.pdfs.get(templateId);
  if (pdf) return typeof pdf === "function" ? pdf() : pdf;
  return new Response(Buffer.from(`%PDF ${templateId}`));
});

/** Template ids of the PDFs downloaded so far. */
function pdfsDownloaded() {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith(PDF_BASE))
    .map((url) => new URL(url).searchParams.get("templateId"));
}

const fileName = (pdf: Buffer) => pdf.toString().slice("%PDF ".length);

/** What the AI "reads" as the invitation's facts. */
function factsReply(facts: Record<string, unknown> | string) {
  mockAskAboutPdf.mockResolvedValue(typeof facts === "string" ? facts : JSON.stringify(facts));
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  await connectTestDatabase();
}, 120_000);

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  feed.items = [];
  feed.pdfs.clear();
  feed.status = 200;
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;

  mockReadDeadline.mockReset().mockResolvedValue({ deadline: DEADLINE, quote: "เสนอราคาในวันที่ ..." });
  mockSummarize.mockReset().mockImplementation(async (pdf) => `สรุปจาก ${fileName(pdf)}`);
  mockAskAboutPdf.mockReset();
  factsReply({ agency: "กรมสรรพากร", budget: "2,500,000.00 บาท", referencePrice: "๒,๔๙๙,๖๒๗.๐๐" });

  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function findTor(projectNumber: string) {
  return Tor.findOne({ ocid: `gproc-${projectNumber}` }).lean();
}

// ---------------------------------------------------------------------------

describe("collecting invitations", () => {
  it("stores an open IT invitation from the feed as a published TOR", async () => {
    const item = addItem();

    const counts = await runGprocurementSync("manual");

    expect(counts).toMatchObject({ inserted: 1, updated: 0, skipped: 0, read: 1 });
    const tor = await findTor(item.projectNumber);
    expect(tor).toMatchObject({
      sourceId: "gprocurement",
      status: "published",
      egpProjectNumber: item.projectNumber,
      title: "ซื้อเครื่องคอมพิวเตอร์ 2 เครื่อง",
      agency: "กรมสรรพากร",
      category: "tender_invitation",
      itCategory: "it_equipment",
      budgetAmount: 2_500_000,
      tenderAmount: 2_499_627,
      procurementMethod: "e-bidding",
      fiscalYear: 2026,
      description: "งบประมาณประจำปี 69",
      detailSummary: `สรุปจาก ${item.pdf}`,
      sourceUrl: `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${item.projectNumber}`,
    });
    expect(tor?.submissionDeadline?.getTime()).toBe(DEADLINE.getTime());
    // The publication day, at midnight Bangkok time.
    expect(tor?.tenderStartDate?.toISOString()).toBe("2026-10-20T17:00:00.000Z");
    expect(tor?.publishedDate?.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });

  it("decodes the Windows-874 feed and its XML entities", async () => {
    const item = addItem({ title: "ซื้อลิขสิทธิ์ Software & License จำนวน ๓ ชุด" });
    await runGprocurementSync("manual");

    const tor = await findTor(item.projectNumber);
    expect(tor?.title).toBe("ซื้อลิขสิทธิ์ Software & License จำนวน 3 ชุด");
    expect(tor?.itCategory).toBe("software");
    // "&amp;" in the link is decoded before the PDF is requested.
    expect(tor?.invitationPdfUrl).toBe(`${PDF_BASE}?templateId=${item.pdf}&lang=th`);
  });

  it("logs the run in SyncLog", async () => {
    addItem();
    await runGprocurementSync("manual");

    const log = await SyncLog.findOne({ sourceId: "gprocurement" }).lean();
    expect(log).toMatchObject({ status: "success", trigger: "manual", recordsRead: 1, recordsInserted: 1 });
  });

  it("identifies itself in the User-Agent", async () => {
    addItem();
    await runGprocurementSync("manual");

    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>)["User-Agent"]).toContain("TOR-Insight");
    }
  });

  it("only reads IT invitations, without downloading the others", async () => {
    const computers = addItem();
    const road = addItem({ title: "ประกวดราคาจ้างก่อสร้างถนนคอนกรีตเสริมเหล็ก ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)" });
    const scanner = addItem({ title: "ซื้อเครื่องเอกซเรย์คอมพิวเตอร์ จำนวน 1 เครื่อง" });

    const counts = await runGprocurementSync("manual");

    expect(counts.read).toBe(1);
    expect(pdfsDownloaded()).toEqual([computers.pdf]);
    expect(await findTor(road.projectNumber)).toBeNull();
    expect(await findTor(scanner.projectNumber)).toBeNull();
  });

  it("ignores feed entries without a valid project number", async () => {
    addItem({ projectNumber: "ไม่ระบุ" });
    addItem({ projectNumber: "6910901" });

    const counts = await runGprocurementSync("manual");

    expect(counts.read).toBe(0);
  });
});

describe("reading the invitation's facts", () => {
  it("uses the reference price as the budget when no budget is stated", async () => {
    factsReply({ agency: "กรมสรรพากร", budget: null, referencePrice: "1,192,000.00" });
    const item = addItem();
    await runGprocurementSync("manual");

    expect(await findTor(item.projectNumber)).toMatchObject({ budgetAmount: 1_192_000, tenderAmount: 1_192_000 });
  });

  it("accepts facts wrapped in an array", async () => {
    factsReply(JSON.stringify([{ agency: "สำนักงาน  เศรษฐกิจ\nอุตสาหกรรม", referencePrice: "1,375,000" }]));
    const item = addItem();
    await runGprocurementSync("manual");

    expect(await findTor(item.projectNumber)).toMatchObject({ agency: "สำนักงาน เศรษฐกิจ อุตสาหกรรม", tenderAmount: 1_375_000 });
  });

  it("still stores the tender when the facts can't be read", async () => {
    factsReply("not json");
    const item = addItem();
    await runGprocurementSync("manual");

    const tor = await findTor(item.projectNumber);
    expect(tor?.agency).toBe("ไม่ระบุหน่วยงาน");
    expect(tor?.budgetAmount).toBeUndefined();
  });
});

describe("skipping", () => {
  it("skips a project already collected from BMA or Bangkok's e-GP, without downloading it (FR-08)", async () => {
    const item = addItem();
    await Tor.create({
      ocid: `egp-${item.projectNumber}`,
      sourceId: "egp",
      egpProjectNumber: item.projectNumber,
      title: "ซื้อคอมพิวเตอร์",
      agency: "สำนักการจราจรและขนส่ง",
    });

    const counts = await runGprocurementSync("manual");

    expect(counts).toMatchObject({ inserted: 0, skipped: 1 });
    expect(await findTor(item.projectNumber)).toBeNull();
    expect(pdfsDownloaded()).toEqual([]);
  });

  it("skips a link that isn't a PDF", async () => {
    const item = addItem();
    feed.pdfs.set(item.pdf, new Response("<html>เกิดข้อผิดพลาด</html>"));

    const counts = await runGprocurementSync("manual");

    expect(counts.skipped).toBe(1);
    expect(await findTor(item.projectNumber)).toBeNull();
    expect(mockReadDeadline).not.toHaveBeenCalled();
  });

  it("skips a PDF over 15 MB", async () => {
    const item = addItem();
    const big = Buffer.alloc(15 * 1024 * 1024 + 1);
    big.write("%PDF");
    feed.pdfs.set(item.pdf, new Response(big));

    const counts = await runGprocurementSync("manual");

    expect(counts.skipped).toBe(1);
    expect(mockReadDeadline).not.toHaveBeenCalled();
  });

  it("doesn't store a tender whose deadline can't be read", async () => {
    mockReadDeadline.mockResolvedValue({ deadline: null, reason: "no deadline in PDF" });
    const item = addItem();

    const counts = await runGprocurementSync("manual");

    expect(counts.skipped).toBe(1);
    expect(await findTor(item.projectNumber)).toBeNull();
    expect(mockAskAboutPdf).not.toHaveBeenCalled();
  });

  it("doesn't store a tender that has already closed", async () => {
    mockReadDeadline.mockResolvedValue({ deadline: new Date(Date.now() - 60_000), quote: "..." });
    const item = addItem();

    await runGprocurementSync("manual");

    expect(await findTor(item.projectNumber)).toBeNull();
  });

  it("keeps going when one PDF can't be downloaded", async () => {
    const broken = addItem();
    const fine = addItem();
    feed.pdfs.set(broken.pdf, () => new Response("gone", { status: 404 }));

    const counts = await runGprocurementSync("manual");

    expect(counts).toMatchObject({ inserted: 1, skipped: 1 });
    expect(await findTor(fine.projectNumber)).not.toBeNull();
  });

  it("records a failed run when the feed can't be read", async () => {
    feed.status = 403;

    await expect(runGprocurementSync("manual")).rejects.toThrow("HTTP 403");

    const log = await SyncLog.findOne({ sourceId: "gprocurement" }).lean();
    expect(log?.status).toBe("failed");
  });
});

describe("re-running", () => {
  it("leaves a tender it already has alone, without downloading it again", async () => {
    const item = addItem();
    await runGprocurementSync("manual");
    // A budget fixed by hand must survive the next run.
    await Tor.updateOne({ ocid: `gproc-${item.projectNumber}` }, { $set: { budgetAmount: 2_600_000 } });
    fetchMock.mockClear();
    mockReadDeadline.mockClear();

    const counts = await runGprocurementSync("manual");

    expect(counts).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });
    expect(pdfsDownloaded()).toEqual([]);
    expect(mockReadDeadline).not.toHaveBeenCalled();
    expect((await findTor(item.projectNumber))?.budgetAmount).toBe(2_600_000);
  });

  it("hides tenders whose deadline has passed, as there is no winner data", async () => {
    const past = new Date(Date.now() - DAY_MS);
    await Tor.create([
      {
        ocid: "gproc-69090000001",
        sourceId: "gprocurement",
        title: "ซื้อคอมพิวเตอร์",
        agency: "กรมสรรพากร",
        submissionDeadline: past,
        status: "published",
      },
      {
        ocid: "gproc-69090000002",
        sourceId: "gprocurement",
        title: "ซื้อเครื่องพิมพ์",
        agency: "กรมสรรพากร",
        submissionDeadline: DEADLINE,
        status: "published",
      },
      {
        // Another source's closed tender isn't this fetcher's to hide.
        ocid: "egp-69090000003",
        sourceId: "egp",
        title: "จ้างบำรุงรักษาระบบ",
        agency: "สำนักการจราจรและขนส่ง",
        submissionDeadline: past,
        status: "published",
      },
    ]);

    const counts = await runGprocurementSync("manual");

    expect(counts.updated).toBe(1);
    expect((await Tor.findOne({ ocid: "gproc-69090000001" }).lean())?.status).toBe("draft");
    expect((await Tor.findOne({ ocid: "gproc-69090000002" }).lean())?.status).toBe("published");
    expect((await Tor.findOne({ ocid: "egp-69090000003" }).lean())?.status).toBe("published");
  });
});
