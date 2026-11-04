import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DashboardPage from "@/components/pages/dashboard_page";

/**
 * The budget dashboard with the API mocked: what it shows for each response,
 * and which requests each filter change and retry sends.
 */

// The header needs the router, login state and notifications; none of it is under test here.
jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));

// Charts have no size in jsdom and draw nothing, so the bars are listed as text instead.
// The donuts' legends are real HTML on the page.
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Bar: () => null,
  BarChart: ({ data }: { data: { year: string; total: number }[] }) => (
    <ul aria-label="bars">
      {data.map((d) => (
        <li key={d.year}>{`${d.year}: ${d.total}`}</li>
      ))}
    </ul>
  ),
}));

const LOADING = "กำลังโหลด…";
const EMPTY = "ไม่มี TOR ตามตัวกรองนี้";
const FAILED = "โหลดข้อมูลไม่สำเร็จ";
const NO_MATCH = /ไม่พบ TOR ที่ตรงกับตัวกรองนี้/;
const STATS_FAILED = "โหลดข้อมูลแดชบอร์ดไม่สำเร็จ";

const AGENCY_CHART = "งบประมาณตามหน่วยงาน (5 อันดับแรก)";
const CATEGORY_CHART = "งบประมาณตามหมวดหมู่";
const YEAR_CHART = "งบประมาณตามปีงบประมาณ";
const TOP_LIST = "5 โครงการงบประมาณสูงสุด";

const TRAFFIC = "สำนักการจราจรและขนส่ง";
const MEDICAL = "สำนักการแพทย์";

const FILTER_OPTIONS = { agencies: [TRAFFIC, MEDICAL], fiscalYears: [2026, 2025] };

const SUMMARY = { torCount: 12, totalBudget: 34_500_000.4, averageBudget: 2_875_000.6, agencyCount: 3 };

const BREAKDOWN = {
  byAgency: [
    { agency: TRAFFIC, totalBudget: 25_000_000, share: 72.46 },
    { agency: MEDICAL, totalBudget: 9_500_000, share: 27.54 },
  ],
  byCategory: [
    { category: "tender_invitation", totalBudget: 30_000_000, share: 86.96 },
    { category: "uncategorized", totalBudget: 4_500_000, share: 13.04 },
  ],
  byFiscalYear: [
    { fiscalYear: 2025, totalBudget: 4_560_000, share: 13.22, torCount: 2 },
    { fiscalYear: 2026, totalBudget: 29_940_000, share: 86.78, torCount: 10 },
  ],
};

const TOP_TORS = [
  { id: "tor-1", title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)", agency: TRAFFIC, budgetAmount: 20_000_000.5 },
  { id: "tor-2", title: "ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ", agency: MEDICAL, budgetAmount: 1_438_000 },
];

type Reply = () => Promise<unknown>;

const ok =
  (body: unknown): Reply =>
  () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const httpError =
  (status: number): Reply =>
  () =>
    Promise.resolve({ ok: false, status, json: () => Promise.resolve({ message: "error" }) });
const rejected =
  (error: Error): Reply =>
  () =>
    Promise.reject(error);
const pending: Reply = () => new Promise(() => {});

const PATHS = {
  filters: "/api/tors/filters",
  summary: "/api/stats/summary",
  breakdown: "/api/stats/breakdown",
  tors: "/api/tors",
};

let replies: Record<keyof typeof PATHS, Reply>;
const fetchMock = jest.fn();

