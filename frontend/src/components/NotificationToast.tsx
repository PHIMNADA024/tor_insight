"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, X } from "lucide-react";

type ToastNotification = {
    _id: string;
    type: string;
    title: string;
    message: string;
};

const TYPE_ICON: Record<string, typeof Bell> = {
    tor_match: Bell,
    feedback_resolved: CheckCircle2,
};

export function NotificationToast({
    notification,
    onDismiss,
}: {
    notification: ToastNotification;
    onDismiss: () => void;
}) {
    const router = useRouter();
    const Icon = TYPE_ICON[notification.type] ?? Bell;

    useEffect(() => {
        const timer = setTimeout(onDismiss, 8000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Icon className="size-4" />
            </span>

            <button
                type="button"
                onClick={() => {
                    router.push("/notifications");
                    onDismiss();
                }}
                className="flex-1 cursor-pointer text-left"
            >
                <p className="text-sm font-medium">{notification.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {notification.message}
                </p>
            </button>

            <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="ปิด"
            >
                <X className="size-4" />
            </button>
        </div>
    );
}