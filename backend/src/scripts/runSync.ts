/**
 * Runs a BMA sync manually from the command line.
 *
 *   npx tsx src/scripts/runSync.ts              current fiscal year
 *   npx tsx src/scripts/runSync.ts 2568         a specific fiscal year
 *   npx tsx src/scripts/runSync.ts data/x.json  a local file
 */
import "dotenv/config";
import { connectDB, disconnectDB } from "../db.js";
import {
  currentFiscalYear,
  runBmaSync,
  syncFiscalYear,
} from "../services/bmaFetcher.js";

const arg = process.argv[2];

await connectDB();

try {
  let result;

  if (!arg) {
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