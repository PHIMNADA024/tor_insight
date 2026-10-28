import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationsPage from "@/components/pages/notifications_page";
import { NotificationProvider, useNotifications } from "@/contexts/notification-context";

jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1", name: "Test User", email: "test@example.test", role: "end_user" } }),
}));
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const fetchMock = jest.fn();
const notifications = [
  { _id: "n1", type: "tor_match", title: "New matching TOR", message: "A TOR matches your saved criteria", isRead: false, createdAt: "2026-10-20T10:00:00Z", relatedId: "tor-1" },
  { _id: "n2", type: "feedback_resolved", title: "Feedback answered", message: "Your feedback was reviewed", isRead: false, createdAt: "2026-10-19T10:00:00Z", relatedId: "feedback-1" },
  { _id: "n3", type: "new_feedback", title: "New user feedback", message: "A user sent feedback", isRead: true, createdAt: "2026-10-18T10:00:00Z", relatedId: "feedback-2" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function UnreadCount() {
  const { unreadCount } = useNotifications();
  return <output data-testid="unread-count">{unreadCount}</output>;
}

function renderNotificationsPage() {
  return render(
    <NotificationProvider>
      <UnreadCount />
      <NotificationsPage />
    </NotificationProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("token", "test-user-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/notifications") && url.includes("/read")) {
      return jsonResponse({ message: "Marked as read" });
    }
    if (url.includes("filter=unread")) {
      return jsonResponse({ notifications: notifications.filter((item) => !item.isRead), unreadCount: 2 });
    }
    if (url.includes("filter=read")) {
      return jsonResponse({ notifications: notifications.filter((item) => item.isRead), unreadCount: 2 });
    }
    return jsonResponse({ notifications, unreadCount: 2 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  mockPush.mockReset();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("Notifications page", () => {
  it("loads all notifications and switches between all, unread, and read tabs", async () => {
    renderNotificationsPage();

    expect(await screen.findByText("New matching TOR")).toBeInTheDocument();
    expect(screen.getByText("Feedback answered")).toBeInTheDocument();
    expect(screen.getByText("New user feedback")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยังไม่อ่าน" }));
    expect(await screen.findByText("Feedback answered")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("filter=unread"),
      expect.any(Object),
    ));
    expect(screen.queryByText("New user feedback")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "อ่านแล้ว" }));
    expect(await screen.findByText("New user feedback")).toBeInTheDocument();
    expect(screen.queryByText("New matching TOR")).not.toBeInTheDocument();
  });

  it("marks an unread notification as read and updates the unread count", async () => {
    renderNotificationsPage();

    const notification = await screen.findByText("New matching TOR");
    await screen.findByText("2", { selector: "output" });
    fireEvent.click(notification.closest("li")!);

    await waitFor(() => expect(screen.getByTestId("unread-count")).toHaveTextContent("1"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/notifications/n1/read"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/tor/tor-1");
  });

  it("marks all notifications read and clears the unread count", async () => {
    renderNotificationsPage();
    await screen.findByText("New matching TOR");
    await screen.findByText("2", { selector: "output" });

    fireEvent.click(screen.getByRole("button", { name: "ทำเครื่องหมายว่าอ่านทั้งหมด" }));

    await waitFor(() => expect(screen.getByTestId("unread-count")).toHaveTextContent("0"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/notifications/read-all"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
