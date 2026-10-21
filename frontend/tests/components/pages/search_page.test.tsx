import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SearchPage from "@/components/pages/search_page";

/**
 * The search page with the API mocked: what it shows for each response, and
 * which GET /api/tors request each filter, sort and page change sends.
 */

// The header needs the router, login state and notifications; none of it is under test here.
jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));

// 10:00 on 14 Oct 2026, Bangkok time, so bidding badges and time left are fixed.
const NOW = new Date("2026-10-14T03:00:00Z");

type Tor = Record<string, unknown>;

const OPEN_TOR: Tor = {
  id: "tor-open",
  title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
  agency: "สำนักการจราจรและขนส่ง",
  category: "tender_invitation",
  budgetAmount: 5_000_000,
  fiscalYear: 2026,
  publishedDate: "2026-10-10T00:00:00Z",
  submissionDeadline: "2026-10-20T05:00:00Z",
  hasWinner: false,
};

const CLOSED_TOR: Tor = {
  id: "tor-closed",
  title: "ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ",
  agency: "สำนักการแพทย์",
  category: "equipment",
  fiscalYear: 2025,
  publishedDate: "2025-05-01T00:00:00Z",
  submissionDeadline: "2025-05-20T05:00:00Z",
  hasWinner: true,
};

const UPCOMING_TOR: Tor = {
  id: "tor-upcoming",
  title: "จ้างบำรุงรักษาระบบเครือข่ายสื่อสาร",
  agency: "สำนักการจราจรและขนส่ง",
  category: "services",
  budgetAmount: 9_000_000,
  fiscalYear: 2026,
  publishedDate: "2026-10-12T00:00:00Z",
  biddingStage: "upcoming",
  hasWinner: false,
};

const FILTER_OPTIONS = {
  agencies: ["สำนักการจราจรและขนส่ง", "สำนักการแพทย์"],
  categories: ["equipment", "tender_invitation"],
  fiscalYears: [2026, 2025],
};

type SearchReply = { status?: number; body: unknown } | Error;

let searchReply: SearchReply;
const fetchMock = jest.fn();

