/**
 * One-time migration: publishes TORs left in "draft" from before the
 * fetcher started publishing automatically.
 *
 *   npx tsx src/scripts/publishDrafts.ts           dry run, changes nothing
 *   npx tsx src/scripts/publishDrafts.ts --apply   publish them
 *
 * Only drafts the current fetcher has re-validated are published. Every
 * record it accepts gets a `contracts` field, so drafts without one were
 * last written by an older fetcher and are ones the current filters now
 * reject. Archived records are never touched.
 *
 * With --apply, the changed ids are saved under data/ so the change
 * can be reverted.
 */
import "dotenv/config";
import fs from "fs";
import { connectDB, disconnectDB } from "../db.js";
import { Tor } from "../models/index.js";

const apply = process.argv.includes("--apply");

const toPublish = { status: "draft", contracts: { $exists: true } } as const;
const toSkip = { status: "draft", contracts: { $exists: false } } as const;

await connectDB();

try {
  const [publishable, skipped] = await Promise.all([
    Tor.find(toPublish, { _id: 1 }).lean(),
    Tor.find(toSkip, { title: 1 }).lean(),
  ]);

  console.log(`Drafts to publish: ${publishable.length}`);
  console.log(`Drafts left as draft (not re-validated by the current fetcher): ${skipped.length}`);
  skipped.forEach((d) => console.log(`  - ${d._id} ${d.title}`));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to publish.");
  } else {
    const ids = publishable.map((d) => d._id);
    const result = await Tor.updateMany({ _id: { $in: ids }, status: "draft" }, { status: "published" });

    fs.mkdirSync("data", { recursive: true });
    const logPath = `data/published-drafts-${Date.now()}.json`;
    fs.writeFileSync(logPath, JSON.stringify(ids.map(String), null, 2));

    console.log(`\nPublished ${result.modifiedCount}. Ids saved to ${logPath}`);
  }
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
