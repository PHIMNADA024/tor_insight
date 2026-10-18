import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, SyncLog } from "../../src/models/index.js";
import { runBmaSync } from "../../src/services/bmaFetcher.js";
import { notifyMatchingUsers } from "../../src/jobs/notify-matches.js";

/**
 * BMA OCDS sync against a throwaway in-memory MongoDB (FR-07, FR-08).
 * Each test writes a small release file and runs the real sync on it.
 */

// Never send real match emails from a test.
jest.mock("../../src/jobs/notify-matches.js", () => ({
  notifyMatchingUsers: jest.fn().mockResolvedValue({ usersNotified: 0 }),
}));

const TENDER_ID = "69019999999";

/** A valid IT release; tests override the parts they care about. */
function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    ocid: "ocds-test-computers",
    date: "2026-10-01T00:00:00Z",
    buyer: { id: "B1", name: "สำนักการจราจรและขนส่ง" },
    planning: {
      budget: {
        // Starts with 69 (FY2569 = 2026), ends with group 0501 (equipment).
        id: "6912345050101001",
        project: "ซื้อเครื่องคอมพิวเตอร์ ๒ เครื่อง",
        amount: { amount: 50_000, currency: "THB" },
      },
    },
    tender: {
      id: TENDER_ID,
      items: [
        {
          description: "เครื่องคอมพิวเตอร์",
          classification: { id: "43211507", description: "Desktop computers" },
          quantity: 2,
          unit: { name: "เครื่อง" },
        },
      ],
      value: { amount: 48_000 },
      procurementMethodDetails: "e-bidding",
      tenderPeriod: { startDate: "2569-01-10", endDate: "2569-01-20" },
    },
    awards: [{ suppliers: [{ id: "1234567890123", name: "บริษัท ทดสอบ จำกัด" }] }],
    contracts: [{ title: "สัญญาซื้อคอมพิวเตอร์", value: { amount: 48_000 } }],
    ...overrides,
  };
}

let mongo: MongoMemoryServer;
let tmpDir: string;
let fileCount = 0;

