/**
 * National e-GP (gprocurement.go.th) data collection service.
 * The national invitation RSS lists only the announcements published *today*
 * and cannot be queried for earlier days, so the open tenders are built up
 * by running this several times a day and keeping what each run sees.
 *
 * Each IT invitation's PDF (linked from the feed) is read for its submission
 * deadline, agency and prices; without a readable deadline it isn't stored.
 *
 * Note: process.gprocurement.go.th's robots.txt disallows automated access.
 * Requests here are few, spaced out, and identify themselves; the team chose
 * to use the feed knowing this.
 */
import { Tor } from "../models/index.js";
import { NonRetryableError, sleep, withRetry } from "./http.js";
import { withSyncLog, type SyncCounts, type SyncTrigger } from "./syncRun.js";
import { askAboutPdf, MAX_PDF_BYTES } from "./genai.js";
import { readDeadline } from "./deadlineReader.js";
import { toArabicDigitsOpt } from "./thaiDigits.js";
import { egpSearchUrl } from "./egpLinks.js";
import { summarizeTorDocument } from "./torDocumentSummary.js";
import {
  budgetDescription,
  cleanTitle,
  fiscalYearFromNumber,
  isItName,
  isSoftware,
  normalizeMethod,
} from "./egpFetcher.js";

const FEED_URL = "https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType=D0";
const USER_AGENT = "TOR-Insight student project (procurement search)";
const REQUEST_GAP_MS = 1500;

type FeedItem = {
  title: string;
  /** The invitation PDF. */
  link: string;
  projectNumber: string;
  method: string;
  /** Publication day, YYYY-MM-DD (Bangkok). */
  pubDate: string;
};

async function get(url: string): Promise<Response> {
  await sleep(REQUEST_GAP_MS);
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(45_000) });
    if (res.status >= 400 && res.status < 500) throw new NonRetryableError(`${url}: HTTP ${res.status}`);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  });
}

const tag = (xml: string, name: string) => {
  const start = xml.indexOf(`<${name}>`);
  const end = xml.indexOf(`</${name}>`);
  return start < 0 || end < 0 ? "" : xml.slice(start + name.length + 2, end).trim();
};

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/** Today's invitations. The feed is Windows-874 encoded. */
async function readFeed(): Promise<FeedItem[]> {
  const bytes = await (await get(FEED_URL)).arrayBuffer();
  const xml = new TextDecoder("windows-874").decode(bytes);
  return xml
    .split("<item>")
    .slice(1)
    .map((block) => {
      // "69109015469, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน"
      const [projectNumber = "", method = ""] = tag(block, "description").split(",").map((s) => s.trim());
      return {
        title: decodeEntities(tag(block, "title")).replace(/\s+/g, " "),
        link: decodeEntities(tag(block, "link")),
        projectNumber,
        method,
        pubDate: tag(block, "pubDate"),
      };
    })
    .filter((item) => /^\d{11}$/.test(item.projectNumber) && item.link);
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
function parseMoney(value: unknown) {
  const text = String(value ?? "").replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d))).replace(/[^\d.]/g, "");
  const n = Number(text);
  return text && Number.isFinite(n) && n > 0 ? n : undefined;
}

const FACTS_PROMPT = [
  "จากประกาศเชิญชวนนี้ ให้คัดลอกข้อมูลตามที่เขียนในเอกสาร ห้ามคำนวณหรือเดา",
  "ตอบเป็น JSON เท่านั้น:",
  '{"agency":"ชื่อหน่วยงานที่ออกประกาศ","budget":"วงเงินงบประมาณตามที่เขียน หรือ null","referencePrice":"ราคากลางตามที่เขียน หรือ null"}',
].join("\n");

/** The feed has no agency or prices; the invitation states them. */
async function readFacts(pdf: Buffer) {
  try {
    let parsed = JSON.parse(await askAboutPdf(pdf, FACTS_PROMPT, true));
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {};
    const agency = typeof parsed.agency === "string" ? parsed.agency.replace(/\s+/g, " ").trim() : "";
    return {
      agency: agency || undefined,
      budget: parseMoney(parsed.budget),
      referencePrice: parseMoney(parsed.referencePrice),
    };
  } catch {
    return { agency: undefined, budget: undefined, referencePrice: undefined };
  }
}

