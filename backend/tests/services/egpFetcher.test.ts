import { SyncLog, Tor } from "../../src/models/index.js";
import {
  budgetDescription,
  cleanTitle,
  fiscalYearFromNumber,
  isItName,
  isSoftware,
  normalizeMethod,
  runEgpSync,
} from "../../src/services/egpFetcher.js";
import { readDeadline } from "../../src/services/deadlineReader.js";
import { readWinners } from "../../src/services/winnerReader.js";
import { summarizeTorDocument } from "../../src/services/torDocumentSummary.js";
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from "../helpers/database.js";

/**
 * Bangkok e-GP sync (FR-07, FR-08) against a fake e-GP API and a throwaway
 * in-memory MongoDB. The AI readers are mocked, so no model is called; each
 * fake PDF is just its file name, which the mocks can tell apart.
 */

// The fetcher waits 1.1s between requests (robots.txt crawl delay); tests don't need to.
jest.mock("../../src/services/http.js", () => ({
  ...jest.requireActual("../../src/services/http.js"),
  sleep: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/deadlineReader.js", () => ({ readDeadline: jest.fn() }));
jest.mock("../../src/services/winnerReader.js", () => ({ readWinners: jest.fn() }));
jest.mock("../../src/services/torDocumentSummary.js", () => ({ summarizeTorDocument: jest.fn() }));
jest.mock("../../src/jobs/notify-matches.js", () => ({
  notifyMatchingUsers: jest.fn().mockResolvedValue({ usersNotified: 0 }),
}));

const mockReadDeadline = readDeadline as jest.MockedFunction<typeof readDeadline>;
const mockReadWinners = readWinners as jest.MockedFunction<typeof readWinners>;
const mockSummarize = summarizeTorDocument as jest.MockedFunction<typeof summarizeTorDocument>;

const SITE = "https://egp2.bangkok.go.th";
const INVITATION_TYPE_ID = "705f1ffb-82e2-4beb-bdd2-2746f0783bf0";
const COMPUTER_GOODS_ID = "54c0c93b-9193-4e49-809e-eccd40704a83";
const DRAFT_TYPE_IDS = [
  "24995aa2-d875-4d3d-9dec-d5e22d222aa4",
  "417bddc2-c971-465f-b419-23847e27bcba",
  "9863983d-44e1-4eee-b38a-bb0b495762c5",
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** A deadline a week ahead, so a new invitation is still open. */
const DEADLINE = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS + 7 * DAY_MS + 5 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Fake e-GP API
// ---------------------------------------------------------------------------

type Announcement = {
  id: string;
  masterAnnounceTypeName: string;
  projectAnnouncementPublishDate: string;
  projectAnnouncementPath: string | null;
};

type FakeProject = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  /** Which listing the project shows up in. */
  listedAs: "invitation" | "draft" | "none";
  /** In the "computer goods" category (otherwise found by its name only). */
  computerCategory: boolean;
  detail: Record<string, unknown>;
  announcements: Announcement[];
};

const egp = {
  projects: [] as FakeProject[],
  pageSize: 100,
  /** Requests answered with this status instead of data. */
  failing: new Map<string, number>(),
};

let announcementCount = 0;

function announcement(type: string, date: string, path: string | null = `${type}.pdf`): Announcement {
  return {
    id: `ann-${announcementCount++}`,
    masterAnnounceTypeName: type,
    projectAnnouncementPublishDate: date,
    projectAnnouncementPath: path,
  };
}

const INVITATION = "ประกาศเชิญชวน";
const TOR = "ร่างขอบเขตของงาน (TOR)";
const DRAFT_BIDDING = "ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา";
const WINNER = "ประกาศรายชื่อผู้ชนะการเสนอราคา";

/** An IT project with a draft TOR and an invitation; tests override what they need. */
function addProject(overrides: Partial<FakeProject> & { detail?: Record<string, unknown> } = {}): FakeProject {
  const n = egp.projects.length + 1;
  const projectNumber = overrides.projectNumber ?? `691000000${String(n).padStart(2, "0")}`;
  const projectId = overrides.projectId ?? `pid-${n}`;
  const projectName =
    overrides.projectName ?? "ประกวดราคาซื้อเครื่องคอมพิวเตอร์ ๒ เครื่อง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)";

  const project: FakeProject = {
    projectId,
    projectNumber,
    projectName,
    listedAs: "invitation",
    computerCategory: true,
    announcements: [
      announcement(TOR, "2026-09-20T09:00:00", `tor-${n}.pdf`),
      announcement(INVITATION, "2026-10-01T09:00:00", `invitation-${n}.pdf`),
    ],
    ...overrides,
    detail: {
      projectId,
      projectName,
      projectNumber,
      masterOrgGroupName: "สำนักการจราจรและขนส่ง",
      projectBudget: 5_000_000,
      projectAverageBudget: 4_900_000,
      masterMethodIdName: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
      masterContractAvailableName: "ระหว่างดำเนินการ",
      // A staff name: must never be stored.
      createdBy: "นางสาวทดสอบ ไม่ควรเก็บ",
      ...overrides.detail,
    },
  };
  egp.projects.push(project);
  return project;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = jest.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const failStatus = [...egp.failing].find(([part]) => url.href.includes(part))?.[1];
  if (failStatus) return json({ message: "error" }, failStatus);

  // A file: the "PDF" is its own file name.
  if (url.pathname.startsWith("/api/file/")) {
    return new Response(Buffer.from(`%PDF ${decodeURIComponent(url.pathname.split("/").pop()!)}`));
  }

  const params = url.searchParams;
  if (url.pathname.endsWith("/Projects/GetProjectFromFilter")) {
    const type = params.get("masterAnnounceTypeId");
    const matching = egp.projects.filter((p) =>
      type === INVITATION_TYPE_ID
        ? p.listedAs === "invitation" && (params.get("masterGoodIdId") !== COMPUTER_GOODS_ID || p.computerCategory)
        : DRAFT_TYPE_IDS.includes(type ?? "") && p.listedAs === "draft",
    );
    const pageNo = Number(params.get("pageNo"));
    const data = matching
      .slice((pageNo - 1) * egp.pageSize, pageNo * egp.pageSize)
      .map(({ projectId, projectNumber, projectName }) => ({ projectId, projectNumber, projectName }));
    return json({ data, totalCount: matching.length, hasNextPage: pageNo * egp.pageSize < matching.length });
  }

  const project = egp.projects.find((p) => p.projectId === params.get("projectId"));
  if (!project) return json({ message: "not found" }, 404);
  if (url.pathname.endsWith("/ProjectAnnouncements/GetAnnouncementDetailInProject")) {
    return json({ data: project.announcements });
  }
  if (url.pathname.endsWith("/Projects/GetProjectDetail")) return json(project.detail);
  return json({ message: "unknown endpoint" }, 404);
});

/** Paths of the requests sent so far that contain `part`. */
function requestsTo(part: string) {
  return fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => url.includes(part));
}

/** Text of the fake PDF the mock was given. */
const fileName = (pdf: Buffer) => pdf.toString().slice("%PDF ".length);

// ---------------------------------------------------------------------------

beforeAll(async () => {
  await connectTestDatabase();
}, 120_000);

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  egp.projects = [];
  egp.pageSize = 100;
  egp.failing.clear();
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;

  mockReadDeadline.mockReset().mockResolvedValue({ deadline: DEADLINE, quote: "เสนอราคาในวันที่ ..." });
  mockReadWinners.mockReset().mockResolvedValue({ names: ["บริษัท ชนะประมูล จำกัด"], amount: 4_500_000 });
  mockSummarize.mockReset().mockImplementation(async (pdf) => `สรุปจาก ${fileName(pdf)}`);

  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function findTor(projectNumber: string) {
  return Tor.findOne({ ocid: `egp-${projectNumber}` }).lean();
}

// ---------------------------------------------------------------------------

describe("helpers", () => {
  it.each([
    "ซื้อเครื่องคอมพิวเตอร์",
    "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
    "ซื้อลิขสิทธิ์ Software ป้องกันไวรัส",
    "จ้างพัฒนาระบบสารสนเทศ",
  ])("treats %s as IT work", (name) => {
    expect(isItName(name)).toBe(true);
  });

  it.each([
    "ซื้อเครื่องเอกซเรย์คอมพิวเตอร์", // a CT scanner
    "จ้างปรับปรุงระบบไฟฟ้าห้องคอมพิวเตอร์",
    "ซื้อเครื่องปรับอากาศห้องเซิร์ฟเวอร์",
    "ซื้อวัสดุสำนักงาน",
  ])("doesn't treat %s as IT work", (name) => {
    expect(isItName(name)).toBe(false);
  });

  it("tells software from equipment by the name", () => {
    expect(isSoftware("ซื้อลิขสิทธิ์โปรแกรม Microsoft Office")).toBe(true);
    expect(isSoftware("ซื้อ License Antivirus")).toBe(true);
    expect(isSoftware("ซื้อเครื่องคอมพิวเตอร์")).toBe(false);
  });

  it("strips the method from the title, as BMA titles read, with Arabic digits", () => {
    expect(cleanTitle("ประกวดราคาซื้อเครื่องคอมพิวเตอร์ ๒ เครื่อง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)")).toBe(
      "ซื้อเครื่องคอมพิวเตอร์ 2 เครื่อง",
    );
    expect(cleanTitle("จ้างพัฒนาระบบ โดยวิธีเฉพาะเจาะจง")).toBe("จ้างพัฒนาระบบ");
  });

  it.each([
    ["ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)", "e-bidding"],
    ["เฉพาะเจาะจง", "วิธีเฉพาะเจาะจง"],
    ["คัดเลือก", "วิธีคัดเลือก"],
    ["ตลาดอิเล็กทรอนิกส์ (e-market)", "วิธีประกาศเชิญชวนทั่วไป"],
    ["สอบราคา", "วิธีประกาศเชิญชวนทั่วไป"],
    [null, undefined],
  ])("maps the method %s to %s", (method, expected) => {
    expect(normalizeMethod(method)).toBe(expected);
  });

  it("reads the fiscal year from the project number's Buddhist year", () => {
    expect(fiscalYearFromNumber("69100012345")).toBe(2026);
    expect(fiscalYearFromNumber("67100012345")).toBe(2024);
    expect(budgetDescription(2026)).toBe("งบประมาณประจำปี 69");
    expect(budgetDescription(undefined)).toBeUndefined();
  });
});

describe("collecting invitations", () => {
  it("stores an open IT invitation as a published TOR", async () => {
    const project = addProject();

    const counts = await runEgpSync("full", "manual");

    expect(counts).toMatchObject({ inserted: 1, updated: 0, skipped: 0, read: 1 });
    const tor = await findTor(project.projectNumber);
    expect(tor).toMatchObject({
      sourceId: "egp",
      status: "published",
      biddingStage: "invited",
      title: "ซื้อเครื่องคอมพิวเตอร์ 2 เครื่อง",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      itCategory: "it_equipment",
      budgetAmount: 5_000_000,
      tenderAmount: 4_900_000,
      procurementMethod: "e-bidding",
      fiscalYear: 2026,
      description: "งบประมาณประจำปี 69",
      egpProjectId: project.projectId,
      contractStatus: "ระหว่างดำเนินการ",
      detailSummary: "สรุปจาก tor-1.pdf",
      sourceUrl: `${SITE}/project-detail/${project.projectId}`,
    });
    expect(tor?.submissionDeadline?.getTime()).toBe(DEADLINE.getTime());
    expect(tor?.tenderStartDate?.getTime()).toBe(new Date("2026-10-01T09:00:00").getTime());
    expect(tor?.invitationPdfUrl).toContain("invitation-1.pdf");
    expect(tor?.torPdfUrl).toContain("tor-1.pdf");
  });

  it("never stores staff names", async () => {
    const project = addProject();
    await runEgpSync("full", "manual");

    expect(JSON.stringify(await findTor(project.projectNumber))).not.toContain("นางสาวทดสอบ");
  });

  it("logs the run in SyncLog", async () => {
    addProject();
    await runEgpSync("full", "manual");

    const log = await SyncLog.findOne({ sourceId: "egp" }).lean();
    expect(log).toMatchObject({ status: "success", trigger: "manual", recordsRead: 1, recordsInserted: 1 });
  });

  it("also finds IT work filed outside the computer category, by its name", async () => {
    const cctv = addProject({ computerCategory: false, projectName: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)" });
    const scanner = addProject({ computerCategory: false, projectName: "ซื้อเครื่องเอกซเรย์คอมพิวเตอร์" });

    await runEgpSync("full", "manual");

    expect(await findTor(cctv.projectNumber)).not.toBeNull();
    expect(await findTor(scanner.projectNumber)).toBeNull();
  });

  it("reads every page of the listing", async () => {
    egp.pageSize = 1;
    addProject();
    addProject();
    addProject();

    const counts = await runEgpSync("full", "manual");

    expect(counts.inserted).toBe(3);
  });

  it("skips projects from before Buddhist year 2567", async () => {
    addProject({ projectNumber: "66100000001" });

    const counts = await runEgpSync("full", "manual");

    expect(counts.read).toBe(0);
    expect(await Tor.countDocuments()).toBe(0);
  });

  it("tags software by its name", async () => {
    const project = addProject({ projectName: "ซื้อลิขสิทธิ์โปรแกรมออกแบบกราฟิก" });
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.itCategory).toBe("software");
  });
});

describe("skipping", () => {
  it("skips a project already collected from BMA, without fetching it (FR-08)", async () => {
    const project = addProject();
    await Tor.create({
      ocid: "ocds-bma-1",
      sourceId: "bma",
      egpProjectNumber: project.projectNumber,
      title: "ซื้อคอมพิวเตอร์",
      agency: "สำนักการจราจรและขนส่ง",
    });

    const counts = await runEgpSync("full", "manual");

    expect(counts).toMatchObject({ inserted: 0, skipped: 1 });
    expect(await findTor(project.projectNumber)).toBeNull();
    expect(requestsTo(`projectId=${project.projectId}`)).toHaveLength(0);
  });

  it("skips a project whose invitation has no file", async () => {
    const project = addProject({ announcements: [announcement(INVITATION, "2026-10-01T09:00:00", null)] });

    const counts = await runEgpSync("full", "manual");

    expect(counts.skipped).toBe(1);
    expect(await findTor(project.projectNumber)).toBeNull();
    expect(mockReadDeadline).not.toHaveBeenCalled();
  });

  it("doesn't store a project whose deadline can't be read", async () => {
    mockReadDeadline.mockResolvedValue({ deadline: null, reason: "no deadline in PDF" });
    const project = addProject();

    const counts = await runEgpSync("full", "manual");

    expect(counts.skipped).toBe(1);
    expect(await findTor(project.projectNumber)).toBeNull();
  });

  it("keeps going when one project fails", async () => {
    const broken = addProject();
    const fine = addProject();
    egp.failing.set(`GetProjectDetail?projectId=${broken.projectId}`, 404);

    const counts = await runEgpSync("full", "manual");

    expect(counts).toMatchObject({ inserted: 1, skipped: 1 });
    expect(await findTor(fine.projectNumber)).not.toBeNull();
  });

  it("records a failed run when the listing can't be read", async () => {
    egp.failing.set("GetProjectFromFilter", 403);

    await expect(runEgpSync("full", "manual")).rejects.toThrow("HTTP 403");

    const log = await SyncLog.findOne({ sourceId: "egp" }).lean();
    expect(log?.status).toBe("failed");
    expect(log?.errorMessage).toContain("HTTP 403");
  });
});

describe("re-running", () => {
  it("doesn't read the PDFs again when nothing changed", async () => {
    addProject();
    await runEgpSync("full", "manual");
    jest.clearAllMocks();

    const counts = await runEgpSync("full", "manual");

    expect(counts).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });
    expect(mockReadDeadline).not.toHaveBeenCalled();
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it("re-reads the deadline when the invitation is amended", async () => {
    const project = addProject();
    await runEgpSync("full", "manual");

    const extended = new Date(DEADLINE.getTime() + 3 * DAY_MS);
    mockReadDeadline.mockResolvedValue({ deadline: extended, quote: "ขยายเวลา" });
    project.announcements.push(announcement("เปลี่ยนแปลงประกาศเชิญชวน", "2026-10-05T09:00:00", "amended.pdf"));

    const counts = await runEgpSync("full", "manual");

    expect(counts.updated).toBe(1);
    const tor = await findTor(project.projectNumber);
    expect(tor?.submissionDeadline?.getTime()).toBe(extended.getTime());
    expect(tor?.invitationPdfUrl).toContain("amended.pdf");
    expect(fileName(mockReadDeadline.mock.calls.at(-1)![0])).toBe("amended.pdf");
  });

  it("re-checks open records that dropped out of the recent listing", async () => {
    const project = addProject();
    await runEgpSync("full", "manual");

    project.listedAs = "none";
    project.announcements.push(announcement(WINNER, "2026-10-15T09:00:00", "winner.pdf"));
    await runEgpSync("recent", "manual");

    expect((await findTor(project.projectNumber))?.suppliers).toEqual(["บริษัท ชนะประมูล จำกัด"]);
  });

  it("never changes an archived record's status", async () => {
    const project = addProject();
    await runEgpSync("full", "manual");
    await Tor.updateOne({ ocid: `egp-${project.projectNumber}` }, { $set: { status: "archived" } });

    project.announcements.push(announcement("ยกเลิกประกาศเชิญชวน", "2026-10-03T09:00:00"));
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.status).toBe("archived");
  });
});

