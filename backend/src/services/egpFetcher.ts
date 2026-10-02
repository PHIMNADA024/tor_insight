/**
 * e-GP (Bangkok) data collection service: egp2.bangkok.go.th.
 * Collects IT tenders that have an invitation to bid (ประกาศเชิญชวน) with a
 * readable submission deadline, which BMA Open Contract doesn't have
 * (it only lists finished procurements).
 *
 * The API is the public site's own, undocumented. robots.txt allows crawling
 * with a 1 second delay, which every request here respects.
 */
import { Tor } from "../models/index.js";
import { NonRetryableError, sleep, withRetry } from "./http.js";
import { withSyncLog, type SyncCounts, type SyncTrigger } from "./syncRun.js";
import { readDeadline } from "./deadlineReader.js";
import { summarizeTorDocument } from "./torDocumentSummary.js";
import { readWinners } from "./winnerReader.js";

const SITE = "https://egp2.bangkok.go.th";
const API = `${SITE}/appapi/api`;
const REQUEST_GAP_MS = 1100;

/** "วัสดุครุภัณฑ์คอมพิวเตอร์" — also covers software maintenance and licences. */
const COMPUTER_GOODS_ID = "54c0c93b-9193-4e49-809e-eccd40704a83";
/** "ประกาศเชิญชวน" */
const INVITATION_TYPE_ID = "705f1ffb-82e2-4beb-bdd2-2746f0783bf0";

const INVITATION_TYPES = ["ประกาศเชิญชวน", "เปลี่ยนแปลงประกาศเชิญชวน"];
const TOR_TYPE = "ร่างขอบเขตของงาน (TOR)";
/** Announcements that end bidding: a winner, or the invitation being cancelled. */
const WINNER_TYPE_PREFIX = "ประกาศรายชื่อผู้ชนะ";
const CLOSING_TYPE_PREFIXES = [WINNER_TYPE_PREFIX, "ยกเลิกประกาศเชิญชวน"];

const SOFTWARE_WORDS = ["โปรแกรม", "ซอฟต์แวร์", "ซอฟท์แวร์", "ลิขสิทธิ์", "software", "license", "แอปพลิเคชัน", "application"];

/** IT work outside the computer goods category, matched on the project name. */
const IT_NAME_PATTERN =
  /คอมพิวเตอร์|โปรแกรม|ซอฟต์แวร์|ซอฟท์แวร์|software|ลิขสิทธิ์การใช้งาน|สิทธิ์การใช้งาน|แอปพลิเคชัน|application|สารสนเทศ|เครือข่าย|ฐานข้อมูล|เว็บไซต์|เซิร์ฟเวอร์|server|firewall|กล้องโทรทัศน์วงจรปิด|cctv|อินเทอร์เน็ต/i;

/**
 * Names that match the words above but aren't IT work: medical scanners
 * ("เอกซเรย์คอมพิวเตอร์" is a CT scan), the power and cooling of computer
 * rooms, and "เครือข่าย" in its social sense. Found by reviewing all matches
 * since 2567.
 */
const NOT_IT_NAME_PATTERN =
  /เอกซเรย์|MRI|สนามแม่เหล็กไฟฟ้า|เครื่องตรวจ|กระจกตา|ฉลากยา|ตัดเย็บ|พัดลม|ศิลปวัฒนธรรม|ปรับอากาศ|เครื่องกำเนิดไฟฟ้า|ระบบไฟฟ้า|ป้องกันไฟฟ้า/i;

/** How far back "recent" runs look for new invitations. */
const RECENT_DAYS = 30;
/**
 * A winning price below this share of the budget is treated as a misread.
 * e-bidding rarely saves more than half; this leaves room for big discounts.
 */
const MIN_AWARD_SHARE = 0.2;
/** Oldest Buddhist year collected (the project number prefix, e.g. 67…). */
const OLDEST_YEAR_BE = 2567;

