import cron from "node-cron";
import { startEgpSyncSchedule } from "../../src/jobs/egpSyncSchedule.js";
import { startGprocurementSyncSchedule } from "../../src/jobs/gprocurementSyncSchedule.js";
import { runEgpSync } from "../../src/services/egpFetcher.js";
import { runGprocurementSync } from "../../src/services/gprocurementFetcher.js";

/**
 * The scheduled syncs (FR-07): off unless their flag is set, on the right
 * schedule in Bangkok time, and a slow run never overlaps the next one.
 * node-cron is mocked, so we call the scheduled function ourselves.
 */

jest.mock("node-cron", () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock("../../src/services/egpFetcher.js", () => ({ runEgpSync: jest.fn() }));
jest.mock("../../src/services/gprocurementFetcher.js", () => ({ runGprocurementSync: jest.fn() }));

const schedule = jest.mocked(cron.schedule);

/** The function the schedule would run, as passed to cron.schedule. */
function scheduledTask() {
  return schedule.mock.calls[0][1] as () => Promise<void>;
}

const ENV_KEYS = ["EGP_SYNC_ENABLED", "EGP_SYNC_CRON", "GPROCUREMENT_SYNC_ENABLED"];

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("Bangkok e-GP sync schedule", () => {
  it("is off unless EGP_SYNC_ENABLED is true", () => {
    startEgpSyncSchedule();

    expect(schedule).not.toHaveBeenCalled();
  });

  it("stays off for values other than true", () => {
    process.env.EGP_SYNC_ENABLED = "1";

    startEgpSyncSchedule();

    expect(schedule).not.toHaveBeenCalled();
  });

  it("runs daily at 06:15 Bangkok time when enabled", () => {
    process.env.EGP_SYNC_ENABLED = "true";

    startEgpSyncSchedule();

    expect(schedule).toHaveBeenCalledWith("15 6 * * *", expect.any(Function), {
      timezone: "Asia/Bangkok",
    });
  });

  it("uses EGP_SYNC_CRON when set", () => {
    process.env.EGP_SYNC_ENABLED = "true";
    process.env.EGP_SYNC_CRON = "0 12 * * *";

    startEgpSyncSchedule();

    expect(schedule.mock.calls[0][0]).toBe("0 12 * * *");
  });

  it("runs a recent sync marked as scheduled", async () => {
    process.env.EGP_SYNC_ENABLED = "true";
    jest.mocked(runEgpSync).mockResolvedValue({} as never);
    startEgpSyncSchedule();

    await scheduledTask()();

    expect(runEgpSync).toHaveBeenCalledWith("recent", "scheduled");
  });

  it("skips a run while the previous one is still going", async () => {
    process.env.EGP_SYNC_ENABLED = "true";
    let finish!: () => void;
    jest.mocked(runEgpSync).mockReturnValue(new Promise((resolve) => (finish = () => resolve({} as never))));
    startEgpSyncSchedule();
    const task = scheduledTask();

    const first = task();
    await task();
    finish();
    await first;

    expect(runEgpSync).toHaveBeenCalledTimes(1);
  });

  it("runs again after a failed run", async () => {
    process.env.EGP_SYNC_ENABLED = "true";
    jest.mocked(runEgpSync).mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue({} as never);
    startEgpSyncSchedule();
    const task = scheduledTask();

    await task();
    await task();

    expect(runEgpSync).toHaveBeenCalledTimes(2);
  });
});

describe("national e-GP sync schedule", () => {
  it("is off unless GPROCUREMENT_SYNC_ENABLED is true", () => {
    startGprocurementSyncSchedule();

    expect(schedule).not.toHaveBeenCalled();
  });

  it("runs every 20 minutes in office hours, Bangkok time, when enabled", () => {
    process.env.GPROCUREMENT_SYNC_ENABLED = "true";

    startGprocurementSyncSchedule();

    expect(schedule).toHaveBeenCalledWith("*/20 8-18 * * 1-5", expect.any(Function), {
      timezone: "Asia/Bangkok",
    });
  });

  it("runs a sync marked as scheduled", async () => {
    process.env.GPROCUREMENT_SYNC_ENABLED = "true";
    jest.mocked(runGprocurementSync).mockResolvedValue({} as never);
    startGprocurementSyncSchedule();

    await scheduledTask()();

    expect(runGprocurementSync).toHaveBeenCalledWith("scheduled");
  });

  it("is a valid cron expression", () => {
    process.env.GPROCUREMENT_SYNC_ENABLED = "true";
    startGprocurementSyncSchedule();
    const { validate } = jest.requireActual<typeof import("node-cron")>("node-cron");

    expect(validate(schedule.mock.calls[0][0] as string)).toBe(true);
  });
});