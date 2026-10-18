import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import request from "supertest";
import { User } from "../../src/models/user.js";
import authRoutes from "../../src/routes/auth.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../src/services/email.js";
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
  sendTorMatchEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackResolvedEmail: jest.fn().mockResolvedValue(undefined),
  sendNewFeedbackAdminEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountDisabledEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const emailMock = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>;
const resetEmailMock = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>;

async function createUser(options: {
  email?: string;
  password?: string;
  status?: "active" | "disabled";
  verified?: boolean;
} = {}) {
  return User.create({
    name: "Test User",
    email: options.email ?? "test@example.test",
    passwordHash: await bcrypt.hash(options.password ?? "correct-password", 4),
    role: "end_user",
    status: options.status ?? "active",
    isEmailVerified: options.verified ?? true,
  });
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
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
  resetEmailMock.mockClear();
});

describe("POST /api/auth/register", () => {
  it("rejects missing required registration fields", async () => {
    const response = await request(app).post("/api/auth/register").send({ email: "user@example.test" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Name, email and password are required");
  });

  it("rejects an email that is already registered, ignoring email case", async () => {
    await createUser({ email: "registered@example.test" });

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Another User", email: " REGISTERED@example.test ", password: "password123" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Email is already registered");
  });

  it("creates an unverified user and sends a six-digit OTP", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "New User", email: "new@example.test", password: "password123" });

    expect(response.status).toBe(201);
    expect(emailMock).toHaveBeenCalledWith("new@example.test", expect.stringMatching(/^\d{6}$/));
    const user = await User.findOne({ email: "new@example.test" }).select("+emailVerificationToken");
    expect(user?.isEmailVerified).toBe(false);
    expect(user?.role).toBe("end_user");
  });
});

describe("email verification", () => {
  it("rejects a wrong OTP and accepts the correct OTP", async () => {
    await User.create({
      name: "Unverified",
      email: "verify@example.test",
      passwordHash: "not-used-here",
      isEmailVerified: false,
      emailVerificationToken: "123456",
      emailVerificationExpires: new Date(Date.now() + 60_000),
    });

    const wrong = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "verify@example.test", otp: "654321" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe("Invalid OTP");

    const correct = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "verify@example.test", otp: "123456" });
    expect(correct.status).toBe(200);
    expect((await User.findOne({ email: "verify@example.test" }))?.isEmailVerified).toBe(true);
  });

  it("rejects an expired OTP", async () => {
    await User.create({
      name: "Expired",
      email: "expired-otp@example.test",
      passwordHash: "not-used-here",
      isEmailVerified: false,
      emailVerificationToken: "123456",
      emailVerificationExpires: new Date(Date.now() - 1_000),
    });

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "expired-otp@example.test", otp: "123456" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP has expired");
  });

  it("resends an OTP and refreshes its expiry", async () => {
    await User.create({
      name: "Unverified",
      email: "resend@example.test",
      passwordHash: "not-used-here",
      isEmailVerified: false,
      emailVerificationToken: "111111",
      emailVerificationExpires: new Date(Date.now() - 1_000),
    });

    const response = await request(app)
      .post("/api/auth/resend-otp")
      .send({ email: "RESEND@example.test" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Verification code resent");
    expect(emailMock).toHaveBeenCalledWith("resend@example.test", expect.stringMatching(/^\d{6}$/));

    const user = await User.findOne({ email: "resend@example.test" })
      .select("+emailVerificationToken +emailVerificationExpires");
    expect(user?.emailVerificationToken).toBe((emailMock.mock.calls[0] as [string, string])[1]);
    expect(user?.emailVerificationExpires?.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("POST /api/auth/login", () => {
  it("rejects an incorrect password", async () => {
    await createUser();

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.test", password: "incorrect-password" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("returns 403 with the user id when email is not verified", async () => {
    const user = await createUser({ email: "unverified@example.test", verified: false });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "correct-password" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Please verify your email before logging in");
    expect(response.body.userId).toBe(user._id.toString());
  });

  it("blocks disabled accounts", async () => {
    await createUser({ email: "disabled@example.test", status: "disabled" });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "disabled@example.test", password: "correct-password" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account has been disabled");
  });
});

describe("password reset", () => {
  it("returns the same generic response for known and unknown emails", async () => {
    await createUser({ email: "known@example.test" });

    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "known@example.test" });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "unknown@example.test" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(resetEmailMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid reset token once and rejects its reuse", async () => {
    const rawToken = "single-use-reset-token";
    await User.create({
      name: "Reset User",
      email: "reset@example.test",
      passwordHash: await bcrypt.hash("old-password", 4),
      isEmailVerified: true,
      passwordResetToken: hashToken(rawToken),
      passwordResetExpires: new Date(Date.now() + 60_000),
    });

    const payload = { email: "reset@example.test", token: rawToken, newPassword: "new-password" };
    const first = await request(app).post("/api/auth/reset-password").send(payload);
    expect(first.status).toBe(200);

    const reused = await request(app).post("/api/auth/reset-password").send(payload);
    expect(reused.status).toBe(400);
    expect(reused.body.message).toBe("Invalid or expired reset link");

    const user = await User.findOne({ email: payload.email }).select("+passwordHash");
    expect(await bcrypt.compare("new-password", user!.passwordHash)).toBe(true);
  });

  it("rejects an expired reset token", async () => {
    const rawToken = "expired-reset-token";
    await User.create({
      name: "Expired Reset",
      email: "expired-reset@example.test",
      passwordHash: await bcrypt.hash("old-password", 4),
      passwordResetToken: hashToken(rawToken),
      passwordResetExpires: new Date(Date.now() - 1_000),
    });

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "expired-reset@example.test", token: rawToken, newPassword: "new-password" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Reset link has expired");
  });
});
