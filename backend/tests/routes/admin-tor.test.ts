import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { AdminActionLog } from "../../src/models/adminActionLog.js";
import { Feedback } from "../../src/models/feedback.js";
import { Tor } from "../../src/models/tor.js";
import { User } from "../../src/models/user.js";
import adminTorRoutes from "../../src/routes/admin-tor.js";
import { signAccessToken } from "../../src/services/token.js";
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/database.js";

const app = express();
app.use(express.json());
app.use("/api/admin", adminTorRoutes);

let adminId: mongoose.Types.ObjectId;
let adminToken: string;
let regularToken: string;

async function createUser(email: string, role: "end_user" | "admin" = "end_user") {
  return User.create({
    name: role === "admin" ? "TOR Admin" : "Regular User",
    email,
    passwordHash: "not-used-here",
    role,
    isEmailVerified: true,
  });
}

async function createTor(options: {
  ocid?: string;
  title?: string;
  agency?: string;
  category?: string;
  status?: "draft" | "published" | "archived";
} = {}) {
  return Tor.create({
    ocid: options.ocid ?? `admin-tor-${new mongoose.Types.ObjectId()}`,
    title: options.title ?? "Test software procurement",
    agency: options.agency ?? "Digital Services Agency",
    category: options.category ?? "software",
    status: options.status ?? "published",
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
  const admin = await createUser("tor-admin@example.test", "admin");
  const regular = await createUser("tor-user@example.test");
  adminId = admin._id;
  adminToken = signAccessToken({ id: adminId.toString(), role: admin.role });
  regularToken = signAccessToken({ id: regular._id.toString(), role: regular.role });
});

describe("admin TOR authorization", () => {
  it("rejects non-admin users", async () => {
    const response = await request(app)
      .get("/api/admin/tors")
      .set("Authorization", `Bearer ${regularToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required");
  });
});

describe("GET /api/admin/tors/reported", () => {
  it("returns TORs with open linked feedback and excludes resolved or unrelated feedback", async () => {
    const reportedTor = await createTor({ title: "Reported network project" });
    const secondReportedTor = await createTor({ title: "Reported software project" });
    const unreportedTor = await createTor({ title: "No open report" });
    const submitter = await createUser("reporter@example.test");

    const openFeedback = await Feedback.create({
      userId: submitter._id,
      torId: reportedTor._id,
      category: "incorrect_info",
      description: "The budget value looks incorrect",
      status: "pending",
    });
    await Feedback.create({
      userId: submitter._id,
      torId: reportedTor._id,
      category: "outdated_info",
      description: "This linked feedback is being reviewed",
      status: "reviewed",
    });
    await Feedback.create({
      userId: submitter._id,
      torId: reportedTor._id,
      category: "broken_link",
      description: "This report is already resolved",
      status: "resolved",
    });
    await Feedback.create({
      userId: submitter._id,
      category: "app_feedback",
      description: "General feedback has no TOR link",
      status: "pending",
    });
    await Feedback.create({
      userId: submitter._id,
      torId: secondReportedTor._id,
      category: "incorrect_info",
      description: "Another TOR report",
      status: "pending",
    });

    const response = await request(app)
      .get("/api/admin/tors/reported")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(2);

    const first = response.body.results.find((item: { tor: { _id: string } }) => item.tor._id === reportedTor._id.toString());
    expect(first.tor.title).toBe("Reported network project");
    expect(first.feedback).toHaveLength(2);
    expect(first.feedback.map((item: { _id: string }) => item._id)).toContain(openFeedback._id.toString());
    expect(first.feedback.every((item: { status: string }) => item.status !== "resolved")).toBe(true);
    expect(response.body.results.some((item: { tor: { _id: string } }) => item.tor._id === unreportedTor._id.toString())).toBe(false);
  });
});

describe("GET /api/admin/tors filters", () => {
  it("filters TORs by category and searches title or agency", async () => {
    await createTor({ title: "Cloud platform procurement", agency: "Digital Services Agency", category: "software" });
    await createTor({ title: "Office equipment purchase", agency: "Digital Services Agency", category: "equipment" });
    await createTor({ title: "Network equipment project", agency: "Transport Office", category: "equipment" });

    const searchResponse = await request(app)
      .get("/api/admin/tors")
      .query({ category: "equipment", search: "Transport" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.tors).toHaveLength(1);
    expect(searchResponse.body.tors[0]).toMatchObject({
      title: "Network equipment project",
      agency: "Transport Office",
      category: "equipment",
    });
    expect(searchResponse.body.pagination.total).toBe(1);
  });
});

describe("PUT /api/admin/tors/:id", () => {
  it("updates only allowed fields and records the before/after changes", async () => {
    const tor = await createTor({ title: "Original title", status: "draft" });

    const response = await request(app)
      .put(`/api/admin/tors/${tor._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Corrected title",
        agency: "Updated Agency",
        budgetAmount: 250_000,
        status: "published",
        ocid: "client-attempted-ocid-change",
      });

    expect(response.status).toBe(200);
    expect(response.body.tor).toMatchObject({
      title: "Corrected title",
      agency: "Updated Agency",
      budgetAmount: 250_000,
      status: "draft",
      ocid: tor.ocid,
    });

    const saved = await Tor.findById(tor._id);
    expect(saved).toMatchObject({ title: "Corrected title", agency: "Updated Agency", status: "draft" });

    const log = await AdminActionLog.findOne({ action: "tor.edit", targetId: tor._id });
    expect(log).toMatchObject({
      actorId: adminId,
      targetType: "Tor",
      metadata: {
        title: { from: "Original title", to: "Corrected title" },
        agency: { from: "Digital Services Agency", to: "Updated Agency" },
        budgetAmount: { to: 250_000 },
      },
    });
    expect(log?.metadata).not.toHaveProperty("status");
    expect(log?.metadata).not.toHaveProperty("ocid");
  });
});

describe("TOR status actions", () => {
  it("archives a TOR and logs the status transition", async () => {
    const tor = await createTor({ status: "published" });

    const response = await request(app)
      .post(`/api/admin/tors/${tor._id}/archive`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.tor.status).toBe("archived");
    expect((await Tor.findById(tor._id))?.status).toBe("archived");
    expect(await AdminActionLog.findOne({
      action: "tor.status_change",
      targetId: tor._id,
      metadata: { from: "published", to: "archived" },
    })).not.toBeNull();
  });

  it("publishes a draft TOR and logs the status transition", async () => {
    const tor = await createTor({ status: "draft" });

    const response = await request(app)
      .post(`/api/admin/tors/${tor._id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.tor.status).toBe("published");
    expect((await Tor.findById(tor._id))?.status).toBe("published");
    expect(await AdminActionLog.findOne({
      action: "tor.status_change",
      targetId: tor._id,
      metadata: { from: "draft", to: "published" },
    })).not.toBeNull();
  });
});
