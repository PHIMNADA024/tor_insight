import { Lock, LockBusyError, withLock } from "../../src/services/lock.js";
import { clearTestDatabase, connectTestDatabase, disconnectTestDatabase } from "../helpers/database.js";

/**
 * The per-key lock that makes "check, then write" one step (ASVS V15.4.2),
 * against a throwaway in-memory MongoDB.
 */

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

/** A promise the test resolves when it wants a lock holder to finish. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("withLock", () => {
  it("runs the function and returns its result", async () => {
    const result = await withLock("test:a", async () => 42);

    expect(result).toBe(42);
  });

  it("releases the lock afterwards, so it can be taken again", async () => {
    await withLock("test:a", async () => undefined);

    expect(await Lock.countDocuments({ key: "test:a" })).toBe(0);
    await expect(withLock("test:a", async () => "again")).resolves.toBe("again");
  });

  it("refuses a second holder while the first still holds it", async () => {
    const hold = deferred();
    const first = withLock("test:a", () => hold.promise);
    // Let the first one take the lock.
    await new Promise((r) => setTimeout(r, 50));

    await expect(withLock("test:a", async () => "second")).rejects.toBeInstanceOf(LockBusyError);

    hold.resolve();
    await first;
  });

  it("lets only one of many parallel callers in", async () => {
    const hold = deferred();
    const all = Promise.allSettled(
      Array.from({ length: 5 }, () => withLock("test:a", () => hold.promise.then(() => "ran"))),
    );
    // While the winner holds the lock, all the others are refused.
    await new Promise((r) => setTimeout(r, 100));
    hold.resolve();

    const settled = await all;
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((r) => r.status === "rejected" && r.reason instanceof LockBusyError)).toHaveLength(4);
  });

  it("doesn't block other keys", async () => {
    const hold = deferred();
    const first = withLock("test:a", () => hold.promise);
    await new Promise((r) => setTimeout(r, 50));

    await expect(withLock("test:b", async () => "b")).resolves.toBe("b");

    hold.resolve();
    await first;
  });

  it("releases the lock when the function throws", async () => {
    await expect(
      withLock("test:a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await Lock.countDocuments({ key: "test:a" })).toBe(0);
  });

  it("takes over a lock that expired, e.g. after a crash", async () => {
    await Lock.create({ key: "test:a", token: "crashed", expiresAt: new Date(Date.now() - 1000) });

    await expect(withLock("test:a", async () => "taken")).resolves.toBe("taken");
  });

  it("doesn't remove a newer holder's lock when an expired holder finishes", async () => {
    const holdA = deferred();
    // A's lock expires after 1 ms, while A is still working.
    const a = withLock("test:a", () => holdA.promise, 1);
    await new Promise((r) => setTimeout(r, 50));

    const holdB = deferred();
    const b = withLock("test:a", () => holdB.promise);
    await new Promise((r) => setTimeout(r, 50));

    holdA.resolve();
    await a;

    // B still holds it.
    expect(await Lock.countDocuments({ key: "test:a" })).toBe(1);
    await expect(withLock("test:a", async () => "c")).rejects.toBeInstanceOf(LockBusyError);

    holdB.resolve();
    await b;
  });
});