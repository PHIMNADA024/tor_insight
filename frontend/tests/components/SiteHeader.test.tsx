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

function storeUser(role: string) {
  localStorage.setItem("token", "local-token");
  localStorage.setItem("user", JSON.stringify({
    id: "user-1",
    name: "Test User",
    email: "test@example.test",
    role,
  }));
}

beforeEach(() => {
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
    storeUser("end_user");
    sessionStorage.setItem("token", "session-token");
    sessionStorage.setItem("user", "session-user");
    render(<SiteHeader />);

    fireEvent.click(await screen.findByRole("button", { name: /Test User/ }));
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));

    expect(screen.getByText("คุณต้องการออกจากระบบใช่หรือไม่")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("local-token");
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
