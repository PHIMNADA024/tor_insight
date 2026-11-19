import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SiteHeader } from "@/components/SiteHeader";

const mockPush = jest.fn();
let mockUnreadCount = 0;
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));
jest.mock("@/contexts/notification-context", () => ({
  useNotifications: () => ({ unreadCount: mockUnreadCount }),
}));

const fetchMock = jest.fn();

/** Only the token is stored; the header loads the user from GET /api/auth/me. */
function storeUser(role: string) {
  const token = `local-token-${role}`;
  localStorage.setItem("token", token);
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/api/auth/me")
      ? { user: { id: "user-1", name: "Test User", email: "test@example.test", role } }
      : {}),
  }));
  return token;
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
  sessionStorage.clear();
  mockPush.mockReset();
  mockUnreadCount = 0;
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("Site header", () => {
  it("shows the admin link only to admins", async () => {
    storeUser("end_user");
    const { unmount } = render(<SiteHeader />);
    fireEvent.click(await screen.findByRole("button", { name: /Test User/ }));
    expect(screen.queryByRole("link", { name: "แผงควบคุมผู้ดูแลระบบ" })).not.toBeInTheDocument();
    unmount();

    localStorage.clear();
    storeUser("admin");
    render(<SiteHeader />);
    fireEvent.click(await screen.findByRole("button", { name: /Test User/ }));
    expect(screen.getByRole("link", { name: "แผงควบคุมผู้ดูแลระบบ" })).toHaveAttribute("href", "/admin");
  });

  it("shows the notification dot only when unreadCount is positive", async () => {
    storeUser("end_user");
    const { unmount } = render(<SiteHeader />);
    const notificationLink = await screen.findByRole("link", { name: "การแจ้งเตือน" });
    expect(notificationLink.querySelector("span")).not.toBeInTheDocument();
    unmount();

    mockUnreadCount = 2;
    render(<SiteHeader />);
    const unreadLink = await screen.findByRole("link", { name: "การแจ้งเตือน" });
    expect(unreadLink.querySelector("span")).toBeInTheDocument();
  });

  it("asks for logout confirmation and clears local and session storage after confirmation", async () => {
    const token = storeUser("end_user");
    sessionStorage.setItem("token", "session-token");
    render(<SiteHeader />);

    fireEvent.click(await screen.findByRole("button", { name: /Test User/ }));
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));

    expect(screen.getByText("คุณต้องการออกจากระบบใช่หรือไม่")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe(token);
    expect(sessionStorage.getItem("token")).toBe("session-token");

    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    await waitFor(() => {
      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(sessionStorage.getItem("token")).toBeNull();
      expect(sessionStorage.getItem("user")).toBeNull();
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("user details in browser storage", () => {
  it("loads the user from the API and keeps only the token in storage", async () => {
    const token = storeUser("end_user");

    render(<SiteHeader />);

    expect(await screen.findByRole("button", { name: /Test User/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/auth/me",
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }),
    );
    expect(localStorage.getItem("user")).toBeNull();
    expect(sessionStorage.getItem("user")).toBeNull();
  });

  it("removes user details that an older version stored", async () => {
    storeUser("end_user");
    localStorage.setItem("user", JSON.stringify({ email: "old@example.test" }));

    render(<SiteHeader />);

    await screen.findByRole("button", { name: /Test User/ });
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("forgets a token that the API no longer accepts", async () => {
    localStorage.setItem("token", "revoked-token");
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    render(<SiteHeader />);

    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
    expect(screen.queryByRole("button", { name: /Test User/ })).not.toBeInTheDocument();
  });
});
