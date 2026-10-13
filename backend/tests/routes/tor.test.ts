import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../src/models/tor.js";
import torRoutes from "../../src/routes/tor.js";

/**
 * GET /api/tors against a throwaway in-memory MongoDB, so the real filters
 * (including the bidding-status $expr) run as they do in production.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 12:00 Bangkok time, `days` from today: an e-GP deadline with an exact time. */
function deadlineIn(days: number) {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(5, 0, 0, 0);
  return date;
}

/** Today at UTC midnight: a BMA date-only deadline, open through the whole day. */
function todayDateOnly() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

const app = express();
app.use("/api/tors", torRoutes);

let mongo: MongoMemoryServer;

beforeAll(async () => {
  // The first run downloads a MongoDB binary, which can take a while.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  await Tor.create([
    {
      ocid: "egp-open-cctv",
      title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      budgetAmount: 5_000_000,
      fiscalYear: 2026,
      publishedDate: new Date("2026-10-10"),
      tenderStartDate: new Date("2026-10-10"),
      submissionDeadline: deadlineIn(7),
      status: "published",
    },
    {
      ocid: "bma-closed-computer",
      title: "ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ",
      agency: "สำนักการแพทย์",
      category: "equipment",
      budgetAmount: 1_000_000,
      fiscalYear: 2025,
      publishedDate: new Date("2025-05-01"),
      submissionDeadline: deadlineIn(-30),
      status: "published",
    },
    {
      // "CCTV" only in the description, to check relevance ranking.
      ocid: "egp-upcoming-network",
      title: "จ้างบำรุงรักษาระบบเครือข่ายสื่อสาร",
      description: "รวมการเชื่อมโยงสัญญาณ CCTV",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      budgetAmount: 9_000_000,
      fiscalYear: 2026,
      publishedDate: new Date("2026-10-12"),
      biddingStage: "upcoming",
      status: "published",
    },
    {
      // Deadline still ahead, but a contract is signed: closed.
      ocid: "bma-awarded-software",
      title: "ซื้อลิขสิทธิ์ซอฟต์แวร์",
      agency: "สำนักงานเขตบางรัก",
      category: "materials",
      budgetAmount: 300_000,
      fiscalYear: 2026,
      publishedDate: new Date("2026-09-01"),
      submissionDeadline: deadlineIn(3),
      contracts: [{ title: "สัญญาซื้อลิขสิทธิ์" }],
      status: "published",
    },
    {
      ocid: "bma-date-only-today",
      title: "จ้างพัฒนาระบบสารสนเทศ",
      agency: "สำนักงานเขตบางรัก",
      category: "services",
      budgetAmount: 2_000_000,
      fiscalYear: 2026,
      publishedDate: new Date("2026-09-15"),
      submissionDeadline: todayDateOnly(),
      status: "published",
    },
    {
      // Drafts never appear in search.
      ocid: "egp-draft-cctv",
      title: "จ้างติดตั้งกล้อง CCTV (ฉบับร่าง)",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      budgetAmount: 100_000,
      fiscalYear: 2026,
      publishedDate: new Date("2026-10-13"),
      status: "draft",
    },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

/** Calls the search API and returns the matching ocid-less titles in order. */
async function search(query: Record<string, string | number> = {}) {
  const res = await request(app).get("/api/tors").query(query);
  return { res, titles: (res.body.results ?? []).map((t: { title: string }) => t.title) as string[] };
}

describe("GET /api/tors", () => {
  it("returns published TORs only, newest first, with pagination", async () => {
    const { res, titles } = await search();

    expect(res.status).toBe(200);
    expect(titles).toHaveLength(5);
    expect(titles).not.toContain("จ้างติดตั้งกล้อง CCTV (ฉบับร่าง)");
    expect(titles[0]).toBe("จ้างบำรุงรักษาระบบเครือข่ายสื่อสาร");
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
  });

  it("returns the fields the search page needs", async () => {
    const { res } = await search({ keyword: "ลิขสิทธิ์" });

    expect(res.body.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: "ซื้อลิขสิทธิ์ซอฟต์แวร์",
        agency: "สำนักงานเขตบางรัก",
        category: "materials",
        budgetAmount: 300_000,
        fiscalYear: 2026,
        hasWinner: true,
      }),
    );
  });

  describe("keyword", () => {
    it("matches part of a Thai title", async () => {
      const { titles } = await search({ keyword: "คอมพิวเตอร์" });
      expect(titles).toEqual(["ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ"]);
    });

    it("matches Thai digits against stored Arabic digits", async () => {
      const { titles } = await search({ keyword: "๘ รายการ" });
      expect(titles).toEqual(["ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ"]);
    });

    it("is case-insensitive", async () => {
      const { titles } = await search({ keyword: "cctv" });
      expect(titles).toHaveLength(2);
    });

    it("ranks title matches above description-only matches", async () => {
      const { titles } = await search({ keyword: "CCTV" });
      expect(titles).toEqual([
        "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
        "จ้างบำรุงรักษาระบบเครือข่ายสื่อสาร",
      ]);
    });

    it("treats regex characters literally", async () => {
      const { res, titles } = await search({ keyword: "(CCTV)" });
      expect(res.status).toBe(200);
      expect(titles).toEqual(["จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)"]);

      const unbalanced = await search({ keyword: "((" });
      expect(unbalanced.res.status).toBe(200);
      expect(unbalanced.titles).toEqual([]);
    });
  });

  describe("filters", () => {
    it("filters by agency", async () => {
      const { titles } = await search({ agency: "สำนักงานเขตบางรัก" });
      expect(titles.sort()).toEqual(["จ้างพัฒนาระบบสารสนเทศ", "ซื้อลิขสิทธิ์ซอฟต์แวร์"].sort());
    });

    it("filters by category", async () => {
      const { titles } = await search({ category: "equipment" });
      expect(titles).toEqual(["ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ"]);
    });

    it("filters by fiscal year", async () => {
      const { titles } = await search({ fiscalYear: 2025 });
      expect(titles).toEqual(["ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ"]);
    });

    it("filters by budget range, inclusive", async () => {
      const { titles } = await search({ budgetMin: 1_000_000, budgetMax: 5_000_000 });
      expect(titles.sort()).toEqual(
        [
          "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)",
          "ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ",
          "จ้างพัฒนาระบบสารสนเทศ",
        ].sort(),
      );
    });

    it("combines filters", async () => {
      const { titles } = await search({ agency: "สำนักการจราจรและขนส่ง", keyword: "CCTV", budgetMax: 6_000_000 });
      expect(titles).toEqual(["จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)"]);
    });
  });

  describe("bidding status", () => {
    it("open: deadline ahead and no winner, including a date-only deadline today", async () => {
      const { titles } = await search({ bidding: "open" });
      expect(titles.sort()).toEqual(
        ["จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV)", "จ้างพัฒนาระบบสารสนเทศ"].sort(),
      );
    });

    it("upcoming: draft TOR out, no deadline yet", async () => {
      const { titles } = await search({ bidding: "upcoming" });
      expect(titles).toEqual(["จ้างบำรุงรักษาระบบเครือข่ายสื่อสาร"]);
    });

    it("closed: deadline passed, or a winner before the deadline", async () => {
      const { titles } = await search({ bidding: "closed" });
      expect(titles.sort()).toEqual(["ซื้อครุภัณฑ์คอมพิวเตอร์ 8 รายการ", "ซื้อลิขสิทธิ์ซอฟต์แวร์"].sort());
    });
  });

  describe("sorting and paging", () => {
    it("sorts by budget, highest first", async () => {
      const { res } = await search({ sort: "budget" });
      const budgets = res.body.results.map((t: { budgetAmount: number }) => t.budgetAmount);
      expect(budgets).toEqual([9_000_000, 5_000_000, 2_000_000, 1_000_000, 300_000]);
    });

    it("pages through results", async () => {
      const first = await search({ sort: "budget", limit: 2, page: 1 });
      const third = await search({ sort: "budget", limit: 2, page: 3 });

      expect(first.res.body.results).toHaveLength(2);
      expect(first.res.body.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
      expect(third.res.body.results.map((t: { budgetAmount: number }) => t.budgetAmount)).toEqual([300_000]);
    });

    it("caps limit at 100", async () => {
      const { res } = await search({ limit: 1000 });
      expect(res.body.pagination.limit).toBe(100);
    });

    it("returns an empty page past the end", async () => {
      const { res } = await search({ page: 99 });
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
      expect(res.body.pagination.total).toBe(5);
    });
  });

  describe("invalid input", () => {
    it.each([
      [{ sort: "price" }, "sort must be one of: date, budget, relevance"],
      [{ fiscalYear: "abc" }, "fiscalYear must be a number"],
      [{ budgetMin: "x" }, "budgetMin must be a number"],
      [{ budgetMax: "x" }, "budgetMax must be a number"],
      [{ budgetMin: 5, budgetMax: 1 }, "budgetMin must not exceed budgetMax"],
      [{ page: "two" }, "page must be a number"],
      [{ limit: "ten" }, "limit must be a number"],
      [{ bidding: "soon" }, "bidding must be one of: open, upcoming, closed"],
    ])("rejects %j with 400", async (query, message) => {
      const { res } = await search(query);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(message);
    });
  });
});
