import { render, screen, waitFor } from "@testing-library/react";
import GoogleCallbackPage from "@/components/pages/google_callback_page";
import LoginPage from "@/components/pages/login_page";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function openWithFragment(fragment: string) {
  window.history.replaceState(null, "", `/auth/google#${fragment}`);
}

const LOGIN_CODE = "A".repeat(43);

beforeEach(() => {
  mockReplace.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("Google sign-in", () => {
  it("shows a Google button on the login page that goes to the backend", () => {
    render(<LoginPage />);

    expect(screen.getByRole("link", { name: "เข้าสู่ระบบด้วย Google" })).toHaveAttribute(
      "href",
      "http://localhost:4000/api/auth/google",
    );
  });

  it("swaps the login code and sends the MFA step to the login page", async () => {
    fetchMock.mockReturnValue(jsonResponse({ mfaRequired: true, challengeToken: "c".repeat(64) }, 202));
    openWithFragment(`code=${LOGIN_CODE}`);

    render(<GoogleCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/auth/google/exchange",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: LOGIN_CODE }) }),
    );
    expect(JSON.parse(sessionStorage.getItem("pendingGoogleMfa")!)).toMatchObject({ mfaRequired: true });
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("continues a Google login with the authenticator code step", async () => {
    sessionStorage.setItem("pendingGoogleMfa", JSON.stringify({ mfaRequired: true, challengeToken: "c".repeat(64) }));

    render(<LoginPage />);

    expect(await screen.findByLabelText("รหัส authenticator 6 หลัก")).toBeInTheDocument();
    expect(sessionStorage.getItem("pendingGoogleMfa")).toBeNull();
  });

  it("continues a first Google login with MFA setup", async () => {
    fetchMock.mockReturnValue(jsonResponse({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/x" }));
    sessionStorage.setItem("pendingGoogleMfa", JSON.stringify({ mfaSetupRequired: true, setupToken: "setup-token" }));

    render(<LoginPage />);

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/auth/mfa/setup",
      expect.objectContaining({ headers: { Authorization: "Bearer setup-token" } }),
    );
  });

  it("removes the code from the address bar right away", async () => {
    fetchMock.mockReturnValue(jsonResponse({ mfaRequired: true, challengeToken: "c".repeat(64) }, 202));
    openWithFragment(`code=${LOGIN_CODE}`);

    render(<GoogleCallbackPage />);

    expect(window.location.hash).toBe("");
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it.each([
    ["cancelled", "คุณยกเลิกการเข้าสู่ระบบด้วย Google"],
    ["account_disabled", "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ"],
    ["account_conflict", "อีเมลนี้เชื่อมต่อกับบัญชี Google อื่นอยู่แล้ว"],
    ["invalid_token", "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"],
  ])("shows a message for error=%s without calling the API", async (code, message) => {
    openWithFragment(`error=${code}`);

    render(<GoogleCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("shows an error and stores nothing when the code is rejected", async () => {
    fetchMock.mockReturnValue(jsonResponse({ message: "Login code is invalid or expired" }, 401));
    openWithFragment(`code=${LOGIN_CODE}`);

    render(<GoogleCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
