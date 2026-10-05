"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Search,
    Globe,
    Monitor,
    Package,
    Wrench,
    FileText,
    Wallet,
    Coins,
    Building2,
    type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTHB } from "@/lib/mock-data";
import { categoryLabel } from "@/lib/categories";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** How many category cards the home page shows (the grid has 5 columns). */
const TOP_CATEGORIES = 5;

/** Icon per category key. Anything not listed falls back to Globe. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    tender_invitation: FileText,
    equipment: Monitor,
    materials: Package,
    services: Wrench,
    other_expenses: Coins,
    construction: Building2,
};

/** Shape of a TOR record as returned by GET /api/tors. */
type TorSummary = {
    id: string;
    title: string;
    agency: string;
    category: string;
    budgetAmount?: number;
    fiscalYear?: number;
    publishedDate?: string;
};

/** Shape of GET /api/tors/stats. */
type TorStats = {
    torCount: number;
    totalBudget: number;
    avgBudget: number;
    agencyCount: number;
    categories: { category: string; count: number; totalBudget: number }[];
};

/** Formats a whole number with thousand separators, e.g. 1,243,750,000. */
function formatNumber(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

export function HomePage() {
    // Records from the API. Empty until the fetch resolves.
    const [tors, setTors] = useState<TorSummary[]>([]);
    // Totals for the category and stat cards. Null until loaded.
    const [stats, setStats] = useState<TorStats | null>(null);

    useEffect(() => {
        fetch(`${API_URL}/api/tors?limit=4`)
            .then(async (res) => {
                // An error response (e.g. 429 from the rate limiter) has no
                // `results`; keep the list empty instead of crashing the page.
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setTors(data.results ?? []);
            })
            .catch((err) => console.error("Failed to load TORs:", err));

        fetch(`${API_URL}/api/tors/stats`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setStats(await res.json());
            })
            .catch((err) => console.error("Failed to load stats:", err));
    }, []);

    // Shown in the stat cards while loading or if the request failed.
    const placeholder = "–";

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
                            className="border-0 text-foreground shadow-none focus-visible:ring-0"
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
                        {/* The API already sorts categories by count, largest first. */}
                        {(stats?.categories ?? []).slice(0, TOP_CATEGORIES).map((c) => {
                            const Icon = CATEGORY_ICONS[c.category] ?? Globe;

                            return (
                                <Link
                                    key={c.category}
                                    href={`/search?category=${encodeURIComponent(c.category)}`}
                                    className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
                                >
                                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                                        <Icon className="size-4" />
                                    </span>
                                    <p className="mt-3 text-sm font-medium">{categoryLabel(c.category)}</p>
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
                                {tors.map((t) => (
                                    <tr key={t.id} className="border-t border-border">
                                        <td className="px-4 py-3">
                                            <Link href={`/tor/${t.id}`} className="hover:text-primary">
                                                {t.title}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{t.agency}</td>
                                        <td className="px-4 py-3">{formatTHB(t.budgetAmount ?? 0)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {t.publishedDate
                                                ? new Date(t.publishedDate).toLocaleDateString("th-TH")
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                                                {categoryLabel(t.category)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="จำนวน TOR ทั้งหมด"
                        value={stats ? formatNumber(stats.torCount) : placeholder}
                        delta="ที่เผยแพร่แล้ว"
                        tone="neutral"
                    />
                    <StatCard
                        label="งบประมาณรวม"
                        value={stats ? formatNumber(stats.totalBudget) : placeholder}
                        unit="บาท"
                        delta="รวมทุกหมวดหมู่"
                        tone="neutral"
                    />
                    <StatCard
                        label="งบประมาณเฉลี่ย"
                        value={stats ? formatNumber(stats.avgBudget) : placeholder}
                        unit="บาท"
                        delta="ต่อ TOR"
                        tone="neutral"
                    />
                    <StatCard
                        label="หน่วยงาน"
                        value={stats ? formatNumber(stats.agencyCount) : placeholder}
                        delta="หน่วยงานภาครัฐ"
                        tone="neutral"
                    />
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
                TOR Insight · ข้อมูลจากกรุงเทพมหานครและระบบ e-GP
            </footer>
        </div>
    );
}