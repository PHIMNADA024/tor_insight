type BiddingInput = {
  tenderStartDate?: string;
  submissionDeadline?: string;
  hasContract: boolean;
};

export type BiddingStatus = { label: string; note?: string; tone: "open" | "upcoming" | "closed" };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether bids are being accepted, from the bidding window when the source
 * has one. Without dates, a signed contract still means bidding has closed.
 * Returns null when there's nothing to go on.
 */
export function biddingStatus(tor: BiddingInput, now = new Date()): BiddingStatus | null {
  const opensAt = tor.tenderStartDate ? new Date(tor.tenderStartDate) : undefined;
  // Deadlines are date-only (midnight), so bids are accepted through that whole day.
  const closesAt = tor.submissionDeadline
    ? new Date(new Date(tor.submissionDeadline).getTime() + DAY_MS)
    : undefined;

  if (closesAt && now >= closesAt) return { label: "ปิดรับสมัคร", tone: "closed" };
  if (opensAt && now < opensAt) return { label: "ยังไม่เปิดรับสมัคร", tone: "upcoming" };
  if (closesAt) return { label: "เปิดรับสมัคร", tone: "open" };
  if (tor.hasContract) return { label: "ปิดรับสมัคร", note: "ได้ผู้ชนะแล้ว", tone: "closed" };
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
