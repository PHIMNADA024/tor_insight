import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { Feedback } from "../../src/models/feedback.js";
import { User } from "../../src/models/user.js";
import feedbackRoutes from "../../src/routes/feedback.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

/**
 * Feedback limits under parallel requests (ASVS V15.4.2): the daily limit and
 * the duplicate check can't be bypassed by sending many requests at once.
 */

jest.mock("../../src/services/email.js", () => ({
  sendNewFeedbackAdminEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use("/api/feedback", feedbackRoutes);

let userId: mongoose.Types.ObjectId;
let token: string;

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  jest.spyOn(console, "error").mockImplementation(() => {});
  const user = await User.create({
    name: "Parallel User",
    email: "parallel@example.test",
    passwordHash: "not-used-here",
    isEmailVerified: true,
  });
  userId = user._id;
  token = signAccessToken({ id: userId.toString(), role: user.role });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function submit(description: string) {
  return request(app)
    .post("/api/feedback")
    .set("Authorization", `Bearer ${token}`)
    .send({ category: "app_feedback", description });
}

/** Feedback this user already sent today. */
async function alreadySent(count: number) {
  await Feedback.insertMany(
    Array.from({ length: count }, (_, i) => ({ userId, category: "app_feedback", description: `Earlier feedback ${i}` })),
  );
}

describe("feedback limits under parallel requests", () => {
  it("lets only one of five parallel requests take the 10th daily slot", async () => {
    await alreadySent(9);

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) => submit(`Parallel feedback number ${i}`)),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(4);
    expect(await Feedback.countDocuments({ userId })).toBe(10);
  });

  it("stores the same text only once when it is sent several times at once", async () => {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () => submit("The budget on this TOR is wrong")),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Feedback.countDocuments({ userId, description: "The budget on this TOR is wrong" })).toBe(1);
  });

  it("still accepts submissions one after another", async () => {
    const first = await submit("First feedback about the site");
    const second = await submit("Second feedback about the site");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await Feedback.countDocuments({ userId })).toBe(2);
  });

  it("doesn't let one user's submission block another user's", async () => {
    const other = await User.create({
      name: "Other User",
      email: "other@example.test",
      passwordHash: "not-used-here",
      isEmailVerified: true,
    });
    const otherToken = signAccessToken({ id: other._id.toString(), role: other.role });

    const [mine, theirs] = await Promise.all([
      submit("My feedback about the site"),
      request(app)
        .post("/api/feedback")
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ category: "app_feedback", description: "Their feedback about the site" }),
    ]);

    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);
  });
});