beforeEach(() => {
  replies = {
    filters: ok(FILTER_OPTIONS),
    summary: ok(SUMMARY),
    breakdown: ok(BREAKDOWN),
    tors: ok({ results: TOP_TORS }),
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    const { pathname } = new URL(url);
    const key = (Object.keys(PATHS) as (keyof typeof PATHS)[]).find((k) => PATHS[k] === pathname);
    return key ? replies[key]() : Promise.reject(new Error(`unexpected request: ${url}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

/** Query params of every request sent to one endpoint so far. */
function requests(key: keyof typeof PATHS) {
  return fetchMock.mock.calls
    .map(([url]) => new URL(url as string))
    .filter((url) => url.pathname === PATHS[key])
    .map((url) => Object.fromEntries(url.searchParams));
}

/** Renders the page and waits for every card, chart and list to finish loading. */
async function renderPage() {
  render(<DashboardPage />);
  await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
}

/** The card a chart or list heading belongs to. */
function panel(heading: string) {
  return within(screen.getByRole("heading", { name: heading }).parentElement as HTMLElement);
}

function legend(heading: string) {
  return panel(heading)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

function statCard(label: string) {
  return screen.getByText(label).parentElement as HTMLElement;
}

function selectAgency(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "หน่วยงาน" }), { target: { value } });
}

function selectYear(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "ปีงบประมาณ" }), { target: { value } });
}

/** Waits until the agency dropdown has been filled from the API. */
async function renderPageWithOptions() {
  await renderPage();
  await screen.findByRole("option", { name: TRAFFIC });
}

describe("Dashboard page", () => {
  describe("stat cards", () => {
    it("shows a placeholder in every card, chart and list while loading", async () => {
      replies = { filters: pending, summary: pending, breakdown: pending, tors: pending };
      render(<DashboardPage />);

      expect(screen.getAllByText(LOADING)).toHaveLength(8);
      expect(screen.queryByText(STATS_FAILED)).not.toBeInTheDocument();
      expect(screen.queryByText(NO_MATCH)).not.toBeInTheDocument();
    });

    it("shows the totals as whole numbers", async () => {
      await renderPage();

      expect(statCard("งบประมาณรวม")).toHaveTextContent("34,500,000บาท");
      expect(statCard("งบประมาณเฉลี่ย")).toHaveTextContent("2,875,001บาท");
      expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("12");
      expect(statCard("หน่วยงาน")).toHaveTextContent("3");
    });
  });

  describe("donut charts", () => {
    it("shows each agency's share of the budget, to one decimal", async () => {
      await renderPage();

      expect(legend(AGENCY_CHART)).toEqual([`${TRAFFIC}72.5%`, `${MEDICAL}27.5%`]);
    });

    it("keeps the top 5 and combines the rest", async () => {
      replies.breakdown = ok({
        ...BREAKDOWN,
        byAgency: [40, 20, 15, 10, 5, 6.04, 3.96].map((share, i) => ({
          agency: `หน่วยงาน ${i + 1}`,
          totalBudget: share * 1000,
          share,
        })),
      });
      await renderPage();

      expect(legend(AGENCY_CHART)).toEqual([
        "หน่วยงาน 140%",
        "หน่วยงาน 220%",
        "หน่วยงาน 315%",
        "หน่วยงาน 410%",
        "หน่วยงาน 55%",
        "หน่วยงานอื่น ๆ10%",
      ]);
    });

    it("doesn't add an 'others' slice for exactly 5 rows", async () => {
      replies.breakdown = ok({
        ...BREAKDOWN,
        byCategory: ["materials", "equipment", "services", "construction", "utilities"].map((category) => ({
          category,
          totalBudget: 1000,
          share: 20,
        })),
      });
      await renderPage();

      expect(legend(CATEGORY_CHART)).toHaveLength(5);
      expect(panel(CATEGORY_CHART).queryByText("หมวดอื่น ๆ")).not.toBeInTheDocument();
    });

    it("shows category names instead of their codes", async () => {
      await renderPage();

      expect(legend(CATEGORY_CHART)).toEqual(["ประกาศเชิญชวน87%", "ไม่ระบุหมวดหมู่13%"]);
    });

    it("shows an empty note when there are no rows", async () => {
      replies.breakdown = ok({ ...BREAKDOWN, byAgency: [] });
      await renderPage();

      expect(panel(AGENCY_CHART).getByText(EMPTY)).toBeInTheDocument();
    });

    it("shows an empty note when every share is zero, since the donut would be invisible", async () => {
      replies.breakdown = ok({
        ...BREAKDOWN,
        byAgency: [{ agency: TRAFFIC, totalBudget: 0, share: 0 }],
      });
      await renderPage();

      expect(panel(AGENCY_CHART).getByText(EMPTY)).toBeInTheDocument();
      expect(panel(AGENCY_CHART).queryByText(TRAFFIC)).not.toBeInTheDocument();
    });
  });

  describe("fiscal year bars", () => {
    it("shows Buddhist Era years and millions of baht, to one decimal", async () => {
      await renderPage();

      expect(legend(YEAR_CHART)).toEqual(["2568: 4.6", "2569: 29.9"]);
    });

    it("shows an empty note when there are no years", async () => {
      replies.breakdown = ok({ ...BREAKDOWN, byFiscalYear: [] });
      await renderPage();

      expect(panel(YEAR_CHART).getByText(EMPTY)).toBeInTheDocument();
    });
  });

  describe("highest budgets", () => {
    it("asks the search API for the 5 largest budgets", async () => {
      await renderPage();

      expect(requests("tors")).toEqual([{ sort: "budget", limit: "5" }]);
    });

    it("lists the projects in order with their agency and budget", async () => {
      await renderPage();

      expect(legend(TOP_LIST)).toEqual([
        `1. ${TOP_TORS[0].title}${TRAFFIC}20,000,001 บาท`,
        `2. ${TOP_TORS[1].title}${MEDICAL}1,438,000 บาท`,
      ]);
    });

    it("links each project to its TOR page", async () => {
      await renderPage();

      const link = panel(TOP_LIST).getByRole("link", { name: new RegExp("ซื้อครุภัณฑ์คอมพิวเตอร์") });
      expect(link).toHaveAttribute("href", "/tor/tor-2");
    });

    it("shows an empty note when there are no projects", async () => {
      replies.tors = ok({ results: [] });
      await renderPage();

      expect(panel(TOP_LIST).getByText(EMPTY)).toBeInTheDocument();
    });
  });

  describe("filters", () => {
    it("fills the dropdowns from the API, showing fiscal years in Buddhist Era", async () => {
      await renderPageWithOptions();

      expect(screen.getByRole("option", { name: MEDICAL })).toHaveValue(MEDICAL);
      expect(screen.getByRole("option", { name: "2569" })).toHaveValue("2026");
      expect(screen.getByRole("option", { name: "2568" })).toHaveValue("2025");
    });

    it.each<[string, Reply]>([
      ["fails", httpError(500)],
      ["can't be reached", rejected(new Error("network down"))],
    ])("still shows the dashboard when the dropdown request %s", async (_name, reply) => {
      replies.filters = reply;
      await renderPage();

      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ทุกหน่วยงาน", "ทุกปีงบประมาณ"]);
      expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("12");
    });

    it("first loads everything, with no filters", async () => {
      await renderPage();

      expect(requests("summary")).toEqual([{}]);
      expect(requests("breakdown")).toEqual([{}]);
      expect(screen.queryByRole("button", { name: "ล้างตัวกรอง" })).not.toBeInTheDocument();
    });

    it("sends the agency to the cards, charts and list", async () => {
      await renderPageWithOptions();

      selectAgency(TRAFFIC);

      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      expect(requests("summary").at(-1)).toEqual({ agency: TRAFFIC });
      expect(requests("breakdown").at(-1)).toEqual({ agency: TRAFFIC });
      expect(requests("tors").at(-1)).toEqual({ agency: TRAFFIC, sort: "budget", limit: "5" });
    });

    it("sends the fiscal year as a Gregorian year", async () => {
      await renderPageWithOptions();

      selectYear("2026");

      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      expect(requests("summary").at(-1)).toEqual({ fiscalYear: "2026" });
      expect(requests("tors").at(-1)).toEqual({ fiscalYear: "2026", sort: "budget", limit: "5" });
    });

    it("combines both filters", async () => {
      await renderPageWithOptions();

      selectAgency(MEDICAL);
      selectYear("2025");

      await waitFor(() => expect(requests("breakdown").at(-1)).toEqual({ agency: MEDICAL, fiscalYear: "2025" }));
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
    });

    it("doesn't reload the dropdowns when a filter changes", async () => {
      await renderPageWithOptions();

      selectAgency(TRAFFIC);

      await waitFor(() => expect(requests("summary")).toHaveLength(2));
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      expect(requests("filters")).toHaveLength(1);
    });

    it("shows the loading state again until the new numbers arrive", async () => {
      await renderPageWithOptions();
      expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("12");

      replies = { ...replies, summary: pending, breakdown: pending, tors: pending };
      selectAgency(TRAFFIC);

      expect(await screen.findAllByText(LOADING)).toHaveLength(8);
      expect(statCard("จำนวน TOR ทั้งหมด")).not.toHaveTextContent("12");
      expect(screen.queryByText(TOP_TORS[0].title)).not.toBeInTheDocument();
    });

    it("cancels the previous requests when a filter changes", async () => {
      await renderPageWithOptions();
      const summaryCall = fetchMock.mock.calls.find(([url]) => (url as string).includes(PATHS.summary));
      const { signal } = summaryCall?.[1] as RequestInit;
      expect(signal?.aborted).toBe(false);

      selectAgency(TRAFFIC);

      await waitFor(() => expect(signal?.aborted).toBe(true));
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
    });

    it("clears both filters with 'ล้างตัวกรอง'", async () => {
      await renderPageWithOptions();
      selectAgency(TRAFFIC);
      selectYear("2026");

      fireEvent.click(await screen.findByRole("button", { name: "ล้างตัวกรอง" }));

      await waitFor(() => expect(requests("summary").at(-1)).toEqual({}));
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      expect(screen.getByRole("combobox", { name: "หน่วยงาน" })).toHaveValue("");
      expect(screen.getByRole("combobox", { name: "ปีงบประมาณ" })).toHaveValue("");
      expect(screen.queryByRole("button", { name: "ล้างตัวกรอง" })).not.toBeInTheDocument();
    });

    it("offers to clear the filters when nothing matches them", async () => {
      await renderPageWithOptions();

      replies.summary = ok({ torCount: 0, totalBudget: 0, averageBudget: 0, agencyCount: 0 });
      replies.breakdown = ok({ byAgency: [], byCategory: [], byFiscalYear: [] });
      replies.tors = ok({ results: [] });
      selectAgency(MEDICAL);

      const notice = (await screen.findByText(NO_MATCH)).parentElement as HTMLElement;
      expect(screen.getAllByText(EMPTY)).toHaveLength(4);

      replies.summary = ok(SUMMARY);
      replies.breakdown = ok(BREAKDOWN);
      replies.tors = ok({ results: TOP_TORS });
      fireEvent.click(within(notice).getByRole("button", { name: "ล้างตัวกรอง" }));

      await waitFor(() => expect(screen.queryByText(NO_MATCH)).not.toBeInTheDocument());
      await waitFor(() => expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("12"));
      expect(requests("summary").at(-1)).toEqual({});
    });
  });

  describe("errors", () => {
    it.each<[string, Reply]>([
      ["fails", httpError(500)],
      ["can't be reached", rejected(new Error("network down"))],
    ])("shows a notice and '-' in the cards when the stats request %s", async (_name, reply) => {
      replies.summary = reply;
      await renderPage();

      expect(screen.getByText(STATS_FAILED)).toBeInTheDocument();
      expect(statCard("งบประมาณรวม")).toHaveTextContent("-บาท");
      expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("-");
    });

    it("keeps showing the charts and list when only the stats fail", async () => {
      replies.summary = httpError(500);
      await renderPage();

      expect(legend(AGENCY_CHART)).toHaveLength(2);
      expect(legend(TOP_LIST)).toHaveLength(2);
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
    });

    it("shows an error on all three charts when the breakdown fails, leaving the rest", async () => {
      replies.breakdown = httpError(500);
      await renderPage();

      [AGENCY_CHART, CATEGORY_CHART, YEAR_CHART].forEach((heading) => {
        expect(panel(heading).getByText(FAILED)).toBeInTheDocument();
      });
      expect(statCard("จำนวน TOR ทั้งหมด")).toHaveTextContent("12");
      expect(legend(TOP_LIST)).toHaveLength(2);
    });

    it("shows an error on the list when the top projects fail, leaving the rest", async () => {
      replies.tors = httpError(500);
      await renderPage();

      expect(panel(TOP_LIST).getByText(FAILED)).toBeInTheDocument();
      expect(legend(AGENCY_CHART)).toHaveLength(2);
    });

    it("doesn't treat a cancelled request as an error", async () => {
      const aborted = new Error("aborted");
      aborted.name = "AbortError";
      replies.summary = rejected(aborted);
      replies.breakdown = rejected(aborted);
      replies.tors = rejected(aborted);
      render(<DashboardPage />);
      await screen.findByRole("option", { name: TRAFFIC });

      expect(screen.queryByText(STATS_FAILED)).not.toBeInTheDocument();
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
      expect(screen.getAllByText(LOADING)).toHaveLength(8);
    });

    it("loads everything again with 'ลองใหม่', keeping the filters", async () => {
      await renderPageWithOptions();
      replies.summary = httpError(500);
      replies.breakdown = httpError(500);
      replies.tors = httpError(500);
      selectAgency(TRAFFIC);
      await screen.findByText(STATS_FAILED);
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      fetchMock.mockClear();

      replies.summary = ok(SUMMARY);
      replies.breakdown = ok(BREAKDOWN);
      replies.tors = ok({ results: TOP_TORS });
      const notice = screen.getByText(STATS_FAILED).parentElement as HTMLElement;
      fireEvent.click(within(notice).getByRole("button", { name: "ลองใหม่" }));

      await waitFor(() => expect(screen.queryByText(STATS_FAILED)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryAllByText(LOADING)).toHaveLength(0));
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
      expect(requests("summary")).toEqual([{ agency: TRAFFIC }]);
      expect(requests("breakdown")).toEqual([{ agency: TRAFFIC }]);
      expect(requests("tors")).toEqual([{ agency: TRAFFIC, sort: "budget", limit: "5" }]);
      expect(requests("filters")).toHaveLength(0);
    });

    it("retries from a chart's own 'ลองใหม่' button", async () => {
      replies.breakdown = httpError(500);
      await renderPage();

      replies.breakdown = ok(BREAKDOWN);
      fireEvent.click(panel(YEAR_CHART).getByRole("button", { name: "ลองใหม่" }));

      await waitFor(() => expect(legend(YEAR_CHART)).toEqual(["2568: 4.6", "2569: 29.9"]));
      expect(legend(AGENCY_CHART)).toHaveLength(2);
    });
  });
});
