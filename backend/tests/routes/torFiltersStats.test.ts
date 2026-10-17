import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../src/models/tor.js";
import torRoutes from "../../src/routes/tor.js";
import statsRoutes from "../../src/routes/stats.js";

/**
 * Filter options (GET /api/tors/filters) and budget statistics
 * (GET /api/tors/stats, /api/stats/summary, /api/stats/breakdown) against a
 * throwaway in-memory MongoDB.
 */

const TRAFFIC = "สำนักการจราจรและขนส่ง";
const MEDICAL = "สำนักการแพทย์";
const BANG_RAK = "สำนักงานเขตบางรัก";
const PATHUM_WAN = "สำนักงานเขตปทุมวัน";

const app = express();
app.use("/api/tors", torRoutes);
app.use("/api/stats", statsRoutes);

let mongo: MongoMemoryServer;

beforeAll(async () => {
  // The first run downloads a MongoDB binary, which can take a while.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/**
 * Published: 6 TORs, 4 agencies, 10,500,000 baht in all, 5 with a budget
 * (average 2,100,000). One has no fiscal year; one is uncategorized.
 * The draft must never be counted.
 */
beforeEach(async () => {
  await Tor.deleteMany({});
  let n = 0;
  const tor = (fields: Record<string, unknown>) =>
    Tor.create({ ocid: `test-${n}`, title: `TOR ${n++}`, status: "published", ...fields });

  await Promise.all([
    tor({ agency: TRAFFIC, category: "tender_invitation", budgetAmount: 6_000_000, fiscalYear: 2026 }),
    tor({ agency: TRAFFIC, category: "services", budgetAmount: 2_000_000, fiscalYear: 2025 }),
    tor({ agency: MEDICAL, category: "equipment", budgetAmount: 1_000_000, fiscalYear: 2026 }),
    tor({ agency: MEDICAL, category: "equipment", fiscalYear: 2026 }), // no budget
    tor({ agency: BANG_RAK, category: "uncategorized", budgetAmount: 1_000_000, fiscalYear: 2026 }),
    tor({ agency: PATHUM_WAN, category: "services", budgetAmount: 500_000 }), // no fiscal year
    tor({ agency: "หน่วยงานฉบับร่าง", category: "construction", budgetAmount: 99_000_000, fiscalYear: 2020, status: "draft" }),
  ]);
});

/** Rows sorted by a key, for comparing groups whose order ties. */
function byKey<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function isDescending(values: number[]) {
  return values.every((v, i) => i === 0 || values[i - 1] >= v);
}

describe("GET /api/tors/filters", () => {
  it("lists agencies, categories and fiscal years from published TORs only", async () => {
    const res = await request(app).get("/api/tors/filters");

    expect(res.status).toBe(200);
    expect(res.body.agencies).toEqual([TRAFFIC, MEDICAL, BANG_RAK, PATHUM_WAN]);
    expect(res.body.categories).toEqual(["equipment", "services", "tender_invitation"]);
    expect(res.body.fiscalYears).toEqual([2026, 2025]);
  });

  it("sorts agencies in Thai order without duplicates", async () => {
    const res = await request(app).get("/api/tors/filters");
    const agencies: string[] = res.body.agencies;

    expect(new Set(agencies).size).toBe(agencies.length);
    expect(agencies).toEqual([...agencies].sort((a, b) => a.localeCompare(b, "th")));
  });

  it("leaves out 'uncategorized' and a missing fiscal year", async () => {
    const res = await request(app).get("/api/tors/filters");

    expect(res.body.categories).not.toContain("uncategorized");
    expect(res.body.fiscalYears).not.toContain(null);
  });

  it("returns empty lists when nothing is published", async () => {
    await Tor.updateMany({}, { $set: { status: "draft" } });
    const res = await request(app).get("/api/tors/filters");

    expect(res.body).toEqual({ agencies: [], categories: [], fiscalYears: [] });
  });
});

describe("GET /api/tors/stats", () => {
  it("returns totals over published TORs", async () => {
    const res = await request(app).get("/api/tors/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        torCount: 6,
        totalBudget: 10_500_000,
        // TORs without a budget are left out of the average, not counted as 0.
        avgBudget: 2_100_000,
        agencyCount: 4,
      }),
    );
  });

  it("counts TORs and budget per category, most TORs first, without 'uncategorized'", async () => {
    const res = await request(app).get("/api/tors/stats");
    const categories = res.body.categories;

    expect(byKey(categories, "category")).toEqual([
      { category: "equipment", count: 2, totalBudget: 1_000_000 },
      { category: "services", count: 2, totalBudget: 2_500_000 },
      { category: "tender_invitation", count: 1, totalBudget: 6_000_000 },
    ]);
    expect(isDescending(categories.map((c: { count: number }) => c.count))).toBe(true);
  });

  it("returns zeros when nothing is published", async () => {
    await Tor.updateMany({}, { $set: { status: "draft" } });
    const res = await request(app).get("/api/tors/stats");

    expect(res.body).toEqual({ torCount: 0, totalBudget: 0, avgBudget: 0, agencyCount: 0, categories: [] });
  });
});

