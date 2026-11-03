import { fireEvent, render, screen } from "@testing-library/react";
import AccountSettingsPage from "@/components/pages/account_settings_page";

jest.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const fetchMock = jest.fn();
const profile = {
  id: "user-1",
  name: "Settings User",
  email: "settings@example.test",
  interestCriteria: { categories: [], agencies: ["BMA"], keywords: ["cloud"] },
  notifyByEmail: true,
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  localStorage.setItem("token", "test-token");
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, options?: RequestInit) => {
    if (options?.method === "PUT") return jsonResponse({ message: "Saved" });
    return jsonResponse(profile);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  mockPush.mockReset();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("Account settings page", () => {
  it("adds trimmed agencies and keywords only once, and removes them", async () => {
    render(<AccountSettingsPage />);
    await screen.findByDisplayValue("Settings User");

    const agencyInput = screen.getByPlaceholderText("พิมพ์ชื่อหน่วยงานแล้วกด Enter");
    fireEvent.change(agencyInput, { target: { value: "  BMA  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "เพิ่ม" })[0]);
    expect(screen.getAllByText("BMA")).toHaveLength(1);

    fireEvent.change(agencyInput, { target: { value: "  กรมทดสอบ  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "เพิ่ม" })[0]);
    expect(screen.getByText("กรมทดสอบ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลบ กรมทดสอบ" }));
    expect(screen.queryByText("กรมทดสอบ")).not.toBeInTheDocument();

    const keywordInput = screen.getByPlaceholderText("พิมพ์คำสำคัญแล้วกด Enter");
    fireEvent.change(keywordInput, { target: { value: "  cloud  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "เพิ่ม" })[1]);
    expect(screen.getAllByText("cloud")).toHaveLength(1);

    fireEvent.change(keywordInput, { target: { value: "  data  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "เพิ่ม" })[1]);
    expect(screen.getByText("data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลบ data" }));
    expect(screen.queryByText("data")).not.toBeInTheDocument();
  });

  it("shows validation messages for mismatched and too-short new passwords", async () => {
    render(<AccountSettingsPage />);
    await screen.findByDisplayValue("Settings User");

    fireEvent.change(screen.getByLabelText("รหัสผ่านปัจจุบัน"), { target: { value: "current-password" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่"), { target: { value: "different123" } });
    fireEvent.submit(screen.getByLabelText("รหัสผ่านปัจจุบัน").closest("form")!);

    expect(await screen.findByText("รหัสผ่านใหม่ไม่ตรงกัน")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);

    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่"), { target: { value: "short" } });
    fireEvent.submit(screen.getByLabelText("รหัสผ่านปัจจุบัน").closest("form")!);

    expect(await screen.findByText("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });
});
