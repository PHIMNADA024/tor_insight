import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Feedback } from "../../src/models/feedback.js";
import { Notification } from "../../src/models/notification.js";
import { User } from "../../src/models/user.js";
import adminUserRoutes from "../../src/routes/admin-users.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

jest.mock("../../src/services/email.js", () => ({
  sendAccountDisabledEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use("/api/admin", adminUserRoutes);

let adminToken: string;

async function createUserWithData(email: string) {
  const user = await User.create({
    name: "Delete Target",
    email,
    passwordHash: "not-used-here",
    role: "end_user",
    status: "active",
    isEmailVerified: true,
  });
  const feedback = await Feedback.create({
    userId: user._id,
    category: "app_feedback",
    description: "Feedback that must survive a failed delete",
  });
  const notification = await Notification.create({
    userId: user._id,
    type: "tor_match",
    title: "New TOR",
    message: "A matching TOR was found",
  });
  return { user, feedback, notification };
}

function deleteUser(id: mongoose.Types.ObjectId) {
  return request(app)
    .delete(`/api/admin/users/${id}`)
    .set("Authorization", `Bearer ${adminToken}`);
}

async function expectNothingDeleted(data: Awaited<ReturnType<typeof createUserWithData>>) {
  expect(await User.exists({ _id: data.user._id })).not.toBeNull();
  expect(await Feedback.exists({ _id: data.feedback._id })).not.toBeNull();
  expect(await Notification.exists({ _id: data.notification._id })).not.toBeNull();
  expect(await AdminActionLog.exists({ action: "user.delete", targetId: data.user._id })).toBeNull();
}

beforeAll(async () => {
  await connectTestDatabase();
  // Create the collections up front so the first transaction doesn't have to.
  await Promise.all([User.init(), Feedback.init(), Notification.init(), AdminActionLog.init()]);
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  jest.spyOn(console, "error").mockImplementation(() => undefined);

  const admin = await User.create({
    name: "Admin",
    email: "admin-transaction@example.test",
    passwordHash: "not-used-here",
    role: "admin",
    status: "active",
    isEmailVerified: true,
  });
  adminToken = signAccessToken({ id: admin._id.toString(), role: admin.role });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("DELETE /api/admin/users/:id is all-or-nothing", () => {
  it("rolls everything back when removing notifications fails halfway", async () => {
    const data = await createUserWithData("halfway@example.test");
    jest.spyOn(Notification, "deleteMany").mockRejectedValueOnce(new Error("database went away"));

    const response = await deleteUser(data.user._id);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Failed to delete user");
    await expectNothingDeleted(data);
  });

  it("rolls everything back when the final user delete fails", async () => {
    const data = await createUserWithData("last-step@example.test");
    jest.spyOn(User, "deleteOne").mockRejectedValueOnce(new Error("database went away"));

    const response = await deleteUser(data.user._id);

    expect(response.status).toBe(500);
    await expectNothingDeleted(data);
  });

  it("leaves other users' data alone when the delete succeeds", async () => {
    const target = await createUserWithData("target@example.test");
    const bystander = await createUserWithData("bystander@example.test");

    const response = await deleteUser(target.user._id);

    expect(response.status).toBe(200);
    expect(await User.exists({ _id: target.user._id })).toBeNull();
    expect(await Feedback.exists({ userId: target.user._id })).toBeNull();
    expect(await Notification.exists({ userId: target.user._id })).toBeNull();
    expect(await AdminActionLog.countDocuments({ action: "user.delete", targetId: target.user._id })).toBe(1);

    expect(await User.exists({ _id: bystander.user._id })).not.toBeNull();
    expect(await Feedback.exists({ _id: bystander.feedback._id })).not.toBeNull();
    expect(await Notification.exists({ _id: bystander.notification._id })).not.toBeNull();
  });
});