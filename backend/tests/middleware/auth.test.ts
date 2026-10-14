import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { User } from "../../src/models/user.js";
import { requireAuth } from "../../src/middleware/auth.js";
import { requireAdmin } from "../../src/middleware/requireAdmin.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

const app = express();
app.get("/protected", requireAuth, (req, res) => res.json({ user: req.user }));
app.get("/admin", requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));

const secret = process.env.JWT_SECRET!;

async function createUser(options: {
  role?: "end_user" | "admin";
  status?: "active" | "disabled";
  passwordChangedAt?: Date;
} = {}) {
  return User.create({
    name: "Middleware User",
    email: `${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: "not-used-here",
    role: options.role ?? "end_user",
    status: options.status ?? "active",
    isEmailVerified: true,
    passwordChangedAt: options.passwordChangedAt,
  });
}

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

describe("requireAuth", () => {
  it("rejects a missing bearer token", async () => {
    const response = await request(app).get("/protected");
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  it("rejects an invalid token", async () => {
    const response = await request(app).get("/protected").set("Authorization", "Bearer not-a-jwt");
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired token");
  });

  it("rejects a token for a disabled user", async () => {
    const user = await createUser({ status: "disabled" });
    const token = signAccessToken({ id: user._id.toString(), role: user.role });

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account has been disabled");
  });

  it("rejects a token for a deleted user", async () => {
    const user = await createUser();
    const token = signAccessToken({ id: user._id.toString(), role: user.role });
    await user.deleteOne();

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired token");
  });

  it("rejects a token issued before the user's password changed", async () => {
    const user = await createUser({ passwordChangedAt: new Date() });
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, iat: Math.floor(Date.now() / 1000) - 60 },
      secret,
    );

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Session expired, please log in again");
  });
});

describe("requireAdmin", () => {
  it("returns 403 to an authenticated normal user", async () => {
    const user = await createUser({ role: "end_user" });
    const token = signAccessToken({ id: user._id.toString(), role: user.role });

    const response = await request(app).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required");
  });

  it("allows an authenticated admin", async () => {
    const user = await createUser({ role: "admin" });
    const token = signAccessToken({ id: user._id.toString(), role: user.role });

    const response = await request(app).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
