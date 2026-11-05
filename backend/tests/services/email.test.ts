/**
 * What each notification email says and who it goes to. nodemailer is mocked,
 * so nothing is sent; what's under test is the message handed to it.
 */

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

const SENDER = "tor-insight@example.com";
const TO = "user@example.com";
const SCRIPT = "<script>alert(1)</script>";

const ORIGINAL_USER = process.env.EMAIL_USER;
const ORIGINAL_PASSWORD = process.env.EMAIL_PASSWORD;

let email: typeof import("../../src/services/email.js");
let createTransport: jest.Mock;

// The transporter reads its credentials on import, so set them first.
beforeAll(async () => {
  process.env.EMAIL_USER = SENDER;
  process.env.EMAIL_PASSWORD = "app-password";
  email = await import("../../src/services/email.js");
  createTransport = (await import("nodemailer")).default.createTransport as unknown as jest.Mock;
});

afterAll(() => {
  process.env.EMAIL_USER = ORIGINAL_USER;
  process.env.EMAIL_PASSWORD = ORIGINAL_PASSWORD;
});

beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: "1" });
});

/** The one message handed to nodemailer. */
function sentMail(): { from: string; to: string; subject: string; html: string } {
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  return mockSendMail.mock.calls[0][0];
}

const TOR = {
  title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
  agency: "สำนักการจราจรและขนส่ง",
  budgetAmount: 5_000_000,
  sourceUrl: "https://process.gprocurement.go.th/egp2/tor/1",
};

/** Every email, sent with ordinary values. */
const SENDERS: [string, () => Promise<void>][] = [
  ["sendVerificationEmail", () => email.sendVerificationEmail(TO, "123456")],
  ["sendPasswordResetEmail", () => email.sendPasswordResetEmail(TO, "http://localhost:3000/reset?token=abc")],
  ["sendTorMatchEmail", () => email.sendTorMatchEmail(TO, "สมชาย", [TOR])],
  ["sendFeedbackResolvedEmail", () => email.sendFeedbackResolvedEmail(TO, "สมชาย", "ข้อความ", "คำตอบ")],
  ["sendNewFeedbackAdminEmail", () => email.sendNewFeedbackAdminEmail(TO, "สมชาย", "ปัญหา", "ข้อความ")],
  ["sendAccountDisabledEmail", () => email.sendAccountDisabledEmail(TO, "สมชาย")],
];

