"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const CATEGORY_OPTIONS = [
    "software",
    "it_equipment",
];

const CATEGORY_LABELS: Record<string, string> = {
    software: "ซอฟต์แวร์",
    it_equipment: "ครุภัณฑ์คอมพิวเตอร์",
};

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type InterestCriteria = {
    categories: string[];
    agencies: string[];
    keywords: string[];
    minBudget?: number;
    maxBudget?: number;
    fiscalYear?: number;
};

type Profile = {
    id: string;
    name: string;
    email: string;
    interestCriteria: InterestCriteria;
    notifyByEmail: boolean;
};

const EMPTY_CRITERIA: InterestCriteria = {
    categories: [],
    agencies: [],
    keywords: [],
};

export default function AccountSettingsPage() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [name, setName] = useState("");
    const [criteria, setCriteria] = useState<InterestCriteria>(EMPTY_CRITERIA);
    const [agencyInput, setAgencyInput] = useState("");
    const [keywordInput, setKeywordInput] = useState("");
    const [notifyByEmail, setNotifyByEmail] = useState(true);
    const [isLoading, setIsLoading] = useState(true);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    useEffect(() => {
        const token = getToken();

        if (!token) {
            router.push("/login");
            return;
        }

        fetch(`${API_URL}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (res) => {
                if (!res.ok) throw new Error("failed");
                return res.json();
            })
            .then((data: Profile) => {
                setProfile(data);
                setName(data.name);
                setCriteria({ ...EMPTY_CRITERIA, ...data.interestCriteria });
                setNotifyByEmail(data.notifyByEmail ?? true);
            })
            .catch(() => {
                router.push("/login");
            })
            .finally(() => setIsLoading(false));
    }, [router]);

    function toggleCategory(category: string) {
        setCriteria((prev) => ({
            ...prev,
            categories: prev.categories.includes(category)
                ? prev.categories.filter((c) => c !== category)
                : [...prev.categories, category],
        }));
    }

    function addAgency() {
        const value = agencyInput.trim();
        if (!value || criteria.agencies.includes(value)) return;
        setCriteria((prev) => ({ ...prev, agencies: [...prev.agencies, value] }));
        setAgencyInput("");
    }

    function removeAgency(agency: string) {
        setCriteria((prev) => ({
            ...prev,
            agencies: prev.agencies.filter((a) => a !== agency),
        }));
    }

    function addKeyword() {
        const value = keywordInput.trim();
        if (!value || criteria.keywords.includes(value)) return;
        setCriteria((prev) => ({ ...prev, keywords: [...prev.keywords, value] }));
        setKeywordInput("");
    }

    function removeKeyword(keyword: string) {
        setCriteria((prev) => ({
            ...prev,
            keywords: prev.keywords.filter((k) => k !== keyword),
        }));
    }

    async function handleSaveProfile(e: React.FormEvent) {
        e.preventDefault();
        setProfileMessage(null);
        setProfileError(null);
        setIsSavingProfile(true);

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/users/me`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name,
                    interestCriteria: criteria,
                    notifyByEmail,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setProfileError(data.message ?? "บันทึกไม่สำเร็จ");
                return;
            }

            setProfileMessage("บันทึกข้อมูลเรียบร้อยแล้ว");

            const stored = localStorage.getItem("user") ? localStorage : sessionStorage;
            const raw = stored.getItem("user");
            if (raw) {
                const parsed = JSON.parse(raw);
                stored.setItem("user", JSON.stringify({ ...parsed, name }));
            }
        } catch {
            setProfileError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSavingProfile(false);
        }
    }

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setPasswordMessage(null);
        setPasswordError(null);

        if (newPassword !== confirmNewPassword) {
            setPasswordError("รหัสผ่านใหม่ไม่ตรงกัน");
            return;
        }

        if (newPassword.length < 8) {
            setPasswordError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
            return;
        }

        setIsSavingPassword(true);

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/users/change-password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                setPasswordError(data.message ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
                return;
            }

            setPasswordMessage("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
        } catch {
            setPasswordError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSavingPassword(false);
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background">
                <SiteHeader />
                <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
                <h1 className="text-xl font-semibold">ตั้งค่าบัญชี</h1>

                <form
                    onSubmit={handleSaveProfile}
                    className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
                >
                    <h2 className="text-sm font-semibold">ข้อมูลส่วนตัว</h2>

                    <div className="space-y-1.5">
                        <Label htmlFor="name">ชื่อ</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>อีเมล</Label>
                        <Input value={profile?.email ?? ""} disabled />
                        <p className="text-xs text-muted-foreground">
                            ไม่สามารถเปลี่ยนอีเมลได้
                        </p>
                    </div>

                    <div className="space-y-4 border-t border-border pt-4">
                        <div>
                            <Label className="text-sm">เกณฑ์การแจ้งเตือน TOR</Label>
                            <p className="text-xs text-muted-foreground">
                                เราจะแจ้งเตือนเมื่อมี TOR ใหม่ที่ตรงกับเงื่อนไขทั้งหมดที่คุณตั้งไว้
                            </p>
                        </div>

                        {/* Categories */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">หมวดหมู่</Label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {CATEGORY_OPTIONS.map((category) => (
                                    <label
                                        key={category}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <Checkbox
                                            checked={criteria.categories.includes(category)}
                                            onCheckedChange={() => toggleCategory(category)}
                                        />
                                        {CATEGORY_LABELS[category] ?? category}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Agencies */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">หน่วยงาน</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="พิมพ์ชื่อหน่วยงานแล้วกด Enter"
                                    className="h-9"
                                    value={agencyInput}
                                    onChange={(e) => setAgencyInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addAgency();
                                        }
                                    }}
                                />
                                <Button type="button" variant="outline" onClick={addAgency}>
                                    เพิ่ม
                                </Button>
                            </div>
                            {criteria.agencies.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {criteria.agencies.map((agency) => (
                                        <span
                                            key={agency}
                                            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"
                                        >
                                            {agency}
                                            <button
                                                type="button"
                                                onClick={() => removeAgency(agency)}
                                                aria-label={`ลบ ${agency}`}
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Keywords */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">คำสำคัญ</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="พิมพ์คำสำคัญแล้วกด Enter"
                                    className="h-9"
                                    value={keywordInput}
                                    onChange={(e) => setKeywordInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addKeyword();
                                        }
                                    }}
                                />
                                <Button type="button" variant="outline" onClick={addKeyword}>
                                    เพิ่ม
                                </Button>
                            </div>
                            {criteria.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {criteria.keywords.map((keyword) => (
                                        <span
                                            key={keyword}
                                            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"
                                        >
                                            {keyword}
                                            <button
                                                type="button"
                                                onClick={() => removeKeyword(keyword)}
                                                aria-label={`ลบ ${keyword}`}
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Budget range */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                ช่วงงบประมาณ (บาท)
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    type="number"
                                    placeholder="ต่ำสุด"
                                    className="h-9"
                                    value={criteria.minBudget ?? ""}
                                    onChange={(e) =>
                                        setCriteria((prev) => ({
                                            ...prev,
                                            minBudget: e.target.value ? Number(e.target.value) : undefined,
                                        }))
                                    }
                                />
                                <Input
                                    type="number"
                                    placeholder="สูงสุด"
                                    className="h-9"
                                    value={criteria.maxBudget ?? ""}
                                    onChange={(e) =>
                                        setCriteria((prev) => ({
                                            ...prev,
                                            maxBudget: e.target.value ? Number(e.target.value) : undefined,
                                        }))
                                    }
                                />
                            </div>
                        </div>

                        {/* Fiscal year */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">ปีงบประมาณ</Label>
                            <Input
                                type="number"
                                placeholder="เช่น 2569"
                                className="h-9"
                                value={criteria.fiscalYear ?? ""}
                                onChange={(e) =>
                                    setCriteria((prev) => ({
                                        ...prev,
                                        fiscalYear: e.target.value ? Number(e.target.value) : undefined,
                                    }))
                                }
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 border-t border-border pt-4 text-sm">
                        <Checkbox
                            checked={notifyByEmail}
                            onCheckedChange={(v) => setNotifyByEmail(v === true)}
                        />
                        รับการแจ้งเตือนทางอีเมล
                    </label>

                    {profileError && (
                        <p className="text-sm text-destructive">{profileError}</p>
                    )}
                    {profileMessage && (
                        <p className="text-sm text-success">{profileMessage}</p>
                    )}

                    <Button type="submit" disabled={isSavingProfile}>
                        {isSavingProfile ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                    </Button>
                </form>

                <form
                    onSubmit={handleChangePassword}
                    className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
                >
                    <h2 className="text-sm font-semibold">เปลี่ยนรหัสผ่าน</h2>

                    <div className="space-y-1.5">
                        <Label htmlFor="current-password">รหัสผ่านปัจจุบัน</Label>
                        <div className="relative">
                            <Input
                                id="current-password"
                                type={showCurrentPassword ? "text" : "password"}
                                className="pr-9"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword((v) => !v)}
                                className="absolute right-3 top-2.5 text-muted-foreground"
                            >
                                {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="new-password">รหัสผ่านใหม่</Label>
                        <div className="relative">
                            <Input
                                id="new-password"
                                type={showNewPassword ? "text" : "password"}
                                className="pr-9"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword((v) => !v)}
                                className="absolute right-3 top-2.5 text-muted-foreground"
                            >
                                {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="confirm-new-password">ยืนยันรหัสผ่านใหม่</Label>
                        <div className="relative">
                            <Input
                                id="confirm-new-password"
                                type={showConfirmNewPassword ? "text" : "password"}
                                className="pr-9"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmNewPassword((v) => !v)}
                                className="absolute right-3 top-2.5 text-muted-foreground"
                            >
                                {showConfirmNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </div>

                    {passwordError && (
                        <p className="text-sm text-destructive">{passwordError}</p>
                    )}
                    {passwordMessage && (
                        <p className="text-sm text-success">{passwordMessage}</p>
                    )}

                    <Button type="submit" disabled={isSavingPassword}>
                        {isSavingPassword ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
                    </Button>
                </form>
            </main>
        </div>
    );
}