type ProcessResult = "inserted" | "unchanged" | `skipped: ${string}`;

async function processItem(item: FeedItem, knownNumbers: Set<string>): Promise<ProcessResult> {
  const ocid = `gproc-${item.projectNumber}`;
  if (await Tor.exists({ ocid })) return "unchanged";
  // Already collected from BMA or Bangkok's e-GP (FR-08).
  if (knownNumbers.has(item.projectNumber)) return "skipped: duplicate of another source";

  const pdf = Buffer.from(await (await get(item.link)).arrayBuffer());
  if (pdf.subarray(0, 4).toString("latin1") !== "%PDF") return "skipped: link is not a PDF";
  if (pdf.length > MAX_PDF_BYTES) return "skipped: PDF too large";

  const announcedAt = new Date(`${item.pubDate}T00:00:00+07:00`);
  const deadline = await readDeadline(pdf, announcedAt);
  // No deadline, no record (same rule as Bangkok's e-GP).
  if (!deadline.deadline) return `skipped: ${deadline.reason}`;
  if (deadline.deadline <= new Date()) return "skipped: already closed";

  const facts = await readFacts(pdf);
  const detailSummary = (await summarizeTorDocument(pdf)) ?? undefined;
  const fiscalYear = fiscalYearFromNumber(item.projectNumber);
  const now = new Date();

  await Tor.updateOne(
    { ocid },
    {
      $setOnInsert: {
        ocid,
        sourceId: "gprocurement",
        egpProjectNumber: item.projectNumber,
        title: cleanTitle(item.title),
        description: budgetDescription(fiscalYear),
        agency: toArabicDigitsOpt(facts.agency) ?? "ไม่ระบุหน่วยงาน",
        category: "tender_invitation",
        itCategory: isSoftware(item.title) ? "software" : "it_equipment",
        budgetAmount: facts.budget ?? facts.referencePrice,
        tenderAmount: facts.referencePrice,
        procurementMethod: normalizeMethod(item.method),
        fiscalYear,
        tenderStartDate: announcedAt,
        submissionDeadline: deadline.deadline,
        detailSummary,
        invitationPdfUrl: item.link,
        // e-GP's public announcement search, pre-filled with the project number.
        sourceUrl: egpSearchUrl(item.projectNumber),
        status: "published",
        publishedDate: announcedAt,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, timestamps: false },
  );
  console.log(`  ${item.projectNumber}: deadline ${deadline.deadline.toISOString()} ← "${deadline.quote.slice(0, 100)}"`);
  return "inserted";
}

async function syncGprocurement(): Promise<SyncCounts> {
  const items = (await readFeed()).filter((item) => isItName(item.title));
  const knownNumbers = new Set(
    ((await Tor.distinct("egpProjectNumber", { sourceId: { $ne: "gprocurement" } })) as string[]).filter(Boolean),
  );

  const counts: SyncCounts = { inserted: 0, updated: 0, skipped: 0, read: items.length };
  const skipReasons = new Map<string, number>();

  for (const item of items) {
    let outcome: ProcessResult;
    try {
      outcome = await processItem(item, knownNumbers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = `skipped: error (${message.slice(0, 80)})`;
    }
    if (outcome === "inserted") counts.inserted++;
    else {
      counts.skipped++;
      const reason = outcome === "unchanged" ? "unchanged" : outcome.slice("skipped: ".length);
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    }
  }

  // The feed never says when bidding ends, so closed tenders are hidden here.
  // There is no winner data from this source to keep them on show.
  const closed = await Tor.updateMany(
    { sourceId: "gprocurement", status: "published", submissionDeadline: { $lte: new Date() } },
    { $set: { status: "draft", updatedAt: new Date() } },
    { timestamps: false },
  );
  counts.updated += closed.modifiedCount;

  console.log("National e-GP skipped by reason:", Object.fromEntries(skipReasons));
  return counts;
}

/** Collects today's IT invitations from the national e-GP feed. */
export function runGprocurementSync(trigger: SyncTrigger = "scheduled") {
  return withSyncLog("gprocurement", trigger, syncGprocurement);
}
