"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertCircle,
    Inbox,
    RotateCw,
    LayoutDashboard,
    Search,
    Bookmark,
    Bell,
    Info,
} from "lucide-react";
import {
    Bar,
    BarChart,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { StatCard } from "@/components/StatCard";
import { categoryLabel } from "@/lib/categories";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Totals from GET /api/stats/summary for the current filters (published TORs only, same as search). */
type Stats = {
    torCount: number;
    totalBudget: number;
    averageBudget: number;
    agencyCount: number;
};

/** A TOR in the "highest budgets" list (fields from GET /api/tors). */
type TopTor = { id: string; title: string; agency: string; budgetAmount?: number };

/** "" means all agencies / all years. fiscalYear is Gregorian, as the API expects. */
type DashboardFilters = { agency: string; fiscalYear: string };

const selectClass = "h-9 rounded-md border border-input bg-card px-3 text-sm";

/** Rows from GET /api/stats/breakdown, largest budget first; share is % of the total budget. */
type BreakdownRow = { totalBudget: number; share: number };
type Breakdown = {
    byAgency: (BreakdownRow & { agency: string })[];
    byCategory: (BreakdownRow & { category: string })[];
    /** Oldest first; fiscalYear is Gregorian (2026), shown in Buddhist Era (2569). */
    byFiscalYear: (BreakdownRow & { fiscalYear: number; torCount: number })[];
};
type Slice = { name: string; value: number };

/** Slices shown per donut; the rest are combined so the chart stays readable. */
const TOP_SLICES = 5;

const roundShare = (n: number) => Math.round(n * 10) / 10;

function topSlices<T extends BreakdownRow>(rows: T[], name: (row: T) => string, othersLabel: string): Slice[] {
    const top = rows.slice(0, TOP_SLICES).map((r) => ({ name: name(r), value: roundShare(r.share) }));
    const rest = rows.slice(TOP_SLICES).reduce((sum, r) => sum + r.share, 0);
    return rest > 0 ? [...top, { name: othersLabel, value: roundShare(rest) }] : top;
}

/** null = loading, "error" = failed, otherwise the loaded data. */
type Loadable<T> = T | null | "error";

/**
 * What a chart or list shows when it has nothing to draw: a pulsing
 * placeholder while loading, an error with a retry button, or an empty note.
 */
function StatusPanel({
    state,
    onRetry,
    className = "h-44",
}: {
    state: "loading" | "error" | "empty";
    onRetry: () => void;
    className?: string;
}) {
    if (state === "loading") {
        return (
            <div className={`${className} flex animate-pulse flex-col justify-center gap-3`} aria-busy="true">
                <span className="sr-only">กำลังโหลด…</span>
                <div className="h-3 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
        );
    }
    return (
        <div className={`${className} flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground`}>
            {state === "error" ? (
                <>
                    <AlertCircle className="size-5 text-destructive" />
                    <p>โหลดข้อมูลไม่สำเร็จ</p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline"
                    >
                        <RotateCw className="size-3" /> ลองใหม่
                    </button>
                </>
            ) : (
                <>
                    <Inbox className="size-5" />
                    <p>ไม่มี TOR ตามตัวกรองนี้</p>
                </>
            )}
        </div>
    );
}

/** loading / error / empty for a Loadable list, or null when there is something to show. */
function emptyState<T>(data: Loadable<T[]>, isEmpty = (d: T[]) => d.length === 0) {
    if (data === null) return "loading" as const;
    if (data === "error") return "error" as const;
    return isEmpty(data) ? ("empty" as const) : null;
}

/** A donut once its data is in, otherwise the same card with a status panel. */
function DonutCard({ title, data, onRetry }: { title: string; data: Loadable<Slice[]>; onRetry: () => void }) {
    // All-zero shares (TORs without budgets) would draw an invisible donut.
    const state = emptyState(data, (d) => d.length === 0 || d.every((s) => s.value === 0));
    if (!state && Array.isArray(data)) return <Donut title={title} data={data} />;
    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-semibold">{title}</h2>
            <StatusPanel state={state ?? "empty"} onRetry={onRetry} className="mt-2 h-44" />
        </div>
    );
}

/** Card value: "-" if the stats couldn't be loaded (loading shows a placeholder instead). */
function statValue(stats: Loadable<Stats>, pick: (s: Stats) => number) {
    if (stats === "error" || !stats) return "-";
    return Math.round(pick(stats)).toLocaleString("th-TH");
}

const chartColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
];

const items = [
    {
        label: "แดชบอร์ด",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        label: "ค้นหา TOR",
        href: "/search",
        icon: Search,
    },
    {
        label: "การค้นหาที่บันทึกไว้",
        icon: Bookmark,
    },
    {
        label: "การแจ้งเตือน",
        href: "/notifications",
        icon: Bell,
    },
    {
        label: "เกี่ยวกับเรา",
        href: "/about",
        icon: Info,
    },
];

