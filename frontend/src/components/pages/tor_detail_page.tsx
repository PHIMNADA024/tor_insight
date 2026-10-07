"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Clock, ExternalLink, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/categories";
import { BiddingBadge, timeLeftLabel } from "@/components/BiddingBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const NO_DATA = "ไม่มีข้อมูล";


type TorItem = {
  description?: string;
  unspscCode?: string;
  unspscDescription?: string;
  quantity?: number;
  unit?: string;
};

type TorContract = {
  title?: string;
  startDate?: string;
  endDate?: string;
  amount?: number;
  amountSpent?: number;
};

type TorDetail = {
  id: string;
  ocid: string;
  title: string;
  description?: string;
  agency: string;
  category: string;
  fiscalYear?: number;
  budgetAmount?: number;
  tenderAmount?: number;
  publishedDate?: string;
  tenderStartDate?: string;
  submissionDeadline?: string;
  awardAnnouncedAt?: string;
  biddingStage?: string;
  detailSummary?: string;
  procurementMethod?: string;
  bidderQualifications?: string;
  sourceUrl?: string;
  items: TorItem[];
  suppliers: string[];
  // e-GP only: the winning price and contract status stand in for contracts.
  awardAmount?: number;
  contractStatus?: string;
  contracts: TorContract[];
  lastUpdated?: string;
};

type LoadState = "loading" | "ready" | "notfound" | "error";


