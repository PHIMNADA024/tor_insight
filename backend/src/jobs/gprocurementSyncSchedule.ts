/**
 * Scheduled sync of the national e-GP (gprocurement.go.th) fetcher.
 *
 * The national invitation feed only shows the latest 20 invitations of the
 * day (about 300-400 are published daily), so it has to be read often during
 * office hours or announcements scroll out of reach before we see them.
 *
 * Off unless GPROCUREMENT_SYNC_ENABLED=true: the database is shared by the
 * whole team, and every developer running the backend would otherwise run the
 * same job and hit the source site several times over. Turn it on in one
 * place only. (The BMA fetcher has its own switch, BMA_SYNC_ENABLED.)
 */
import cron from "node-cron";
import { runGprocurementSync } from "../services/gprocurementFetcher.js";

/** Every 20 minutes, 08:00-18:40 Bangkok time, Monday to Friday. */
const GPROCUREMENT_SYNC_CRON = "*/20 8-18 * * 1-5";

export function startGprocurementSyncSchedule() {
  if (process.env.GPROCUREMENT_SYNC_ENABLED !== "true") {
    console.log("National e-GP sync cron is off (set GPROCUREMENT_SYNC_ENABLED=true to enable)");
    return;
  }

  // A slow run (e.g. a feed that times out and retries) must not overlap the next.
  let running = false;
  cron.schedule(
    GPROCUREMENT_SYNC_CRON,
    async () => {
      if (running) return;
      running = true;
      try {
        const counts = await runGprocurementSync("scheduled");
        console.log("Scheduled national e-GP sync finished:", counts);
      } catch (error) {
        // Already recorded in SyncLog; the next run tries again.
        console.error("Scheduled national e-GP sync failed:", error instanceof Error ? error.message : error);
      } finally {
        running = false;
      }
    },
    { timezone: "Asia/Bangkok" },
  );
  console.log(`National e-GP sync cron enabled: ${GPROCUREMENT_SYNC_CRON} (Asia/Bangkok)`);
}
