"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ERROR_MESSAGES: Record<string, string> = {
    cancelled: "คุณยกเลิกการเข้าสู่ระบบด้วย Google",
    account_disabled: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ",
    account_conflict: "อีเมลนี้เชื่อมต่อกับบัญชี Google อื่นอยู่แล้ว",
    email_not_verified: "อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน",
    not_configured: "ระบบยังไม่เปิดใช้การเข้าสู่ระบบด้วย Google",
};
const DEFAULT_ERROR = "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";

/**
 * The backend sends the browser here after Google sign-in, with either a
 * one-time login code or an error code in the URL fragment.
 */
function GoogleCallbackPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        // The login code works once, so never send it twice (React StrictMode runs effects twice).
        if (started.current) return;
        started.current = true;

        const params = new URLSearchParams(window.location.hash.slice(1));
        // Remove the code from the address bar and browser history straight away.
        window.history.replaceState(null, "", window.location.pathname);

        const code = params.get("code");

        (async () => {
            if (!code) {
                setError(ERROR_MESSAGES[params.get("error") ?? ""] ?? DEFAULT_ERROR);
                return;
            }

            try {
                const res = await fetch(`${API_URL}/api/auth/google/exchange`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                });
                const data = await res.json();

                if (!res.ok) {
                    setError(res.status === 403 ? ERROR_MESSAGES.account_disabled : DEFAULT_ERROR);
                    return;
                }

                sessionStorage.setItem("token", data.token);
                sessionStorage.setItem("user", JSON.stringify(data.user));
                router.replace("/");
            } catch {
                setError(DEFAULT_ERROR);
            }
        })();
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
                <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Search className="size-5" />
                </span>

                {error ? (
                    <>
                        <p role="alert" className="mt-5 text-sm text-destructive">
                            {error}
                        </p>
                        <Link href="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
                            กลับไปหน้าเข้าสู่ระบบ
                        </Link>
                    </>
                ) : (
                    <p className="mt-5 text-sm text-muted-foreground">กำลังเข้าสู่ระบบด้วย Google...</p>
                )}
            </div>
        </div>
    );
}

export default GoogleCallbackPage;
