/**
 * Runs a BMA sync manually from the command line.
 *
 * Without arguments, downloads the current fiscal year from BMA first:
 *   npx tsx src/scripts/runSync.ts
 *
 * With a path, syncs a local file instead:
 *   npx tsx src/scripts/runSync.ts data/bma2568.json
 */
import "dotenv/config";
import { connectDB, disconnectDB } from "../db.js";
import {
  currentFiscalYear,
  downloadBmaFile,
  runBmaSync,
} from "../services/bmaFetcher.js";

const localFile = process.argv[2];

const file = localFile ?? (await downloadBmaFile(currentFiscalYear()));
console.log(`Syncing ${file}`);

await connectDB();

try {
  const result = await runBmaSync(file, "manual");
  console.log(result);
} finally {
  await disconnectDB();
}