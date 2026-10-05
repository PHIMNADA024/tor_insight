/**
 * Runs a sync manually from the command line.
 *
 *   npx tsx src/scripts/runSync.ts              BMA, current fiscal year
 *   npx tsx src/scripts/runSync.ts 2568         BMA, a specific fiscal year
 *   npx tsx src/scripts/runSync.ts data/x.json  BMA, a local file
 *   npx tsx src/scripts/runSync.ts egp          e-GP, invitations from the last 30 days
 *   npx tsx src/scripts/runSync.ts egp full     e-GP, every IT invitation (~8+ minutes)
 *   npx tsx src/scripts/runSync.ts gproc        national e-GP, today's IT invitations
 */
import "dotenv/config";
import { connectDB, disconnectDB } from "../db.js";
import {
  currentFiscalYear,
  runBmaSync,
  syncFiscalYear,
} from "../services/bmaFetcher.js";
import { runEgpSync } from "../services/egpFetcher.js";
import { runGprocurementSync } from "../services/gprocurementFetcher.js";

const arg = process.argv[2];

await connectDB();

try {
  let result;

  if (arg === "gproc") {
    result = await runGprocurementSync("manual");
  } else if (arg === "egp") {
    result = await runEgpSync(process.argv[3] === "full" ? "full" : "recent", "manual");
  } else if (!arg) {
    result = await syncFiscalYear(currentFiscalYear(), "manual");
  } else if (/^\d{4}$/.test(arg)) {
    result = await syncFiscalYear(Number(arg), "manual");
  } else {
    result = await runBmaSync(arg, "manual");
  }

  console.log(result);
} catch (error) {
  // The failure is already recorded in SyncLog, so just report it briefly.
  console.error("Sync failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}