function formatDate(value?: string): string {
  if (!value) return NO_DATA;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  // th-TH gives the Buddhist year (2569) and Thai month names.
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The OCID without its source prefix: "egp-69099318566" → "69099318566",
 * "ocds-bq4ldt-6904…-001" → "6904…-001". Display only; the stored OCID keeps it.
 */
function referenceNumber(ocid: string): string {
  return ocid.replace(/^(ocds-[a-z0-9]+-|egp-|gproc-|mea-)/i, "");
}

function formatMoney(value?: number): string {
  return value == null ? NO_DATA : value.toLocaleString("th-TH");
}

// Opens the agency's own page directly rather than proxying through our backend.
function openExternal(url?: string) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

const card = "rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]";
const subheading = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** One signed contract: title, period, value and how much has been paid. */
function ContractCard({ contract }: { contract: TorContract }) {
  const { amount, amountSpent } = contract;
  const percent =
    amount && amountSpent != null ? Math.min(100, Math.round((amountSpent / amount) * 100)) : null;

  return (
    <div className="rounded-lg border border-border p-3">
      {contract.title && <p className="text-sm leading-relaxed">{contract.title}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">ระยะเวลาสัญญา</dt>
          <dd className="mt-0.5 font-medium">
            {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">มูลค่าสัญญา (บาท)</dt>
          <dd className="mt-0.5 font-medium">{formatMoney(amount)}</dd>
        </div>
      </dl>
      {percent != null && (
        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">เบิกจ่ายแล้ว</span>
            <span className="font-medium">
              {formatMoney(amountSpent)} บาท ({percent}%)
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders AI-written text: a lead paragraph followed by "- " bullet lines. */
/** Label/value rows, label on the left and value right-aligned. */
function InfoList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 space-y-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd className={`break-all text-right font-medium ${v === NO_DATA ? "text-muted-foreground" : ""}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "๑๒ เดือน" → "12 เดือน". e-GP documents use Thai digits; the rest of the page doesn't. */
function arabicDigits(text: string) {
  return text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

function SummaryText({ text }: { text: string }) {
  const lines = arabicDigits(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const paragraphs = lines.filter((l) => !l.startsWith("- "));
  const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {bullets.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SummaryState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Loaded separately from the TOR itself: the first view of a TOR waits a few
 * seconds on the model, and the rest of the page shouldn't wait with it.
 */
function TorSummarySection({ id }: { id: string }) {
  const [summary, setSummary] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/tors/${id}/summary`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503) return setSummary({ status: "unavailable" });
        if (!res.ok) return setSummary({ status: "error" });
        const data: { text: string } = await res.json();
        if (!cancelled) setSummary({ status: "ready", text: data.text });
      })
      .catch(() => {
        if (!cancelled) setSummary({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <section className={card}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" />
        สรุป TOR
      </h2>

      {summary.status === "loading" && (
        <p className="animate-pulse text-sm text-muted-foreground">กำลังสรุปข้อมูล...</p>
      )}
      {summary.status === "unavailable" && (
        <p className="text-sm text-muted-foreground">ยังไม่เปิดใช้งานการสรุป TOR</p>
      )}
      {summary.status === "error" && (
        <p className="text-sm text-muted-foreground">สรุปข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
      )}
      {summary.status === "ready" && <SummaryText text={summary.text} />}
    </section>
  );
}

export function TorPage({ id }: { id: string }) {
  const router = useRouter();
  const [tor, setTor] = useState<TorDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/tors/${id}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 400) {
          if (!cancelled) setState("notfound");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TorDetail = await res.json();
        if (!cancelled) {
          setTor(data);
          setState("ready");
        }
      })
      .catch((err) => {
        console.error("Failed to load TOR:", err);
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const backButton = (
    <button
      type="button"
      onClick={() => {
        // Opened in a new tab (e.g. a shared link), there is nothing to go back
        // to and router.back() does nothing, so go to search instead.
        if (window.history.length > 1) router.back();
        else router.push("/search");
      }}
      className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      กลับไปหน้าก่อนหน้า
    </button>
  );

  if (state !== "ready" || !tor) {
    const message =
      state === "loading"
        ? "กำลังโหลดข้อมูล..."
        : state === "notfound"
          ? "ไม่พบ TOR นี้ หรือยังไม่ได้เผยแพร่"
          : "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง";

    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-6">{backButton}</div>
          <div className={`${card} text-center text-sm text-muted-foreground`}>{message}</div>
        </main>
      </div>
    );
  }

  const torCategoryLabel = categoryLabel(tor.category);

  // "เก็บข้อมูลครั้งแรก" and "อัปเดตจากแหล่งที่มา" are when we first collected
  // the record and when the source last regenerated it. BMA doesn't publish an
  // announcement date, so the labels say what the dates actually are. The
  // bidding window only shows when the source has one (few BMA records do).
  const dates: [string, string][] = [
    ...(tor.tenderStartDate ? [["วันเปิดรับข้อเสนอ", formatDate(tor.tenderStartDate)] as [string, string]] : []),
    ...(tor.submissionDeadline ? [["วันปิดรับข้อเสนอ", formatDate(tor.submissionDeadline)] as [string, string]] : []),
    ["เก็บข้อมูลครั้งแรก", formatDate(tor.publishedDate)],
    ["อัปเดตจากแหล่งที่มา", formatDate(tor.lastUpdated)],
  ];

  const meta: [string, string][] = [
    ["วิธีจัดซื้อจัดจ้าง", tor.procurementMethod || NO_DATA],
    ["งบประมาณ (บาท)", formatMoney(tor.budgetAmount)],
    ["ราคากลาง (บาท)", formatMoney(tor.tenderAmount)],
    ["หมวดหมู่", torCategoryLabel],
    ["เลขอ้างอิง", referenceNumber(tor.ocid)],
  ];

  // Headline figure is always the budget. For BMA records this is the whole
  // budget line, which can be shared by several procurements, so it may be
  // larger than this TOR's contract; the contract value is listed below.
  const contracts = tor.contracts ?? [];
  const headlineLabel = "งบประมาณ (บาท)";
  const headlineAmount = tor.budgetAmount;
  const bidding = { ...tor, hasWinner: contracts.length > 0 || !!tor.awardAnnouncedAt };
  const timeLeft = timeLeftLabel(bidding);
  // 3 days or less left is shown as urgent.
  const timeLeftUrgent = !!timeLeft && (!timeLeft.startsWith("เหลืออีก") || Number(timeLeft.match(/\d+/)?.[0]) <= 3);

  const items = tor.items ?? [];
  const suppliers = tor.suppliers ?? [];
  const hasProjectDetails =
    !!tor.detailSummary ||
    items.length > 0 ||
    suppliers.length > 0 ||
    contracts.length > 0 ||
    !!tor.bidderQualifications;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          {backButton}
          <span className="rounded-md bg-success/15 px-2.5 py-1 text-xs font-medium text-success">เผยแพร่แล้ว</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight">{tor.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <BiddingBadge tor={bidding} />
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" /> {tor.agency}
              </span>
              <span className="rounded-md bg-accent px-2 py-1 text-accent-foreground">{torCategoryLabel}</span>
              {tor.fiscalYear != null && (
                <span className="rounded-md bg-muted px-2 py-1">
                  {/* Stored as a Gregorian year (2026); Thai users expect Buddhist Era (2569). */}
                  ปีงบประมาณ {tor.fiscalYear < 2400 ? tor.fiscalYear + 543 : tor.fiscalYear}
                </span>
              )}
            </div>
            {tor.description && <p className="mt-2 text-sm text-muted-foreground">{tor.description}</p>}
          </div>
          <div className={`h-fit ${card} p-4`}>
            <p className="text-xs text-muted-foreground">{headlineLabel}</p>
            <p className="mt-1 text-2xl font-semibold text-success">{formatMoney(headlineAmount)}</p>
            {timeLeft && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">เวลาที่เหลือในการยื่นข้อเสนอ</p>
                <p
                  className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${timeLeftUrgent ? "text-warning" : "text-foreground"}`}
                >
                  <Clock className="size-4" />
                  {timeLeft}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section className={card}>
              <h2 className="text-sm font-semibold">ข้อมูลทั่วไป</h2>
              <InfoList rows={meta} />
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold">กำหนดการ</h2>
              <InfoList rows={dates} />
            </section>
          </div>

          <section className={card}>
            <h2 className="text-sm font-semibold">รายละเอียดโครงการ</h2>

            {!hasProjectDetails && <p className="mt-2 text-sm text-muted-foreground">{NO_DATA}</p>}

            {/* e-GP records: a summary of the TOR document stands in for items/contracts. */}
            {tor.detailSummary && (
              <div className="mt-3">
                <SummaryText text={tor.detailSummary} />
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-4">
                <h3 className={subheading}>รายการที่จัดซื้อจัดจ้าง</h3>
                <ul className="mt-2 space-y-2">
                  {items.map((item, i) => (
                    <li key={`${item.unspscCode}-${i}`} className="text-sm">
                      <span className="font-medium">{arabicDigits(item.description || NO_DATA)}</span>
                      {item.quantity != null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.quantity.toLocaleString("th-TH")} {item.unit}
                        </span>
                      )}
                      {item.unspscCode && (
                        <span className="block text-xs text-muted-foreground">
                          UNSPSC {item.unspscCode}
                          {item.unspscDescription && ` · ${item.unspscDescription}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {suppliers.length > 0 && (
              <div className="mt-4">
                <h3 className={subheading}>ผู้ได้รับการคัดเลือก</h3>
                <ul className="mt-2 space-y-1 text-sm font-medium">
                  {suppliers.map((name) => (
                    <li key={name}>{arabicDigits(name)}</li>
                  ))}
                </ul>
                {(tor.awardAmount != null || tor.contractStatus) && (
                  <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">ราคาที่ชนะ (บาท)</dt>
                      <dd className="mt-0.5 font-medium">{formatMoney(tor.awardAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">สถานะสัญญา</dt>
                      <dd className="mt-0.5 font-medium">{tor.contractStatus || NO_DATA}</dd>
                    </div>
                  </dl>
                )}
              </div>
            )}

            {contracts.length > 0 && (
              <div className="mt-4">
                <h3 className={subheading}>สัญญา</h3>
                <div className="mt-2 space-y-3">
                  {contracts.map((c, i) => (
                    <ContractCard key={i} contract={c} />
                  ))}
                </div>
              </div>
            )}

            {tor.bidderQualifications && (
              <div className="mt-4">
                <h3 className={subheading}>คุณสมบัติผู้ยื่นข้อเสนอ</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {tor.bidderQualifications}
                </p>
              </div>
            )}
          </section>

          <TorSummarySection id={id} />

          <div className="space-y-6">
            <section className={card}>
              <h2 className="text-sm font-semibold">ข้อมูลแหล่งที่มา</h2>
              <p className="mt-2 text-xs text-muted-foreground">ลิงก์ต้นฉบับ</p>
              {tor.sourceUrl ? (
                <>
                  <p className="break-all text-xs text-primary">{tor.sourceUrl}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => openExternal(tor.sourceUrl)}>
                    เปิดแหล่งที่มาต้นฉบับ <ExternalLink className="ml-1 size-3.5" />
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{NO_DATA}</p>
              )}
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold">แจ้งข้อมูลไม่ถูกต้อง</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                พบข้อมูลผิดพลาดหรือไม่เป็นปัจจุบัน? ช่วยเราปรับปรุงด้วยการแจ้งเข้ามาได้เลย
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => router.push(`/my-feedback?torId=${encodeURIComponent(tor.id)}`)}
              >
                แจ้งปัญหา
              </Button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}