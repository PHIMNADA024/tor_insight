"use client";

import Link from "next/link";
import { Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function LoginPage() {
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

                <form
                    className="mt-7 space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="email">อีเมล</Label>

                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="password">รหัสผ่าน</Label>

                        <div className="relative">
                            <Input
                                id="password"
                                type="password"
                                placeholder="กรอกรหัสผ่านของคุณ"
                                className="pr-9"
                            />

                            <Eye className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox />
                            จดจำฉันไว้
                        </label>

                        <button
                            type="button"
                            className="text-sm text-primary hover:underline"
                        >
                            ลืมรหัสผ่าน?
                        </button>
                    </div>

                    <Button type="submit" className="w-full">
                        เข้าสู่ระบบ
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    ยังไม่มีบัญชีใช่ไหม?{" "}
                    <Link
                        href="/login"
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