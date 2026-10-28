import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Feedback } from "../../src/models/feedback.js";
import { Notification } from "../../src/models/notification.js";
import { User } from "../../src/models/user.js";
import adminFeedbackRoutes from "../../src/routes/admin-feedback.js";
import { sendFeedbackResolvedEmail } from "../../src/services/email.js";
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
app.use("/api/admin", adminFeedbackRoutes);

const sendResolvedEmailMock = sendFeedbackResolvedEmail as jest.MockedFunction<typeof sendFeedbackResolvedEmail>;
let adminId: mongoose.Types.ObjectId;
let adminToken: string;
let regularToken: string;
let feedbackId: mongoose.Types.ObjectId;
let submitter: InstanceType<typeof User>;

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  sendResolvedEmailMock.mockClear();

  const admin = await User.create({
    name: "Feedback Admin",
    email: "admin-feedback@example.test",
    passwordHash: "not-used-here",
    role: "admin",
    isEmailVerified: true,
  });
  const regular = await User.create({
    name: "Regular User",
    email: "regular-feedback@example.test",
    passwordHash: "not-used-here",
    role: "end_user",
    isEmailVerified: true,
  });
  submitter = await User.create({
    name: "Feedback Submitter",
    email: "submitter-feedback@example.test",
    passwordHash: "not-used-here",
    isEmailVerified: true,
    notifyByEmail: true,
  });

  adminId = admin._id;
  adminToken = signAccessToken({ id: adminId.toString(), role: admin.role });
  regularToken = signAccessToken({ id: regular._id.toString(), role: regular.role });
  const feedback = await Feedback.create({
    userId: submitter._id,
    category: "app_feedback",
    description: "The dashboard chart needs a clearer label",
    status: "pending",
  });
  feedbackId = feedback._id;
});

describe("PATCH /api/admin/feedback/:id", () => {
  it("requires a response before changing feedback status", async () => {
    const response = await request(app)
      .patch(`/api/admin/feedback/${feedbackId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("A response is required when updating feedback status");
    expect((await Feedback.findById(feedbackId))?.status).toBe("pending");
  });

  it("resolves feedback, writes an audit log, and creates an in-app notification", async () => {
    const response = await request(app)
      .patch(`/api/admin/feedback/${feedbackId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved", adminResponse: "  Thank you, this has been fixed.  " });

    expect(response.status).toBe(200);
    expect(response.body.feedback).toMatchObject({
      status: "resolved",
      adminResponse: "Thank you, this has been fixed.",
      resolvedBy: adminId.toString(),
    });
    expect(response.body.feedback.resolvedAt).toBeTruthy();

    const notification = await Notification.findOne({ userId: submitter._id, relatedId: feedbackId });
    expect(notification).toMatchObject({
      type: "feedback_resolved",
      message: "Thank you, this has been fixed.",
    });
    expect(await AdminActionLog.findOne({
      actorId: adminId,
      action: "feedback.status_change",
      targetType: "Feedback",
      targetId: feedbackId,
      metadata: { from: "pending", to: "resolved" },
    })).not.toBeNull();
    expect(sendResolvedEmailMock).toHaveBeenCalledWith(
      submitter.email,
      submitter.name,
      "The dashboard chart needs a clearer label",
      "Thank you, this has been fixed.",
    );
  });

  it("does not send email when the user opted out, but still sends an in-app notification", async () => {
    await User.findByIdAndUpdate(submitter._id, { notifyByEmail: false });

    const response = await request(app)
      .patch(`/api/admin/feedback/${feedbackId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved", adminResponse: "Reviewed and resolved." });

    expect(response.status).toBe(200);
    expect(await Notification.countDocuments({ userId: submitter._id, relatedId: feedbackId })).toBe(1);
    expect(sendResolvedEmailMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin users with 403", async () => {
    const response = await request(app)
      .patch(`/api/admin/feedback/${feedbackId}`)
      .set("Authorization", `Bearer ${regularToken}`)
      .send({ status: "resolved", adminResponse: "Should not be accepted." });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required");
    expect((await Feedback.findById(feedbackId))?.status).toBe("pending");
    expect(await AdminActionLog.countDocuments({ targetId: feedbackId })).toBe(0);
  });
});
