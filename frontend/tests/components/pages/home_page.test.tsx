import { render, screen, waitFor, within } from "@testing-library/react";
import { HomePage } from "@/components/pages/home_page";
import SearchRoute from "@/app/search/page";

/**
 * The home page with the API mocked: latest TORs, category cards, platform
 * stats, and the keyword search that hands off to the search page.
 */

// The header needs the router, login state and notifications; none of it is under test here.
jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));

const LATEST_TORS = [
  {
    id: "tor-cctv",
    title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด",
    agency: "สำนักการจราจรและขนส่ง",
    category: "tender_invitation",
    budgetAmount: 3_000_000,
    publishedDate: "2026-10-10T00:00:00Z",
  },
  {
    id: "tor-computers",
    title: "ซื้อครุภัณฑ์คอมพิวเตอร์",
    agency: "สำนักการแพทย์",
    category: "equipment",
  },
];

const STATS = {
  torCount: 1234,
  totalBudget: 1_243_750_000,
  avgBudget: 1_007_901.3,
  agencyCount: 42,
  categories: [
    { category: "tender_invitation", count: 120, totalBudget: 0 },
    { category: "equipment", count: 80, totalBudget: 0 },
    { category: "services", count: 40, totalBudget: 0 },
    { category: "materials", count: 30, totalBudget: 0 },
    { category: "construction", count: 20, totalBudget: 0 },
    { category: "other_expenses", count: 10, totalBudget: 0 },
  ],
};

type Reply = { status: number; body?: unknown } | Error;

let torsReply: Reply;
let statsReply: Reply;
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
  torsReply = { status: 200, body: { results: LATEST_TORS } };
  statsReply = { status: 200, body: STATS };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    respond(url.includes("/api/tors/stats") ? statsReply : torsReply),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  // Failed requests are logged on purpose; keep the test output clean.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The stat card with this label. "หน่วยงาน" is also a table header, so match the card's <p> only. */
function statValue(label: string) {
  return screen.getByText(label, { selector: "p" }).parentElement as HTMLElement;
}

describe("Home page", () => {
  describe("latest TORs", () => {
    it("asks the API for the 4 newest TORs and the stats", async () => {
      render(<HomePage />);
      await screen.findByText(LATEST_TORS[0].title);

      const urls = fetchMock.mock.calls.map(([url]) => url as string);
      expect(urls.some((u) => u.endsWith("/api/tors?limit=4"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/api/tors/stats"))).toBe(true);
    });

    it("shows each TOR with its agency, budget and category, linked to its page", async () => {
      render(<HomePage />);
      const row = (await screen.findByText(LATEST_TORS[0].title)).closest("tr") as HTMLElement;

      expect(within(row).getByRole("link", { name: LATEST_TORS[0].title })).toHaveAttribute("href", "/tor/tor-cctv");
      expect(within(row).getByText("สำนักการจราจรและขนส่ง")).toBeInTheDocument();
      expect(within(row).getByText("3,000,000")).toBeInTheDocument();
      expect(within(row).getByText("ประกาศเชิญชวน")).toBeInTheDocument();
    });

    it("shows 0 budget and '-' for date when the TOR has neither", async () => {
      render(<HomePage />);
      const row = (await screen.findByText(LATEST_TORS[1].title)).closest("tr") as HTMLElement;

      expect(within(row).getByText("0")).toBeInTheDocument();
      expect(within(row).getByText("-")).toBeInTheDocument();
    });

    it("keeps the table empty instead of crashing when the API answers an error", async () => {
      torsReply = { status: 429, body: { message: "Too many requests" } };
      render(<HomePage />);

      await waitFor(() => expect(console.error).toHaveBeenCalled());
      expect(screen.getByText("TOR ล่าสุด")).toBeInTheDocument();
      expect(screen.queryAllByRole("row")).toHaveLength(1); // only the header row
    });
  });

  describe("categories and stats", () => {
    it("shows the 5 largest categories with their counts, linked to a filtered search", async () => {
      render(<HomePage />);
      const card = (await screen.findByText("120 รายการ")).closest("a") as HTMLElement;

      expect(card).toHaveAttribute("href", "/search?category=tender_invitation");
      expect(within(card).getByText("ประกาศเชิญชวน")).toBeInTheDocument();
      expect(screen.getByText("20 รายการ")).toBeInTheDocument();
      // The 6th category doesn't fit in the grid.
      expect(screen.queryByText("10 รายการ")).not.toBeInTheDocument();
    });

    it("shows the platform stats with thousand separators, rounded", async () => {
      render(<HomePage />);
      await screen.findByText("1,234");

      expect(statValue("จำนวน TOR ทั้งหมด")).toHaveTextContent("1,234");
      expect(statValue("งบประมาณรวม")).toHaveTextContent("1,243,750,000");
      expect(statValue("งบประมาณเฉลี่ย")).toHaveTextContent("1,007,901");
      expect(statValue("หน่วยงาน")).toHaveTextContent("42");
    });

    it("shows '–' on every stat card when the stats can't be loaded", async () => {
      statsReply = new Error("Network down");
      render(<HomePage />);
      await screen.findByText(LATEST_TORS[0].title);

      expect(screen.getAllByText("–")).toHaveLength(4);
    });
  });

  describe("keyword search", () => {
    it("sends the keyword to /search as ?q=", () => {
      render(<HomePage />);
      const input = screen.getByPlaceholderText("ค้นหาด้วยคำสำคัญ ชื่อโครงการ หรือหน่วยงาน...");
      const form = input.closest("form") as HTMLFormElement;

      expect(form).toHaveAttribute("action", "/search");
      expect(input).toHaveAttribute("name", "q");
      expect(within(form).getByRole("button", { name: "ค้นหา" })).toHaveAttribute("type", "submit");
    });

    it("hands ?q= and ?category= to the search page as its starting filters", async () => {
      const page = await SearchRoute({
        searchParams: Promise.resolve({ q: "กล้องวงจรปิด", category: "equipment" }),
      });

      expect(page.props).toEqual({ initialKeyword: "กล้องวงจรปิด", initialCategory: "equipment" });
    });

    it("starts the search page empty without ?q=", async () => {
      const page = await SearchRoute({ searchParams: Promise.resolve({}) });

      expect(page.props).toEqual({ initialKeyword: "", initialCategory: "" });
    });
  });
});