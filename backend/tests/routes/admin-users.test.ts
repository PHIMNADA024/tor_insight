import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Feedback } from "../../src/models/feedback.js";
import { Notification } from "../../src/models/notification.js";
import { User } from "../../src/models/user.js";
import { requireAuth } from "../../src/middleware/auth.js";
import adminUserRoutes from "../../src/routes/admin-users.js";
import { sendAccountDisabledEmail, sendPasswordResetEmail } from "../../src/services/email.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

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
app.use("/api/admin", adminUserRoutes);
app.get("/session-check", requireAuth, (_req, res) => res.json({ ok: true }));

const sendDisabledEmailMock = sendAccountDisabledEmail as jest.MockedFunction<typeof sendAccountDisabledEmail>;
let adminId: mongoose.Types.ObjectId;
let adminToken: string;
let regularToken: string;

async function createUser(options: {
  email?: string;
  role?: "end_user" | "admin";
  status?: "active" | "disabled";
} = {}) {
  return User.create({
    name: "Managed User",
    email: options.email ?? `${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: "not-used-here",
    role: options.role ?? "end_user",
    status: options.status ?? "active",
    isEmailVerified: true,
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
  sendDisabledEmailMock.mockClear();

  const admin = await createUser({ email: "admin-users@example.test", role: "admin" });
  admin.passwordHash = await bcrypt.hash("admin-password", 4);
  await admin.save();
  const regular = await createUser({ email: "regular-users@example.test" });
  adminId = admin._id;
  adminToken = signAccessToken({ id: adminId.toString(), role: admin.role });
  regularToken = signAccessToken({ id: regular._id.toString(), role: regular.role });
});

describe("admin user permissions", () => {
  it("rejects non-admin access with 403", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${regularToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required");
  });

  it("treats regex syntax in user searches literally", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .query({ search: ".*" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual([]);
  });

  it("rejects unsupported user filters", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .query({ role: "superuser" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/admin/users/:id/disable and enable", () => {
  it("disables a user, sends an email notification, and logs the action", async () => {
    const user = await createUser({ email: "disable-target@example.test" });

    const response = await request(app)
      .patch(`/api/admin/users/${user._id}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("User disabled");
    expect((await User.findById(user._id))?.status).toBe("disabled");
    expect(sendDisabledEmailMock).toHaveBeenCalledWith(user.email, user.name);

    const log = await AdminActionLog.findOne({ action: "user.disable", targetId: user._id });
    expect(log).toMatchObject({
      actorId: adminId,
      targetType: "User",
      metadata: { from: "active", to: "disabled" },
    });
  });

  it("enables a disabled user and logs the action", async () => {
    const user = await createUser({ email: "enable-target@example.test", status: "disabled" });

    const response = await request(app)
      .patch(`/api/admin/users/${user._id}/enable`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("User enabled");
    expect((await User.findById(user._id))?.status).toBe("active");

    const log = await AdminActionLog.findOne({ action: "user.enable", targetId: user._id });
    expect(log).toMatchObject({
      actorId: adminId,
      targetType: "User",
      metadata: { from: "disabled", to: "active" },
    });
  });

  it("rejects disabling the current admin's own account", async () => {
    const response = await request(app)
      .patch(`/api/admin/users/${adminId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You cannot disable your own account");
    expect((await User.findById(adminId))?.status).toBe("active");
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("requires the current administrator password", async () => {
    const user = await createUser();
    const response = await request(app)
      .delete(`/api/admin/users/${user._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ currentPassword: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Current password is incorrect");
    expect(await User.exists({ _id: user._id })).not.toBeNull();
  });

  it("rejects deleting the current admin's own account", async () => {
    const response = await request(app)
      .delete(`/api/admin/users/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ currentPassword: "admin-password" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You cannot delete your own account");
    expect(await User.exists({ _id: adminId })).not.toBeNull();
  });

  it("deletes the user and their feedback and notifications, while recording the action", async () => {
    const user = await createUser({ email: "delete-target@example.test" });
    const feedback = await Feedback.create({
      userId: user._id,
      category: "app_feedback",
      description: "Feedback belonging to deleted user",
    });
    const notification = await Notification.create({
      userId: user._id,
      type: "tor_match",
      title: "New TOR",
      message: "A matching TOR was found",
    });

    const response = await request(app)
      .delete(`/api/admin/users/${user._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ currentPassword: "admin-password" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("User deleted");
    expect(await User.exists({ _id: user._id })).toBeNull();
    expect(await Feedback.exists({ _id: feedback._id })).toBeNull();
    expect(await Notification.exists({ _id: notification._id })).toBeNull();

    const log = await AdminActionLog.findOne({ action: "user.delete", targetId: user._id });
    expect(log).toMatchObject({
      actorId: adminId,
      targetType: "User",
      metadata: { name: user.name, email: user.email, role: user.role },
    });
  });
});

describe("POST /api/admin/users/:id/password-reset", () => {
  it("sends an expiring reset link and records the administrative action without handling a password", async () => {
    const user = await createUser({ email: "reset-target@example.test" });
    const original = await User.findById(user._id).select("+passwordHash");
    const response = await request(app)
      .post(`/api/admin/users/${user._id}/password-reset`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Password reset instructions sent");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(/^http:\/\/localhost:3000\/reset-password\?token=[a-f0-9]{64}&email=/),
    );
    const updated = await User.findById(user._id).select("+passwordResetToken +passwordResetExpires +passwordHash");
    expect(updated?.passwordResetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(updated?.passwordResetExpires?.getTime()).toBeGreaterThan(Date.now());
    expect(updated?.passwordHash).toBe(original?.passwordHash);
    expect(await AdminActionLog.exists({ action: "user.password_reset", targetId: user._id })).not.toBeNull();
  });
});

describe("administrator session revocation", () => {
  it("revokes a user's sessions without disabling the account", async () => {
    const target = await createUser();
    const targetToken = signAccessToken({ id: target._id.toString(), role: target.role });

    const response = await request(app)
      .post(`/api/admin/users/${target._id}/sessions/revoke`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect((await User.findById(target._id))?.status).toBe("active");
    expect((await User.findById(target._id))?.tokenVersion).toBe(1);
    expect(await AdminActionLog.exists({ action: "user.sessions_revoke", targetId: target._id })).not.toBeNull();
    expect((await request(app).get("/session-check").set("Authorization", `Bearer ${targetToken}`)).status).toBe(401);
  });

  it("revokes sessions for all accounts and invalidates the acting admin's session", async () => {
    const target = await createUser();
    const targetToken = signAccessToken({ id: target._id.toString(), role: target.role });

    const response = await request(app)
      .post("/api/admin/users/sessions/revoke-all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.accountsAffected).toBe(3);
    expect((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${adminToken}`)).status).toBe(401);
    expect((await request(app).get("/session-check").set("Authorization", `Bearer ${targetToken}`)).status).toBe(401);
    expect(await AdminActionLog.exists({ action: "users.sessions_revoke_all", targetId: adminId })).not.toBeNull();
  });
});
