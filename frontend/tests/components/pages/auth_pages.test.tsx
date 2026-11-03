import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/components/pages/login_page";
import RegisterPage from "@/components/pages/register_page";
import ResetPasswordPage from "@/components/pages/reset_password_page";

const mockPush = jest.fn();
let mockSearchParams = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  mockPush.mockReset();
  mockSearchParams = "email=user%40example.test&token=reset-token";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ message: "Unexpected request" }, 500));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("authentication pages", () => {
  it("logs in to sessionStorage by default and localStorage when Remember me is selected", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      token: "access-token",
      user: { id: "user-1", name: "Test User", email: "user@example.test", role: "end_user" },
    }));

    const { unmount } = render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    await waitFor(() => expect(sessionStorage.getItem("token")).toBe("access-token"));
    expect(localStorage.getItem("token")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/");

    unmount();
    localStorage.clear();
    sessionStorage.clear();
    mockPush.mockClear();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse({
      token: "remembered-token",
      user: { id: "user-1", name: "Test User", email: "user@example.test", role: "end_user" },
    }));

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    await waitFor(() => expect(localStorage.getItem("token")).toBe("remembered-token"));
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("shows the login validation error returned by the API", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid email or password" }, 401));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("shows the suspension message for a disabled account", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "This account has been disabled" }, 403));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "disabled@example.test" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));

    expect(await screen.findByText("บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ")).toBeInTheDocument();
  });

  it("validates registration password confirmation and minimum length", async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("ชื่อ"), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "new@example.test" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน", { selector: "input" }), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value: "different123" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("รหัสผ่านไม่ตรงกัน")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("รหัสผ่าน", { selector: "input" }), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่าน"), { target: { value: "short" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates reset-password links, confirmation, and minimum length", async () => {
    mockSearchParams = "";
    const { unmount } = render(<ResetPasswordPage />);
    expect(screen.getByText("ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว")).toBeInTheDocument();
    unmount();

    mockSearchParams = "email=user%40example.test&token=reset-token";
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่"), { target: { value: "different123" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("รหัสผ่านไม่ตรงกัน")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่"), { target: { value: "short" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
