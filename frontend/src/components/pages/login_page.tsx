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
    const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
    const [mfaSetupToken, setMfaSetupToken] = useState<string | null>(null);
    const [totpSecret, setTotpSecret] = useState("");
    const [totpCode, setTotpCode] = useState("");

    function completeLogin(data: { token: string; user: unknown }) {
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem("token", data.token);
        storage.setItem("user", JSON.stringify(data.user));
        router.push("/");
    }

/**
 * After the first factor (password or Google) the server answers 202 with either
 * an MFA challenge or an MFA setup token. Returns false for any other answer.
 */
async function startMfaStep(data: { mfaRequired?: unknown; challengeToken?: unknown; mfaSetupRequired?: unknown; setupToken?: unknown }) {
    if (data.mfaRequired && typeof data.challengeToken === "string") {
        setMfaChallengeToken(data.challengeToken);
        return true;
    }

    if (data.mfaSetupRequired && typeof data.setupToken === "string") {
        setMfaSetupToken(data.setupToken);
        const setup = await fetch(`${API_URL}/api/auth/mfa/setup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${data.setupToken}` },
        });
        const setupData = await setup.json();
        if (!setup.ok) {
            setMfaSetupToken(null);
            setError(setupData.message ?? "ตั้งค่า MFA ไม่สำเร็จ");
            return true;
        }
        setTotpSecret(setupData.secret);
        return true;
    }

    return false;
}

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

        if (res.status === 202 && await startMfaStep(data)) {
            setPassword("");
            return;
        }

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

        completeLogin(data);
    } catch {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
        setIsSubmitting(false);
    }
}

async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
        const isSetup = Boolean(mfaSetupToken);
        const res = await fetch(`${API_URL}/api/auth/mfa/${isSetup ? "confirm-setup" : "verify"}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(mfaSetupToken ? { Authorization: `Bearer ${mfaSetupToken}` } : {}),
            },
            body: JSON.stringify(isSetup
                ? { code: totpCode }
                : { challengeToken: mfaChallengeToken, code: totpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
            setError(data.message ?? "รหัสยืนยันไม่ถูกต้อง");
            return;
        }
        completeLogin(data);
    } catch {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
        setIsSubmitting(false);
    }
}

useEffect(() => {
    const storedError = sessionStorage.getItem("authErrorMessage");
    if (storedError) {
        sessionStorage.removeItem("authErrorMessage");
        window.setTimeout(() => setError(storedError), 0);
    }

    // Google sign-in replaced the password step; continue with MFA here.
    const pendingGoogleMfa = sessionStorage.getItem("pendingGoogleMfa");
    if (pendingGoogleMfa) {
        sessionStorage.removeItem("pendingGoogleMfa");
        (async () => {
            try {
                if (!(await startMfaStep(JSON.parse(pendingGoogleMfa)))) {
                    setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
                }
            } catch {
                setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
            }
        })();
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
                        {mfaSetupToken ? "ตั้งค่าแอปยืนยันตัวตน" : mfaChallengeToken ? "ยืนยันการเข้าสู่ระบบ" : "ยินดีต้อนรับกลับมา!"}
                    </h1>

                    <p className="mt-1 text-center text-sm text-muted-foreground">
                        {mfaSetupToken
                            ? "เพิ่ม TOR Insight ในแอป authenticator แล้วกรอกรหัส 6 หลักเพื่อเปิดใช้งาน MFA"
                            : mfaChallengeToken
                                ? "กรอกรหัส 6 หลักจากแอป authenticator ของคุณ"
                                : "เข้าสู่ระบบเพื่อใช้งานบัญชีของคุณ"}
                    </p>
                </div>

                {mfaSetupToken || mfaChallengeToken ? (
                    <form className="mt-7 space-y-4" onSubmit={handleMfaSubmit}>
                        {mfaSetupToken && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                                <p className="text-xs text-muted-foreground">คีย์ตั้งค่าแบบ manual</p>
                                <code className="mt-1 block break-all text-sm font-semibold">{totpSecret || "กำลังสร้างคีย์..."}</code>
                                <p className="mt-2 text-xs text-muted-foreground">คีย์จะแสดงให้เห็นเฉพาะระหว่างการตั้งค่า กรุณาบันทึกไว้ในแอป authenticator</p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="totp-code">รหัส authenticator 6 หลัก</Label>
                            <Input
                                id="totp-code"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                pattern="[0-9]{6}"
                                value={totpCode}
                                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" className="w-full" disabled={isSubmitting || totpCode.length !== 6 || (Boolean(mfaSetupToken) && !totpSecret)}>
                            {isSubmitting ? "กำลังยืนยัน..." : mfaSetupToken ? "เปิดใช้ MFA และเข้าสู่ระบบ" : "ยืนยันและเข้าสู่ระบบ"}
                        </Button>
                    </form>
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
                )}

                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    หรือ
                    <span className="h-px flex-1 bg-border" />
                </div>

                {/* A full page navigation: the backend sends the browser on to Google. */}
                <Button asChild variant="outline" className="w-full">
                    <a href={`${API_URL}/api/auth/google`}>เข้าสู่ระบบด้วย Google</a>
                </Button>

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