describe("GET /api/stats/summary", () => {
  function summary(query: Record<string, string | number> = {}) {
    return request(app).get("/api/stats/summary").query(query);
  }

  it("summarises all published TORs", async () => {
    const res = await summary();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalBudget: 10_500_000, averageBudget: 2_100_000, torCount: 6, agencyCount: 4 });
  });

  it("filters by agency, leaving TORs without a budget out of the average", async () => {
    const res = await summary({ agency: MEDICAL });

    expect(res.body).toEqual({ totalBudget: 1_000_000, averageBudget: 1_000_000, torCount: 2, agencyCount: 1 });
  });

  it("filters by fiscal year, rounding the average to 2 decimals", async () => {
    const res = await summary({ fiscalYear: 2026 });

    // 8,000,000 over the 3 TORs that have a budget.
    expect(res.body).toEqual({ totalBudget: 8_000_000, averageBudget: 2_666_666.67, torCount: 4, agencyCount: 3 });
  });

  it("combines agency and fiscal year", async () => {
    const res = await summary({ agency: TRAFFIC, fiscalYear: 2025 });

    expect(res.body).toEqual({ totalBudget: 2_000_000, averageBudget: 2_000_000, torCount: 1, agencyCount: 1 });
  });

  it("treats a blank fiscal year as all years", async () => {
    const res = await summary({ fiscalYear: "" });

    expect(res.body.torCount).toBe(6);
  });

  it("returns zeros when nothing matches", async () => {
    const res = await summary({ agency: "ไม่มีหน่วยงานนี้" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalBudget: 0, averageBudget: 0, torCount: 0, agencyCount: 0 });
  });

  it("never counts drafts", async () => {
    const res = await summary({ agency: "หน่วยงานฉบับร่าง" });

    expect(res.body.torCount).toBe(0);
  });

  it.each(["abc", "2025.5"])("rejects fiscalYear=%s with 400", async (fiscalYear) => {
    const res = await summary({ fiscalYear });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("fiscalYear must be a whole number");
  });
});

describe("GET /api/stats/breakdown", () => {
  function breakdown(query: Record<string, string | number> = {}) {
    return request(app).get("/api/stats/breakdown").query(query);
  }

  it("breaks the budget down by agency, largest first, with each one's share", async () => {
    const res = await breakdown();
    const byAgency = res.body.byAgency;

    expect(res.status).toBe(200);
    expect(byKey(byAgency, "agency")).toEqual(
      byKey(
        [
          { agency: TRAFFIC, totalBudget: 8_000_000, torCount: 2, share: 76.19 },
          { agency: MEDICAL, totalBudget: 1_000_000, torCount: 2, share: 9.52 },
          { agency: BANG_RAK, totalBudget: 1_000_000, torCount: 1, share: 9.52 },
          { agency: PATHUM_WAN, totalBudget: 500_000, torCount: 1, share: 4.76 },
        ],
        "agency",
      ),
    );
    expect(isDescending(byAgency.map((r: { totalBudget: number }) => r.totalBudget))).toBe(true);
  });

  it("breaks the budget down by category, including 'uncategorized'", async () => {
    const res = await breakdown();
    const byCategory = res.body.byCategory;

    expect(byKey(byCategory, "category")).toEqual([
      { category: "equipment", totalBudget: 1_000_000, torCount: 2, share: 9.52 },
      { category: "services", totalBudget: 2_500_000, torCount: 2, share: 23.81 },
      { category: "tender_invitation", totalBudget: 6_000_000, torCount: 1, share: 57.14 },
      { category: "uncategorized", totalBudget: 1_000_000, torCount: 1, share: 9.52 },
    ]);
    expect(isDescending(byCategory.map((r: { totalBudget: number }) => r.totalBudget))).toBe(true);
  });

  it("breaks the budget down by fiscal year, oldest first, leaving out TORs with no year", async () => {
    const res = await breakdown();

    expect(res.body.byFiscalYear).toEqual([
      { fiscalYear: 2025, totalBudget: 2_000_000, torCount: 1, share: 19.05 },
      { fiscalYear: 2026, totalBudget: 8_000_000, torCount: 4, share: 76.19 },
    ]);
  });

  it("works out shares within the filtered set", async () => {
    const res = await breakdown({ fiscalYear: 2026 });

    expect(byKey(res.body.byAgency, "agency")).toEqual(
      byKey(
        [
          { agency: TRAFFIC, totalBudget: 6_000_000, torCount: 1, share: 75 },
          { agency: MEDICAL, totalBudget: 1_000_000, torCount: 2, share: 12.5 },
          { agency: BANG_RAK, totalBudget: 1_000_000, torCount: 1, share: 12.5 },
        ],
        "agency",
      ),
    );
    expect(res.body.byFiscalYear).toEqual([{ fiscalYear: 2026, totalBudget: 8_000_000, torCount: 4, share: 100 }]);
  });

  it("gives a share of 0, not NaN, when the filtered budget is 0", async () => {
    await Tor.create({ ocid: "test-no-budget", title: "ไม่มีงบ", agency: "สำนักงานเขตดุสิต", status: "published", fiscalYear: 2026 });
    const res = await breakdown({ agency: "สำนักงานเขตดุสิต" });

    expect(res.body.byAgency).toEqual([{ agency: "สำนักงานเขตดุสิต", totalBudget: 0, torCount: 1, share: 0 }]);
  });

  it("returns empty lists when nothing matches", async () => {
    const res = await breakdown({ agency: "ไม่มีหน่วยงานนี้" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byAgency: [], byCategory: [], byFiscalYear: [] });
  });

  it("never counts drafts", async () => {
    const res = await breakdown();

    expect(res.body.byAgency.map((r: { agency: string }) => r.agency)).not.toContain("หน่วยงานฉบับร่าง");
    expect(res.body.byFiscalYear.map((r: { fiscalYear: number }) => r.fiscalYear)).not.toContain(2020);
  });

  it("rejects a fiscal year that isn't a whole number with 400", async () => {
    const res = await breakdown({ fiscalYear: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("fiscalYear must be a whole number");
  });
});
