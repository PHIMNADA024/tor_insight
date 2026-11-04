import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminTorManagementPage from "@/components/pages/admin_tor_management_page";

jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
jest.mock("@/components/DashboardSidebar", () => ({ DashboardSidebar: () => null }));

const fetchMock = jest.fn();
const publishedTor = {
  _id: "tor-1",
  title: "Test procurement",
  agency: "Example Agency",
  category: "software",
  status: "published",
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  localStorage.setItem("token", "admin-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes("/reported")) return jsonResponse({ results: [] });
    if (options?.method === "POST" && url.includes("/archive")) return jsonResponse({ message: "Archived" });
    if (url.includes("status=published")) return jsonResponse({ tors: [publishedTor] });
    return jsonResponse({ tors: [] });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("Admin TOR management page", () => {
  it("asks for confirmation before archiving a TOR", async () => {
    render(<AdminTorManagementPage />);
    fireEvent.click(await screen.findByRole("button", { name: "เผยแพร่แล้ว" }));
    await screen.findByText("Test procurement");

    const torRow = screen.getByText("Test procurement").closest("li")!;
    fireEvent.click(within(torRow).getByRole("button", { name: "เก็บถาวร" }));
    const confirmation = screen.getByRole("heading", { name: "เก็บถาวร TOR นี้?" });
    expect(confirmation).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes("/archive") && options?.method === "POST")).toBe(false);

    const modal = confirmation.parentElement!.parentElement!;
    fireEvent.click(within(modal).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "เก็บถาวร TOR นี้?" })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes("/archive") && options?.method === "POST")).toBe(false);
  });
});
