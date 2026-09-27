"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Info } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useNotifications } from "@/contexts/notification-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";

const TYPE_ICON: Record<string, { icon: typeof Bell; tone: string }> = {
    tor_match: { icon: Bell, tone: "primary" },
    feedback_resolved: { icon: CheckCircle2, tone: "success" },
};

const toneClass: Record<string, string> = {
    primary: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    muted: "bg-muted text-muted-foreground",
};

const TABS = [
    { value: "all", label: "ทั้งหมด" },
    { value: "unread", label: "ยังไม่อ่าน" },
    { value: "read", label: "อ่านแล้ว" },
];

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type NotificationItem = {
    _id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
};

export default function NotificationsPage() {
    const router = useRouter();
    const { markAsRead: contextMarkAsRead, markAllAsRead: contextMarkAllAsRead, fetchList } = useNotifications();
    const [activeTab, setActiveTab] = useState<"all" | "unread" | "read">("all");
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function loadNotifications(filter: "all" | "unread" | "read") {
        const token = getToken();
        if (!token) {
            router.push("/login");
            return;
        }

        setIsLoading(true);
        setError(null);

        const notifications = await fetchList(filter);
        setItems(notifications);
        setIsLoading(false);
    }

    useEffect(() => {
        loadNotifications(activeTab);
    }, [activeTab]);

    async function markAsRead(id: string) {
        await contextMarkAsRead(id);
        setItems((prev) =>
            prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
        );
    }

    async function markAllAsRead() {
        await contextMarkAllAsRead();
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="text-xl font-semibold tracking-tight">
                    การแจ้งเตือนของฉัน
                </h1>

                <div className="mt-4 flex items-center justify-between border-b border-border">
                    <div className="flex gap-6 text-sm">
                        {TABS.map((tab) => (
                            <button
                                key={tab.value}
                                type="button"
                                onClick={() => setActiveTab(tab.value as typeof activeTab)}
                                className={`-mb-px cursor-pointer border-b-2 pb-2.5 ${
                                    activeTab === tab.value
                                        ? "border-primary font-medium text-primary"
                                        : "border-transparent text-muted-foreground"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={markAllAsRead}
                        className="cursor-pointer pb-2.5 text-xs text-primary hover:underline"
                    >
                        ทำเครื่องหมายว่าอ่านทั้งหมด
                    </button>
                </div>

                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                {isLoading ? (
                    <p className="mt-4 text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : items.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        ไม่มีการแจ้งเตือนในหมวดนี้
                    </p>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {items.map((n) => {
                            const config = TYPE_ICON[n.type] ?? { icon: Info, tone: "muted" };
                            const Icon = config.icon;

                            return (
                                <li
                                    key={n._id}
                                    onClick={() => !n.isRead && markAsRead(n._id)}
                                    className={`flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] ${
                                        !n.isRead ? "" : "opacity-80"
                                    }`}
                                >
                                    <span
                                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${toneClass[config.tone]}`}
                                    >
                                        <Icon className="size-4" />
                                    </span>

                                    <div className="flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-medium">{n.title}</p>

                                            {!n.isRead && (
                                                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                                            )}
                                        </div>

                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {n.message}
                                        </p>

                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {new Date(n.createdAt).toLocaleString("th-TH", {
                                                dateStyle: "long",
                                                timeStyle: "short",
                                            })}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </div>
    );
}