function page(results: Tor[], { page = 1, totalPages = 1, total = results.length } = {}) {
  return { body: { results, pagination: { page, limit: 20, total, totalPages } } };
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  searchReply = page([OPEN_TOR, CLOSED_TOR, UPCOMING_TOR]);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/tors/filters")) return jsonResponse(200, FILTER_OPTIONS);
    if (searchReply instanceof Error) return Promise.reject(searchReply);
    return jsonResponse(searchReply.status ?? 200, searchReply.body);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Query params of every search request sent so far. */
function searchRequests() {
  return fetchMock.mock.calls
    .map(([url]) => url as string)
    .filter((url) => !url.includes("/api/tors/filters"))
    .map((url) => Object.fromEntries(new URL(url).searchParams));
}

function lastSearch() {
  return searchRequests().at(-1);
}

/** The <select> that has an option with this text (the filter labels aren't linked to their selects). */
function selectWithOption(optionText: string) {
  return screen.getByRole("option", { name: optionText }).closest("select") as HTMLSelectElement;
}

async function renderPage(props: { initialKeyword?: string; initialCategory?: string } = {}) {
  render(<SearchPage {...props} />);
  await waitFor(() => expect(screen.queryByText("กำลังโหลด...")).not.toBeInTheDocument());
}

function card(title: string) {
  return screen.getByText(title).closest("article") as HTMLElement;
}

describe("Search page", () => {
  describe("showing results", () => {
    it("shows a loading message, then the results and their count", async () => {
      render(<SearchPage />);
      expect(screen.getByText("กำลังโหลด...")).toBeInTheDocument();

      expect(await screen.findByText("พบ 3 รายการ")).toBeInTheDocument();
      expect(screen.queryByText("กำลังโหลด...")).not.toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(3);
    });

    it("shows each TOR's details on its card", async () => {
      await renderPage();
      const open = within(card(OPEN_TOR.title as string));

      expect(open.getByText("สำนักการจราจรและขนส่ง")).toBeInTheDocument();
      expect(open.getByText("5,000,000 บาท")).toBeInTheDocument();
      expect(open.getByText("ประกาศเชิญชวน")).toBeInTheDocument();
      expect(open.getByText(/ปีงบประมาณ: 2569/)).toBeInTheDocument();
      expect(open.getByText(/ประกาศ: 10 ต\.ค\. 2569/)).toBeInTheDocument();
    });

    it("shows '-' when a TOR has no budget", async () => {
      await renderPage();
      expect(within(card(CLOSED_TOR.title as string)).getByText("- บาท")).toBeInTheDocument();
    });

    it("links the title and the details button to the TOR page", async () => {
      await renderPage();
      const open = within(card(OPEN_TOR.title as string));

      expect(open.getByRole("link", { name: OPEN_TOR.title as string })).toHaveAttribute("href", "/tor/tor-open");
      expect(open.getByRole("link", { name: "ดูรายละเอียด" })).toHaveAttribute("href", "/tor/tor-open");
    });

    it("shows the bidding status of each TOR", async () => {
      await renderPage();

      expect(within(card(OPEN_TOR.title as string)).getByText("เปิดรับสมัคร")).toBeInTheDocument();
      expect(within(card(CLOSED_TOR.title as string)).getByText("ปิดรับสมัคร")).toBeInTheDocument();
      expect(within(card(UPCOMING_TOR.title as string)).getByText("ยังไม่เปิดรับสมัคร")).toBeInTheDocument();
    });

    it("shows the time left to bid only on open TORs", async () => {
      await renderPage();

      expect(within(card(OPEN_TOR.title as string)).getByText("เหลืออีก 6 วัน")).toBeInTheDocument();
      expect(within(card(CLOSED_TOR.title as string)).queryByText(/เหลืออีก|ปิดวันนี้|ปิดพรุ่งนี้/)).not.toBeInTheDocument();
    });

    it("shows a message when nothing matches", async () => {
      searchReply = page([]);
      await renderPage();

      expect(screen.getByText("ไม่พบ TOR ที่ตรงกับเงื่อนไขการค้นหา")).toBeInTheDocument();
      expect(screen.getByText("พบ 0 รายการ")).toBeInTheDocument();
    });
  });

  describe("errors", () => {
    it("shows the API's message when the request is rejected", async () => {
      searchReply = { status: 400, body: { message: "budgetMin must not exceed budgetMax" } };
      await renderPage();

      expect(screen.getByText("budgetMin must not exceed budgetMax")).toBeInTheDocument();
      expect(screen.queryAllByRole("article")).toHaveLength(0);
    });

    it("shows a general message when the API can't be reached", async () => {
      searchReply = new Error("network down");
      await renderPage();

      expect(screen.getByText("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument();
    });
  });

  describe("search requests", () => {
    it("first searches everything, newest first", async () => {
      await renderPage();
      expect(searchRequests()).toEqual([{ sort: "date", page: "1" }]);
    });

    it("starts from the keyword and category in the URL", async () => {
      await renderPage({ initialKeyword: "CCTV", initialCategory: "equipment" });

      expect(lastSearch()).toEqual({ keyword: "CCTV", category: "equipment", sort: "date", page: "1" });
      expect(screen.getByPlaceholderText("พิมพ์คำค้นหา...")).toHaveValue("CCTV");
    });

    it("fills the filter options from the API, showing fiscal years in Buddhist Era", async () => {
      await renderPage();

      expect(selectWithOption("ทุกหน่วยงาน")).toHaveTextContent("สำนักการแพทย์");
      expect(screen.getByRole("option", { name: "ค่าครุภัณฑ์" })).toHaveValue("equipment");
      expect(screen.getByRole("option", { name: "2569" })).toHaveValue("2026");
    });

    it("waits for 'ใช้ตัวกรอง' before searching, then sends every filter", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("พิมพ์คำค้นหา..."), { target: { value: "  กล้อง  " } });
      fireEvent.change(selectWithOption("ทุกสถานะ"), { target: { value: "open" } });
      fireEvent.change(selectWithOption("ทุกหน่วยงาน"), { target: { value: "สำนักการจราจรและขนส่ง" } });
      fireEvent.change(selectWithOption("ทุกหมวดหมู่"), { target: { value: "tender_invitation" } });
      fireEvent.change(selectWithOption("ทุกปี"), { target: { value: "2026" } });
      fireEvent.change(screen.getByPlaceholderText("ต่ำสุด"), { target: { value: "1000000" } });
      fireEvent.change(screen.getByPlaceholderText("สูงสุด"), { target: { value: "6000000" } });
      expect(searchRequests()).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));

      await waitFor(() => expect(searchRequests()).toHaveLength(2));
      expect(lastSearch()).toEqual({
        keyword: "กล้อง",
        bidding: "open",
        agency: "สำนักการจราจรและขนส่ง",
        category: "tender_invitation",
        fiscalYear: "2026",
        budgetMin: "1000000",
        budgetMax: "6000000",
        sort: "date",
        page: "1",
      });
    });

    it("searches again when the sort order changes", async () => {
      await renderPage();

      fireEvent.change(selectWithOption("งบประมาณสูงสุด"), { target: { value: "budget" } });

      await waitFor(() => expect(lastSearch()).toEqual({ sort: "budget", page: "1" }));
    });

    it("clears every filter and the sort order with 'ล้างทั้งหมด'", async () => {
      await renderPage({ initialKeyword: "CCTV" });
      fireEvent.change(selectWithOption("งบประมาณสูงสุด"), { target: { value: "budget" } });
      await waitFor(() => expect(lastSearch()?.sort).toBe("budget"));

      fireEvent.click(screen.getByRole("button", { name: "ล้างทั้งหมด" }));

      await waitFor(() => expect(lastSearch()).toEqual({ sort: "date", page: "1" }));
      expect(screen.getByPlaceholderText("พิมพ์คำค้นหา...")).toHaveValue("");
    });
  });

  describe("pagination", () => {
    it("hides the page controls when everything fits on one page", async () => {
      await renderPage();
      expect(screen.queryByRole("button", { name: /ถัดไป/ })).not.toBeInTheDocument();
    });

    it("moves between pages", async () => {
      searchReply = page([OPEN_TOR], { page: 1, totalPages: 3, total: 50 });
      await renderPage();

      expect(screen.getByText("หน้า 1 จาก 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ก่อนหน้า/ })).toBeDisabled();

      searchReply = page([CLOSED_TOR], { page: 2, totalPages: 3, total: 50 });
      fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));

      await screen.findByText("หน้า 2 จาก 3");
      expect(lastSearch()?.page).toBe("2");
      expect(screen.getByText(CLOSED_TOR.title as string)).toBeInTheDocument();
    });

    it("disables 'ถัดไป' on the last page", async () => {
      searchReply = page([OPEN_TOR], { page: 3, totalPages: 3, total: 50 });
      await renderPage();

      expect(screen.getByRole("button", { name: /ถัดไป/ })).toBeDisabled();
    });

    it("goes back to page 1 when filters are applied", async () => {
      searchReply = page([OPEN_TOR], { page: 1, totalPages: 3, total: 50 });
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
      await waitFor(() => expect(lastSearch()?.page).toBe("2"));

      fireEvent.change(screen.getByPlaceholderText("พิมพ์คำค้นหา..."), { target: { value: "CCTV" } });
      fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));

      await waitFor(() => expect(lastSearch()).toEqual({ keyword: "CCTV", sort: "date", page: "1" }));
    });
  });
});
