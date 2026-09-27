"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";
const POLL_INTERVAL_MS = 30000; // 30 seconds

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type ToastNotification = {
    _id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
};

export function useNotificationPoller() {
    const [toasts, setToasts] = useState<ToastNotification[]>([]);
    const lastSeenRef = useRef<string | null>(null);
    const isFirstCheckRef = useRef(true);

    const checkForNew = useCallback(async () => {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/api/notifications?filter=unread`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) return;

            const data = await res.json();
            const notifications: ToastNotification[] = data.notifications ?? [];

            if (notifications.length === 0) return;

            const newest = notifications[0];

            if (isFirstCheckRef.current) {
                isFirstCheckRef.current = false;
                lastSeenRef.current = newest.createdAt;
                return;
            }

            if (!lastSeenRef.current || newest.createdAt > lastSeenRef.current) {
                const freshOnes = notifications.filter(
                    (n) => !lastSeenRef.current || n.createdAt > lastSeenRef.current!,
                );

                setToasts((prev) => [...freshOnes, ...prev]);
                lastSeenRef.current = newest.createdAt;
            }
        } catch {
            // silent — polling failures shouldn't disrupt the app
        }
    }, []);

    useEffect(() => {
        checkForNew();
        const interval = setInterval(checkForNew, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [checkForNew]);

    function dismissToast(id: string) {
        setToasts((prev) => prev.filter((t) => t._id !== id));
    }

    return { toasts, dismissToast };
}