import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { User } from "../../src/models/user.js";
import userRoutes from "../../src/routes/user.js";
import { sendPasswordChangedEmail } from "../../src/services/email.js";
import { verifyPassword } from "../../src/services/passwordHash.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

jest.mock("../../src/services/email.js", () => ({
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/passwordPolicy.js", () => ({
  checkPasswordLength: (password: unknown) =>
    typeof password !== "string" || [...password].length < 8
      ? "too_short"
      : [...password].length > 128 ? "too_long" : undefined,
  passwordPolicyMessage: (reason: string) => reason === "too_short"
    ? "Password must be at least 8 characters"
    : reason,
  validateNewPassword: jest.fn(async (password: unknown) =>
    typeof password !== "string" || password.length < 8
      ? { ok: false, reason: "too_short" }
      : { ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);

let userId: string;
let token: string;

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  const user = await User.create({
    name: "Settings User",
    email: "settings@example.test",
    passwordHash: await bcrypt.hash("current-password", 4),
    isEmailVerified: true,
  });
  userId = user._id.toString();
  token = signAccessToken({ id: userId, role: user.role });
});

describe("GET /api/users/me", () => {
  it("returns the authenticated user's profile and saved settings", async () => {
    await User.findByIdAndUpdate(userId, {
      $set: {
        interestCriteria: {
          categories: ["software"],
          agencies: ["BMA"],
          keywords: ["cloud"],
          minBudget: 100_000,
          maxBudget: 500_000,
          fiscalYear: 2026,
        },
        notifyByEmail: false,
      },
    });

    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: userId,
      name: "Settings User",
      email: "settings@example.test",
      interestCriteria: {
        categories: ["software"],
        agencies: ["BMA"],
        keywords: ["cloud"],
        minBudget: 100_000,
        maxBudget: 500_000,
        fiscalYear: 2026,
      },
      notifyByEmail: false,
    });
    expect(response.body).not.toHaveProperty("passwordHash");
  });
});

describe("PUT /api/users/me", () => {
  it("saves profile and notification criteria that persist on a subsequent GET", async () => {
    const payload = {
      name: "  Updated Name  ",
      interestCriteria: {
        categories: ["software", "it_equipment"],
        agencies: ["Bangkok Metropolitan Administration"],
        keywords: ["database", "security"],
        minBudget: 50_000,
        maxBudget: 900_000,
        fiscalYear: 2027,
      },
      notifyByEmail: false,
    };

    const update = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(update.status).toBe(200);
    expect(update.body.user).toMatchObject({
      name: "Updated Name",
      interestCriteria: payload.interestCriteria,
      notifyByEmail: false,
    });

    const reload = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(reload.status).toBe(200);
    expect(reload.body).toMatchObject({
      name: "Updated Name",
      interestCriteria: payload.interestCriteria,
      notifyByEmail: false,
    });
  });

  it.each([
    [{ interestCriteria: { minBudget: 500, maxBudget: 100 } }, "reversed budgets"],
    [{ interestCriteria: { minBudget: "100" } }, "string budget"],
    [{ notifyByEmail: "false" }, "string boolean"],
    [{ interestCriteria: { keywords: [1] } }, "non-string list item"],
    [{ role: "admin" }, "unsupported field"],
  ])("rejects invalid profile input: %s", async (payload) => {
    const response = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/users/change-password", () => {
  it("rejects an incorrect current password", async () => {
    const response = await request(app)
      .put("/api/users/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong-password", newPassword: "new-password" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Current password is incorrect");
  });

  it("rejects a new password shorter than eight characters", async () => {
    const response = await request(app)
      .put("/api/users/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "current-password", newPassword: "short" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Password must be at least 8 characters");
  });

  it("changes the password when the current password is correct", async () => {
    const response = await request(app)
      .put("/api/users/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "current-password", newPassword: "new-password" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Password changed successfully");

    const user = await User.findById(userId).select("+passwordHash");
    expect(await verifyPassword("new-password", user!.passwordHash!, user!.passwordHashScheme)).toBe(true);
    expect(await verifyPassword("current-password", user!.passwordHash!, user!.passwordHashScheme)).toBe(false);
    expect(user?.passwordHashScheme).toBe("bcrypt_sha256");
    expect(user?.passwordChangedAt).toBeInstanceOf(Date);
    expect(user?.tokenVersion).toBe(1);
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith(user?.email, user?.name);
  });
});
