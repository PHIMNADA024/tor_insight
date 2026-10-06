"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";

const CATEGORY_OPTIONS = [
    { value: "app_feedback", label: "ข้อเสนอแนะเกี่ยวกับแอป" },
    { value: "incorrect_info", label: "ข้อมูล TOR ไม่ถูกต้อง" },
    { value: "outdated_info", label: "ข้อมูล TOR ล้าสมัย" },
    { value: "broken_link", label: "ลิงก์ใช้งานไม่ได้" },
    { value: "other", label: "อื่นๆ" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
    CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    pending: { label: "รอตรวจสอบ", className: "bg-muted text-muted-foreground" },
    reviewed: { label: "กำลังดำเนินการ", className: "bg-warning/15 text-warning" },
    resolved: { label: "แก้ไขแล้ว", className: "bg-success/15 text-success" },
};

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type FeedbackItem = {
    _id: string;
    category: string;
    description: string;
    torReference?: string;
    status: "pending" | "reviewed" | "resolved";
    adminResponse?: string;
    createdAt: string;
};

type TorOption = {
    id: string;
    title: string;
    agency: string;
};

export default function MyFeedbackPage() {
    const router = useRouter();

    const [category, setCategory] = useState("app_feedback");
    const [torSearch, setTorSearch] = useState("");
    const [torResults, setTorResults] = useState<TorOption[]>([]);
    const [selectedTor, setSelectedTor] = useState<TorOption | null>(null);
    const [isSearchingTors, setIsSearchingTors] = useState(false);
    const [description, setDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formMessage, setFormMessage] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    const needsTorReference = category !== "app_feedback" && category !== "other";

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const torId = params.get("torId");
        if (!torId) return;

        let cancelled = false;
        fetch(`${API_URL}/api/tors/${encodeURIComponent(torId)}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("TOR not found");
                return res.json() as Promise<TorOption>;
            })
            .then((tor) => {
                if (cancelled) return;
                setSelectedTor(tor);
                setCategory("incorrect_info");
            })
            .catch(() => {
                if (!cancelled) setFormError("ไม่พบ TOR ที่เลือก กรุณาค้นหาและเลือก TOR อีกครั้ง");
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!needsTorReference || selectedTor || torSearch.trim().length < 2) return;

        let cancelled = false;
        const timeout = window.setTimeout(async () => {
            setIsSearchingTors(true);
            try {
                const params = new URLSearchParams({ keyword: torSearch.trim(), limit: "8" });
                const res = await fetch(`${API_URL}/api/tors?${params.toString()}`);
                if (!res.ok) throw new Error("TOR search failed");
                const data = await res.json();
                if (!cancelled) setTorResults(data.results ?? []);
            } catch {
                if (!cancelled) setTorResults([]);
            } finally {
                if (!cancelled) setIsSearchingTors(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [needsTorReference, selectedTor, torSearch]);

    async function loadFeedback(): Promise<FeedbackItem[]> {
        const token = getToken();
        if (!token) return [];

        try {
            const res = await fetch(`${API_URL}/api/feedback/mine`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("failed");
            const data = await res.json();
            return data.feedback ?? [];
        } catch {
            // silently ignore — form still usable even if list fails
            return [];
        }
    }

    useEffect(() => {
        const token = getToken();
        if (!token) {
            router.push("/login");
            return;
        }
        let cancelled = false;
        loadFeedback().then((feedback) => {
            if (cancelled) return;
            setItems(feedback);
            setIsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [router]);
    
async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage(null);
    setFormError(null);

    const token = getToken();
    if (!token) {
        setFormError("กรุณาเข้าสู่ระบบก่อนส่งข้อเสนอแนะ");
        return;
    }

    const trimmedDescription = description.trim();

    if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
        setFormError(`กรุณากรอกรายละเอียดอย่างน้อย ${MIN_DESCRIPTION_LENGTH} ตัวอักษร`);
        return;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
        setFormError(`รายละเอียดต้องไม่เกิน ${MAX_DESCRIPTION_LENGTH} ตัวอักษร`);
        return;
    }

    if (needsTorReference && !selectedTor) {
        setFormError("กรุณาค้นหาและเลือก TOR ที่เกี่ยวข้องจากรายการ");
        return;
    }

    setIsSubmitting(true);

    try {
        const res = await fetch(`${API_URL}/api/feedback`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                category,
                description: trimmedDescription,
                torId: needsTorReference ? selectedTor?.id : undefined,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            setFormError(data.message ?? "ส่งข้อเสนอแนะไม่สำเร็จ");
            return;
        }

        setFormMessage("ส่งข้อเสนอแนะเรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็นของคุณ");
        setDescription("");
        setTorSearch("");
        setTorResults([]);
        setSelectedTor(null);
        loadFeedback().then(setItems);
    } catch {
        setFormError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
        setIsSubmitting(false);
    }
}

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
                <h1 className="text-xl font-semibold">ข้อเสนอแนะของฉัน</h1>

                {/* Submission form */}
                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
                >
                    <h2 className="text-sm font-semibold">ส่งข้อเสนอแนะใหม่</h2>
                    <p className="text-sm text-muted-foreground">
                        แจ้งปัญหาเกี่ยวกับแอป หรือรายงานข้อมูล TOR ที่ไม่ถูกต้อง
                    </p>

                    <div className="space-y-1.5">
                        <Label htmlFor="category">ประเภท</Label>
                        <select
                            id="category"
                            value={category}
                            onChange={(e) => {
                                const nextCategory = e.target.value;
                                setCategory(nextCategory);
                                if (nextCategory === "app_feedback" || nextCategory === "other") {
                                    setSelectedTor(null);
                                    setTorSearch("");
                                    setTorResults([]);
                                    setIsSearchingTors(false);
                                }
                            }}
                            className="h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm"
                        >
                            {CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {needsTorReference && (
                        <div className="space-y-1.5">
                            <Label htmlFor="tor-search">เลือก TOR ที่เกี่ยวข้อง</Label>
                            {selectedTor ? (
                                <div className="flex items-start cursor-pointer justify-between gap-3 rounded-md border border-primary/30 bg-accent/40 p-3">
                                    <div>
                                        <p className="text-sm font-medium">{selectedTor.title}</p>
                                        <p className="text-xs text-muted-foreground">{selectedTor.agency}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedTor(null);
                                            setTorSearch("");
                                        }}
                                        className="text-xs text-primary hover:underline cursor-pointer"
                                    >
                                        เปลี่ยน TOR
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Input
                                        id="tor-search"
                                        placeholder="ค้นหาด้วยชื่อโครงการหรือหน่วยงาน (อย่างน้อย 2 ตัวอักษร)"
                                        value={torSearch}
                                        onChange={(e) => {
                                            setTorSearch(e.target.value);
                                            setTorResults([]);
                                            setIsSearchingTors(false);
                                        }}
                                        autoComplete="off"
                                    />
                                    {isSearchingTors && (
                                        <p className="text-xs text-muted-foreground">กำลังค้นหา TOR...</p>
                                    )}
                                    {!isSearchingTors && torSearch.trim().length >= 2 && torResults.length === 0 && (
                                        <p className="text-xs text-muted-foreground">ไม่พบ TOR ที่เผยแพร่ตรงกับคำค้นหา</p>
                                    )}
                                    {torResults.length > 0 && (
                                        <ul className="max-h-60 overflow-y-auto rounded-md border border-border">
                                            {torResults.map((tor) => (
                                                <li key={tor.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedTor(tor);
                                                            setTorResults([]);
                                                        }}
                                                        className="w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                                                    >
                                                        <span className="block text-sm font-medium">{tor.title}</span>
                                                        <span className="block text-xs text-muted-foreground">{tor.agency}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="description">รายละเอียด</Label>
                        <textarea
                            id="description"
                            rows={4}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                            placeholder="อธิบายปัญหาหรือข้อเสนอแนะของคุณ"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                        <p className="text-right text-xs text-muted-foreground">
                            {description.length}/{MAX_DESCRIPTION_LENGTH}
                        </p>
                    </div>

                    {formError && <p className="text-sm text-destructive">{formError}</p>}
                    {formMessage && <p className="text-sm text-success">{formMessage}</p>}

                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "กำลังส่ง..." : "ส่งข้อเสนอแนะ"}
                    </Button>
                </form>

                {/* Tracker */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">ประวัติข้อเสนอแนะ</h2>

                        {!isLoading && items.length > 3 && (
                            <button
                                type="button"
                                onClick={() => setShowAll((v) => !v)}
                                className="cursor-pointer text-xs text-primary hover:underline"
                            >
                                {showAll ? "แสดงน้อยลง" : `แสดงทั้งหมด (${items.length})`}
                            </button>
                        )}
                    </div>

                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            คุณยังไม่เคยส่งข้อเสนอแนะ
                        </p>
                    ) : (
                        <ul
                            className={`space-y-3 ${
                                showAll ? "max-h-[480px] overflow-y-auto pr-1" : ""
                            }`}
                        >
                            {(showAll ? items : items.slice(0, 3)).map((item) => {
                                const statusInfo = STATUS_LABELS[item.status];
                                return (
                                    <li
                                        key={item._id}
                                        className="rounded-lg border border-border p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <span className="text-xs font-medium text-primary">
                                                    {CATEGORY_LABELS[item.category] ?? item.category}
                                                </span>
                                                {item.torReference && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        เกี่ยวข้องกับ: {item.torReference}
                                                    </p>
                                                )}
                                            </div>

                                            <span
                                                className={`rounded-md px-2 py-0.5 text-xs ${statusInfo.className}`}
                                            >
                                                {statusInfo.label}
                                            </span>
                                        </div>

                                        <p className="mt-2 text-sm">{item.description}</p>

                                        {item.adminResponse && (
                                            <div className="mt-3 rounded-md bg-accent p-3">
                                                <p className="text-xs font-medium text-accent-foreground">
                                                    คำตอบจากทีมงาน
                                                </p>
                                                <p className="mt-1 text-sm text-accent-foreground">
                                                    {item.adminResponse}
                                                </p>
                                            </div>
                                        )}

                                        <p className="mt-2 text-xs text-muted-foreground">
                                            ส่งเมื่อ:{" "}
                                            {new Date(item.createdAt).toLocaleDateString("th-TH", {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </main>
        </div>
    );
}