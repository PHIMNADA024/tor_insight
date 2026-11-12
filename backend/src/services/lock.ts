/**
 * A short lock in MongoDB, so a check and the write that depends on it run
 * as one step (ASVS V15.4.2). Without it, two requests at the same moment can
 * both pass a check like "fewer than 10 today" before either one writes.
 *
 * Taking the lock is a single atomic operation: a unique index on `key` lets
 * only one request hold it. A lock left behind by a crash expires on its own.
 */
import { randomUUID } from "node:crypto";
import { Schema, model } from "mongoose";

const lockSchema = new Schema({
  key: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
// MongoDB removes expired locks by itself (checked about once a minute).
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

export const Lock = model("Lock", lockSchema);

/** Another request holds the lock right now. */
export class LockBusyError extends Error {
  constructor(key: string) {
    super(`Lock is busy: ${key}`);
  }
}

const DEFAULT_TTL_MS = 10_000;

/**
 * Runs `fn` while holding the lock `key`. Throws LockBusyError at once if
 * another request holds it; never waits.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  // The unique index must exist before the first lock, or two could slip in.
  await Lock.init();

  const token = randomUUID();
  const now = new Date();
  try {
    // Takes a free or expired lock. If one is held, the filter matches
    // nothing, the upsert tries to insert a second `key`, and the unique
    // index refuses it (E11000).
    await Lock.updateOne(
      { key, expiresAt: { $lte: now } },
      { $set: { token, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new LockBusyError(key);
    throw error;
  }

  try {
    return await fn();
  } finally {
    // Only our own lock: if it expired and someone else took it, leave theirs.
    await Lock.deleteOne({ key, token });
  }
}