/** Writes releases to a temp file the way BMA ships them. */
function writeReleases(releases: unknown[]): string {
  const filePath = path.join(tmpDir, `releases-${fileCount++}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ releases }));
  return filePath;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bma-test-"));
});

beforeEach(async () => {
  await Tor.deleteMany({});
  await SyncLog.deleteMany({});
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("mapping BMA releases", () => {
  it("stores an IT release as a published TOR with the right fields", async () => {
    const counts = await runBmaSync(writeReleases([makeRelease()]));
    expect(counts).toMatchObject({ inserted: 1, updated: 0, skipped: 0, read: 1 });

    const tor = await Tor.findOne({ ocid: "ocds-test-computers" }).lean();
    expect(tor).toMatchObject({
      sourceId: "bma",
      status: "published",
      // Thai digits are stored as Arabic digits.
      title: "ซื้อเครื่องคอมพิวเตอร์ 2 เครื่อง",
      agency: "สำนักการจราจรและขนส่ง",
      category: "equipment",
      itCategory: "it_equipment",
      fiscalYear: 2026,
      budgetAmount: 50_000,
      egpProjectNumber: TENDER_ID,
      suppliers: ["บริษัท ทดสอบ จำกัด"],
    });
    // Buddhist-era dates are converted: 2569-01-20 is 2026-01-20.
    expect(tor?.submissionDeadline?.toISOString()).toMatch(/^2026-01-20/);
  });

  it("never stores supplier ID numbers", async () => {
    await runBmaSync(writeReleases([makeRelease()]));

    const tor = await Tor.findOne({ ocid: "ocds-test-computers" }).lean();
    expect(JSON.stringify(tor)).not.toContain("1234567890123");
  });

  it("tags software by its UNSPSC code", async () => {
    const release = makeRelease({
      tender: {
        id: TENDER_ID,
        items: [{ classification: { id: "43231500", description: "Software" } }],
      },
    });
    await runBmaSync(writeReleases([release]));

    const tor = await Tor.findOne({ ocid: "ocds-test-computers" }).lean();
    expect(tor?.itCategory).toBe("software");
  });

  it("reads the budget from the non-standard 'value' field", async () => {
    const release = makeRelease({
      planning: {
        budget: {
          id: "6912345050101001",
          project: "ซื้อเครื่องพิมพ์",
          value: { amount: 70_000 },
        },
      },
    });
    await runBmaSync(writeReleases([release]));

    const tor = await Tor.findOne({ ocid: "ocds-test-computers" }).lean();
    expect(tor?.budgetAmount).toBe(70_000);
  });

  it("skips non-IT releases, individual hires and releases without a title", async () => {
    const notIt = makeRelease({
      ocid: "ocds-test-road",
      tender: { items: [{ classification: { id: "72101500" } }] },
    });
    const individualHire = makeRelease({
      ocid: "ocds-test-hire",
      contracts: [{ title: "จ้างเหมาบริการเป็นรายบุคคล ตำแหน่งครูฝึก" }],
    });
    const noTitle = makeRelease({
      ocid: "ocds-test-no-title",
      planning: { budget: { id: "6912345050101001" } },
    });

    const counts = await runBmaSync(writeReleases([notIt, individualHire, noTitle]));

    expect(counts).toMatchObject({ inserted: 0, skipped: 3, read: 3 });
    expect(await Tor.countDocuments()).toBe(0);
  });
});

describe("duplicate detection", () => {
  it("does not create duplicates when the same file is synced twice", async () => {
    const filePath = writeReleases([makeRelease()]);

    await runBmaSync(filePath);
    const second = await runBmaSync(filePath);

    expect(second).toMatchObject({ inserted: 0, updated: 0 });
    expect(await Tor.countDocuments({ ocid: "ocds-test-computers" })).toBe(1);
  });

  it("updates a changed record but keeps its first published date", async () => {
    await runBmaSync(writeReleases([makeRelease()]));

    const changed = makeRelease({
      date: "2026-10-02T00:00:00Z",
      planning: {
        budget: {
          id: "6912345050101001",
          project: "ซื้อเครื่องคอมพิวเตอร์ ๒ เครื่อง",
          amount: { amount: 55_000, currency: "THB" },
        },
      },
    });
    const counts = await runBmaSync(writeReleases([changed]));

    expect(counts).toMatchObject({ inserted: 0, updated: 1 });
    const tor = await Tor.findOne({ ocid: "ocds-test-computers" }).lean();
    expect(tor?.budgetAmount).toBe(55_000);
    expect(tor?.publishedDate?.toISOString()).toMatch(/^2026-10-01/);
    expect(await Tor.countDocuments()).toBe(1);
  });

  it("skips a new BMA release that e-GP already brought in (FR-08)", async () => {
    await Tor.create({
      ocid: "egp-69019999999",
      sourceId: "egp",
      egpProjectNumber: TENDER_ID,
      title: "ซื้อเครื่องคอมพิวเตอร์ 2 เครื่อง",
      agency: "สำนักการจราจรและขนส่ง",
      category: "tender_invitation",
      status: "published",
    });

    const counts = await runBmaSync(writeReleases([makeRelease()]));

    expect(counts).toMatchObject({ inserted: 0, skipped: 1 });
    expect(await Tor.countDocuments({ egpProjectNumber: TENDER_ID })).toBe(1);
    expect(await Tor.exists({ sourceId: "bma" })).toBeNull();
  });
});

describe("sync log", () => {
  it("logs a successful run with its counts and notifies about new TORs", async () => {
    await runBmaSync(writeReleases([makeRelease()]), "manual");

    const log = await SyncLog.findOne({ sourceId: "bma" }).lean();
    expect(log).toMatchObject({
      status: "success",
      trigger: "manual",
      recordsRead: 1,
      recordsInserted: 1,
    });
    expect(notifyMatchingUsers).toHaveBeenCalledTimes(1);
  });

  it("logs a failed run with its error message", async () => {
    await expect(runBmaSync(path.join(tmpDir, "missing.json"))).rejects.toThrow();

    const log = await SyncLog.findOne({ sourceId: "bma" }).lean();
    expect(log?.status).toBe("failed");
    expect(log?.errorMessage).toMatch(/ENOENT/);
  });
});