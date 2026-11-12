import { fireEvent, render, screen, within } from "@testing-library/react";
import { TorPage } from "@/components/pages/tor_detail_page";

/**
 * The TOR detail page with the API mocked: the details, documents, source
 * link and AI summary it shows, and what it does for missing or failed loads.
 */

// The header needs login state and notifications; none of it is under test here.
jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// 10:00 on 14 Oct 2026, Bangkok time, so the time left to bid is fixed.
const NOW = new Date("2026-10-14T03:00:00Z");

const TOR = {
  id: "tor-1",
  ocid: "egp-69109038918",
  title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด",
  description: "ระบบกล้อง CCTV ทั่วกรุงเทพฯ",
  agency: "สำนักการจราจรและขนส่ง",
  category: "tender_invitation",
  fiscalYear: 2026,
  budgetAmount: 3_000_000,
  tenderAmount: 2_900_000,
  procurementMethod: "e-bidding",
  publishedDate: "2026-10-05T00:00:00Z",
  tenderStartDate: "2026-10-09T00:00:00Z",
  submissionDeadline: "2026-10-29T05:00:00Z",
  sourceUrl: "https://egp2.bangkok.go.th/project-detail/abc",
  items: [],
  suppliers: [],
  contracts: [],
  documents: [
    { type: "tor", url: "https://egp2.bangkok.go.th/api/file/2/tor.pdf", format: "pdf" },
    { type: "invitation", url: "https://egp2.bangkok.go.th/api/file/1/invite.pdf", format: "pdf" },
    { type: "attachment", title: "แบบรูปรายการ", url: "https://egp2.bangkok.go.th/api/file/9/plan.zip", format: "zip" },
  ],
  lastUpdated: "2026-10-09T00:00:00Z",
};

type Reply = { status: number; body?: unknown } | Error;

let torReply: Reply;
let summaryReply: Reply;
const fetchMock = jest.fn();

