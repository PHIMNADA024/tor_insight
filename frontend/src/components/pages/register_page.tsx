"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function RegisterPage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError("รหัสผ่านไม่ตรงกัน");
            return;
        }

        if (password.length < 8) {
            setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "สมัครสมาชิกไม่สำเร็จ");
                return;
            }

            router.push(
                `/verify-email?email=${encodeURIComponent(email.toLowerCase().trim())}`,
            );
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
                        <Search className="size-5" />
                    </span>

                    <p className="mt-3 text-lg font-semibold tracking-tight">
                        TOR Insight
                    </p>

                    <h1 className="mt-5 text-xl font-semibold">
                        สร้างบัญชี
                    </h1>

                    <p className="mt-1 text-sm text-muted-foreground">
                        สมัครสมาชิกเพื่อเริ่มใช้งาน TOR Insight
                    </p>
                </div>

                <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-1.5">
                        <Label htmlFor="name">ชื่อ</Label>

                        <Input
                            id="name"
                            type="text"
                            placeholder="กรอกชื่อของคุณ"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

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

                    <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">
                            ยืนยันรหัสผ่าน
                        </Label>

                        <div className="relative">
                            <Input
                                id="confirm-password"
                                type={
                                    showConfirmPassword ? "text" : "password"
                                }
                                placeholder="กรอกรหัสผ่านอีกครั้ง"
                                className="pr-9"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                required
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    setShowConfirmPassword((v) => !v)
                                }
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
                        {isSubmitting ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    มีบัญชีอยู่แล้ว?{" "}
                    <Link
                        href="/login"
                        className="text-primary hover:underline"
                    >
                        เข้าสู่ระบบ
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default RegisterPage;