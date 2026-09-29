"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (res.status === 403 && data.userId) {
                router.push(`/verify-email?email=${encodeURIComponent(email)}`);
                return;
            }

            if (res.status === 403 && data.message?.includes("disabled")) {
                setError(
                    "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ",
                );
                return;
            }

            setError(data.message ?? "เข้าสู่ระบบไม่สำเร็จ");
            return;
        }

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem("token", data.token);
        storage.setItem("user", JSON.stringify(data.user));

        router.push("/");
    } catch {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
        setIsSubmitting(false);
    }
}

useEffect(() => {
    const storedError = sessionStorage.getItem("authErrorMessage");
    if (storedError) {
        setError(storedError);
        sessionStorage.removeItem("authErrorMessage");
    }
}, []);

    return (
        <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-hero)] px-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
                <div className="flex flex-col items-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Search className="size-5" />
                    </span>

                    <p className="mt-3 text-lg font-semibold tracking-tight">
                        TOR Insight
                    </p>

                    <h1 className="mt-5 text-xl font-semibold">
                        ยินดีต้อนรับกลับมา!
                    </h1>

                    <p className="mt-1 text-sm text-muted-foreground">
                        เข้าสู่ระบบเพื่อใช้งานบัญชีของคุณ
                    </p>
                </div>

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

                    <div className="space-y-1.5">
                        <Label htmlFor="password">รหัสผ่าน</Label>

                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="กรอกรหัสผ่านของคุณ"
                                className="pr-9"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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

                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox
                                checked={rememberMe}
                                onCheckedChange={(v) =>
                                    setRememberMe(v === true)
                                }
                            />
                            จดจำฉันไว้
                        </label>

                        <Link
                            href="/forgot-password"
                            className="text-sm text-primary hover:underline"
                        >
                            ลืมรหัสผ่าน?
                        </Link>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    ยังไม่มีบัญชีใช่ไหม?{" "}
                    <Link
                        href="/register"
                        className="text-primary hover:underline"
                    >
                        สมัครสมาชิก
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default LoginPage;