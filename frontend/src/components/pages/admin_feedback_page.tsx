"use client";

import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";

const items = [
    { label: "ภาพรวม", href: "/admin", icon: LayoutDashboard },
    { label: "จัดการ TOR", href: "/admin/tors", icon: FileStack },
    { label: "การเก็บรวบรวมข้อมูล", href: "/admin/sync", icon: Database },
    { label: "ข้อเสนอแนะ", href: "/admin/feedback", icon: MessageSquare },
    { label: "ผู้ใช้งาน", href: "/admin/users", icon: Users },
];

const CATEGORY_LABELS: Record<string, string> = {
    incorrect_info: "ข้อมูลไม่ถูกต้อง",
    outdated_info: "ข้อมูลล้าสมัย",
    broken_link: "ลิงก์ใช้งานไม่ได้",
    app_feedback: "ข้อเสนอแนะเกี่ยวกับแอป",
    other: "อื่นๆ",
};

const STATUS_TABS = [
    { value: "pending", label: "รอตรวจสอบ" },
    { value: "reviewed", label: "กำลังดำเนินการ" },
    { value: "resolved", label: "แก้ไขแล้ว" },
    { value: "", label: "ทั้งหมด" },
];

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    reviewed: "bg-warning/15 text-warning",
    resolved: "bg-success/15 text-success",
};

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type FeedbackItem = {
    _id: string;
    category: string;
    description: string;
    torReference?: string;
    status: "pending" | "reviewed" | "resolved";
    adminResponse?: string;
    createdAt: string;
    userId: { name: string; email: string } | string;
};

export default function AdminFeedbackPage() {
    const [activeStatus, setActiveStatus] = useState("pending");
    const [items_, setItems] = useState<FeedbackItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function loadFeedback(status: string) {
        setIsLoading(true);
        setError(null);

        try {
            const token = getToken();
            const query = status ? `?status=${status}` : "";
            const res = await fetch(`${API_URL}/api/admin/feedback${query}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) throw new Error("failed");

            const data = await res.json();
            setItems(data.feedback ?? []);
        } catch {
            setError("โหลดข้อมูลไม่สำเร็จ");
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadFeedback(activeStatus);
    }, [activeStatus]);

    function toggleExpand(id: string) {
        setExpandedId((prev) => (prev === id ? null : id));
    }

    async function handleUpdate(id: string, status: "reviewed" | "resolved") {
        const adminResponse = responseDrafts[id]?.trim();

        if (!adminResponse) {
            setError("กรุณากรอกคำตอบก่อนบันทึก");
            return;
        }

        setSavingId(id);
        setError(null);

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/feedback/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status, adminResponse }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "บันทึกไม่สำเร็จ");
                return;
            }

            setItems((prev) => {
                if (activeStatus && activeStatus !== status) {
                    return prev.filter((item) => item._id !== id);
                }
                return prev.map((item) =>
                    item._id === id
                        ? { ...item, status, adminResponse }
                        : item,
                );
            });

            setExpandedId(null);
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setSavingId(null);
        }
    }

    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar
                subtitle="ผู้ดูแลระบบ"
                items={items}
                activeLabel="ข้อเสนอแนะ"
            />

            <main className="flex-1 space-y-6 p-6">
                <h1 className="text-xl font-semibold tracking-tight">
                    จัดการข้อเสนอแนะ
                </h1>

                <div className="flex gap-2 border-b border-border">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveStatus(tab.value)}
                            className={`cursor-pointer border-b-2 px-3 pb-2 text-sm ${
                                activeStatus === tab.value
                                    ? "border-primary font-medium text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : items_.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ไม่มีข้อเสนอแนะในหมวดนี้</p>
                ) : (
                    <ul className="space-y-3">
                        {items_.map((item) => {
                            const isExpanded = expandedId === item._id;
                            const userInfo =
                                typeof item.userId === "object" ? item.userId : null;

                            return (
                                <li
                                    key={item._id}
                                    className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                                >
                                    <button
                                        onClick={() => toggleExpand(item._id)}
                                        className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-primary">
                                                    {CATEGORY_LABELS[item.category] ?? item.category}
                                                </span>
                                                <span
                                                    className={`rounded-md px-2 py-0.5 text-xs ${STATUS_BADGE[item.status]}`}
                                                >
                                                    {STATUS_TABS.find((t) => t.value === item.status)?.label}
                                                </span>
                                            </div>

                                            <p className="mt-1 text-sm font-medium">
                                                {item.description}
                                            </p>

                                            {item.torReference && (
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    เกี่ยวข้องกับ: {item.torReference}
                                                </p>
                                            )}

                                            {userInfo && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    จาก: {userInfo.name} ({userInfo.email})
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleDateString("th-TH")}
                                            </span>
                                            {isExpanded ? (
                                                <ChevronUp className="size-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="size-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="mt-4 space-y-3 border-t border-border pt-4">
                                            {item.adminResponse && (
                                                <div className="rounded-md bg-accent p-3">
                                                    <p className="text-xs font-medium text-accent-foreground">
                                                        คำตอบก่อนหน้า
                                                    </p>
                                                    <p className="mt-1 text-sm text-accent-foreground">
                                                        {item.adminResponse}
                                                    </p>
                                                </div>
                                            )}

                                            <div className="space-y-1.5">
                                                <label className="text-xs text-muted-foreground">
                                                    คำตอบถึงผู้ใช้ (จะถูกส่งเป็นการแจ้งเตือนในแอปและอีเมล)
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                                                    placeholder="พิมพ์คำตอบที่นี่..."
                                                    value={responseDrafts[item._id] ?? ""}
                                                    onChange={(e) =>
                                                        setResponseDrafts((prev) => ({
                                                            ...prev,
                                                            [item._id]: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={savingId === item._id}
                                                    onClick={() => handleUpdate(item._id, "reviewed")}
                                                >
                                                    ทำเครื่องหมายว่ากำลังดำเนินการ
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={savingId === item._id}
                                                    onClick={() => handleUpdate(item._id, "resolved")}
                                                >
                                                    {savingId === item._id ? "กำลังบันทึก..." : "แก้ไขและปิดเรื่อง"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </div>
    );
}