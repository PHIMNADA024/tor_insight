"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
} from "lucide-react";
import {
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { StatCard } from "@/components/StatCard";
import { SiteHeader } from "@/components/SiteHeader";

const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const items = [
    {
        label: "ภาพรวม",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        label: "จัดการ TOR",
        href: "/admin/tors",
        icon: FileStack,
    },
    {
        label: "การเก็บรวบรวมข้อมูล",
        href: "/admin/sync",
        icon: Database,
    },
    {
        label: "ข้อเสนอแนะ",
        href: "/admin/feedback",
        icon: MessageSquare,
    },
    {
        label: "ผู้ใช้งาน",
        href: "/admin/users",
        icon: Users,
    },
];

const TOR_STATUSES = [
    { value: "published", name: "เผยแพร่แล้ว", color: "var(--chart-1)" },
    { value: "draft", name: "ฉบับร่าง", color: "var(--chart-4)" },
    { value: "archived", name: "เก็บถาวร", color: "var(--chart-5)" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
    bma: "BMA Open Contracting",
    egp: "e-GP กรุงเทพมหานคร",
    gprocurement: "e-GP กรมบัญชีกลาง",
};

const FEEDBACK_LABELS: Record<string, string> = {
    incorrect_info: "ข้อมูลไม่ถูกต้อง",
    outdated_info: "ข้อมูลล้าสมัย",
    broken_link: "ลิงก์ใช้งานไม่ได้",
    app_feedback: "ข้อเสนอแนะเกี่ยวกับแอป",
    other: "อื่น ๆ",
};

const SYNC_STATUS_LABELS: Record<string, string> = {
    success: "สำเร็จ",
    failed: "ล้มเหลว",
    in_progress: "กำลังทำงาน",
};

type StatusCounts = Record<
    (typeof TOR_STATUSES)[number]["value"],
    number
>;

type FeedbackItem = {
    _id: string;
    category: string;
    description: string;
    torReference?: string;
    createdAt: string;
};

type SyncLog = {
    id: string;
    sourceId: string;
    status: string;
    startedAt: string;
    recordsRead: number;
    recordsInserted: number;
};

type OverviewData = {
    torCounts: StatusCounts;
    statusChanges: StatusCounts;
    feedback: FeedbackItem[];
    syncRuns: SyncLog[];
};

function getToken() {
    if (typeof window === "undefined") return null;

    return (
        localStorage.getItem("token") ??
        sessionStorage.getItem("token")
    );
}

async function getJson(path: string, signal: AbortSignal) {
    const res = await fetch(`${API_URL}${path}`, {
        signal,
        headers: {
            Authorization: `Bearer ${getToken()}`,
        },
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
}

function formatDate(value: string) {
    return new Date(value).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getStatusDelta(change: number) {
    if (change > 0) {
        return {
            delta: `+${change.toLocaleString("th-TH")} รายการใหม่ใน 7 วันที่ผ่านมา`,
            tone: "up" as const,
        };
    }

    if (change < 0) {
        return {
            delta: `${change.toLocaleString("th-TH")} รายการใน 7 วันที่ผ่านมา`,
            tone: "down" as const,
        };
    }

    return {
        delta: "ไม่มีการเปลี่ยนแปลงใน 7 วันที่ผ่านมา",
        tone: "neutral" as const,
    };
}

export default function AdminPage() {
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        async function loadOverview() {
            try {
                const [stats, feedbackData, syncData] = await Promise.all([
                    getJson("/api/admin/tors/stats", controller.signal),
                    getJson("/api/admin/feedback", controller.signal),
                    getJson("/api/admin/sync-logs/latest", controller.signal),
                ]);

                if (controller.signal.aborted) return;

                setOverview({
                    torCounts: (stats as {
                        counts: StatusCounts;
                    }).counts,
                    statusChanges: (stats as {
                        statusChanges: StatusCounts;
                    }).statusChanges,
                    feedback:
                        (feedbackData as {
                            feedback?: FeedbackItem[];
                        }).feedback?.slice(0, 3) ?? [],
                    syncRuns:
                        (syncData as {
                            results?: SyncLog[];
                        }).results ?? [],
                });
            } catch {
                if (!controller.signal.aborted) {
                    setError(true);
                }
            }
        }

        void loadOverview();

        return () => controller.abort();
    }, []);

    const totalTors = overview
        ? Object.values(overview.torCounts).reduce(
              (sum, count) => sum + count,
              0
          )
        : 0;

    const totalStatusChange = overview
        ? Object.values(overview.statusChanges).reduce(
              (sum, count) => sum + count,
              0
          )
        : 0;

    const displayCount = (value: number) =>
        error ? "-" : value.toLocaleString("th-TH");

    const statusData = TOR_STATUSES.map((status) => ({
        ...status,
        value: overview?.torCounts[status.value] ?? 0,
    }));

    const totalAdded = overview
        ? Object.values(overview.statusChanges).reduce(
              (sum, change) => sum + Math.max(change, 0),
              0
          )
        : 0;

    const totalRemoved = overview
        ? Object.values(overview.statusChanges).reduce(
              (sum, change) => sum + Math.max(-change, 0),
              0
          )
        : 0;

    const totalDelta = totalAdded - totalRemoved;
    const totalTrend = getStatusDelta(totalDelta);

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8 sm:px-6">
                <DashboardSidebar
                    subtitle="ผู้ดูแลระบบ"
                    items={items}
                    activeLabel="ภาพรวม"
                />

                <main className="min-w-0 flex-1 space-y-6">
                    <h1 className="text-xl font-semibold tracking-tight">
                        ภาพรวมผู้ดูแลระบบ
                    </h1>

                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="จำนวน TOR ทั้งหมด"
                            value={displayCount(totalTors)}
                            loading={!overview && !error}
                            delta={
                                overview
                                    ? totalTrend.delta
                                    : undefined
                            }
                            tone={
                                overview
                                    ? totalTrend.tone
                                    : "neutral"
                            }
                        />

                        {TOR_STATUSES.map((status) => {
                            const change =
                                overview?.statusChanges[status.value] ?? 0;
                            const trend = getStatusDelta(change);

                            return (
                                <StatCard
                                    key={status.value}
                                    label={status.name}
                                    value={displayCount(
                                        overview?.torCounts[status.value] ?? 0
                                    )}
                                    loading={!overview && !error}
                                    delta={
                                        overview
                                            ? trend.delta
                                            : undefined
                                    }
                                    tone={
                                        overview
                                            ? trend.tone
                                            : "neutral"
                                    }
                                />
                            );
                        })}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                            <h2 className="text-sm font-semibold">
                                ภาพรวมสถานะ TOR
                            </h2>

                            <div className="mt-2 flex items-center gap-4">
                                <div className="h-44 flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={statusData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={45}
                                                outerRadius={70}
                                                paddingAngle={2}
                                            >
                                                {statusData.map((d) => (
                                                    <Cell
                                                        key={d.name}
                                                        fill={d.color}
                                                    />
                                                ))}
                                            </Pie>

                                            <Tooltip
                                                formatter={(value, name) => {
                                                    const percentage =
                                                        totalTors > 0
                                                            ? (Number(value) /
                                                                  totalTors) *
                                                              100
                                                            : 0;

                                                    return [
                                                        `${percentage.toFixed(1)}%`,
                                                        name,
                                                    ];
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                <ul className="w-40 space-y-1.5 text-xs">
                                    {statusData.map((d) => {
                                        const percentage =
                                            totalTors > 0
                                                ? (d.value / totalTors) * 100
                                                : 0;

                                        return (
                                            <li
                                                key={d.name}
                                                className="flex items-center justify-between gap-2"
                                            >
                                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                                    <span
                                                        className="size-2 rounded-full"
                                                        style={{
                                                            background: d.color,
                                                        }}
                                                    />
                                                    {d.name}
                                                </span>

                                                <span className="font-medium">
                                                    {percentage.toFixed(1)}%
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </section>

                        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                            <h2 className="mb-3 text-sm font-semibold">
                                ข้อเสนอแนะล่าสุด
                            </h2>

                            <ul className="space-y-3">
                                {overview?.feedback.map((f) => (
                                    <li
                                        key={f._id}
                                        className="flex items-start justify-between gap-3"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium">
                                                {FEEDBACK_LABELS[f.category] ??
                                                    f.category}
                                            </span>

                                            <span className="block break-words text-xs text-muted-foreground">
                                                {f.torReference || f.description}
                                            </span>
                                        </span>

                                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                            {formatDate(f.createdAt)}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            {overview && overview.feedback.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    ยังไม่มีข้อเสนอแนะ
                                </p>
                            )}

                            <Link
                                href="/admin/feedback"
                                className="mt-4 inline-block text-xs text-primary hover:underline"
                            >
                                ดูข้อเสนอแนะทั้งหมด →
                            </Link>
                        </section>
                    </div>

                    <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="mb-3 text-sm font-semibold">
                            งานเก็บรวบรวมข้อมูลล่าสุด
                        </h2>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead className="text-left text-xs text-muted-foreground">
                                    <tr>
                                        <th className="pb-2 font-medium">
                                            แหล่งข้อมูล
                                        </th>
                                        <th className="pb-2 font-medium">
                                            สถานะ
                                        </th>
                                        <th className="pb-2 font-medium">
                                            อ่าน / เพิ่มใหม่
                                        </th>
                                        <th className="pb-2 font-medium">
                                            รันล่าสุด
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {overview?.syncRuns.map((run) => (
                                        <tr
                                            key={run.id}
                                            className="border-t border-border"
                                        >
                                            <td className="py-2.5">
                                                {SOURCE_LABELS[run.sourceId] ??
                                                    run.sourceId}
                                            </td>

                                            <td className="py-2.5">
                                                <span
                                                    className={`rounded-md px-2 py-0.5 text-xs ${
                                                        run.status === "success"
                                                            ? "bg-success/15 text-success"
                                                            : run.status === "failed"
                                                              ? "bg-destructive/15 text-destructive"
                                                              : "bg-warning/15 text-warning"
                                                    }`}
                                                >
                                                    {SYNC_STATUS_LABELS[run.status] ??
                                                        run.status}
                                                </span>
                                            </td>

                                            <td className="py-2.5 text-muted-foreground">
                                                {run.recordsRead.toLocaleString("th-TH")}{" "}
                                                /{" "}
                                                {run.recordsInserted.toLocaleString("th-TH")}
                                            </td>

                                            <td className="py-2.5 text-muted-foreground">
                                                {formatDate(run.startedAt)}
                                            </td>
                                        </tr>
                                    ))}

                                    {overview && overview.syncRuns.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={4}
                                                className="py-6 text-center text-muted-foreground"
                                            >
                                                ยังไม่มีประวัติการเก็บข้อมูล
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <Link
                            href="/admin/sync"
                            className="mt-3 inline-block text-xs text-primary hover:underline"
                        >
                            ดูงานทั้งหมด →
                        </Link>
                    </section>
                </main>
            </div>
        </div>
    );
}