describe("project details", () => {
  it("summarises the draft bidding document when there's no TOR", async () => {
    const project = addProject({
      announcements: [
        announcement(DRAFT_BIDDING, "2026-09-25T09:00:00", "draft-bidding.pdf"),
        announcement(INVITATION, "2026-10-01T09:00:00", "invitation.pdf"),
      ],
    });
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.detailSummary).toBe("สรุปจาก draft-bidding.pdf");
  });

  it("summarises the invitation when there's no TOR or draft, downloading it once", async () => {
    const project = addProject({ announcements: [announcement(INVITATION, "2026-10-01T09:00:00", "invitation.pdf")] });
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.detailSummary).toBe("สรุปจาก invitation.pdf");
    expect(requestsTo("invitation.pdf")).toHaveLength(1);
  });
});

describe("winners and closing", () => {
  function withWinner() {
    return addProject({
      announcements: [
        announcement(TOR, "2026-09-20T09:00:00", "tor.pdf"),
        announcement(INVITATION, "2026-10-01T09:00:00", "invitation.pdf"),
        announcement(WINNER, "2026-10-15T09:00:00", "winner.pdf"),
      ],
    });
  }

  it("stores the winners, the winning price and when bidding closed", async () => {
    const project = withWinner();
    await runEgpSync("full", "manual");

    const tor = await findTor(project.projectNumber);
    expect(tor).toMatchObject({ status: "published", suppliers: ["บริษัท ชนะประมูล จำกัด"], awardAmount: 4_500_000 });
    expect(tor?.awardAnnouncedAt?.getTime()).toBe(new Date("2026-10-15T09:00:00").getTime());
    expect(tor?.awardPdfUrl).toContain("winner.pdf");
  });

  it.each([
    ["above the budget", 6_000_000],
    ["under 20% of the budget", 900_000],
  ])("drops a winning price %s as a misread", async (_case, amount) => {
    mockReadWinners.mockResolvedValue({ names: ["บริษัท ชนะประมูล จำกัด"], amount });
    const project = withWinner();
    await runEgpSync("full", "manual");

    const tor = await findTor(project.projectNumber);
    expect(tor?.awardAmount).toBeNull();
    expect(tor?.suppliers).toEqual(["บริษัท ชนะประมูล จำกัด"]);
  });

  it("doesn't keep a project whose winner name can't be read", async () => {
    const project = addProject();
    await runEgpSync("full", "manual");
    expect(await findTor(project.projectNumber)).not.toBeNull();

    mockReadWinners.mockResolvedValue({ names: [], amount: undefined });
    project.announcements.push(announcement(WINNER, "2026-10-15T09:00:00", "winner.pdf"));
    const counts = await runEgpSync("full", "manual");

    expect(counts.skipped).toBe(1);
    expect(await findTor(project.projectNumber)).toBeNull();
  });

  it("hides a cancelled invitation as a draft", async () => {
    const project = addProject();
    project.announcements.push(announcement("ยกเลิกประกาศเชิญชวน", "2026-10-03T09:00:00"));
    await runEgpSync("full", "manual");

    const tor = await findTor(project.projectNumber);
    expect(tor?.status).toBe("draft");
    expect(tor?.awardAnnouncedAt).toBeDefined();
  });

  it("hides a tender as a draft once its deadline passes without a winner", async () => {
    mockReadDeadline.mockResolvedValue({ deadline: new Date(Date.now() - DAY_MS), quote: "..." });
    const project = addProject();
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.status).toBe("draft");
  });
});

