import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../src/models/tor.js";
import torRoutes from "../../src/routes/tor.js";

/**
 * GET /api/tors/stats and GET /api/tors/:id against a throwaway
 * in-memory MongoDB (FR-06, #71, #73, #56).
 */

const app = express();
app.use("/api/tors", torRoutes);

let mongo: MongoMemoryServer;
let publishedId: string;
let draftId: string;

beforeAll(async () => {
  // The first run downloads a MongoDB binary, which can take a while.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const docs = await Tor.create([
    {
      ocid: "stats-traffic-cctv",
      title: "จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      budgetAmount: 3_000_000,
      status: "published",
    },
    {
      ocid: "stats-medical-network",
      title: "จ้างปรับปรุงระบบเครือข่าย",
      agency: "สำนักการแพทย์",
      category: "tender_invitation",
      budgetAmount: 1_000_000,
      status: "published",
    },
    {
      ocid: "stats-traffic-computers",
      title: "ซื้อครุภัณฑ์คอมพิวเตอร์",
      agency: "สำนักการจราจรและขนส่ง",
      category: "equipment",
      budgetAmount: 2_000_000,
      status: "published",
    },
    {
      // Published but uncategorized and without a budget.
      ocid: "stats-education-unknown",
      title: "โครงการที่ยังไม่จัดหมวดหมู่",
      agency: "สำนักการศึกษา",
      category: "uncategorized",
      status: "published",
    },
    {
      // A draft must never show up in stats or on the detail page.
      ocid: "stats-health-draft",
      title: "ร่างโครงการ",
      agency: "สำนักอนามัย",
      category: "equipment",
      budgetAmount: 9_000_000,
      status: "draft",
    },
  ]);

  publishedId = docs[0]._id.toString();
  draftId = docs[4]._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("GET /api/tors/stats", () => {
  it("counts every published TOR, including uncategorized, but no drafts", async () => {
    const res = await request(app).get("/api/tors/stats");

    expect(res.status).toBe(200);
    expect(res.body.torCount).toBe(4);
  });

  it("sums budgets of published TORs only", async () => {
    const res = await request(app).get("/api/tors/stats");

    // 3M + 1M + 2M; the uncategorized TOR has no budget, the draft is excluded.
    expect(res.body.totalBudget).toBe(6_000_000);
  });

  it("averages only TORs that have a budget", async () => {
    const res = await request(app).get("/api/tors/stats");

    // (3M + 1M + 2M) / 3, not / 4.
    expect(res.body.avgBudget).toBe(2_000_000);
  });

  it("counts distinct agencies of published TORs", async () => {
    const res = await request(app).get("/api/tors/stats");

    // Traffic (twice), medical, education. The draft's agency is not counted.
    expect(res.body.agencyCount).toBe(3);
  });

  it("lists categories without uncategorized, largest first", async () => {
    const res = await request(app).get("/api/tors/stats");

    expect(res.body.categories).toEqual([
      { category: "tender_invitation", count: 2, totalBudget: 4_000_000 },
      { category: "equipment", count: 1, totalBudget: 2_000_000 },
    ]);
  });

  it("category counts add up to the total minus uncategorized", async () => {
    const res = await request(app).get("/api/tors/stats");
    const sum = res.body.categories.reduce(
      (total: number, c: { count: number }) => total + c.count,
      0,
    );

    expect(sum).toBe(res.body.torCount - 1);
  });
});

describe("GET /api/tors/:id", () => {
  it("returns a published TOR with its details", async () => {
    const res = await request(app).get(`/api/tors/${publishedId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: publishedId,
      ocid: "stats-traffic-cctv",
      agency: "สำนักการจราจรและขนส่ง",
      budgetAmount: 3_000_000,
    });
    expect(res.body.items).toEqual([]);
  });

  it("hides drafts with 404", async () => {
    const res = await request(app).get(`/api/tors/${draftId}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an id that does not exist", async () => {
    const unknownId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/tors/${unknownId}`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid id", async () => {
    const res = await request(app).get("/api/tors/not-an-id");

    expect(res.status).toBe(400);
  });
});