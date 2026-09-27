"use client";

import { useNotifications } from "@/contexts/notification-context";
import { NotificationToast } from "@/components/NotificationToast";
import { useAuth } from "@/hooks/use-auth";

export function NotificationToastContainer() {
    const { user } = useAuth();
    const { toasts, dismissToast } = useNotifications();

    if (!user) return null;

    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
                <div key={toast._id} className="pointer-events-auto">
                    <NotificationToast
                        notification={toast}
                        onDismiss={() => dismissToast(toast._id)}
                    />
                </div>
            ))}
        </div>
    );
}