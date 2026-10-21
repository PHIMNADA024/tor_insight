import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, SyncLog } from "../../src/models/index.js";
import { currentFiscalYear, syncRecentFiscalYears } from "../../src/services/bmaFetcher.js";

/**
 * BMA sync across fiscal years (FR-07). BMA's server is faked with a mocked
 * fetch, so nothing is downloaded.
 */

jest.mock("../../src/jobs/notify-matches.js", () => ({
  notifyMatchingUsers: jest.fn().mockResolvedValue({ usersNotified: 0 }),
}));

/** 18 Oct 2026 falls in FY2570, so the previous year is FY2569. */
const TODAY = new Date("2026-10-18T12:00:00+07:00");

/** One IT release for a fiscal year (budget ids start with the Buddhist year). */
function releaseFor(fiscalYear: number) {
  return {
    ocid: `ocds-test-fy${fiscalYear}`,
    buyer: { name: "สำนักการจราจรและขนส่ง" },
    planning: {
      budget: {
        id: `${String(fiscalYear).slice(2)}12345050101001`,
        project: `ซื้อคอมพิวเตอร์ ปีงบประมาณ ${fiscalYear}`,
        amount: { amount: 10_000 },
      },
    },
    tender: { items: [{ classification: { id: "43211507" } }] },
  };
}

/** Answers like BMA: a file for each year in `published`, 404 for the rest. */
function fakeBma(published: number[]) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const year = Number(String(input).match(/ocds_releases_(\d{4})\.json/)?.[1]);
    if (!published.includes(year)) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify({ releases: [releaseFor(year)] }), { status: 200 });
  });
}

let mongo: MongoMemoryServer;
let tmpDir: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bma-years-"));
});

beforeEach(async () => {
  await Tor.deleteMany({});
  await SyncLog.deleteMany({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("currentFiscalYear", () => {
  it("starts a new fiscal year on 1 October", () => {
    expect(currentFiscalYear(new Date(2026, 8, 30))).toBe(2569);
    expect(currentFiscalYear(new Date(2026, 9, 1))).toBe(2570);
  });
});

describe("syncRecentFiscalYears", () => {
  it("syncs both the previous and the current fiscal year", async () => {
    const fetchMock = fakeBma([2569, 2570]);

    const counts = await syncRecentFiscalYears("scheduled", { today: TODAY, destDir: tmpDir });

    expect(counts).toMatchObject({ inserted: 2, read: 2 });
    expect(await Tor.countDocuments()).toBe(2);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes("ocds_releases_2569.json"))).toBe(true);
    expect(urls.some((u) => u.includes("ocds_releases_2570.json"))).toBe(true);
  });

  it("skips the current year while BMA has not published it yet", async () => {
    fakeBma([2569]);

    const counts = await syncRecentFiscalYears("scheduled", { today: TODAY, destDir: tmpDir });

    expect(counts).toMatchObject({ inserted: 1, read: 1 });
    const log = await SyncLog.findOne({ sourceId: "bma" }).lean();
    expect(log?.status).toBe("success");
  });

  it("fails and logs the error when the previous year is missing too", async () => {
    fakeBma([]);

    await expect(
      syncRecentFiscalYears("scheduled", { today: TODAY, destDir: tmpDir }),
    ).rejects.toThrow("FY2569");

    const log = await SyncLog.findOne({ sourceId: "bma" }).lean();
    expect(log?.status).toBe("failed");
    expect(log?.errorMessage).toMatch(/FY2569/);
  });
});