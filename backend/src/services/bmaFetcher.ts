import fs from "fs";
import { Tor } from "../models/index.js";
import { SyncLog } from "../models/index.js";

/** UNSPSC prefixes we treat as IT-related. */
const IT_PREFIXES = ["43", "8111", "8116"];
/** Narrower set: software and IT services specifically. */
const SOFTWARE_PREFIXES = ["43231", "8111", "8116"];

/** Picks a category label from a record's UNSPSC codes. */
function classify(codes: string[]): string {
  if (codes.some((c) => SOFTWARE_PREFIXES.some((p) => c.startsWith(p)))) {
    return "software";
  }
  if (codes.some((c) => IT_PREFIXES.some((p) => c.startsWith(p)))) {
    return "it_equipment";
  }
  return "uncategorized";
}

/** Thai fiscal years use the Buddhist calendar: 2569 = 2026. */
function toGregorianYear(buddhistYear: number): number {
  return buddhistYear - 543;
}

/** Maps one OCDS release to our TOR shape. Returns null if unusable. */
function mapRelease(release: any) {
  const ocid = release.ocid;
  if (!ocid) return null;

  const title = release.planning?.budget?.project;
  const agency = release.buyer?.name;
  if (!title || !agency) return null;

  const items = release.tender?.items ?? [];
  const codes: string[] = items
    .map((i: any) => i.classification?.id)
    .filter(Boolean);

  // BMA sometimes uses the non-standard "value" instead of "amount".
  const budget = release.planning?.budget?.amount;
  const budgetAmount = budget?.amount ?? release.planning?.budget?.value?.amount;

  // Budget ids start with the Buddhist fiscal year, e.g. 69... for 2569.
  const budgetId: string = release.planning?.budget?.id ?? "";
  const fiscalYear = budgetId.length >= 2
    ? toGregorianYear(2500 + Number(budgetId.slice(0, 2)))
    : undefined;

  return {
    ocid,
    sourceId: "bma",
    title,
    description: release.planning?.budget?.description,
    agency,
    agencyId: release.buyer?.id,
    category: classify(codes),
    unspscCodes: codes,
    budgetAmount,
    budgetCurrency: budget?.currency ?? "THB",
    tenderAmount: release.tender?.value?.amount,
    fiscalYear,
    publishedDate: release.date ? new Date(release.date) : undefined,
    sourceUrl: "https://opencontract.bangkok.go.th/",
    sourceUpdatedAt: release.date ? new Date(release.date) : undefined,
  };
}

/**
 * Reads a BMA OCDS file and upserts every usable release into the
 * TOR collection. Records one SyncLog entry per run (FR-07, FR-08, FR-23).
 */
export async function runBmaSync(
  filePath: string,
  trigger: "scheduled" | "manual" = "scheduled",
) {
  const log = await SyncLog.create({ sourceId: "bma", trigger });

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const releases: any[] = parsed.releases ?? parsed;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const release of releases) {
      const doc = mapRelease(release);

      if (!doc) {
        skipped++;
        continue;
      }

      // Upsert on ocid: existing records are updated, new ones created.
      // This is what prevents duplicates across repeated runs.
      const result = await Tor.updateOne(
        { ocid: doc.ocid },
        { $set: doc, $setOnInsert: { status: "draft" } },
        { upsert: true },
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
      else skipped++;
    }

    await SyncLog.updateOne(
      { _id: log._id },
      {
        status: "success",
        finishedAt: new Date(),
        recordsRead: releases.length,
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsSkipped: skipped,
      },
    );

    return { inserted, updated, skipped, read: releases.length };
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