type Announcement = {
  id: string;
  masterAnnounceTypeName: string | null;
  projectAnnouncementPublishDate: string | null;
  projectAnnouncementPath: string | null;
};

type ProjectDetail = {
  projectId: string;
  projectName: string;
  projectNumber: string;
  masterOrgGroupName: string | null;
  projectBudget: number | null;
  /** Reference price (ราคากลาง); stored like BMA's tender value. */
  projectAverageBudget: number | null;
  masterMethodIdName: string | null;
  /** e.g. "จัดทำสัญญา/ PO แล้ว", "ระหว่างดำเนินการ". */
  masterContractAvailableName: string | null;
};

async function egpGet<T>(path: string): Promise<T> {
  await sleep(REQUEST_GAP_MS);
  return withRetry(async () => {
    const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
    // The API returns occasional 500s that succeed on retry; 4xx won't.
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableError(`e-GP ${path}: HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`e-GP ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  });
}

type ListedProject = { projectId: string; projectNumber: string; projectName: string };

/** Every project with an invitation, optionally of one goods category and since a date. */
async function listInvitations(since: Date, goodsId?: string) {
  const projects: ListedProject[] = [];
  const filter =
    `&masterAnnounceTypeId=${INVITATION_TYPE_ID}` +
    `&startDate=${since.toISOString()}&endDate=${new Date().toISOString()}` +
    (goodsId ? `&masterGoodIdId=${goodsId}` : "");

  for (let page = 1; ; page++) {
    const result = await egpGet<{ data: ListedProject[]; hasNextPage: boolean }>(
      `/Projects/GetProjectFromFilter?pageNo=${page}&pageSize=100${filter}`,
    );
    projects.push(
      ...result.data.map(({ projectId, projectNumber, projectName }) => ({ projectId, projectNumber, projectName })),
    );
    if (!result.hasNextPage) return projects;
  }
}

/**
 * IT projects with an invitation: everything in the computer category, plus
 * IT work filed elsewhere (system maintenance is often under services), found
 * by the words in its name.
 */
async function listInvitedProjects(since: Date) {
  const byNumber = new Map<string, ListedProject>();
  for (const p of await listInvitations(since, COMPUTER_GOODS_ID)) byNumber.set(p.projectNumber, p);
  for (const p of await listInvitations(since)) {
    const name = p.projectName ?? "";
    if (IT_NAME_PATTERN.test(name) && !NOT_IT_NAME_PATTERN.test(name)) byNumber.set(p.projectNumber, p);
  }
  return [...byNumber.values()];
}

async function fetchAnnouncements(projectId: string): Promise<Announcement[]> {
  const result = await egpGet<{ data: Announcement[] }>(
    `/ProjectAnnouncements/GetAnnouncementDetailInProject?projectId=${projectId}&pageNo=1&pageSize=50`,
  );
  return result.data ?? [];
}

function fileUrl(a: Announcement) {
  return `${SITE}/api/file/${a.id}/${encodeURIComponent(a.projectAnnouncementPath ?? "")}`;
}

async function downloadPdf(url: string): Promise<Buffer> {
  await sleep(REQUEST_GAP_MS);
  return withRetry(async () => {
    const res = await fetch(url);
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableError(`PDF: HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`PDF: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

const toDate = (value: string | null) => (value ? new Date(value) : undefined);

function byDate(a: Announcement, b: Announcement) {
  return (toDate(a.projectAnnouncementPublishDate)?.getTime() ?? 0) -
    (toDate(b.projectAnnouncementPublishDate)?.getTime() ?? 0);
}

function isSoftware(name: string) {
  const lower = name.toLowerCase();
  return SOFTWARE_WORDS.some((w) => lower.includes(w));
}

/*
 * The functions below put e-GP data into the same shape and wording as BMA
 * records, so both sources read alike on the site.
 */

/**
 * e-GP names repeat the method, e.g. "ประกวดราคาซื้อ… ด้วยวิธีประกวดราคา
 * อิเล็กทรอนิกส์ (e-bidding)". Strip it to "ซื้อ…", like BMA's contract titles.
 */
function cleanTitle(name: string) {
  return name
    .trim()
    .replace(/^ประกวดราคา\s*/, "")
    .replace(/\s*(ด้วย|โดย)วิธี.*$/, "")
    .trim();
}

/** Maps e-GP method names onto the wording BMA uses. */
function normalizeMethod(method: string | null) {
  if (!method) return undefined;
  if (/e-bidding/i.test(method)) return "e-bidding";
  if (/เฉพาะเจาะจง/.test(method)) return "วิธีเฉพาะเจาะจง";
  if (/คัดเลือก/.test(method)) return "วิธีคัดเลือก";
  // Paper bidding, price inquiry and e-market are all open invitations.
  if (/ประกวดราคา|สอบราคา|e-market/i.test(method)) return "วิธีประกาศเชิญชวนทั่วไป";
  return method;
}

/** BMA's description is always "งบประมาณประจำปี" + the 2-digit Buddhist year. */
function budgetDescription(fiscalYear: number | undefined) {
  return fiscalYear ? `งบประมาณประจำปี ${(fiscalYear + 543) % 100}` : undefined;
}

/** e-GP project numbers start with the Buddhist year they were created in, e.g. 69… */
function fiscalYearFromNumber(projectNumber: string) {
  const yy = Number(projectNumber.slice(0, 2));
  return Number.isFinite(yy) ? 2500 + yy - 543 : undefined;
}

type ProcessResult = "inserted" | "updated" | "unchanged" | `skipped: ${string}`;

/**
 * Brings one e-GP project into the TOR collection. Cheapest checks first,
 * so duplicates and already-read deadlines cost no extra requests or AI calls.
 */
async function processProject(
  project: { projectId: string; projectNumber: string },
  bmaNumbers: Set<string>,
): Promise<ProcessResult> {
  // 1. Already collected from BMA: not ours to add (FR-08).
  if (bmaNumbers.has(project.projectNumber)) return "skipped: duplicate of BMA record";

  const ocid = `egp-${project.projectNumber}`;
  const existing = await Tor.findOne({ ocid }).lean();

  const announcements = (await fetchAnnouncements(project.projectId)).sort(byDate);

  // 2. The deadline lives in the latest invitation (or its amendment) PDF.
  const invitations = announcements.filter(
    (a) => INVITATION_TYPES.includes(a.masterAnnounceTypeName ?? "") && a.projectAnnouncementPath,
  );
  const latestInvitation = invitations.at(-1);
  if (!latestInvitation) return "skipped: no invitation PDF";
  const invitationUrl = fileUrl(latestInvitation);
  const announcedAt = toDate(invitations[0].projectAnnouncementPublishDate);

  // 3. Winners, from the latest winner announcement. Read once per file, like
  //    the deadline; shown in the same place as BMA's suppliers. Checked
  //    before the deadline and summary so a skipped project costs one AI call.
  const winnerAnnouncement = announcements
    .filter((a) => (a.masterAnnounceTypeName ?? "").startsWith(WINNER_TYPE_PREFIX) && a.projectAnnouncementPath)
    .at(-1);
  const awardPdfUrl = winnerAnnouncement ? fileUrl(winnerAnnouncement) : undefined;
  let suppliers = existing?.suppliers?.length ? existing.suppliers : undefined;
  // null = read but not usable; undefined = never read (records from before prices were read).
  let rawAwardAmount = existing?.awardAmount;

  if (
    awardPdfUrl &&
    (!suppliers || existing?.awardPdfUrl !== awardPdfUrl || existing?.awardAmount === undefined)
  ) {
    const winners = await readWinners(await downloadPdf(awardPdfUrl));
    if (winners.names.length > 0) suppliers = winners.names;
    rawAwardAmount = winners.amount ?? null;
  }

  // A winner was announced but no name could be read: not kept (agreed rule).
  if (awardPdfUrl && !suppliers) {
    if (existing) await Tor.deleteOne({ ocid });
    return "skipped: winner name unreadable";
  }

  // 4. Reuse the deadline unless the invitation PDF changed since we read it.
  let submissionDeadline = existing?.submissionDeadline ?? undefined;
  let invitationPdf: Buffer | undefined;

  if (!submissionDeadline || existing?.invitationPdfUrl !== invitationUrl) {
    invitationPdf = await downloadPdf(invitationUrl);
    const result = await readDeadline(invitationPdf, announcedAt);
    if (!result.deadline) {
      // No deadline, no record (agreed rule). An existing record keeps its old one.
      if (!existing) return `skipped: ${result.reason}`;
    } else {
      submissionDeadline = result.deadline;
      console.log(
        `  deadline ${project.projectNumber}: ${result.deadline.toISOString()} ← "${result.quote.slice(0, 120)}"`,
      );
    }
  }

  // 5. Project details: a summary of the TOR document, or of the invitation if
  //    there's no TOR. Only regenerated when that file changes.
  const torAnnouncement = announcements
    .filter((a) => a.masterAnnounceTypeName === TOR_TYPE && a.projectAnnouncementPath)
    .at(-1);
  const torUrl = torAnnouncement ? fileUrl(torAnnouncement) : invitationUrl;
  let detailSummary = existing?.detailSummary ?? undefined;

  if (!detailSummary || existing?.torPdfUrl !== torUrl) {
    const pdf = torUrl === invitationUrl && invitationPdf ? invitationPdf : await downloadPdf(torUrl);
    detailSummary = (await summarizeTorDocument(pdf)) ?? detailSummary;
  }

  const detail = await egpGet<ProjectDetail>(`/Projects/GetProjectDetail?projectId=${project.projectId}`);

  const closing = announcements.find((a) =>
    CLOSING_TYPE_PREFIXES.some((p) => (a.masterAnnounceTypeName ?? "").startsWith(p)),
  );

  // Thai digits in scanned PDFs get misread (๕/๙), so a winning price is only
  // kept if it's plausible: not above the budget, not far below it.
  const ceiling = Math.max(detail.projectBudget ?? 0, detail.projectAverageBudget ?? 0);
  const awardAmount =
    rawAwardAmount != null && ceiling > 0 &&
    rawAwardAmount <= ceiling && rawAwardAmount >= ceiling * MIN_AWARD_SHARE
      ? rawAwardAmount
      : rawAwardAmount === undefined ? undefined : null;

  const doc = {
    ocid,
    sourceId: "egp",
    egpProjectNumber: project.projectNumber,
    egpProjectId: project.projectId,
    title: cleanTitle(detail.projectName),
    description: budgetDescription(fiscalYearFromNumber(project.projectNumber)),
    agency: detail.masterOrgGroupName ?? "ไม่ระบุหน่วยงาน",
    // Every e-GP record is an invitation to bid, kept as its own category
    // rather than guessing a budget category (e-GP has no budget code).
    category: "tender_invitation",
    itCategory: isSoftware(detail.projectName) ? "software" : "it_equipment",
    budgetAmount: detail.projectBudget ?? undefined,
    tenderAmount: detail.projectAverageBudget ?? undefined,
    procurementMethod: normalizeMethod(detail.masterMethodIdName),
    fiscalYear: fiscalYearFromNumber(project.projectNumber),
    tenderStartDate: announcedAt,
    submissionDeadline,
    awardAnnouncedAt: toDate(closing?.projectAnnouncementPublishDate ?? null),
    // The announcement files themselves aren't listed on the site; their
    // content is summarised into detailSummary instead. Staff names
    // (createdBy) are deliberately not stored.
    detailSummary,
    invitationPdfUrl: invitationUrl,
    torPdfUrl: torUrl,
    suppliers,
    awardPdfUrl,
    awardAmount,
    contractStatus: detail.masterContractAvailableName ?? undefined,
    sourceUrl: `${SITE}/project-detail/${project.projectId}`,
    sourceUpdatedAt: toDate(announcements.at(-1)?.projectAnnouncementPublishDate ?? null),
  };

  // Shown while bidding is open, or once a winner is known. A closed tender
  // with no winner (cancelled, or still being evaluated) is kept as a draft so
  // a later winner announcement can publish it again. Archived is an admin
  // decision and is never overridden.
  const now = new Date();
  const closed = !!doc.awardAnnouncedAt || (!!submissionDeadline && submissionDeadline <= now);
  const status = closed && !suppliers ? "draft" : "published";
  const keepStatus = existing?.status === "archived";

  // Same upsert rules as BMA otherwise: updatedAt only when data changed.
  const result = await Tor.updateOne(
    { ocid },
    existing
      ? { $set: keepStatus ? doc : { ...doc, status } }
      : { $set: doc, $setOnInsert: { status, publishedDate: announcedAt ?? now, createdAt: now, updatedAt: now } },
    { upsert: true, timestamps: false },
  );

  if (result.upsertedCount > 0) return "inserted";
  if (result.modifiedCount > 0) {
    await Tor.updateOne({ ocid }, { $set: { updatedAt: now } }, { timestamps: false });
    return "updated";
  }
  return "unchanged";
}

export type EgpSyncMode = "full" | "recent";

async function syncEgp(mode: EgpSyncMode): Promise<SyncCounts> {
  // Full runs start at the oldest year collected (Buddhist 2567 = 1 Jan 2024),
  // which also keeps the all-categories listing short.
  const since =
    mode === "recent"
      ? new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
      : new Date(`${OLDEST_YEAR_BE - 543}-01-01T00:00:00+07:00`);
  // Older projects are filtered before any per-project request or AI call.
  const listed = (await listInvitedProjects(since)).filter(
    (p) => 2500 + Number(p.projectNumber.slice(0, 2)) >= OLDEST_YEAR_BE,
  );

  // Recent runs also re-check our open records, to catch winners/cancellations
  // on invitations older than the listing window.
  const projects = new Map<string, { projectId: string; projectNumber: string }>(
    listed.map((p) => [p.projectNumber, p]),
  );
  if (mode === "recent") {
    const open = await Tor.find(
      { sourceId: "egp", awardAnnouncedAt: { $exists: false }, egpProjectId: { $exists: true } },
      { egpProjectNumber: 1, egpProjectId: 1 },
    ).lean();
    for (const t of open) {
      projects.set(t.egpProjectNumber!, { projectId: t.egpProjectId!, projectNumber: t.egpProjectNumber! });
    }
  }

  const bmaNumbers = new Set(
    ((await Tor.distinct("egpProjectNumber", { sourceId: "bma" })) as string[]).filter(Boolean),
  );

  const counts: SyncCounts = { inserted: 0, updated: 0, skipped: 0, read: projects.size };
  const skipReasons = new Map<string, number>();

  for (const project of projects.values()) {
    let outcome: ProcessResult;
    try {
      outcome = await processProject(project, bmaNumbers);
    } catch (error) {
      // One bad project shouldn't fail the whole run.
      const message = error instanceof Error ? error.message : String(error);
      outcome = `skipped: error (${message.slice(0, 80)})`;
    }

    if (outcome === "inserted") counts.inserted++;
    else if (outcome === "updated") counts.updated++;
    else {
      counts.skipped++;
      const reason = outcome === "unchanged" ? "unchanged" : outcome.slice("skipped: ".length);
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    }
  }

  console.log("e-GP skipped by reason:", Object.fromEntries(skipReasons));
  return counts;
}

/** Collects IT invitations from e-GP (`full`: all of them; `recent`: last 30 days). */
export function runEgpSync(mode: EgpSyncMode = "recent", trigger: SyncTrigger = "scheduled") {
  return withSyncLog("egp", trigger, () => syncEgp(mode));
}
