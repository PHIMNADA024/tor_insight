"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink, FileText, FileSpreadsheet, FileType2, Archive } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const meta = [
  ["วันที่ประกาศ", "10 ส.ค. 2569"],
  ["ปรับปรุงล่าสุด", "10 ส.ค. 2569"],
  ["วันปิดรับข้อเสนอ", "30 ส.ค. 2569"],
  ["วิธีจัดซื้อจัดจ้าง", "ประกวดราคาอิเล็กทรอนิกส์ (e-Bidding)"],
  ["หมวดหมู่", "ปัญญาประดิษฐ์"],
];

const docs = [
  { icon: FileText, name: "เอกสาร TOR (ฉบับหลัก)", meta: "PDF • 1.24 MB" },
  { icon: FileType2, name: "ข้อกำหนดขอบเขตงาน (DOCX)", meta: "DOCX • 532 KB" },
  { icon: FileSpreadsheet, name: "รายละเอียดงบประมาณ", meta: "XLSX • 198 KB" },
  { icon: Archive, name: "เอกสารประกอบเพิ่มเติม", meta: "ZIP • 3.45 MB" },
];

export function TorPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader variant="app" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            กลับไปหน้าก่อนหน้า
          </button>
          <span className="rounded-md bg-success/15 px-2.5 py-1 text-xs font-medium text-success">เผยแพร่แล้ว</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight">
              โครงการพัฒนาระบบบริหารจัดการข้อมูลด้วยปัญญาประดิษฐ์
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" /> สำนักดิจิทัลกรุงเทพมหานคร
              </span>
              <span className="rounded-md bg-accent px-2 py-1 text-accent-foreground">ปัญญาประดิษฐ์</span>
              <span className="rounded-md bg-muted px-2 py-1">ปีงบประมาณ 2569</span>
            </div>
          </div>
          <div className="h-fit rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted-foreground">งบประมาณ (บาท)</p>
            <p className="mt-1 text-2xl font-semibold text-success">12,500,000</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <dl className="space-y-3 text-sm">
              {meta.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-semibold">รายละเอียดโครงการ</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              โครงการนี้มีวัตถุประสงค์เพื่อพัฒนาระบบบริหารจัดการข้อมูลด้วยปัญญาประดิษฐ์
              สำหรับสนับสนุนการวิเคราะห์ข้อมูล การจัดทำรายงานอัตโนมัติ
              และกระบวนการตัดสินใจของกรุงเทพมหานคร
            </p>
            <Button variant="outline" size="sm" className="mt-4">
              ดูรายละเอียดฉบับเต็ม
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="mb-3 text-sm font-semibold">เอกสารแนบ</h2>
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={d.name}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="flex items-center gap-3">
                    <d.icon className="size-4 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{d.name}</span>
                      <span className="block text-xs text-muted-foreground">{d.meta}</span>
                    </span>
                  </span>
                  <Button variant="outline" size="sm">
                    ดาวน์โหลด
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold">ข้อมูลแหล่งที่มา</h2>
              <p className="mt-2 text-xs text-muted-foreground">ลิงก์ต้นฉบับ</p>
              <p className="break-all text-xs text-primary">https://www.bangkok.go.th/procurement/2569/12345</p>
              <Button variant="outline" size="sm" className="mt-3">
                เปิดแหล่งที่มาต้นฉบับ <ExternalLink className="ml-1 size-3.5" />
              </Button>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
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
