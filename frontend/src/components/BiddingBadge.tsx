type BiddingInput = {
  tenderStartDate?: string;
  submissionDeadline?: string;
  /** A signed contract, or an announced winner/cancellation. */
  hasWinner: boolean;
  /** e-GP: "upcoming" when the draft TOR is out but the invitation isn't yet. */
  biddingStage?: string;
};

export type BiddingStatus = { label: string; note?: string; tone: "open" | "upcoming" | "closed" };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BMA deadlines are date-only (stored at UTC midnight), so bids are accepted
 * through that whole day. e-GP deadlines carry the real closing time (e.g. 12:00).
 */
function closingTime(deadline: string) {
  const d = new Date(deadline);
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return dateOnly ? new Date(d.getTime() + DAY_MS) : d;
}

/**
 * Whether bids are being accepted, from the bidding window when the source
 * has one. Without dates, a signed contract still means bidding has closed.
 * Returns null when there's nothing to go on.
 */
/** Calendar day in Bangkok, as a day count, so "tomorrow" means the next Thai date. */
function bangkokDay(date: Date) {
  return Math.floor((date.getTime() + 7 * 60 * 60 * 1000) / DAY_MS);
}

/**
 * How long bidding stays open, e.g. "เหลืออีก 5 วัน", "ปิดพรุ่งนี้",
 * "ปิดวันนี้ 12:00 น.". Null unless bids are being accepted now.
 */
export function timeLeftLabel(tor: BiddingInput, now = new Date()): string | null {
  if (biddingStatus(tor, now)?.tone !== "open" || !tor.submissionDeadline) return null;
  const deadline = new Date(tor.submissionDeadline);
  const exact = closingTime(tor.submissionDeadline).getTime() === deadline.getTime();
  // A date-only deadline (UTC midnight) names its day directly; an exact one is read in Bangkok time.
  const lastDay = exact ? bangkokDay(deadline) : Math.floor(deadline.getTime() / DAY_MS);
  const days = lastDay - bangkokDay(now);
  const time = deadline.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  if (days <= 0) return exact ? `ปิดวันนี้ ${time} น.` : "ปิดวันนี้";
  if (days === 1) return exact ? `ปิดพรุ่งนี้ ${time} น.` : "ปิดพรุ่งนี้";
  return `เหลืออีก ${days} วัน`;
}

export function biddingStatus(tor: BiddingInput, now = new Date()): BiddingStatus | null {
  const opensAt = tor.tenderStartDate ? new Date(tor.tenderStartDate) : undefined;
  const closesAt = tor.submissionDeadline ? closingTime(tor.submissionDeadline) : undefined;

  if (closesAt && now >= closesAt) return { label: "ปิดรับสมัคร", tone: "closed" };
  // A winner or cancellation closes bidding even before the deadline.
  if (tor.hasWinner) return { label: "ปิดรับสมัคร", note: "ได้ผู้ชนะแล้ว", tone: "closed" };
  if (opensAt && now < opensAt) return { label: "ยังไม่เปิดรับสมัคร", tone: "upcoming" };
  if (closesAt) return { label: "เปิดรับสมัคร", tone: "open" };
  // No dates yet: only the draft TOR or reference price is out.
  if (tor.biddingStage === "upcoming") return { label: "ยังไม่เปิดรับสมัคร", note: "มีร่าง TOR แล้ว", tone: "upcoming" };
  return null;
}

const TONE: Record<BiddingStatus["tone"], string> = {
  open: "bg-success text-success-foreground",
  upcoming: "bg-warning text-warning-foreground",
  closed: "bg-destructive text-destructive-foreground",
};

const SIZE = {
  md: "px-3 py-1 text-sm",
  sm: "px-2.5 py-0.5 text-xs",
};

export function BiddingBadge({ tor, size = "md" }: { tor: BiddingInput; size?: keyof typeof SIZE }) {
  const status = biddingStatus(tor);
  if (!status) return null;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full font-semibold shadow-sm ${SIZE[size]} ${TONE[status.tone]}`}
    >
      <span className="size-2 rounded-full bg-current opacity-80" />
      {status.label}
      {status.note && <span className="font-normal opacity-90">· {status.note}</span>}
    </span>
  );
}
