"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, isLoaded } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "admin") {
            router.push("/");
        }
    }, [isLoaded, user, router]);

    if (!isLoaded || !user || user.role !== "admin") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</p>
            </div>
        );
    }

    return <>{children}</>;
}