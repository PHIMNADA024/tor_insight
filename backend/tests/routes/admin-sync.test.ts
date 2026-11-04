import express from "express";
import request from "supertest";
import { SyncLog } from "../../src/models/index.js";
import { User } from "../../src/models/user.js";
import adminSyncRoutes from "../../src/routes/admin-sync.js";
import { syncFiscalYear, syncRecentFiscalYears } from "../../src/services/bmaFetcher.js";
import { runEgpSync } from "../../src/services/egpFetcher.js";
import { runGprocurementSync } from "../../src/services/gprocurementFetcher.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

/**
 * Admin Data Collection Dashboard API (FR-07, FR-23, UC-09):
 * sync-logs history, latest run per source and the manual triggers.
 * The fetchers are mocked, so no test talks to a government site.
 */

jest.mock("../../src/services/bmaFetcher.js", () => ({
  syncFiscalYear: jest.fn(),
  syncRecentFiscalYears: jest.fn(),
}));
jest.mock("../../src/services/egpFetcher.js", () => ({ runEgpSync: jest.fn() }));
jest.mock("../../src/services/gprocurementFetcher.js", () => ({ runGprocurementSync: jest.fn() }));

const app = express();
app.use(express.json());
app.use("/api/admin", adminSyncRoutes);

let adminToken: string;
let userToken: string;

async function createUser(email: string, role: "end_user" | "admin") {
  const user = await User.create({
    name: role,
    email,
    passwordHash: "not-used-here",
    role,
    isEmailVerified: true,
  });
  return signAccessToken({ id: user._id.toString(), role: user.role });
}

/** One fixed "now" per test, so durations come out exact. */
let now: number;

/** A time `minutes` minutes before now. */
function minutesAgo(minutes: number) {
  return new Date(now - minutes * 60 * 1000);
}

function asAdmin(req: request.Test) {
  return req.set("Authorization", `Bearer ${adminToken}`);
}

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  jest.clearAllMocks();
  now = Date.now();
  adminToken = await createUser("sync-admin@example.test", "admin");
  userToken = await createUser("sync-user@example.test", "end_user");
});

describe("admin sync authorization", () => {
  it.each([
    ["get", "/api/admin/sync-logs"],
    ["get", "/api/admin/sync-logs/latest"],
    ["post", "/api/admin/sync/bma"],
    ["post", "/api/admin/sync/egp"],
  ] as const)("%s %s answers 401 without a token", async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
  });

  it.each([
    ["get", "/api/admin/sync-logs"],
    ["get", "/api/admin/sync-logs/latest"],
    ["post", "/api/admin/sync/bma"],
    ["post", "/api/admin/sync/egp"],
  ] as const)("%s %s answers 403 for a regular user", async (method, path) => {
    const res = await request(app)[method](path).set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it("does not start a sync for a regular user", async () => {
    await request(app).post("/api/admin/sync/egp").set("Authorization", `Bearer ${userToken}`);

    expect(runEgpSync).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/sync-logs", () => {
  beforeEach(async () => {
    await SyncLog.create([
      { sourceId: "bma", status: "success", startedAt: minutesAgo(30), finishedAt: minutesAgo(28) },
      { sourceId: "egp", status: "failed", startedAt: minutesAgo(20), errorMessage: "fetch failed" },
      { sourceId: "bma", status: "in_progress", startedAt: minutesAgo(10), trigger: "manual" },
    ]);
  });

  it("lists runs newest first", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs"));

    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      "in_progress",
      "failed",
      "success",
    ]);
  });

  it("adds the run duration, or null while it is still running", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs"));
    const [running, , finished] = res.body.results;

    expect(finished.durationMs).toBe(2 * 60 * 1000);
    expect(running.durationMs).toBeNull();
    expect(running.finishedAt).toBeNull();
  });

  it("shows the error message of a failed run", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs?status=failed"));

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ sourceId: "egp", errorMessage: "fetch failed" });
  });

  it("filters by source", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs?sourceId=bma"));

    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((r: { sourceId: string }) => r.sourceId === "bma")).toBe(true);
  });

  it("pages the results", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs?page=2&limit=2"));

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].status).toBe("success");
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("caps limit at 100", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs?limit=500"));

    expect(res.body.pagination.limit).toBe(100);
  });

  it.each([
    ["status=done", "status must be one of"],
    ["page=0", "page must be a positive integer"],
    ["page=abc", "page must be a positive integer"],
    ["limit=-5", "limit must be a positive integer"],
  ])("answers 400 for %s", async (query, message) => {
    const res = await asAdmin(request(app).get(`/api/admin/sync-logs?${query}`));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain(message);
  });
});

