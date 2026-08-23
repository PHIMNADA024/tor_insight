import type { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  Globe,
  Smartphone,
  Brain,
  BarChart3,
  MapPin,
  FileText,
  Wallet,
  Coins,
  Building2,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tors, formatTHB, categories } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "TOR Insight — รวม TOR ซอฟต์แวร์ของหน่วยงาน กทม.",
  description:
    "ค้นหา วิเคราะห์ และติดตามข้อกำหนดขอบเขตงาน (TOR) ด้านซอฟต์แวร์จากหน่วยงานกรุงเทพมหานคร ในแพลตฟอร์มเดียว",
};

const catIcons = [Globe, Smartphone, Brain, BarChart3, MapPin];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="bg-[image:var(--gradient-hero)] text-navy-foreground">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            ค้นหาโครงการพัฒนาซอฟต์แวร์จากหน่วยงานกรุงเทพมหานคร
          </h1>
          <p className="mt-4 max-w-xl text-sm text-navy-foreground/70">
            ค้นหา วิเคราะห์ และติดตาม TOR ด้านซอฟต์แวร์ได้ครบในที่เดียว
          </p>
          <form action="/search" className="mt-8 flex max-w-3xl gap-2 rounded-xl bg-card p-2 shadow-[var(--shadow-card)]">
            <Input
              name="q"
              placeholder="ค้นหาด้วยคำสำคัญ ชื่อโครงการ หรือหน่วยงาน..."
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" aria-label="ค้นหา">
              <Search className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">หมวดหมู่ยอดนิยม</h2>
            <Link href="/search" className="text-xs text-primary hover:underline">
              ดูทั้งหมด
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {categories.map((c, i) => {
              const Icon = catIcons[i] ?? Globe;

              return (
                <Link
                  key={c.name}
                  href="/search"
                  className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count} รายการ</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">TOR ล่าสุด</h2>
            <Link href="/search" className="text-xs text-primary hover:underline">
              ดูทั้งหมด
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">ชื่อโครงการ</th>
                  <th className="px-4 py-3 font-medium">หน่วยงาน</th>
                  <th className="px-4 py-3 font-medium">งบประมาณ (บาท)</th>
                  <th className="px-4 py-3 font-medium">วันที่ประกาศ</th>
                  <th className="px-4 py-3 font-medium">หมวดหมู่</th>
                </tr>
              </thead>
              <tbody>
                {tors.slice(0, 4).map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link href="/tor" className="hover:text-primary">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.agency}</td>
                    <td className="px-4 py-3">{formatTHB(t.budget)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.published}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                        {t.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="จำนวน TOR ทั้งหมด" value="351" delta="+12 รายการสัปดาห์นี้" />
          <StatCard label="งบประมาณรวม" value="1,243,750,000" unit="บาท" delta="+8.5% ปีนี้" />
          <StatCard label="งบประมาณเฉลี่ย" value="7,892,857" unit="บาท" delta="+4.2% ปีนี้" />
          <StatCard label="หน่วยงาน" value="24" delta="หน่วยงานภาครัฐ" tone="neutral" />
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: FileText, title: "รวบรวม", text: "ดึงข้อมูล TOR จากเว็บไซต์จัดซื้อจัดจ้างของหน่วยงานทุกวัน" },
            { icon: Coins, title: "จัดมาตรฐาน", text: "ปรับรูปแบบงบประมาณ วันที่ และหมวดหมู่ให้เป็นมาตรฐานเดียวกัน" },
            { icon: Building2, title: "วิเคราะห์", text: "เปรียบเทียบการใช้งบประมาณระหว่างหน่วยงานและรายปี" },
          ].map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <s.icon className="size-5 text-primary" />
              <p className="mt-3 font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <Wallet className="mx-auto mb-2 size-4" />
        TOR Insight · ข้อมูลตัวอย่างสำหรับการสาธิต
      </footer>
    </div>
  );
}
