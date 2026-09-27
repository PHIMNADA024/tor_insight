"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { useAuth } from "@/hooks/use-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";
const POLL_INTERVAL_MS = 30000;

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

type NotificationContextValue = {
    unreadCount: number;
    toasts: NotificationItem[];
    refresh: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    dismissToast: (id: string) => void;
    fetchList: (filter: "all" | "unread" | "read") => Promise<NotificationItem[]>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [toasts, setToasts] = useState<NotificationItem[]>([]);
    const lastSeenRef = useRef<string | null>(null);
    const isFirstCheckRef = useRef(true);

    const refresh = useCallback(async () => {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/api/notifications?filter=unread`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;

            const data = await res.json();
            const unread: NotificationItem[] = data.notifications ?? [];
            setUnreadCount(data.unreadCount ?? unread.length);

            if (unread.length === 0) return;
            const newest = unread[0];

            if (isFirstCheckRef.current) {
                isFirstCheckRef.current = false;
                lastSeenRef.current = newest.createdAt;
                return;
            }

            if (!lastSeenRef.current || newest.createdAt > lastSeenRef.current) {
                const freshOnes = unread.filter(
                    (n) => !lastSeenRef.current || n.createdAt > lastSeenRef.current!,
                );
                setToasts((prev) => [...freshOnes, ...prev]);
                lastSeenRef.current = newest.createdAt;
            }
        } catch {
            // silent
        }
    }, []);

    const fetchList = useCallback(
        async (filter: "all" | "unread" | "read") => {
            const token = getToken();
            if (!token) return [];

            try {
                const query = filter !== "all" ? `?filter=${filter}` : "";
                const res = await fetch(`${API_URL}/api/notifications${query}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.notifications ?? []) as NotificationItem[];
            } catch {
                return [];
            }
        },
        [],
    );

    const markAsRead = useCallback(
        async (id: string) => {
            const token = getToken();
            try {
                await fetch(`${API_URL}/api/notifications/${id}/read`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setUnreadCount((prev) => Math.max(0, prev - 1));
            } catch {
                // ignore
            }
        },
        [],
    );

    const markAllAsRead = useCallback(async () => {
        const token = getToken();
        try {
            await fetch(`${API_URL}/api/notifications/read-all`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` },
            });
            setUnreadCount(0);
        } catch {
            // ignore
        }
    }, []);

    function dismissToast(id: string) {
        setToasts((prev) => prev.filter((t) => t._id !== id));
    }

    useEffect(() => {
        if (!user) {
            setUnreadCount(0);
            setToasts([]);
            isFirstCheckRef.current = true;
            lastSeenRef.current = null;
            return;
        }

        refresh();
        const interval = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [user, refresh]);

    return (
        <NotificationContext.Provider
            value={{
                unreadCount,
                toasts,
                refresh,
                markAsRead,
                markAllAsRead,
                dismissToast,
                fetchList,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error("useNotifications must be used within NotificationProvider");
    }
    return ctx;
}