import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { User } from "../../src/models/user.js";
import userRoutes from "../../src/routes/user.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

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
    expect(await bcrypt.compare("new-password", user!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("current-password", user!.passwordHash)).toBe(false);
    expect(user?.passwordChangedAt).toBeInstanceOf(Date);
  });
});
