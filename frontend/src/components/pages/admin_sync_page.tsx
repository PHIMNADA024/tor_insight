"use client";

import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Loader2,
} from "lucide-react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const items = [
    { label: "ภาพรวม", href: "/admin", icon: LayoutDashboard },
    { label: "จัดการ TOR", href: "/admin/tors", icon: FileStack },
    { label: "การเก็บรวบรวมข้อมูล", href: "/admin/sync", icon: Database },
    { label: "ข้อเสนอแนะ", href: "/admin/feedback", icon: MessageSquare },
    { label: "ผู้ใช้งาน", href: "/admin/users", icon: Users },
];

const SOURCE_LABELS: Record<string, string> = {
    bma: "BMA Open Contracting",
    egp: "e-GP กรมบัญชีกลาง",
};

const STATUS_LABELS: Record<string, string> = {
    success: "สำเร็จ",
    failed: "ล้มเหลว",
    in_progress: "กำลังทำงาน",
};

const STATUS_BADGE: Record<string, string> = {
    success: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
    in_progress: "bg-warning/15 text-warning",
};

const TRIGGER_LABELS: Record<string, string> = {
    scheduled: "อัตโนมัติ",
    manual: "ด้วยตนเอง",
};

const PAGE_SIZE = 10;

const card = "rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]";

type SyncLogItem = {
    id: string;
    sourceId: string;
    status: "success" | "failed" | "in_progress";
    trigger: "scheduled" | "manual";
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    recordsRead: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsSkipped: number;
    errorMessage: string | null;
};

type Pagination = { page: number; totalPages: number; total: number };

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