describe("email service", () => {
  it("sends through Gmail with the credentials from the environment", () => {
    expect(createTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: SENDER, pass: "app-password" },
    });
  });

  describe.each(SENDERS)("%s", (_name, send) => {
    it("sends one email from TOR Insight to the given address", async () => {
      await send();

      const mail = sentMail();
      expect(mail.from).toBe(`"TOR Insight" <${SENDER}>`);
      expect(mail.to).toBe(TO);
      expect(mail.subject).toMatch(/^TOR Insight - /);
      expect(mail.html).toContain("<h2>TOR Insight</h2>");
    });

    it("passes a sending failure on to the caller", async () => {
      mockSendMail.mockRejectedValue(new Error("SMTP down"));

      await expect(send()).rejects.toThrow("SMTP down");
    });
  });

  describe("sendVerificationEmail", () => {
    it("contains the code and how long it lasts", async () => {
      await email.sendVerificationEmail(TO, "123456");

      const mail = sentMail();
      expect(mail.subject).toBe("TOR Insight - Email Verification");
      expect(mail.html).toContain("<h1>123456</h1>");
      expect(mail.html).toContain("expire in 10 minutes");
    });

    it("keeps the code out of the subject, which shows in inbox previews", async () => {
      await email.sendVerificationEmail(TO, "123456");

      expect(sentMail().subject).not.toContain("123456");
    });
  });

  describe("sendPasswordResetEmail", () => {
    const LINK = "http://localhost:3000/reset-password?token=abc123";

    it("contains a working link and how long it lasts", async () => {
      await email.sendPasswordResetEmail(TO, LINK);

      const mail = sentMail();
      expect(mail.subject).toBe("TOR Insight - Password Reset Request");
      expect(mail.html).toContain(`<a href="${LINK}">${LINK}</a>`);
      expect(mail.html).toContain("expire in 30 minutes");
    });

    it("keeps the token out of the subject", async () => {
      await email.sendPasswordResetEmail(TO, LINK);

      expect(sentMail().subject).not.toContain("abc123");
    });
  });

  describe("sendTorMatchEmail", () => {
    it("greets the user and counts the matches", async () => {
      await email.sendTorMatchEmail(TO, "สมชาย", [TOR, { ...TOR, title: "ซื้อครุภัณฑ์คอมพิวเตอร์" }]);

      const mail = sentMail();
      expect(mail.subject).toContain("(2 รายการ)");
      expect(mail.html).toContain("สวัสดีคุณ สมชาย,");
      expect(mail.html).toContain("ที่คุณตั้งไว้ 2 รายการ");
    });

    it("lists each TOR's title, agency, budget and link", async () => {
      await email.sendTorMatchEmail(TO, "สมชาย", [TOR]);

      const { html } = sentMail();
      expect(html).toContain(`<strong>${TOR.title}</strong>`);
      expect(html).toContain(`หน่วยงาน: ${TOR.agency}`);
      expect(html).toContain("งบประมาณ: 5,000,000 บาท");
      expect(html).toContain(`<a href="${TOR.sourceUrl}">ดูรายละเอียด</a>`);
    });

    it("keeps the TORs in the order given", async () => {
      await email.sendTorMatchEmail(TO, "สมชาย", [
        { ...TOR, title: "โครงการแรก" },
        { ...TOR, title: "โครงการสอง" },
      ]);

      const { html } = sentMail();
      expect(html.indexOf("โครงการแรก")).toBeLessThan(html.indexOf("โครงการสอง"));
      expect(html.match(/<li/g)).toHaveLength(2);
    });

    it.each([
      ["missing", undefined],
      ["zero", 0],
    ])("leaves out the budget line when the budget is %s", async (_name, budgetAmount) => {
      await email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, budgetAmount }]);

      expect(sentMail().html).not.toContain("งบประมาณ:");
    });

    it("leaves out the link when there is no source URL", async () => {
      await email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, sourceUrl: undefined }]);

      expect(sentMail().html).not.toContain("ดูรายละเอียด");
    });
  });

  describe("sendFeedbackResolvedEmail", () => {
    it("quotes the feedback and the team's answer", async () => {
      await email.sendFeedbackResolvedEmail(TO, "สมชาย", "ค้นหาไม่เจอ", "แก้ไขแล้ว");

      const mail = sentMail();
      expect(mail.subject).toBe("TOR Insight - ข้อเสนอแนะของคุณได้รับการตอบกลับแล้ว");
      expect(mail.html).toContain("สวัสดีคุณ สมชาย,");
      expect(mail.html).toContain("<strong>ข้อความของคุณ:</strong> ค้นหาไม่เจอ");
      expect(mail.html).toContain("<strong>คำตอบจากทีมงาน:</strong> แก้ไขแล้ว");
    });
  });

  describe("sendNewFeedbackAdminEmail", () => {
    it("tells the admin who sent what", async () => {
      await email.sendNewFeedbackAdminEmail("admin@example.com", "สมชาย", "ปัญหาการใช้งาน", "ค้นหาไม่เจอ");

      const mail = sentMail();
      expect(mail.to).toBe("admin@example.com");
      expect(mail.subject).toBe("TOR Insight - มีข้อเสนอแนะใหม่รอตรวจสอบ");
      expect(mail.html).toContain("มีข้อเสนอแนะใหม่จาก สมชาย:");
      expect(mail.html).toContain("<strong>ประเภท:</strong> ปัญหาการใช้งาน");
      expect(mail.html).toContain("<strong>รายละเอียด:</strong> ค้นหาไม่เจอ");
    });

    it("mentions the TOR when the feedback is about one", async () => {
      await email.sendNewFeedbackAdminEmail(TO, "สมชาย", "ข้อมูลผิด", "งบไม่ตรง", "TOR-123");

      expect(sentMail().html).toContain("<strong>เกี่ยวข้องกับ:</strong> TOR-123");
    });

    it("leaves that line out otherwise", async () => {
      await email.sendNewFeedbackAdminEmail(TO, "สมชาย", "ข้อมูลผิด", "งบไม่ตรง");

      expect(sentMail().html).not.toContain("เกี่ยวข้องกับ");
    });
  });

  describe("sendAccountDisabledEmail", () => {
    it("tells the user their account is suspended and who to contact", async () => {
      await email.sendAccountDisabledEmail(TO, "สมชาย");

      const mail = sentMail();
      expect(mail.subject).toBe("TOR Insight - บัญชีของคุณถูกระงับการใช้งาน");
      expect(mail.html).toContain("สวัสดีคุณ สมชาย,");
      expect(mail.html).toContain("กรุณาติดต่อทีมงานผู้ดูแลระบบ");
    });
  });

  /**
   * Known bug: the templates don't escape user input yet, so these fail for now.
   * it.failing keeps CI green until "Fix Email Injection and Regex Security" is
   * done; these then report a failure, and it.failing should become it.
   */
  describe("escaping user input", () => {
    it.failing.each<[string, () => Promise<void>]>([
      ["the name in a TOR match", () => email.sendTorMatchEmail(TO, SCRIPT, [TOR])],
      ["a TOR title", () => email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, title: SCRIPT }])],
      ["a TOR agency", () => email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, agency: SCRIPT }])],
      ["the name in a feedback reply", () => email.sendFeedbackResolvedEmail(TO, SCRIPT, "ข้อความ", "คำตอบ")],
      ["the quoted feedback", () => email.sendFeedbackResolvedEmail(TO, "สมชาย", SCRIPT, "คำตอบ")],
      ["the team's answer", () => email.sendFeedbackResolvedEmail(TO, "สมชาย", "ข้อความ", SCRIPT)],
      ["the submitter's name", () => email.sendNewFeedbackAdminEmail(TO, SCRIPT, "ปัญหา", "ข้อความ")],
      ["the feedback category", () => email.sendNewFeedbackAdminEmail(TO, "สมชาย", SCRIPT, "ข้อความ")],
      ["the feedback sent to admins", () => email.sendNewFeedbackAdminEmail(TO, "สมชาย", "ปัญหา", SCRIPT)],
      ["the TOR reference", () => email.sendNewFeedbackAdminEmail(TO, "สมชาย", "ปัญหา", "ข้อความ", SCRIPT)],
      ["the name of a disabled account", () => email.sendAccountDisabledEmail(TO, SCRIPT)],
    ])("escapes HTML in %s", async (_field, send) => {
      await send();

      const { html } = sentMail();
      expect(html).not.toContain(SCRIPT);
      expect(html).toContain("&lt;script&gt;");
    });

    it.failing("doesn't let a source URL break out of the link", async () => {
      const sourceUrl = `https://example.com/"><img src=x onerror=alert(1)>`;

      await email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, sourceUrl }]);

      expect(sentMail().html).not.toContain("<img");
    });

    it.failing("doesn't link to a javascript: source URL", async () => {
      await email.sendTorMatchEmail(TO, "สมชาย", [{ ...TOR, sourceUrl: "javascript:alert(1)" }]);

      expect(sentMail().html).not.toContain("javascript:");
    });
  });
});
