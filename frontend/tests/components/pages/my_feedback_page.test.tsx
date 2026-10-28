import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MyFeedbackPage from "@/components/pages/my_feedback_page";

jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = jest.fn();
const feedbackItems = [
  { _id: "f1", category: "app_feedback", description: "Feedback one", status: "pending", createdAt: "2026-10-01T00:00:00Z" },
  { _id: "f2", category: "other", description: "Feedback two", status: "pending", createdAt: "2026-10-02T00:00:00Z" },
  { _id: "f3", category: "broken_link", description: "Feedback three", status: "reviewed", createdAt: "2026-10-03T00:00:00Z" },
  { _id: "f4", category: "incorrect_info", description: "Feedback four", status: "resolved", createdAt: "2026-10-04T00:00:00Z" },
  { _id: "f5", category: "outdated_info", description: "Feedback five", status: "pending", createdAt: "2026-10-05T00:00:00Z" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  localStorage.setItem("token", "test-user-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/feedback/mine")) {
      return jsonResponse({ feedback: feedbackItems });
    }
    return jsonResponse({ message: "Unexpected request" }, 404);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  pushMock.mockReset();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("My Feedback page", () => {
  it("validates the minimum description length before submitting", async () => {
    render(<MyFeedbackPage />);
    await screen.findByText("Feedback one");

    fireEvent.change(screen.getByLabelText("รายละเอียด"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อเสนอแนะ" }));

    expect(await screen.findByText("กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/feedback"))).toBe(false);
  });

  it("requires selecting a TOR for a TOR-specific report", async () => {
    render(<MyFeedbackPage />);
    await screen.findByText("Feedback one");

    fireEvent.change(screen.getByLabelText("ประเภท"), { target: { value: "incorrect_info" } });
    fireEvent.change(screen.getByLabelText("รายละเอียด"), { target: { value: "The project agency is incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อเสนอแนะ" }));

    expect(await screen.findByText("กรุณาค้นหาและเลือก TOR ที่เกี่ยวข้องจากรายการ")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/feedback"))).toBe(false);
  });

  it("shows only three history items initially, then expands and collapses the list", async () => {
    render(<MyFeedbackPage />);
    await screen.findByText("Feedback one");

    expect(screen.getByText("Feedback three")).toBeInTheDocument();
    expect(screen.queryByText("Feedback four")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แสดงทั้งหมด (5)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "แสดงทั้งหมด (5)" }));
    expect(await screen.findByText("Feedback five")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แสดงน้อยลง" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "แสดงน้อยลง" }));
    await waitFor(() => expect(screen.queryByText("Feedback four")).not.toBeInTheDocument());
  });

  it("sets the description maximum to 2,000 characters", async () => {
    render(<MyFeedbackPage />);
    const description = await screen.findByLabelText("รายละเอียด");
    expect(description).toHaveAttribute("maxLength", "2000");
  });
});
