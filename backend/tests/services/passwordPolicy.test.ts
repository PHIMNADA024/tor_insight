import crypto from "node:crypto";
import { dictionary } from "@zxcvbn-ts/language-common";
import {
  checkPasswordLength,
  isPasswordCompromised,
  validateNewPassword,
} from "../../src/services/passwordPolicy.js";

const originalFetch = global.fetch;

function rangeFor(password: string, count = 1) {
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5), body: `${hash.slice(5)}:${count}\r\n` };
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("password policy", () => {
  it("enforces the 8–128 Unicode-character password range", () => {
    expect(checkPasswordLength("short")).toBe("too_short");
    expect(checkPasswordLength("é".repeat(64))).toBeUndefined();
    expect(checkPasswordLength("x".repeat(128))).toBeUndefined();
    expect(checkPasswordLength("x".repeat(129))).toBe("too_long");
    expect(checkPasswordLength("a-secure-password")).toBeUndefined();
  });

  it("uses a ranked common-password corpus larger than the required 3,000 entries", async () => {
    expect(dictionary["passwords-common"].filter((value) => [...value].length >= 8).length).toBeGreaterThanOrEqual(3_000);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await validateNewPassword("Password123")).toEqual({ ok: false, reason: "common" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects common passwords before making an external request", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await validateNewPassword("Password123")).toEqual({ ok: false, reason: "common" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only the first five SHA-1 characters with HIBP and detects a match", async () => {
    const { prefix, body } = rangeFor("distinctive-password");
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => body });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await isPasswordCompromised("distinctive-password")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({
        headers: expect.objectContaining({ "Add-Padding": "true" }),
        signal: expect.anything(),
      }),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain("distinctive-password");
  });

  it("fails closed when the HIBP check is unavailable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network unavailable")) as unknown as typeof fetch;

    expect(await validateNewPassword("distinctive-password")).toEqual({ ok: false, reason: "unavailable" });
  });
});