function Donut({
    title,
    data,
}: {
    title: string;
    data: { name: string; value: number }[];
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-semibold">{title}</h2>

            <div className="mt-2 flex items-center gap-4">
                <div className="h-44 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={2}
                            >
                                {data.map((_, i) => (
                                    <Cell
                                        key={i}
                                        fill={chartColors[i % chartColors.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <ul className="w-48 space-y-1.5 text-xs">
                    {data.map((d, i) => (
                        <li
                            key={d.name}
                            className="flex items-center justify-between gap-2"
                        >
                            {/* Agency names can be long; cut them off and show the full name on hover. */}
                            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={d.name}>
                                <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{
                                        background:
                                            chartColors[i % chartColors.length],
                                    }}
                                />
                                <span className="truncate">{d.name}</span>
                            </span>

                            <span className="shrink-0 font-medium">{d.value}%</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [filters, setFilters] = useState<DashboardFilters>({ agency: "", fiscalYear: "" });
    const [options, setOptions] = useState<{ agencies: string[]; fiscalYears: number[] }>({
        agencies: [],
        fiscalYears: [],
    });
    const [stats, setStats] = useState<Stats | null | "error">(null);
    const [breakdown, setBreakdown] = useState<Breakdown | null | "error">(null);
    const [topTors, setTopTors] = useState<TopTor[] | null | "error">(null);
    // Bumped by "ลองใหม่" to fetch the same filters again.
    const [reloadKey, setReloadKey] = useState(0);

    // Dropdown options: the same published agencies and years the search page offers.
    useEffect(() => {
        const controller = new AbortController();
        fetch(`${API_URL}/api/tors/filters`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setOptions({ agencies: data.agencies ?? [], fiscalYears: data.fiscalYears ?? [] });
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);

    // Changing a filter shows the loading state until the new numbers arrive.
    const changeFilters = (update: (f: DashboardFilters) => DashboardFilters) => {
        setStats(null);
        setBreakdown(null);
        setTopTors(null);
        setFilters(update);
    };

    const retry = () => {
        setStats(null);
        setBreakdown(null);
        setTopTors(null);
        setReloadKey((k) => k + 1);
    };

    // Cards and charts reload whenever a filter changes.
    useEffect(() => {
        const controller = new AbortController();
        const query = new URLSearchParams();
        if (filters.agency) query.set("agency", filters.agency);
        if (filters.fiscalYear) query.set("fiscalYear", filters.fiscalYear);
        const getJson = (path: string) =>
            fetch(`${API_URL}${path}?${query}`, { signal: controller.signal }).then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            });

        getJson("/api/stats/summary")
            .then((data: Stats) => setStats(data))
            .catch((err) => {
                if (err.name !== "AbortError") setStats("error");
            });
        // Highest budgets via the search API, which takes the same agency/fiscalYear filters.
        fetch(`${API_URL}/api/tors?${query}&sort=budget&limit=5`, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data: { results: TopTor[] }) => setTopTors(data.results ?? []))
            .catch((err) => {
                if (err.name !== "AbortError") setTopTors("error");
            });
        getJson("/api/stats/breakdown")
            .then((data: Breakdown) => setBreakdown(data))
            .catch((err) => {
                if (err.name !== "AbortError") setBreakdown("error");
            });
        return () => controller.abort();
    }, [filters, reloadKey]);

    const slices = (pick: (b: Breakdown) => Slice[]) =>
        breakdown === null || breakdown === "error" ? breakdown : pick(breakdown);
    const agencySlices = slices((b) => topSlices(b.byAgency, (r) => r.agency, "หน่วยงานอื่น ๆ"));
    const categorySlices = slices((b) => topSlices(b.byCategory, (r) => categoryLabel(r.category), "หมวดอื่น ๆ"));
    // Bars in millions of baht, one decimal.
    const yearBars =
        breakdown === null || breakdown === "error"
            ? breakdown
            : breakdown.byFiscalYear.map((r) => ({
                  year: String(r.fiscalYear + 543),
                  total: Math.round(r.totalBudget / 100_000) / 10,
                  torCount: r.torCount,
              }));

    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar
                subtitle="การวิเคราะห์"
                items={items}
                activeLabel="แดชบอร์ด"
            />

            <main className="flex-1 space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-xl font-semibold tracking-tight">
                        ภาพรวมแดชบอร์ดราคา
                    </h1>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="หน่วยงาน"
                            className={`${selectClass} max-w-64`}
                            value={filters.agency}
                            onChange={(e) => changeFilters((f) => ({ ...f, agency: e.target.value }))}
                        >
                            <option value="">ทุกหน่วยงาน</option>
                            {options.agencies.map((a) => (
                                <option key={a} value={a}>
                                    {a}
                                </option>
                            ))}
                        </select>

                        <select
                            aria-label="ปีงบประมาณ"
                            className={selectClass}
                            value={filters.fiscalYear}
                            onChange={(e) => changeFilters((f) => ({ ...f, fiscalYear: e.target.value }))}
                        >
                            <option value="">ทุกปีงบประมาณ</option>
                            {options.fiscalYears.map((y) => (
                                <option key={y} value={String(y)}>
                                    {y + 543}
                                </option>
                            ))}
                        </select>

                        {(filters.agency || filters.fiscalYear) && (
                            <button
                                type="button"
                                className="cursor-pointer text-xs text-primary hover:underline"
                                onClick={() => changeFilters(() => ({ agency: "", fiscalYear: "" }))}
                            >
                                ล้างตัวกรอง
                            </button>
                        )}
                    </div>
                </div>

                {stats !== null && stats !== "error" && stats.torCount === 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Inbox className="size-4" /> ไม่พบ TOR ที่ตรงกับตัวกรองนี้ ลองเลือกหน่วยงานหรือปีงบประมาณอื่น
                        </span>
                        <button
                            type="button"
                            className="cursor-pointer text-xs text-primary hover:underline"
                            onClick={() => changeFilters(() => ({ agency: "", fiscalYear: "" }))}
                        >
                            ล้างตัวกรอง
                        </button>
                    </div>
                )}

                {stats === "error" && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                        <span className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="size-4" /> โหลดข้อมูลแดชบอร์ดไม่สำเร็จ
                        </span>
                        <button type="button" className="cursor-pointer text-xs text-primary hover:underline" onClick={retry}>
                            ลองใหม่
                        </button>
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="งบประมาณรวม"
                        loading={stats === null}
                        value={statValue(stats, (s) => s.totalBudget)}
                        unit="บาท"
                        delta="ของ TOR ที่เผยแพร่ตามตัวกรอง"
                        tone="neutral"
                    />

                    <StatCard
                        label="งบประมาณเฉลี่ย"
                        loading={stats === null}
                        value={statValue(stats, (s) => s.averageBudget)}
                        unit="บาท"
                        delta="ต่อ TOR (เฉพาะที่ระบุงบ)"
                        tone="neutral"
                    />

                    <StatCard
                        label="จำนวน TOR ทั้งหมด"
                        loading={stats === null}
                        value={statValue(stats, (s) => s.torCount)}
                        delta="รายการที่เผยแพร่"
                        tone="neutral"
                    />

                    <StatCard
                        label="หน่วยงาน"
                        loading={stats === null}
                        value={statValue(stats, (s) => s.agencyCount)}
                        delta="ที่มี TOR ในระบบ"
                        tone="neutral"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <DonutCard title="งบประมาณตามหน่วยงาน (5 อันดับแรก)" data={agencySlices} onRetry={retry} />
                    <DonutCard title="งบประมาณตามหมวดหมู่" data={categorySlices} onRetry={retry} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="text-sm font-semibold">
                            งบประมาณตามปีงบประมาณ
                        </h2>

                        <p className="text-xs text-muted-foreground">
                            หน่วย: ล้านบาท
                        </p>

                        <div className="mt-3 h-56">
                            {!Array.isArray(yearBars) || emptyState(yearBars) ? (
                                <StatusPanel state={emptyState(yearBars) ?? "empty"} onRetry={retry} className="h-full" />
                            ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={yearBars}>
                                    <XAxis
                                        dataKey="year"
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={12}
                                    />

                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={12}
                                    />

                                    <Tooltip
                                        formatter={(value) => [`${Number(value).toLocaleString("th-TH")} ล้านบาท`, "งบประมาณ"]}
                                        labelFormatter={(year) => `ปีงบประมาณ ${year}`}
                                    />

                                    <Bar
                                        dataKey="total"
                                        fill="var(--chart-1)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="mb-3 text-sm font-semibold">
                            5 โครงการงบประมาณสูงสุด
                        </h2>

                        {!Array.isArray(topTors) || emptyState(topTors) ? (
                            <StatusPanel state={emptyState(topTors) ?? "empty"} onRetry={retry} className="h-48" />
                        ) : (
                            <ol className="space-y-3 text-sm">
                                {topTors.map((t, i) => (
                                    <li key={t.id} className="flex items-start justify-between gap-4">
                                        <Link
                                            href={`/tor/${t.id}`}
                                            className="min-w-0 text-muted-foreground hover:text-primary hover:underline"
                                        >
                                            {i + 1}. {t.title}
                                            <span className="block text-xs opacity-80">{t.agency}</span>
                                        </Link>

                                        <span className="whitespace-nowrap font-medium">
                                            {Math.round(t.budgetAmount ?? 0).toLocaleString("th-TH")} บาท
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}