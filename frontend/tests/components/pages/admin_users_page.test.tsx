import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsersPage from "@/components/pages/admin_users_page";

jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
jest.mock("@/components/DashboardSidebar", () => ({ DashboardSidebar: () => null }));
const mockAuthUser = { id: "admin-1", name: "Current Admin", email: "admin@example.test", role: "admin" };
jest.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mockAuthUser }) }));

const fetchMock = jest.fn();
const users = [
  { _id: "admin-1", name: "Current Admin", email: "admin@example.test", role: "admin", status: "active", isEmailVerified: true, createdAt: "2026-01-01T00:00:00Z" },
  { _id: "user-2", name: "Other User", email: "other@example.test", role: "end_user", status: "active", isEmailVerified: true, createdAt: "2026-01-02T00:00:00Z" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  localStorage.setItem("token", "admin-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, options?: RequestInit) => {
    if (options?.method === "DELETE") return jsonResponse({ message: "User deleted" });
    return jsonResponse({ users });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("Admin users page", () => {
  it("hides account actions on the current admin's row", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("Other User");

    const ownRow = screen.getByText("Current Admin").closest("tr")!;
    expect(within(ownRow).getByText("ไม่สามารถดำเนินการกับบัญชีตัวเอง")).toBeInTheDocument();
    expect(within(ownRow).queryByRole("button", { name: "ระงับ" })).not.toBeInTheDocument();
    expect(within(ownRow).queryByRole("button", { name: "ลบ" })).not.toBeInTheDocument();

    const otherRow = screen.getByText("Other User").closest("tr")!;
    expect(within(otherRow).getByRole("button", { name: "ระงับ" })).toBeInTheDocument();
    expect(within(otherRow).getByRole("button", { name: "ลบ" })).toBeInTheDocument();
  });

  it("requires confirmation before deleting a user", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("Other User");

    const otherRow = screen.getByText("Other User").closest("tr")!;
    fireEvent.click(within(otherRow).getByRole("button", { name: "ลบ" }));

    expect(screen.getByRole("heading", { name: "ลบผู้ใช้งาน?" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "ลบถาวร" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Other User")).not.toBeInTheDocument());
  });
});
