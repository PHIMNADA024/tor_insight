/**
 * Scheduled sync of the Bangkok e-GP (egp2.bangkok.go.th) fetcher (FR-07).
 *
 * A "recent" run reads the last 30 days of IT invitations and lets the AI
 * read new TOR PDFs, so one run takes about 10-15 minutes. Once a day is
 * enough to catch new invitations before their deadlines.
 *
 * Off unless EGP_SYNC_ENABLED=true: the database is shared by the whole
 * team, so turn it on in one place only (same as the BMA and national
 * e-GP schedules).
 */
import cron from "node-cron";
import { runEgpSync } from "../services/egpFetcher.js";

/** Every day at 06:15 Bangkok time. Override with EGP_SYNC_CRON. */
const DEFAULT_EGP_SYNC_CRON = "15 6 * * *";

export function startEgpSyncSchedule() {
  if (process.env.EGP_SYNC_ENABLED !== "true") {
    console.log("Bangkok e-GP sync cron is off (set EGP_SYNC_ENABLED=true to enable)");
    return;
  }

  const schedule = process.env.EGP_SYNC_CRON ?? DEFAULT_EGP_SYNC_CRON;

  // A slow run must not overlap the next one.
  let running = false;
  cron.schedule(
    schedule,
    async () => {
      if (running) return;
      running = true;
      try {
        const counts = await runEgpSync("recent", "scheduled");
        console.log("Scheduled Bangkok e-GP sync finished:", counts);
      } catch (error) {
        // Already recorded in SyncLog; the next run tries again.
        console.error("Scheduled Bangkok e-GP sync failed:", error instanceof Error ? error.message : error);
      } finally {
        running = false;
      }
    },
    { timezone: "Asia/Bangkok" },
  );
  console.log(`Bangkok e-GP sync cron enabled: ${schedule} (Asia/Bangkok)`);
}