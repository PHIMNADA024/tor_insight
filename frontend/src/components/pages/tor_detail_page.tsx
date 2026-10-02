"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  FileType2,
  Archive,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const NO_DATA = "ไม่มีข้อมูล";

const CATEGORY_LABELS: Record<string, string> = {
  software: "ซอฟต์แวร์และบริการ",
  it_equipment: "อุปกรณ์ไอที",
  uncategorized: "ไม่ระบุหมวดหมู่",
};

type TorDocument = {
  title?: string;
  url?: string;
  format?: string;
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
  submissionDeadline?: string;
  procurementMethod?: string;
  bidderQualifications?: string;
  sourceUrl?: string;
  documents: TorDocument[];
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

function formatMoney(value?: number): string {
  return value == null ? NO_DATA : value.toLocaleString("th-TH");
}

function docIcon(format?: string): LucideIcon {
  const f = (format ?? "").toLowerCase();
  if (f.includes("pdf")) return FileText;
  if (f.includes("doc") || f.includes("word")) return FileType2;
  if (f.includes("xls") || f.includes("sheet") || f.includes("csv")) return FileSpreadsheet;
  if (f.includes("zip") || f.includes("rar")) return Archive;
  return FileIcon;
}

// Files are served by the agency in their original format, so we open
// the source URL directly instead of proxying through our backend.
function openExternal(url?: string) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

const card = "rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]";

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
      onClick={() => router.back()}
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

  const categoryLabel = CATEGORY_LABELS[tor.category] ?? tor.category;

  const meta: [string, string][] = [
    ["วันที่ประกาศ", formatDate(tor.publishedDate)],
    ["ปรับปรุงล่าสุด", formatDate(tor.lastUpdated)],
    ["วันปิดรับข้อเสนอ", formatDate(tor.submissionDeadline)],
    ["วิธีจัดซื้อจัดจ้าง", tor.procurementMethod || NO_DATA],
    ["วงเงินจัดซื้อจัดจ้าง (บาท)", formatMoney(tor.tenderAmount)],
    ["หมวดหมู่", categoryLabel],
    ["เลขอ้างอิง (OCID)", tor.ocid],
  ];

  const documents = tor.documents.filter((d) => d.url);

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
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" /> {tor.agency}
              </span>
              <span className="rounded-md bg-accent px-2 py-1 text-accent-foreground">{categoryLabel}</span>
              {tor.fiscalYear != null && (
                <span className="rounded-md bg-muted px-2 py-1">
                  {/* Stored as a Gregorian year (2026); Thai users expect Buddhist Era (2569). */}
                  ปีงบประมาณ {tor.fiscalYear < 2400 ? tor.fiscalYear + 543 : tor.fiscalYear}
                </span>
              )}
            </div>
          </div>
          <div className={`h-fit ${card} p-4`}>
            <p className="text-xs text-muted-foreground">งบประมาณ (บาท)</p>
            <p className="mt-1 text-2xl font-semibold text-success">{formatMoney(tor.budgetAmount)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className={card}>
            <dl className="space-y-3 text-sm">
              {meta.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd
                    className={`break-all text-right font-medium ${v === NO_DATA ? "text-muted-foreground" : ""}`}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={card}>
            <h2 className="text-sm font-semibold">รายละเอียดโครงการ</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {tor.description || NO_DATA}
            </p>
            {tor.bidderQualifications && (
              <>
                <h3 className="mt-4 text-sm font-semibold">คุณสมบัติผู้ยื่นข้อเสนอ</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {tor.bidderQualifications}
                </p>
              </>
            )}
          </section>

          {documents.length > 0 && (
            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold">เอกสารแนบ</h2>
              <ul className="space-y-2">
                {documents.map((d, i) => {
                  const Icon = docIcon(d.format);
                  return (
                    <li
                      key={`${d.url}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{d.title || "เอกสารแนบ"}</span>
                          {d.format && (
                            <span className="block text-xs uppercase text-muted-foreground">{d.format}</span>
                          )}
                        </span>
                      </span>
                      <Button variant="outline" size="sm" onClick={() => openExternal(d.url)}>
                        ดาวน์โหลด
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
              <Button variant="outline" className="mt-4 w-full">
                แจ้งปัญหา
              </Button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}