async function getJson(path: string) {
    const res = await fetch(`${API_URL}${path}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function formatDateTime(value: string | null): string {
    if (!value) return "-";
    return new Date(value).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDuration(ms: number | null): string {
    if (ms == null) return "-";
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} วินาที`;
    return `${Math.round(ms / 60_000)} นาที`;
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_BADGE[status] ?? "bg-muted"}`}>
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

/** One card per data source showing its most recent run. */
function SourceCard({ log }: { log: SyncLogItem }) {
    const Icon =
        log.status === "success" ? CheckCircle2 : log.status === "failed" ? XCircle : Loader2;
    const iconColor =
        log.status === "success"
            ? "text-success"
            : log.status === "failed"
              ? "text-destructive"
              : "text-warning";

    return (
        <div className={card}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">{SOURCE_LABELS[log.sourceId] ?? log.sourceId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        รันล่าสุด {formatDateTime(log.startedAt)} · {TRIGGER_LABELS[log.trigger] ?? log.trigger}
                    </p>
                </div>
                <Icon className={`size-5 shrink-0 ${iconColor}`} />
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                    <dt className="text-xs text-muted-foreground">เพิ่มใหม่</dt>
                    <dd className="font-semibold">{log.recordsInserted.toLocaleString("th-TH")}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">อัปเดต</dt>
                    <dd className="font-semibold">{log.recordsUpdated.toLocaleString("th-TH")}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">ระยะเวลา</dt>
                    <dd className="font-semibold">{formatDuration(log.durationMs)}</dd>
                </div>
            </dl>

            {log.status === "failed" && (
                <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {log.errorMessage || "ไม่มีรายละเอียดข้อผิดพลาด"}
                </p>
            )}
        </div>
    );
}

export default function AdminSyncPage() {
    const [latest, setLatest] = useState<SyncLogItem[]>([]);
    const [logs, setLogs] = useState<SyncLogItem[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0 });
    const [source, setSource] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
        if (source) params.set("sourceId", source);
        if (status) params.set("status", status);

        Promise.all([getJson("/api/admin/sync-logs/latest"), getJson(`/api/admin/sync-logs?${params}`)])
            .then(([latestData, logsData]) => {
                if (cancelled) return;
                setLatest(latestData.results ?? []);
                setLogs(logsData.results ?? []);
                setPagination(logsData.pagination ?? { page: 1, totalPages: 1, total: 0 });
                setError(null);
            })
            .catch(() => {
                if (!cancelled) setError("โหลดข้อมูลการเก็บรวบรวมไม่สำเร็จ");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [source, status, page, reloadKey]);

    function changeFilter(update: () => void) {
        setIsLoading(true);
        setPage(1);
        update();
    }

    function goToPage(next: number) {
        setIsLoading(true);
        setPage(next);
    }

    function refresh() {
        setIsLoading(true);
        setReloadKey((k) => k + 1);
    }

    const selectClass =
        "h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar subtitle="ผู้ดูแลระบบ" items={items} activeLabel="การเก็บรวบรวมข้อมูล" />

            <main className="flex-1 p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">การเก็บรวบรวมข้อมูล</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            สถานะและประวัติการดึงข้อมูล TOR จากแหล่งข้อมูลภาครัฐ
                        </p>
                    </div>
                    <Button variant="outline" onClick={refresh} disabled={isLoading}>
                        <RefreshCw className={`mr-2 size-4 ${isLoading ? "animate-spin" : ""}`} />
                        รีเฟรช
                    </Button>
                </div>

                {error && (
                    <div className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
                )}

                <section className="mb-8 grid gap-4 md:grid-cols-2">
                    {latest.length === 0 && !isLoading ? (
                        <div className={`${card} text-sm text-muted-foreground`}>ยังไม่มีประวัติการเก็บข้อมูล</div>
                    ) : (
                        latest.map((log) => <SourceCard key={log.sourceId} log={log} />)
                    )}
                </section>

                <section className={card}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">ประวัติการทำงาน ({pagination.total.toLocaleString("th-TH")})</h2>
                        <div className="flex gap-2">
                            <select
                                className={selectClass}
                                value={source}
                                onChange={(e) => changeFilter(() => setSource(e.target.value))}
                            >
                                <option value="">ทุกแหล่งข้อมูล</option>
                                {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                            <select
                                className={selectClass}
                                value={status}
                                onChange={(e) => changeFilter(() => setStatus(e.target.value))}
                            >
                                <option value="">ทุกสถานะ</option>
                                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                    <th className="py-2 pr-4 font-medium">แหล่งข้อมูล</th>
                                    <th className="py-2 pr-4 font-medium">สถานะ</th>
                                    <th className="py-2 pr-4 font-medium">เริ่ม</th>
                                    <th className="py-2 pr-4 font-medium">ระยะเวลา</th>
                                    <th className="py-2 pr-4 text-right font-medium">อ่าน</th>
                                    <th className="py-2 pr-4 text-right font-medium">เพิ่มใหม่</th>
                                    <th className="py-2 pr-4 text-right font-medium">อัปเดต</th>
                                    <th className="py-2 pr-4 text-right font-medium">ข้าม</th>
                                    <th className="py-2 font-medium">ข้อผิดพลาด</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-b border-border last:border-0">
                                        <td className="py-3 pr-4">
                                            <span className="font-medium">{SOURCE_LABELS[log.sourceId] ?? log.sourceId}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {TRIGGER_LABELS[log.trigger] ?? log.trigger}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <StatusBadge status={log.status} />
                                        </td>
                                        <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(log.startedAt)}</td>
                                        <td className="py-3 pr-4 whitespace-nowrap">{formatDuration(log.durationMs)}</td>
                                        <td className="py-3 pr-4 text-right">{log.recordsRead.toLocaleString("th-TH")}</td>
                                        <td className="py-3 pr-4 text-right">{log.recordsInserted.toLocaleString("th-TH")}</td>
                                        <td className="py-3 pr-4 text-right">{log.recordsUpdated.toLocaleString("th-TH")}</td>
                                        <td className="py-3 pr-4 text-right">{log.recordsSkipped.toLocaleString("th-TH")}</td>
                                        <td className="max-w-xs py-3 text-xs text-destructive">
                                            {log.status === "failed" ? log.errorMessage || "ไม่มีรายละเอียด" : ""}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={9} className="py-8 text-center text-muted-foreground">
                                            ไม่พบรายการ
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {pagination.totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1 || isLoading}
                                onClick={() => goToPage(page - 1)}
                            >
                                ก่อนหน้า
                            </Button>
                            <span className="text-muted-foreground">
                                หน้า {pagination.page} / {pagination.totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= pagination.totalPages || isLoading}
                                onClick={() => goToPage(page + 1)}
                            >
                                ถัดไป
                            </Button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}