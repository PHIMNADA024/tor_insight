import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { Notification } from "../../src/models/notification.js";
import { User } from "../../src/models/user.js";
import notificationRoutes from "../../src/routes/notifications.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

const app = express();
app.use(express.json());
app.use("/api/notifications", notificationRoutes);

let ownerId: mongoose.Types.ObjectId;
let otherUserId: mongoose.Types.ObjectId;
let ownerToken: string;
let otherToken: string;
let unreadId: mongoose.Types.ObjectId;
let otherUnreadId: mongoose.Types.ObjectId;

async function createNotification(userId: mongoose.Types.ObjectId, isRead: boolean) {
  return Notification.create({
    userId,
    type: "tor_match",
    title: "New TOR",
    message: "A matching TOR was published",
    isRead,
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
  const owner = await User.create({
    name: "Owner",
    email: "owner@example.test",
    passwordHash: "not-used-in-this-suite",
    isEmailVerified: true,
  });
  const other = await User.create({
    name: "Other",
    email: "other@example.test",
    passwordHash: "not-used-in-this-suite",
    isEmailVerified: true,
  });

  ownerId = owner._id;
  otherUserId = other._id;
  ownerToken = signAccessToken({ id: ownerId.toString(), role: "end_user" });
  otherToken = signAccessToken({ id: otherUserId.toString(), role: "end_user" });

  unreadId = (await createNotification(ownerId, false))._id;
  await createNotification(ownerId, true);
  await createNotification(ownerId, false);
  otherUnreadId = (await createNotification(otherUserId, false))._id;
});

describe("GET /api/notifications", () => {
  it("returns only the user's notifications and their unread count", async () => {
    const response = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(3);
    expect(response.body.notifications.every((item: { userId: string }) => item.userId === ownerId.toString())).toBe(true);
    expect(response.body.unreadCount).toBe(2);
  });

  it("filters read and unread items while keeping the total unread count", async () => {
    const unread = await request(app)
      .get("/api/notifications?filter=unread")
      .set("Authorization", `Bearer ${ownerToken}`);
    const read = await request(app)
      .get("/api/notifications?filter=read")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(unread.status).toBe(200);
    expect(unread.body.notifications).toHaveLength(2);
    expect(unread.body.notifications.every((item: { isRead: boolean }) => !item.isRead)).toBe(true);
    expect(unread.body.unreadCount).toBe(2);
    expect(read.status).toBe(200);
    expect(read.body.notifications).toHaveLength(1);
    expect(read.body.notifications[0].isRead).toBe(true);
    expect(read.body.unreadCount).toBe(2);
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  it("marks the current user's notification as read", async () => {
    const response = await request(app)
      .patch(`/api/notifications/${unreadId}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.notification.isRead).toBe(true);
    expect(await Notification.countDocuments({ userId: ownerId, isRead: false })).toBe(1);
  });

  it("cannot mark another user's notification as read", async () => {
    const response = await request(app)
      .patch(`/api/notifications/${otherUnreadId}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(404);
    expect(await Notification.findById(otherUnreadId).then((item) => item?.isRead)).toBe(false);
  });
});

describe("PATCH /api/notifications/read-all", () => {
  it("marks only the current user's unread notifications as read", async () => {
    const response = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(await Notification.countDocuments({ userId: ownerId, isRead: false })).toBe(0);
    expect(await Notification.countDocuments({ userId: otherUserId, isRead: false })).toBe(1);
    expect(await Notification.findById(otherUnreadId).then((item) => item?.isRead)).toBe(false);
  });
});
