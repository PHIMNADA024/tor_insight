"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";

    const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendMessage, setResendMessage] = useState<string | null>(null);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    function handleChange(index: number, value: string) {
        const digit = value.replace(/\D/g, "").slice(-1);
        const next = [...digits];
        next[index] = digit;
        setDigits(next);

        if (digit && index < 5) {
            inputsRef.current[index + 1]?.focus();
        }
    }

    function handleKeyDown(
        index: number,
        e: React.KeyboardEvent<HTMLInputElement>,
    ) {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
        if (!pasted) return;
        e.preventDefault();
        const next = Array(6).fill("");
        for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
        setDigits(next);
        inputsRef.current[Math.min(pasted.length, 5)]?.focus();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const otp = digits.join("");
        if (otp.length !== 6) {
            setError("กรุณากรอกรหัส OTP ให้ครบ 6 หลัก");
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/verify-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "ยืนยันอีเมลไม่สำเร็จ");
                return;
            }

            router.push("/login?verified=1");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleResend() {
        setError(null);
        setResendMessage(null);
        setIsResending(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/resend-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "ส่งรหัสใหม่ไม่สำเร็จ");
                return;
            }

            setResendMessage("ส่งรหัสยืนยันใหม่แล้ว กรุณาตรวจสอบอีเมลของคุณ");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsResending(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
                <div className="flex flex-col items-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <MailCheck className="size-5" />
                    </span>

                    <p className="mt-3 text-lg font-semibold tracking-tight">
                        TOR Insight
                    </p>

                    <h1 className="mt-5 text-xl font-semibold">
                        ยืนยันอีเมลของคุณ
                    </h1>

                    <p className="mt-1 text-center text-sm text-muted-foreground">
                        เราได้ส่งรหัสยืนยัน 6 หลักไปที่{" "}
                        <span className="font-medium text-foreground">
                            {email || "อีเมลของคุณ"}
                        </span>
                    </p>
                </div>

                <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-1.5">
                        <Label htmlFor="otp-0">รหัส OTP</Label>

                        <div className="flex justify-between gap-2">
                            {digits.map((digit, i) => (
                                <Input
                                    key={i}
                                    id={`otp-${i}`}
                                    ref={(el) => {
                                        inputsRef.current[i] = el;
                                    }}
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) =>
                                        handleChange(i, e.target.value)
                                    }
                                    onKeyDown={(e) => handleKeyDown(i, e)}
                                    onPaste={handlePaste}
                                    className="h-12 w-11 text-center text-lg"
                                />
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    {resendMessage && (
                        <p className="text-sm text-muted-foreground">
                            {resendMessage}
                        </p>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "กำลังยืนยัน..." : "ยืนยันอีเมล"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    ไม่ได้รับรหัส?{" "}
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={isResending}
                        className="text-primary hover:underline disabled:opacity-50"
                    >
                        {isResending ? "กำลังส่ง..." : "ส่งรหัสอีกครั้ง"}
                    </button>
                </p>

                <p className="mt-2 text-center text-sm text-muted-foreground">
                    <Link href="/login" className="hover:underline">
                        กลับไปเข้าสู่ระบบ
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default VerifyEmailPage;