import { NonRetryableError, withRetry } from "../../src/services/http.js";

/**
 * withRetry, which every fetcher uses for downloads (FR-07):
 * retries failures with growing delays, gives up on NonRetryableError.
 * A 10 ms base delay keeps the tests fast.
 */

const BASE_DELAY_MS = 10;

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  // withRetry logs each retry; keep the test output clean.
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("withRetry", () => {
  it("returns the result without retrying when the first attempt works", async () => {
    const fn = jest.fn().mockResolvedValue("ok");

    await expect(withRetry(fn, 3, BASE_DELAY_MS)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("retries after failures and returns the result once an attempt works", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    await expect(withRetry(fn, 3, BASE_DELAY_MS)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt and throws its error", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(new Error("last"));

    await expect(withRetry(fn, 3, BASE_DELAY_MS)).rejects.toThrow("last");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a NonRetryableError", async () => {
    const fn = jest.fn().mockRejectedValue(new NonRetryableError("No file available (HTTP 404)"));

    await expect(withRetry(fn, 3, BASE_DELAY_MS)).rejects.toBeInstanceOf(NonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("doubles the delay between attempts", async () => {
    const timeoutSpy = jest.spyOn(global, "setTimeout");
    const fn = jest.fn().mockRejectedValue(new Error("down"));

    await expect(withRetry(fn, 3, BASE_DELAY_MS)).rejects.toThrow("down");

    const delays = timeoutSpy.mock.calls.map(([, ms]) => ms);
    expect(delays).toEqual([BASE_DELAY_MS, BASE_DELAY_MS * 2]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});