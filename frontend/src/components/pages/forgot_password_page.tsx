"use client";

import { useState } from "react";
import Link from "next/link";
import { MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSent, setIsSent] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
                return;
            }

            setIsSent(true);
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
                <div className="flex flex-col items-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <MailQuestion className="size-5" />
                    </span>

                    <p className="mt-3 text-lg font-semibold tracking-tight">
                        TOR Insight
                    </p>

                    <h1 className="mt-5 text-xl font-semibold">
                        ลืมรหัสผ่าน?
                    </h1>

                    {!isSent && (
                        <p className="mt-1 text-center text-sm text-muted-foreground">
                            กรอกอีเมลของคุณ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้
                        </p>
                    )}
                </div>

                {isSent ? (
                    <div className="mt-7 space-y-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            หากมีบัญชีที่ใช้อีเมลนี้ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปแล้ว
                            กรุณาตรวจสอบกล่องจดหมายของคุณ
                        </p>

                        <Link
                            href="/login"
                            className="inline-block text-sm text-primary hover:underline"
                        >
                            กลับไปเข้าสู่ระบบ
                        </Link>
                    </div>
                ) : (
                    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <Label htmlFor="email">อีเมล</Label>

                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
                        </Button>

                        <p className="text-center text-sm text-muted-foreground">
                            <Link href="/login" className="hover:underline">
                                กลับไปเข้าสู่ระบบ
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}

export default ForgotPasswordPage;