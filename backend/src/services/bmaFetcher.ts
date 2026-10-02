/**
 * BMA data collection service.
 * Reads an OCDS release file, maps each release to a TOR record,
 * categorises it using the UNSPSC codes BMA provides, and upserts on
 * `ocid` so reruns update rather than duplicate. Each run writes one
 * SyncLog entry with counts and status.
 */

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

/** True if any of the record's UNSPSC codes is IT-related. */
function isRelevant(codes: string[]): boolean {
  return classify(codes) !== "uncategorized";
}

/** Thai years use the Buddhist calendar, 543 years ahead: 2569 = 2026. */
const BUDDHIST_ERA_OFFSET = 543;

function toGregorianYear(buddhistYear: number): number {
  return buddhistYear - BUDDHIST_ERA_OFFSET;
}

/**
 * BMA writes contract dates with Buddhist years, e.g. "2568-01-10".
 * Converts them to a real Date.
 */
function parseBmaDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const year = Number(value.slice(0, 4));
  const fixed = year > 2400 ? `${toGregorianYear(year)}${value.slice(4)}` : value;
  const date = new Date(fixed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const BMA_BASE_URL =
  "https://opencontract.bangkok.go.th/assets/data/output/yearly";

/**
 * Current Thai fiscal year in the Buddhist calendar.
 * Fiscal years start 1 October, so October 2026 is FY2570.
 */
export function currentFiscalYear(date = new Date()): number {
  const buddhistYear = date.getFullYear() + BUDDHIST_ERA_OFFSET;
  return date.getMonth() >= 9 ? buddhistYear + 1 : buddhistYear;
}

/** Thrown for failures that retrying won't fix, like a missing file. */
class NonRetryableError extends Error {}

/**
 * Runs an async function, retrying on failure with increasing delays
 * (2s, 4s, ...). Gives up immediately on NonRetryableError.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NonRetryableError || attempt >= attempts) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`Attempt ${attempt} failed, retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Downloads one fiscal year's OCDS file and saves it to disk.
 * Retries network and server errors; fails immediately on client
 * errors like 403, which BMA returns for files not yet published.
 */
export async function downloadBmaFile(
  fiscalYear: number,
  destDir = "data",
): Promise<string> {
  const url = `${BMA_BASE_URL}/ocds_releases_${fiscalYear}.json`;

  const body = await withRetry(async () => {
    const res = await fetch(url);

    if (res.headers.get("cf-mitigated") === "challenge") {
      throw new NonRetryableError(
        `Blocked by Cloudflare bot protection (HTTP ${res.status})`,
      );
    }

    // 4xx means the request itself is wrong (BMA returns 403 for files
    // that don't exist yet), so retrying won't help. 408 and 429 are
    // the exceptions: waiting and trying again can fix those.
    const isClientError = res.status >= 400 && res.status < 500;
    const isRetryableClientError = res.status === 408 || res.status === 429;

    if (isClientError && !isRetryableClientError) {
      throw new NonRetryableError(
        `No file available for FY${fiscalYear} (HTTP ${res.status})`,
      );
    }
    if (!res.ok) {
      throw new Error(`Download failed for FY${fiscalYear}: HTTP ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  });

  fs.mkdirSync(destDir, { recursive: true });
  const filePath = `${destDir}/bma${fiscalYear}.json`;
  fs.writeFileSync(filePath, body);
  return filePath;
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

  if (!isRelevant(codes)) return null;

  // BMA sometimes uses the non-standard "value" instead of "amount".
  const budget = release.planning?.budget?.amount;
  const budgetAmount = budget?.amount ?? release.planning?.budget?.value?.amount;

  // Budget ids start with the Buddhist fiscal year, e.g. 69... for 2569.
  const budgetId: string = release.planning?.budget?.id ?? "";
  const fiscalYear = budgetId.length >= 2
    ? toGregorianYear(2500 + Number(budgetId.slice(0, 2)))
    : undefined;

  const tenderItems = items.map((i: any) => ({
    description: i.description,
    unspscCode: i.classification?.id,
    unspscDescription: i.classification?.description,
    quantity: i.quantity,
    unit: i.unit?.name,
  }));

  // Names only. For individual contractors the supplier id is a
  // Thai national ID number, so it must never be stored.
  const suppliers: string[] = [
    ...new Set<string>(
      (release.awards ?? [])
        .flatMap((a: any) => a.suppliers ?? [])
        .map((s: any) => s.name)
        .filter(Boolean),
    ),
  ];

  const contracts = (release.contracts ?? []).map((c: any) => ({
    title: c.title,
    startDate: parseBmaDate(c.period?.startDate),
    endDate: parseBmaDate(c.period?.endDate),
    amount: c.value?.amount,
    amountSpent: c.implementation?.financialProgress?.totalSpend?.amount,
  }));

  const releaseDate = release.date ? new Date(release.date) : undefined;

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
    procurementMethod: release.tender?.procurementMethodDetails,
    items: tenderItems,
    suppliers,
    contracts,
    fiscalYear,
    publishedDate: releaseDate,
    sourceUrl: "https://opencontract.bangkok.go.th/",
    sourceUpdatedAt: releaseDate,
  };
}

type SyncCounts = {
  inserted: number;
  updated: number;
  skipped: number;
  read: number;
};

/** Parses an OCDS file and upserts every usable release. Returns counts. */
async function processFile(filePath: string): Promise<SyncCounts> {
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

    // BMA rewrites release.date every night when it regenerates the file,
    // so it can't be used as a publication date. We keep the date from the
    // first time we saw the record, and refresh sourceUpdatedAt every run.
    const { publishedDate, ...rest } = doc;

    // Upsert on ocid: existing records are updated, new ones created.
    // This is what prevents duplicates across repeated runs.
    // Automatic timestamps are turned off here. Mongoose would otherwise
    // add updatedAt to every call, so every record would count as
    // changed on every run. We set updatedAt only when data changed.
    const now = new Date();
    const result = await Tor.updateOne(
      { ocid: doc.ocid },
      {
        $set: rest,
        $setOnInsert: { status: "draft", publishedDate, createdAt: now, updatedAt: now },
      },
      { upsert: true, timestamps: false },
    );

    if (result.upsertedCount > 0) {
      inserted++;
    } else if (result.modifiedCount > 0) {
      updated++;
      await Tor.updateOne(
        { ocid: doc.ocid },
        { $set: { updatedAt: now } },
        { timestamps: false },
      );
    } else {
      skipped++;
    }
  }

  return { inserted, updated, skipped, read: releases.length };
}

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
 * Wraps a sync in a SyncLog entry (FR-23). The entry is created first,
 * so any failure inside `work` — download or processing — gets recorded.
 */
async function withSyncLog(
  trigger: "scheduled" | "manual",
  work: () => Promise<SyncCounts>,
): Promise<SyncCounts> {
  await markStaleRuns();
  const log = await SyncLog.create({ sourceId: "bma", trigger });

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

/** Syncs a local OCDS file (FR-07, FR-08). */
export function runBmaSync(
  filePath: string,
  trigger: "scheduled" | "manual" = "scheduled",
) {
  return withSyncLog(trigger, () => processFile(filePath));
}

/** Downloads a fiscal year from BMA and syncs it, logging any failure. */
export function syncFiscalYear(
  fiscalYear: number,
  trigger: "scheduled" | "manual" = "scheduled",
) {
  return withSyncLog(trigger, async () => {
    const filePath = await downloadBmaFile(fiscalYear);
    return processFile(filePath);
  });
}