"use client";

import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
    Search,
    Archive,
    Pencil,
    Check,
} from "lucide-react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_OPTIONS, categoryLabel } from "@/lib/categories";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";

const items = [
    { label: "ภาพรวม", href: "/admin", icon: LayoutDashboard },
    { label: "จัดการ TOR", href: "/admin/tors", icon: FileStack },
    { label: "การเก็บรวบรวมข้อมูล", href: "/admin/sync", icon: Database },
    { label: "ข้อเสนอแนะ", href: "/admin/feedback", icon: MessageSquare },
    { label: "ผู้ใช้งาน", href: "/admin/users", icon: Users },
];

const TABS = [
    { value: "reported", label: "ถูกรายงานปัญหา" },
    { value: "draft", label: "ฉบับร่าง" },
    { value: "published", label: "เผยแพร่แล้ว" },
    { value: "archived", label: "เก็บถาวร" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

// "" represents "every category" for the filter dropdown; CATEGORY_OPTIONS
// itself only lists real category values, same source used in settings.
const FILTER_CATEGORY_OPTIONS = ["", ...CATEGORY_OPTIONS];
function filterCategoryLabel(category: string): string {
    return category === "" ? "ทุกหมวดหมู่" : categoryLabel(category);
}
function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type TorItem = {
    _id: string;
    title: string;
    description?: string;
    detailSummary?: string;
    agency: string;
    category: string;
    status: "draft" | "published" | "archived";
    budgetAmount?: number;
    tenderAmount?: number;
    fiscalYear?: number;
    procurementMethod?: string;
    sourceUrl?: string;
};

type FeedbackItem = {
    _id: string;
    category: string;
    description: string;
    status: string;
    createdAt: string;
    userId: { name: string; email: string } | string;
};

type ReportedItem = {
    tor: TorItem;
    feedback: FeedbackItem[];
};

type EditDraft = {
    title?: string;
    description?: string;
    detailSummary?: string;
    agency?: string;
    category?: string;
    budgetAmount?: number;
    tenderAmount?: number;
    fiscalYear?: number;
    procurementMethod?: string;
    sourceUrl?: string;
};

async function fetchJson(url: string, token: string | null) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("failed");
    return res.json();
}

function buildFilterQuery(searchTerm: string, categoryFilter: string, statusFilter = "") {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    return params.toString();
}

export default function AdminTorManagementPage() {
    const [activeTab, setActiveTab] = useState<TabValue>("reported");
    const [tors, setTors] = useState<TorItem[]>([]);
    const [reported, setReported] = useState<ReportedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [appliedFilters, setAppliedFilters] = useState({ search: "", category: "" });
    const [error, setError] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft>({});
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{
        id: string;
        action: "archive" | "publish";
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const queryString = buildFilterQuery(
            appliedFilters.search,
            appliedFilters.category,
            activeTab === "reported" ? "" : activeTab,
        );
        const query = queryString ? `?${queryString}` : "";
        const endpoint = activeTab === "reported"
            ? `${API_URL}/api/admin/tors/reported${query}`
            : `${API_URL}/api/admin/tors${query}`;

        fetchJson(endpoint, getToken())
            .then((data) => {
                if (cancelled) return;
                if (activeTab === "reported") setReported(data.results ?? []);
                else setTors(data.tors ?? []);
            })
            .catch(() => {
                if (!cancelled) setError("โหลดข้อมูลไม่สำเร็จ");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, appliedFilters]);

    async function handleSearchSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setAppliedFilters({ search, category });
    }

    async function handlePublish(id: string) {
        setActioningId(id);
        setError(null);
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/tors/${id}/publish`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("failed");

            setTors((prev) => prev.filter((t) => t._id !== id));
            setReported((prev) =>
                prev.map((item) => item.tor._id === id
                    ? { ...item, tor: { ...item.tor, status: "published" } }
                    : item),
            );
        } catch {
            setError("ดำเนินการไม่สำเร็จ");
        } finally {
            setActioningId(null);
        }
    }

    async function handleArchive(id: string) {
        setActioningId(id);
        setError(null);
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/tors/${id}/archive`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("failed");

            setTors((prev) => prev.filter((t) => t._id !== id));
            setReported((prev) =>
                prev.map((item) => item.tor._id === id
                    ? { ...item, tor: { ...item.tor, status: "archived" } }
                    : item),
            );
        } catch {
            setError("ดำเนินการไม่สำเร็จ");
        } finally {
            setActioningId(null);
        }
    }

    function startEdit(tor: TorItem) {
        setEditingId(tor._id);
        setEditDraft({
            title: tor.title,
            description: tor.description,
            detailSummary: tor.detailSummary,
            agency: tor.agency,
            category: tor.category,
            budgetAmount: tor.budgetAmount,
            tenderAmount: tor.tenderAmount,
            fiscalYear: tor.fiscalYear,
            procurementMethod: tor.procurementMethod,
            sourceUrl: tor.sourceUrl,
        });
    }

    function cancelEdit() {
        setEditingId(null);
        setEditDraft({});
    }

    async function saveEdit(id: string) {
        setActioningId(id);
        setError(null);
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/tors/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(editDraft),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "แก้ไขไม่สำเร็จ");
                return;
            }

            setTors((prev) =>
                prev.map((t) => (t._id === id ? { ...t, ...editDraft } : t)),
            );
            setReported((prev) =>
                prev.map((r) =>
                    r.tor._id === id ? { ...r, tor: { ...r.tor, ...editDraft } } : r,
                ),
            );
            setEditingId(null);
            setEditDraft({});
            setSuccessMessage("อัปเดต TOR เรียบร้อยแล้ว");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
        }
    }

    async function resolveFeedback(feedbackId: string, response: string) {
        if (!response.trim()) return;
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/feedback/${feedbackId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: "resolved", adminResponse: response }),
            });
            if (!res.ok) throw new Error("failed");

            setReported((prev) =>
                prev
                    .map((r) => ({
                        ...r,
                        feedback: r.feedback.filter((f) => f._id !== feedbackId),
                    }))
                    .filter((r) => r.feedback.length > 0),
            );
        } catch {
            setError("ตอบกลับไม่สำเร็จ");
        }
    }

    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar subtitle="ผู้ดูแลระบบ" items={items} activeLabel="จัดการ TOR" />

            <main className="flex-1 space-y-6 p-6">
                <h1 className="text-xl font-semibold tracking-tight">จัดการ TOR</h1>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
                    <div className="flex gap-2">
                        {TABS.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => {
                                    setError(null);
                                    setIsLoading(true);
                                    setActiveTab(tab.value);
                                }}
                                className={`cursor-pointer border-b-2 px-3 pb-2 text-sm ${
                                    activeTab === tab.value
                                        ? "border-primary font-medium text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2 pb-2">
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                aria-label="กรองตามหมวดหมู่"
                                className="h-8 cursor-pointer rounded-md border border-input bg-card px-2 text-xs"
                            >
                                {FILTER_CATEGORY_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {filterCategoryLabel(opt)}
                                    </option>
                                ))}
                            </select>

                            <Input
                                placeholder="ค้นหาชื่อโครงการหรือหน่วยงาน"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-8 w-56"
                            />

                            <Button type="submit" size="sm" variant="outline">
                                <Search className="size-3.5" />
                            </Button>
                    </form>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {successMessage && <p className="text-sm text-success">{successMessage}</p>}

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : activeTab === "reported" ? (
                    reported.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            ไม่มี TOR ที่ถูกรายงานปัญหา
                        </p>
                    ) : (
                        <ul className="space-y-4">
                            {reported.map(({ tor, feedback }) => (
                                <li
                                    key={tor._id}
                                    className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium">{tor.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {tor.agency}
                                            </p>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => startEdit(tor)}
                                            >
                                                <Pencil className="mr-1 size-3.5" />
                                                แก้ไข TOR
                                            </Button>
                                            {tor.status === "archived" ? (
                                                <span className="self-center text-xs text-muted-foreground">เก็บถาวรแล้ว</span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={actioningId === tor._id}
                                                    onClick={() => setConfirmAction({ id: tor._id, action: "archive" })}
                                                >
                                                    <Archive className="mr-1 size-3.5" />
                                                    เก็บถาวร
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {editingId === tor._id && (
                                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                                            <Input
                                                value={editDraft.title ?? ""}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                                                placeholder="ชื่อโครงการ"
                                            />
                                            <textarea
                                                value={editDraft.description ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, description: e.target.value }))
                                                }
                                                placeholder="คำอธิบาย"
                                                rows={2}
                                                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                                            />
                                            <textarea
                                                value={editDraft.detailSummary ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, detailSummary: e.target.value }))
                                                }
                                                placeholder="รายละเอียดเพิ่มเติม"
                                                rows={3}
                                                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                                            />
                                            <Input
                                                value={editDraft.agency ?? ""}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, agency: e.target.value }))}
                                                placeholder="หน่วยงาน"
                                            />

                                            <select
                                                value={editDraft.category ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, category: e.target.value }))
                                                }
                                                className="h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm"
                                            >
                                                {CATEGORY_OPTIONS.map((opt) => (
                                                    <option key={opt} value={opt}>
                                                        {categoryLabel(opt)}
                                                    </option>
                                                ))}
                                            </select>

                                            <div className="grid grid-cols-2 gap-2">
                                                <Input
                                                    type="number"
                                                    value={editDraft.budgetAmount ?? ""}
                                                    onChange={(e) =>
                                                        setEditDraft((d) => ({
                                                            ...d,
                                                            budgetAmount: Number(e.target.value),
                                                        }))
                                                    }
                                                    placeholder="งบประมาณ"
                                                />
                                                <Input
                                                    type="number"
                                                    value={editDraft.tenderAmount ?? ""}
                                                    onChange={(e) =>
                                                        setEditDraft((d) => ({
                                                            ...d,
                                                            tenderAmount: Number(e.target.value),
                                                        }))
                                                    }
                                                    placeholder="วงเงินประมูล"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <Input
                                                    type="number"
                                                    value={editDraft.fiscalYear ?? ""}
                                                    onChange={(e) =>
                                                        setEditDraft((d) => ({
                                                            ...d,
                                                            fiscalYear: Number(e.target.value),
                                                        }))
                                                    }
                                                    placeholder="ปีงบประมาณ"
                                                />
                                                <Input
                                                    value={editDraft.procurementMethod ?? ""}
                                                    onChange={(e) =>
                                                        setEditDraft((d) => ({
                                                            ...d,
                                                            procurementMethod: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="วิธีจัดซื้อจัดจ้าง"
                                                />
                                            </div>

                                            <Input
                                                value={editDraft.sourceUrl ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({ ...d, sourceUrl: e.target.value }))
                                                }
                                                placeholder="ลิงก์แหล่งที่มา"
                                            />

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={actioningId === tor._id}
                                                    onClick={() => saveEdit(tor._id)}
                                                >
                                                    {actioningId === tor._id ? "กำลังบันทึก..." : "บันทึก"}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={cancelEdit}>
                                                    ยกเลิก
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                                        {feedback.map((f) => {
                                            const userInfo =
                                                typeof f.userId === "object" ? f.userId : null;
                                            return (
                                                <FeedbackRow
                                                    key={f._id}
                                                    feedback={f}
                                                    userInfo={userInfo}
                                                    onResolve={resolveFeedback}
                                                />
                                            );
                                        })}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                ) : tors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
                ) : (
                    <ul className="space-y-3">
                        {tors.map((tor) => (
                            <li
                                key={tor._id}
                                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium">{tor.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {tor.agency} · {tor.status}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => startEdit(tor)}
                                        >
                                            <Pencil className="mr-1 size-3.5" />
                                            แก้ไข
                                        </Button>

                                        {activeTab === "archived" ? (
                                            <Button
                                                size="sm"
                                                disabled={actioningId === tor._id}
                                                onClick={() => setConfirmAction({ id: tor._id, action: "publish" })}
                                            >
                                                <Check className="mr-1 size-3.5" />
                                                เผยแพร่อีกครั้ง
                                            </Button>
                                        ) : activeTab === "draft" ? (
                                            <Button
                                                size="sm"
                                                disabled={actioningId === tor._id}
                                                onClick={() => setConfirmAction({ id: tor._id, action: "publish" })}
                                            >
                                                <Check className="mr-1 size-3.5" />
                                                เผยแพร่
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={actioningId === tor._id}
                                                onClick={() => setConfirmAction({ id: tor._id, action: "archive" })}
                                            >
                                                <Archive className="mr-1 size-3.5" />
                                                เก็บถาวร
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {editingId === tor._id && (
                                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                                        <Input
                                            value={editDraft.title ?? ""}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                                            placeholder="ชื่อโครงการ"
                                        />
                                        <textarea
                                            value={editDraft.description ?? ""}
                                            onChange={(e) =>
                                                setEditDraft((d) => ({ ...d, description: e.target.value }))
                                            }
                                            placeholder="คำอธิบาย"
                                            rows={2}
                                            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                                        />
                                        <textarea
                                            value={editDraft.detailSummary ?? ""}
                                            onChange={(e) =>
                                                setEditDraft((d) => ({ ...d, detailSummary: e.target.value }))
                                            }
                                            placeholder="รายละเอียดเพิ่มเติม"
                                            rows={3}
                                            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                                        />
                                        <Input
                                            value={editDraft.agency ?? ""}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, agency: e.target.value }))}
                                            placeholder="หน่วยงาน"
                                        />

                                        <select
                                            value={editDraft.category ?? ""}
                                            onChange={(e) =>
                                                setEditDraft((d) => ({ ...d, category: e.target.value }))
                                            }
                                            className="h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm"
                                        >
                                            {CATEGORY_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>
                                                    {categoryLabel(opt)}
                                                </option>
                                            ))}
                                        </select>

                                        <div className="grid grid-cols-2 gap-2">
                                            <Input
                                                type="number"
                                                value={editDraft.budgetAmount ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({
                                                        ...d,
                                                        budgetAmount: Number(e.target.value),
                                                    }))
                                                }
                                                placeholder="งบประมาณ"
                                            />
                                            <Input
                                                type="number"
                                                value={editDraft.tenderAmount ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({
                                                        ...d,
                                                        tenderAmount: Number(e.target.value),
                                                    }))
                                                }
                                                placeholder="วงเงินประมูล"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <Input
                                                type="number"
                                                value={editDraft.fiscalYear ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({
                                                        ...d,
                                                        fiscalYear: Number(e.target.value),
                                                    }))
                                                }
                                                placeholder="ปีงบประมาณ"
                                            />
                                            <Input
                                                value={editDraft.procurementMethod ?? ""}
                                                onChange={(e) =>
                                                    setEditDraft((d) => ({
                                                        ...d,
                                                        procurementMethod: e.target.value,
                                                    }))
                                                }
                                                placeholder="วิธีจัดซื้อจัดจ้าง"
                                            />
                                        </div>

                                        <Input
                                            value={editDraft.sourceUrl ?? ""}
                                            onChange={(e) =>
                                                setEditDraft((d) => ({ ...d, sourceUrl: e.target.value }))
                                            }
                                            placeholder="ลิงก์แหล่งที่มา"
                                        />

                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={actioningId === tor._id}
                                                onClick={() => saveEdit(tor._id)}
                                            >
                                                {actioningId === tor._id ? "กำลังบันทึก..." : "บันทึก"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                                                ยกเลิก
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </main>
            {confirmAction && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                    onClick={() => setConfirmAction(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold">
                            {confirmAction.action === "archive"
                                ? "เก็บถาวร TOR นี้?"
                                : activeTab === "draft"
                                ? "เผยแพร่ TOR นี้?"
                                : "เผยแพร่ TOR นี้อีกครั้ง?"}
                        </h2>

                        <p className="mt-2 text-sm text-muted-foreground">
                            {confirmAction.action === "archive"
                                ? "TOR นี้จะไม่แสดงในผลการค้นหาสาธารณะอีกต่อไป คุณสามารถเผยแพร่อีกครั้งได้ภายหลัง"
                                : activeTab === "draft"
                                ? "TOR นี้จะเปลี่ยนจากฉบับร่างเป็นเผยแพร่ และแสดงในผลการค้นหาสาธารณะ"
                                : "TOR นี้จะกลับมาแสดงในผลการค้นหาสาธารณะอีกครั้ง"}
                        </p>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setConfirmAction(null)}>
                                ยกเลิก
                            </Button>
                            <Button
                                variant={confirmAction.action === "archive" ? "destructive" : "default"}
                                disabled={actioningId === confirmAction.id}
                                onClick={async () => {
                                    const { id, action } = confirmAction;
                                    if (action === "archive") {
                                        await handleArchive(id);
                                    } else {
                                        await handlePublish(id);
                                    }
                                    setConfirmAction(null);
                                }}
                            >
                                {actioningId === confirmAction.id
                                    ? "กำลังดำเนินการ..."
                                    : confirmAction.action === "archive"
                                    ? "เก็บถาวร"
                                    : "เผยแพร่"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
    );
}

function FeedbackRow({
    feedback,
    userInfo,
    onResolve,
}: {
    feedback: FeedbackItem;
    userInfo: { name: string; email: string } | null;
    onResolve: (id: string, response: string) => void;
}) {
    const [response, setResponse] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleClick() {
        setIsSubmitting(true);
        await onResolve(feedback._id, response);
        setIsSubmitting(false);
    }

    return (
        <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm">{feedback.description}</p>
            {userInfo && (
                <p className="mt-1 text-xs text-muted-foreground">
                    จาก: {userInfo.name} ({userInfo.email})
                </p>
            )}
            <div className="mt-2 flex gap-2">
                <Input
                    placeholder="พิมพ์คำตอบ..."
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    className="h-8 text-xs"
                />
                <Button size="sm" disabled={isSubmitting} onClick={handleClick}>
                    {isSubmitting ? "กำลังบันทึก..." : "แก้ไขแล้ว"}
                </Button>
            </div>
        </div>
    );
}