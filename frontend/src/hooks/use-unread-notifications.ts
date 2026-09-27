"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";
const POLL_INTERVAL_MS = 30000;

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

export function useUnreadNotifications(enabled: boolean) {
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchCount = useCallback(async () => {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/api/notifications?filter=unread`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) return;

            const data = await res.json();
            setUnreadCount(data.unreadCount ?? 0);
        } catch {
            // silent — don't disrupt the header on a failed poll
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;

        fetchCount();
        const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, fetchCount]);

    return unreadCount;
}