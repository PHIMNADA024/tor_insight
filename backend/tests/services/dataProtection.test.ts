import express from "express";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Notification } from "../../src/models/notification.js";
import { SyncLog } from "../../src/models/syncLog.js";
import { noStore } from "../../src/middleware/noStore.js";
import { sameDigest } from "../../src/services/otp.js";

const DAY = 24 * 60 * 60;

function ttlOf(model: { schema: { indexes(): [Record<string, unknown>, Record<string, unknown>][] } }) {
  const ttl = model.schema.indexes().find(([fields, options]) =>
    Object.keys(fields).join() === "createdAt" && typeof options.expireAfterSeconds === "number");
  return ttl?.[1].expireAfterSeconds;
}

describe("Cache-Control on API answers", () => {
  it("tells browsers and proxies not to store anything", async () => {
    const app = express();
    app.use("/api", noStore);
    app.get("/api/auth/me", (_req, res) => res.json({ user: { email: "private@example.test" } }));

    const res = await request(app).get("/api/auth/me");

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is also set on error answers", async () => {
    const app = express();
    app.use("/api", noStore);
    app.get("/api/users/me", (_req, res) => res.status(401).json({ message: "Invalid or expired token" }));

    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("data retention", () => {
  it.each([
    ["notifications", Notification, 90 * DAY],
    ["sync logs", SyncLog, 180 * DAY],
    ["admin audit log", AdminActionLog, 365 * DAY],
  ])("deletes %s automatically after the retention period", (_label, model, seconds) => {
    expect(ttlOf(model as never)).toBe(seconds);
  });
});

describe("sameDigest", () => {
  const a = "a".repeat(64);

  it("matches equal digests", () => {
    expect(sameDigest(a, "a".repeat(64))).toBe(true);
  });

  it.each([
    ["a different digest", "b".repeat(64)],
    ["a shorter digest", "a".repeat(62)],
    ["an empty string", ""],
  ])("rejects %s", (_label, other) => {
    expect(sameDigest(a, other)).toBe(false);
  });
});
