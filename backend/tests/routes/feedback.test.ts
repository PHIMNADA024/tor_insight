import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { Feedback } from "../../src/models/feedback.js";
import { Notification } from "../../src/models/notification.js";
import { Tor } from "../../src/models/tor.js";
import { User } from "../../src/models/user.js";
import feedbackRoutes from "../../src/routes/feedback.js";
import { sendNewFeedbackAdminEmail } from "../../src/services/email.js";
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
app.use("/api/feedback", feedbackRoutes);

const sendAdminEmailMock = sendNewFeedbackAdminEmail as jest.MockedFunction<typeof sendNewFeedbackAdminEmail>;
let submitterId: mongoose.Types.ObjectId;
let submitterToken: string;
let publishedTorId: mongoose.Types.ObjectId;

async function waitForAdminNotifications(expected: number) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await Notification.countDocuments({ type: "new_feedback" });
    if (count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function createFeedback(userId: mongoose.Types.ObjectId, description: string, createdAt = new Date()) {
  return Feedback.create({ userId, category: "app_feedback", description, createdAt });
}

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  sendAdminEmailMock.mockClear();
  const submitter = await User.create({
    name: "Feedback User",
    email: "submitter@example.test",
    passwordHash: "not-used-here",
    isEmailVerified: true,
  });
  submitterId = submitter._id;
  submitterToken = signAccessToken({ id: submitterId.toString(), role: submitter.role });

  const tor = await Tor.create({
    ocid: "feedback-test-tor",
    title: "Test software project",
    agency: "Example Agency",
    status: "published",
  });
  publishedTorId = tor._id;
});

function submitFeedback(body: Record<string, unknown>, token = submitterToken) {
  return request(app)
    .post("/api/feedback")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe("POST /api/feedback validation", () => {
  it("rejects an unsupported category", async () => {
    const response = await submitFeedback({ category: "support", description: "A valid length description" });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid category");
  });

  it("enforces the 10-character minimum after trimming", async () => {
    const response = await submitFeedback({ category: "app_feedback", description: "  short  " });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Description must be at least 10 characters");
  });

  it("enforces the 2,000-character maximum", async () => {
    const response = await submitFeedback({ category: "app_feedback", description: "x".repeat(2001) });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Description must be under 2000 characters");
  });

  it.each(["incorrect_info", "outdated_info", "broken_link"])(
    "requires a TOR reference for %s feedback",
    async (category) => {
      const response = await submitFeedback({ category, description: "This is a valid description" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Please select the TOR this feedback relates to");
    },
  );

  it("rejects a malformed TOR id", async () => {
    const response = await submitFeedback({
      category: "incorrect_info",
      description: "The project budget seems wrong",
      torId: "not-an-object-id",
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid TOR id");
  });

  it("accepts a description at both length boundaries", async () => {
    const min = await submitFeedback({ category: "app_feedback", description: "1234567890" });
    const max = await submitFeedback({ category: "app_feedback", description: "x".repeat(2000) });

    expect(min.status).toBe(201);
    expect(max.status).toBe(201);
  });

  it("stores feedback linked to the selected published TOR", async () => {
    const response = await submitFeedback({
      category: "incorrect_info",
      description: "Please check the project title",
      torId: publishedTorId.toString(),
    });

    expect(response.status).toBe(201);
    expect(response.body.feedback).toMatchObject({
      userId: submitterId.toString(),
      torId: publishedTorId.toString(),
      torReference: "Test software project — Example Agency",
    });
  });
});

describe("submission limits and ownership", () => {
  it("rejects the eleventh feedback submission in a rolling 24-hour period", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createFeedback(submitterId, `Existing feedback number ${index}`),
      ),
    );

    const response = await submitFeedback({ category: "app_feedback", description: "One more valid feedback" });
    expect(response.status).toBe(429);
    expect(response.body.message).toContain("daily feedback submission limit");
  });

  it("rejects the same user's duplicate description within five minutes", async () => {
    await createFeedback(submitterId, "Duplicate issue description", new Date(Date.now() - 4 * 60 * 1000));

    const response = await submitFeedback({ category: "other", description: " Duplicate issue description " });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain("already submitted this feedback recently");
  });

  it("returns only the authenticated user's feedback from /mine", async () => {
    const other = await User.create({
      name: "Other User",
      email: "other-feedback@example.test",
      passwordHash: "not-used-here",
      isEmailVerified: true,
    });
    const otherToken = signAccessToken({ id: other._id.toString(), role: other.role });
    await createFeedback(submitterId, "My own feedback record");
    await createFeedback(other._id, "Someone else's feedback record");

    const response = await request(app)
      .get("/api/feedback/mine")
      .set("Authorization", `Bearer ${submitterToken}`);

    expect(response.status).toBe(200);
    expect(response.body.feedback).toHaveLength(1);
    expect(response.body.feedback[0].description).toBe("My own feedback record");
    expect(response.body.feedback[0].userId).toBe(submitterId.toString());
    expect(otherToken).not.toBe(submitterToken);
  });
});

describe("admin notifications for new feedback", () => {
  it("notifies all active admins in-app and emails only active admins with email enabled", async () => {
    const activeEmailAdmin = await User.create({
      name: "Email Admin",
      email: "email-admin@example.test",
      passwordHash: "not-used-here",
      role: "admin",
      status: "active",
      isEmailVerified: true,
      notifyByEmail: true,
    });
    const activeInAppAdmin = await User.create({
      name: "In-App Admin",
      email: "in-app-admin@example.test",
      passwordHash: "not-used-here",
      role: "admin",
      status: "active",
      isEmailVerified: true,
      notifyByEmail: false,
    });
    const disabledAdmin = await User.create({
      name: "Disabled Admin",
      email: "disabled-admin@example.test",
      passwordHash: "not-used-here",
      role: "admin",
      status: "disabled",
      isEmailVerified: true,
      notifyByEmail: true,
    });

    const response = await submitFeedback({
      category: "incorrect_info",
      description: "The agency name needs checking",
      torId: publishedTorId.toString(),
    });
    expect(response.status).toBe(201);
    await waitForAdminNotifications(2);

    const notifications = await Notification.find({ type: "new_feedback" }).sort({ userId: 1 });
    expect(notifications).toHaveLength(2);
    expect(notifications.map((item) => item.userId.toString()).sort()).toEqual(
      [activeEmailAdmin._id.toString(), activeInAppAdmin._id.toString()].sort(),
    );
    expect(notifications.every((item) => item.relatedId?.toString() === response.body.feedback._id)).toBe(true);

    expect(sendAdminEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAdminEmailMock).toHaveBeenCalledWith(
      activeEmailAdmin.email,
      "Feedback User",
      "ข้อมูลไม่ถูกต้อง",
      "The agency name needs checking",
      "Test software project — Example Agency",
    );
    expect(notifications.some((item) => item.userId.equals(disabledAdmin._id))).toBe(false);
  });
});
