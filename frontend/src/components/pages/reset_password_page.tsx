// components/pages/reset_password_page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";
    const token = searchParams.get("token") ?? "";

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!email || !token) {
            setError("ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("รหัสผ่านไม่ตรงกัน");
            return;
        }

        if (newPassword.length < 8) {
            setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, token, newPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
                return;
            }

            router.push("/login?reset=1");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!email || !token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
                <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
                    <h1 className="text-xl font-semibold">ลิงก์ไม่ถูกต้อง</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว
                    </p>
                    <Link
                        href="/forgot-password"
                        className="mt-4 inline-block text-sm text-primary hover:underline"
                    >
                        ขอลิงก์ใหม่
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
                <div className="flex flex-col items-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <KeyRound className="size-5" />
                    </span>

                    <p className="mt-3 text-lg font-semibold tracking-tight">
                        TOR Insight
                    </p>

                    <h1 className="mt-5 text-xl font-semibold">
                        ตั้งรหัสผ่านใหม่
                    </h1>

                    <p className="mt-1 text-sm text-muted-foreground">
                        กรอกรหัสผ่านใหม่ของคุณ
                    </p>
                </div>

                <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-password">รหัสผ่านใหม่</Label>

                        <div className="relative">
                            <Input
                                id="new-password"
                                type={showPassword ? "text" : "password"}
                                placeholder="กรอกรหัสผ่านใหม่"
                                className="pr-9"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />

                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-2.5 text-muted-foreground"
                            >
                                {showPassword ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">
                            ยืนยันรหัสผ่านใหม่
                        </Label>

                        <div className="relative">
                            <Input
                                id="confirm-password"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="กรอกรหัสผ่านอีกครั้ง"
                                className="pr-9"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />

                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword((v) => !v)}
                                className="absolute right-3 top-2.5 text-muted-foreground"
                            >
                                {showConfirmPassword ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
                    </Button>
                </form>
            </div>
        </div>
    );
}

export default ResetPasswordPage;