function respond(reply: Reply) {
  if (reply instanceof Error) return Promise.reject(reply);
  return Promise.resolve({
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  torReply = { status: 200, body: TOR };
  summaryReply = { status: 200, body: { text: "สรุปโครงการ\n- ข้อแรก\n- ข้อสอง" } };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    respond(url.endsWith("/summary") ? summaryReply : torReply),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  mockPush.mockReset();
  mockBack.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderPage(tor: Record<string, unknown> = TOR) {
  torReply = { status: 200, body: tor };
  render(<TorPage id="tor-1" />);
  await screen.findByRole("heading", { level: 1 });
}

/** The card (section) whose heading is this text. */
function section(heading: string) {
  return screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement;
}

describe("TOR detail page", () => {
  describe("loading", () => {
    it("shows a loading message, then the TOR", async () => {
      render(<TorPage id="tor-1" />);
      expect(screen.getByText("กำลังโหลดข้อมูล...")).toBeInTheDocument();

      expect(await screen.findByRole("heading", { level: 1, name: TOR.title })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/tors\/tor-1$/));
    });

    it.each([404, 400])("says the TOR wasn't found on %i", async (status) => {
      torReply = { status, body: { message: "TOR not found" } };
      render(<TorPage id="tor-1" />);

      expect(await screen.findByText("ไม่พบ TOR นี้ หรือยังไม่ได้เผยแพร่")).toBeInTheDocument();
    });

    it.each([
      ["a server error", { status: 500, body: {} }],
      ["no connection", new Error("Network down")],
    ])("shows a retry message on %s", async (_case, reply) => {
      torReply = reply as Reply;
      render(<TorPage id="tor-1" />);

      expect(await screen.findByText("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument();
    });
  });

  describe("details", () => {
    it("shows the agency, category and fiscal year in Buddhist Era", async () => {
      await renderPage();

      expect(screen.getByText("สำนักการจราจรและขนส่ง")).toBeInTheDocument();
      expect(screen.getAllByText("ประกาศเชิญชวน").length).toBeGreaterThan(0);
      expect(screen.getByText("ปีงบประมาณ 2569")).toBeInTheDocument();
    });

    it("shows budget, reference price, method and reference number without the source prefix", async () => {
      await renderPage();
      const info = within(section("ข้อมูลทั่วไป"));

      expect(info.getByText("3,000,000")).toBeInTheDocument();
      expect(info.getByText("2,900,000")).toBeInTheDocument();
      expect(info.getByText("e-bidding")).toBeInTheDocument();
      expect(info.getByText("69109038918")).toBeInTheDocument();
    });

    it("shows 'ไม่มีข้อมูล' for missing details", async () => {
      await renderPage({ ...TOR, procurementMethod: undefined, tenderAmount: undefined });
      const info = within(section("ข้อมูลทั่วไป"));

      expect(info.getAllByText("ไม่มีข้อมูล")).toHaveLength(2);
    });

    it("shows the bidding window only when the source has one", async () => {
      await renderPage({ ...TOR, tenderStartDate: undefined, submissionDeadline: undefined });
      const dates = within(section("กำหนดการ"));

      expect(dates.queryByText("วันเปิดรับข้อเสนอ")).not.toBeInTheDocument();
      expect(dates.queryByText("วันปิดรับข้อเสนอ")).not.toBeInTheDocument();
      expect(dates.getByText("เก็บข้อมูลครั้งแรก")).toBeInTheDocument();
    });

    it("shows the time left to bid on an open TOR", async () => {
      await renderPage();

      expect(screen.getByText("เวลาที่เหลือในการยื่นข้อเสนอ")).toBeInTheDocument();
      expect(screen.getByText("เหลืออีก 15 วัน")).toBeInTheDocument();
    });

    it("shows the winner and winning price of an awarded e-GP TOR", async () => {
      await renderPage({
        ...TOR,
        submissionDeadline: "2026-10-01T05:00:00Z",
        awardAnnouncedAt: "2026-10-10T00:00:00Z",
        suppliers: ["บริษัท ทดสอบ จำกัด"],
        awardAmount: 2_750_000,
        contractStatus: "ลงนามแล้ว",
      });
      const project = within(section("รายละเอียดโครงการ"));

      expect(project.getByText("บริษัท ทดสอบ จำกัด")).toBeInTheDocument();
      expect(project.getByText("2,750,000")).toBeInTheDocument();
      expect(project.getByText("ลงนามแล้ว")).toBeInTheDocument();
      expect(screen.queryByText("เวลาที่เหลือในการยื่นข้อเสนอ")).not.toBeInTheDocument();
    });
  });

  describe("documents", () => {
    it("lists documents and asks for confirmation before opening an agency file", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      await renderPage();
      const docs = within(section("เอกสารประกอบ"));
      const links = docs.getAllByRole("button");

      expect(links).toHaveLength(3);
      expect(links[0]).toHaveTextContent("เอกสาร TOR");
      expect(links[0]).toHaveTextContent("pdf");
      expect(links[1]).toHaveTextContent("ประกาศเชิญชวน");

      fireEvent.click(links[0]);
      expect(screen.getByRole("alertdialog")).toHaveTextContent("egp2.bangkok.go.th");
      expect(open).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

      fireEvent.click(links[0]);
      fireEvent.click(screen.getByRole("button", { name: "ไปยังเว็บไซต์ภายนอก" }));
      expect(open).toHaveBeenCalledWith(
        "https://egp2.bangkok.go.th/api/file/2/tor.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("names an attachment by its own title", async () => {
      await renderPage();
      const docs = within(section("เอกสารประกอบ"));

      expect(docs.getByRole("button", { name: /แบบรูปรายการ/ })).toHaveTextContent("zip");
    });

    it.each([
      ["an empty list", []],
      ["no documents field", undefined],
    ])("says there are no documents for %s", async (_case, documents) => {
      await renderPage({ ...TOR, documents });
      const docs = within(section("เอกสารประกอบ"));

      expect(docs.getByText("ไม่มีเอกสารแนบจากหน่วยงาน")).toBeInTheDocument();
      expect(docs.queryAllByRole("link")).toHaveLength(0);
    });
  });

  describe("source and actions", () => {
    it("shows the source URL and requires confirmation before opening it", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      await renderPage();
      const source = within(section("ข้อมูลแหล่งที่มา"));

      expect(source.getByText(TOR.sourceUrl)).toBeInTheDocument();
      fireEvent.click(source.getByRole("button", { name: /เปิดแหล่งที่มาต้นฉบับ/ }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent("egp2.bangkok.go.th");
      expect(open).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "ไปยังเว็บไซต์ภายนอก" }));
      expect(open).toHaveBeenCalledWith(TOR.sourceUrl, "_blank", "noopener,noreferrer");
    });

    it("does not offer unsafe external protocols", async () => {
      await renderPage({ ...TOR, sourceUrl: "javascript:alert(1)" });
      const source = within(section("ข้อมูลแหล่งที่มา"));

      fireEvent.click(source.getByRole("button", { name: /เปิดแหล่งที่มาต้นฉบับ/ }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("hides the open button when there is no source URL", async () => {
      await renderPage({ ...TOR, sourceUrl: undefined });
      const source = within(section("ข้อมูลแหล่งที่มา"));

      expect(source.getByText("ไม่มีข้อมูล")).toBeInTheDocument();
      expect(source.queryByRole("button")).not.toBeInTheDocument();
    });

    it("sends the report button to the feedback page for this TOR", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: "แจ้งปัญหา" }));

      expect(mockPush).toHaveBeenCalledWith("/my-feedback?torId=tor-1");
    });

    it("goes back with the back button, or to search when opened in a new tab", async () => {
      const length = jest.spyOn(window.history, "length", "get");
      await renderPage();
      const back = screen.getByRole("button", { name: /กลับไปหน้าก่อนหน้า/ });

      length.mockReturnValue(3);
      fireEvent.click(back);
      expect(mockBack).toHaveBeenCalled();

      length.mockReturnValue(1);
      fireEvent.click(back);
      expect(mockPush).toHaveBeenCalledWith("/search");
    });
  });

  describe("AI summary", () => {
    it("shows the summary as a paragraph and bullet points", async () => {
      await renderPage();
      const summary = within(section("สรุป TOR"));

      expect(await summary.findByText("สรุปโครงการ")).toBeInTheDocument();
      expect(summary.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["ข้อแรก", "ข้อสอง"]);
    });

    it("says the summary is turned off on 503", async () => {
      summaryReply = { status: 503, body: {} };
      await renderPage();

      expect(await screen.findByText("ยังไม่เปิดใช้งานการสรุป TOR")).toBeInTheDocument();
    });

    it("shows an error when the summary fails, without hiding the TOR", async () => {
      summaryReply = new Error("Network down");
      await renderPage();

      expect(await screen.findByText("สรุปข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: TOR.title })).toBeInTheDocument();
    });
  });
});