/**
 * Scheduled data collection.
 *
 * The national e-GP feed only shows the latest 20 invitations of the day
 * (about 300-400 are published daily), so it has to be read often during
 * office hours or announcements scroll out of reach before we see them.
 *
 * Off unless SYNC_SCHEDULE=on: the database is shared by the whole team, and
 * every developer running the backend would otherwise run the same jobs and
 * hit the source sites several times over. Turn it on in one place only.
 */
import cron from "node-cron";
import { runGprocurementSync } from "../services/gprocurementFetcher.js";

/** Every 20 minutes, 08:00-18:40 Bangkok time, Monday to Friday. */
const GPROCUREMENT_SCHEDULE = "*/20 8-18 * * 1-5";

export function startSyncSchedule() {
  if (process.env.SYNC_SCHEDULE !== "on") {
    console.log("Scheduled syncs are off (set SYNC_SCHEDULE=on to enable)");
    return;
  }

  // A slow run (e.g. a feed that times out and retries) must not overlap the next.
  let running = false;
  cron.schedule(
    GPROCUREMENT_SCHEDULE,
    async () => {
      if (running) return;
      running = true;
      try {
        const counts = await runGprocurementSync("scheduled");
        console.log("Scheduled national e-GP sync:", counts);
      } catch (error) {
        // Already recorded in SyncLog; the next run tries again.
        console.error("Scheduled national e-GP sync failed:", error instanceof Error ? error.message : error);
      } finally {
        running = false;
      }
    },
    { timezone: "Asia/Bangkok" },
  );
  console.log(`Scheduled national e-GP sync: "${GPROCUREMENT_SCHEDULE}" (Asia/Bangkok)`);
}
