/**
 * SyncLog bookkeeping shared by every data source's fetcher (FR-23, UC-09).
 */
import { SyncLog } from "../models/index.js";
import { notifyMatchingUsers } from "../jobs/notify-matches.js";

export type SyncCounts = {
  inserted: number;
  updated: number;
  skipped: number;
  read: number;
  /** Ids of TORs this run inserted, for match notifications. */
  newTorIds?: string[];
};

export type SyncTrigger = "scheduled" | "manual";

/** A run still in_progress after this long is assumed to have died. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Marks runs stuck in "in_progress" as failed. A process killed mid-sync
 * never reaches the code that updates its log, so it would otherwise
 * look like it's still running forever.
 */
async function markStaleRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  await SyncLog.updateMany(
    { status: "in_progress", startedAt: { $lt: cutoff } },
    {
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "Interrupted before finishing",
    },
  );
}

/**
 * Wraps a sync in a SyncLog entry. The entry is created first,
 * so any failure inside `work` — download or processing — gets recorded.
 * After a successful run, notifies users whose saved criteria match any
 * newly-inserted TORs (notification failures never fail the sync itself).
 */
export async function withSyncLog(
  sourceId: string,
  trigger: SyncTrigger,
  work: () => Promise<SyncCounts>,
): Promise<SyncCounts> {
  await markStaleRuns();
  const log = await SyncLog.create({ sourceId, trigger });

  try {
    const counts = await work();
    await SyncLog.updateOne(
      { _id: log._id },
      {
        status: "success",
        finishedAt: new Date(),
        recordsRead: counts.read,
        recordsInserted: counts.inserted,
        recordsUpdated: counts.updated,
        recordsSkipped: counts.skipped,
      },
    );

    if (counts.newTorIds?.length) {
      try {
        await notifyMatchingUsers(counts.newTorIds);
      } catch (error) {
        console.error("Failed to send match notifications:", error);
      }
    }

    return counts;
  } catch (error) {
    await SyncLog.updateOne(
      { _id: log._id },
      {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
    throw error;
  }
}