describe("GET /api/admin/sync-logs/latest", () => {
  it("returns the newest run per source", async () => {
    await SyncLog.create([
      { sourceId: "bma", status: "failed", startedAt: minutesAgo(60) },
      { sourceId: "bma", status: "success", startedAt: minutesAgo(5) },
      { sourceId: "egp", status: "success", startedAt: minutesAgo(30) },
    ]);

    const res = await asAdmin(request(app).get("/api/admin/sync-logs/latest"));

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0]).toMatchObject({ sourceId: "bma", status: "success" });
    expect(res.body.results[1]).toMatchObject({ sourceId: "egp", status: "success" });
  });

  it("returns an empty list before the first run", async () => {
    const res = await asAdmin(request(app).get("/api/admin/sync-logs/latest"));

    expect(res.body.results).toEqual([]);
  });
});

describe("POST /api/admin/sync/bma", () => {
  it("syncs the previous and current fiscal year by default", async () => {
    jest.mocked(syncRecentFiscalYears).mockResolvedValue({ recordsRead: 10 } as never);

    const res = await asAdmin(request(app).post("/api/admin/sync/bma"));

    expect(res.status).toBe(200);
    expect(syncRecentFiscalYears).toHaveBeenCalledWith("manual");
    expect(syncFiscalYear).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ message: "Sync completed", recordsRead: 10 });
  });

  it("syncs only the requested fiscal year", async () => {
    jest.mocked(syncFiscalYear).mockResolvedValue({} as never);

    await asAdmin(request(app).post("/api/admin/sync/bma").send({ fiscalYear: 2026 }));

    expect(syncFiscalYear).toHaveBeenCalledWith(2026, "manual");
    expect(syncRecentFiscalYears).not.toHaveBeenCalled();
  });

  it("answers 500 with the error when the sync fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(syncRecentFiscalYears).mockRejectedValue(new Error("fetch failed"));

    const res = await asAdmin(request(app).post("/api/admin/sync/bma"));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Sync failed", error: "fetch failed" });
  });
});

describe("POST /api/admin/sync/:source", () => {
  it("starts an e-GP sync in the background and answers 202", async () => {
    jest.mocked(runEgpSync).mockResolvedValue({} as never);

    const res = await asAdmin(request(app).post("/api/admin/sync/egp"));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: "Sync started", source: "egp" });
    expect(runEgpSync).toHaveBeenCalledWith("recent", "manual");
  });

  it("starts a gprocurement sync", async () => {
    jest.mocked(runGprocurementSync).mockResolvedValue({} as never);

    const res = await asAdmin(request(app).post("/api/admin/sync/gprocurement"));

    expect(res.status).toBe(202);
    expect(runGprocurementSync).toHaveBeenCalledWith("manual");
  });

  it("answers 404 for an unknown source", async () => {
    const res = await asAdmin(request(app).post("/api/admin/sync/unknown"));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Unknown source: unknown");
  });

  it("answers 409 while a sync for the same source is running", async () => {
    await SyncLog.create({ sourceId: "egp", status: "in_progress", startedAt: minutesAgo(5) });

    const res = await asAdmin(request(app).post("/api/admin/sync/egp"));

    expect(res.status).toBe(409);
    expect(runEgpSync).not.toHaveBeenCalled();
  });

  it("does not block on a run of another source", async () => {
    jest.mocked(runEgpSync).mockResolvedValue({} as never);
    await SyncLog.create({ sourceId: "gprocurement", status: "in_progress", startedAt: minutesAgo(5) });

    const res = await asAdmin(request(app).post("/api/admin/sync/egp"));

    expect(res.status).toBe(202);
  });

  it("ignores an in_progress run older than an hour (it crashed)", async () => {
    jest.mocked(runEgpSync).mockResolvedValue({} as never);
    await SyncLog.create({ sourceId: "egp", status: "in_progress", startedAt: minutesAgo(90) });

    const res = await asAdmin(request(app).post("/api/admin/sync/egp"));

    expect(res.status).toBe(202);
  });

  it("still answers 202 when the background run fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(runEgpSync).mockRejectedValue(new Error("timeout"));

    const res = await asAdmin(request(app).post("/api/admin/sync/egp"));

    expect(res.status).toBe(202);
  });
});