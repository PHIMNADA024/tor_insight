import express from "express";
import request from "supertest";
import { User } from "../../src/models/user.js";
import authRoutes from "../../src/routes/auth.js";
import { sendVerificationEmail } from "../../src/services/email.js";
import { MAX_OTP_ATTEMPTS, hashOtp, verifyOtp } from "../../src/services/otp.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

jest.mock("../../src/middleware/rateLimit.js", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { authLimiter: passThrough, otpLimiter: passThrough };
});

jest.mock("../../src/services/email.js", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/passwordPolicy.js", () => ({
  checkPasswordLength: (password: unknown) =>
    typeof password !== "string" || [...password].length < 8
      ? "too_short"
      : [...password].length > 128 ? "too_long" : undefined,
  passwordPolicyMessage: (reason: string) => reason,
  validateNewPassword: jest.fn().mockResolvedValue({ ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const emailMock = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>;
const EMAIL = "otp@example.test";

async function unverifiedUser(otp: string, extra: Record<string, unknown> = {}) {
  return User.create({
    name: "Unverified",
    email: EMAIL,
    passwordHash: "not-used-here",
    isEmailVerified: false,
    emailVerificationToken: await hashOtp(otp),
    emailVerificationExpires: new Date(Date.now() + 60_000),
    ...extra,
  });
}

function verify(otp: string) {
  return request(app).post("/api/auth/verify-email").send({ email: EMAIL, otp });
}

async function storedUser() {
  return User.findOne({ email: EMAIL }).select(
    "+emailVerificationToken +emailVerificationExpires +emailVerificationAttempts",
  );
}

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  emailMock.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("email verification codes (OTP)", () => {
  it("stores only a salted hash of the emailed code, never the code itself", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "New User", email: EMAIL, password: "password123" });

    const emailed = (emailMock.mock.calls[0] as [string, string])[1];
    const user = await storedUser();
    expect(user!.emailVerificationToken).not.toContain(emailed);
    expect(user!.emailVerificationToken).toMatch(/^\$2[aby]\$/);
    expect(await verifyOtp(emailed, user!.emailVerificationToken)).toBe(true);
  });

  it("gives the same code a different hash each time (salted)", async () => {
    expect(await hashOtp("123456")).not.toBe(await hashOtp("123456"));
  });

  it(`stops accepting the code after ${MAX_OTP_ATTEMPTS} wrong guesses, even the right one`, async () => {
    await unverifiedUser("123456");

    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      expect((await verify("000000")).status).toBe(400);
    }
    const correct = await verify("123456");

    expect(correct.status).toBe(400);
    expect(correct.body).toEqual({ message: "Invalid or expired verification code" });
    expect((await storedUser())!.isEmailVerified).toBe(false);
  });

  it("still accepts the right code before the limit is reached", async () => {
    await unverifiedUser("123456");

    for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i++) await verify("000000");
    const correct = await verify("123456");

    expect(correct.status).toBe(200);
    const user = await storedUser();
    expect(user!.isEmailVerified).toBe(true);
    expect(user!.emailVerificationToken).toBeUndefined();
    expect(user!.emailVerificationAttempts).toBe(0);  
  });

  it("counts parallel guesses too, so they can't get past the limit", async () => {
    await unverifiedUser("123456");

    await Promise.all(Array.from({ length: 12 }, () => verify("000000")));

    expect((await storedUser())!.emailVerificationAttempts).toBe(MAX_OTP_ATTEMPTS);
    expect((await verify("123456")).status).toBe(400);
  });

  it("gives a fresh set of attempts with a new code from resend", async () => {
    await unverifiedUser("123456", { emailVerificationAttempts: MAX_OTP_ATTEMPTS });

    await request(app).post("/api/auth/resend-otp").send({ email: EMAIL });
    const newCode = (emailMock.mock.calls[0] as [string, string])[1];

    expect((await storedUser())!.emailVerificationAttempts).toBe(0);
    expect((await verify(newCode)).status).toBe(200);
  });

  it("no longer accepts the old code after a resend", async () => {
    await unverifiedUser("123456");

    await request(app).post("/api/auth/resend-otp").send({ email: EMAIL });

    // The new code is random, so in the rare case it equals the old one this test can't say anything.
    const newCode = (emailMock.mock.calls[0] as [string, string])[1];
    if (newCode !== "123456") {
      expect((await verify("123456")).status).toBe(400);
    }
  });

  it("doesn't accept a code that was stored in plain text before this change", async () => {
    await User.create({
      name: "Legacy",
      email: EMAIL,
      passwordHash: "not-used-here",
      isEmailVerified: false,
      emailVerificationToken: "123456",
      emailVerificationExpires: new Date(Date.now() + 60_000),
    });

    expect((await verify("123456")).status).toBe(400);
  });

  it("gives the same answer for an unknown email, a wrong code and a used-up code", async () => {
    await unverifiedUser("123456", { emailVerificationAttempts: MAX_OTP_ATTEMPTS });

    const usedUp = await verify("123456");
    const unknown = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "nobody@example.test", otp: "123456" });

    expect(usedUp.body).toEqual(unknown.body);
    expect(usedUp.status).toBe(unknown.status);
  });
});