describe("upcoming tenders", () => {
  function upcoming(overrides: Partial<FakeProject> = {}) {
    return addProject({
      listedAs: "draft",
      announcements: [announcement(TOR, new Date(Date.now() - 5 * DAY_MS).toISOString(), "draft-tor.pdf")],
      ...overrides,
    });
  }

  it("collects an IT project with a draft TOR and no invitation yet", async () => {
    const project = upcoming();

    const counts = await runEgpSync("full", "manual");

    expect(counts.inserted).toBe(1);
    const tor = await findTor(project.projectNumber);
    expect(tor).toMatchObject({
      status: "published",
      biddingStage: "upcoming",
      detailSummary: "สรุปจาก draft-tor.pdf",
      category: "tender_invitation",
    });
    expect(tor?.submissionDeadline).toBeUndefined();
  });

  it("skips upcoming projects that aren't IT work", async () => {
    upcoming({ projectName: "ซื้อวัสดุสำนักงาน" });

    await runEgpSync("full", "manual");

    expect(await Tor.countDocuments()).toBe(0);
  });

  it("becomes an invited tender, on the same record, once the invitation is out", async () => {
    const project = upcoming();
    await runEgpSync("full", "manual");

    project.listedAs = "invitation";
    project.announcements.push(announcement(INVITATION, new Date().toISOString(), "invitation.pdf"));
    await runEgpSync("full", "manual");

    const tors = await Tor.find({ egpProjectNumber: project.projectNumber }).lean();
    expect(tors).toHaveLength(1);
    expect(tors[0]).toMatchObject({ biddingStage: "invited", status: "published" });
    expect(tors[0].submissionDeadline?.getTime()).toBe(DEADLINE.getTime());
  });

  it("hides an upcoming tender that was cancelled", async () => {
    const project = upcoming();
    await runEgpSync("full", "manual");

    project.announcements.push(announcement("ยกเลิกประกาศเชิญชวน", new Date().toISOString()));
    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.status).toBe("draft");
  });

  it("hides an upcoming tender with no invitation after 60 days", async () => {
    const project = upcoming();
    await runEgpSync("full", "manual");
    await Tor.updateOne(
      { ocid: `egp-${project.projectNumber}` },
      { $set: { publishedDate: new Date(Date.now() - 61 * DAY_MS) } },
    );

    await runEgpSync("full", "manual");

    expect((await findTor(project.projectNumber))?.status).toBe("draft");
  });
});
