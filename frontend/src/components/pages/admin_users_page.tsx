"use client";

import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
    Ban,
    CheckCircle2,
    Trash2,
    LogOut,
} from "lucide-react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { SiteHeader } from "../SiteHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050";

const items = [
    { label: "ภาพรวม", href: "/admin", icon: LayoutDashboard },
    { label: "จัดการ TOR", href: "/admin/tors", icon: FileStack },
    { label: "การเก็บรวบรวมข้อมูล", href: "/admin/sync", icon: Database },
    { label: "ข้อเสนอแนะ", href: "/admin/feedback", icon: MessageSquare },
    { label: "ผู้ใช้งาน", href: "/admin/users", icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
    end_user: "ผู้ใช้งานทั่วไป",
    admin: "ผู้ดูแลระบบ",
};

function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

type UserItem = {
    _id: string;
    name: string;
    email: string;
    role: string;
    status: "active" | "disabled";
    isEmailVerified: boolean;
    createdAt: string;
    lastLoginAt?: string;
};

export default function AdminUsersPage() {
    const { user: currentUser, logout } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleteCurrentPassword, setDeleteCurrentPassword] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

    async function fetchUsers(searchTerm = ""): Promise<UserItem[]> {
        const token = getToken();
        const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : "";
        const res = await fetch(`${API_URL}/api/admin/users${query}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("failed");

        const data = await res.json();
        return data.users ?? [];
    }

    useEffect(() => {
        let cancelled = false;

        fetchUsers()
            .then((loadedUsers) => {
                if (!cancelled) setUsers(loadedUsers);
            })
            .catch(() => {
                if (!cancelled) setError("โหลดข้อมูลผู้ใช้งานไม่สำเร็จ");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleSearchSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            setUsers(await fetchUsers(search));
        } catch {
            setError("โหลดข้อมูลผู้ใช้งานไม่สำเร็จ");
        } finally {
            setIsLoading(false);
        }
    }

    async function handleToggleStatus(user: UserItem) {
        setActioningId(user._id);
        setError(null);
        setNotice(null);

        const endpoint = user.status === "active" ? "disable" : "enable";

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/users/${user._id}/${endpoint}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "ดำเนินการไม่สำเร็จ");
                return;
            }

            setUsers((prev) =>
                prev.map((u) =>
                    u._id === user._id
                        ? { ...u, status: user.status === "active" ? "disabled" : "active" }
                        : u,
                ),
            );
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
        }
    }

    async function handlePasswordReset(user: UserItem) {
        setActioningId(user._id);
        setError(null);
        setNotice(null);

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/users/${user._id}/password-reset`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "ส่งลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ");
                return;
            }
            setNotice(`ส่งลิงก์รีเซ็ตรหัสผ่านไปยัง ${user.email} แล้ว`);
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
        }
    }

    async function handleRevokeSessions(user: UserItem) {
        setActioningId(user._id);
        setError(null);
        setNotice(null);
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/users/${user._id}/sessions/revoke`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "ยกเลิกเซสชันไม่สำเร็จ");
                return;
            }
            setNotice(`ยกเลิกเซสชันทั้งหมดของ ${user.email} แล้ว`);
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
        }
    }

    async function handleRevokeAllSessions() {
        setActioningId("all-sessions");
        setError(null);
        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/users/sessions/revoke-all`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "ยกเลิกเซสชันทั้งหมดไม่สำเร็จ");
                return;
            }
            await logout();
            router.push("/login");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
            setConfirmRevokeAll(false);
        }
    }

    async function handleDelete(id: string, currentPassword: string) {
        setActioningId(id);
        setError(null);

        try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message ?? "ลบผู้ใช้งานไม่สำเร็จ");
                return;
            }

            setUsers((prev) => prev.filter((u) => u._id !== id));
            setConfirmDeleteId(null);
            setDeleteCurrentPassword("");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        } finally {
            setActioningId(null);
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8 sm:px-6">
                <DashboardSidebar
                    subtitle="ผู้ดูแลระบบ"
                    items={items}
                    activeLabel="ผู้ใช้งาน"
                />

                <main className="min-w-0 flex-1 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-xl font-semibold tracking-tight">
                            จัดการผู้ใช้งาน
                        </h1>

                        <Button variant="destructive" size="sm" onClick={() => setConfirmRevokeAll(true)}>
                            <LogOut className="mr-1 size-3.5" />
                            ออกจากทุกบัญชี
                        </Button>

                        <form onSubmit={handleSearchSubmit} className="flex gap-2">
                            <Input
                                placeholder="ค้นหาด้วยชื่อหรืออีเมล"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 w-64"
                            />
                            <Button type="submit" variant="outline" size="sm">
                                ค้นหา
                            </Button>
                        </form>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {notice && <p className="text-sm text-success">{notice}</p>}

                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                    ) : users.length === 0 ? (
                        <p className="text-sm text-muted-foreground">ไม่พบผู้ใช้งาน</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                                    <tr>
                                        <th className="p-3 font-medium">ชื่อ</th>
                                        <th className="p-3 font-medium">อีเมล</th>
                                        <th className="p-3 font-medium">บทบาท</th>
                                        <th className="p-3 font-medium">สถานะ</th>
                                        <th className="p-3 font-medium">เข้าสู่ระบบล่าสุด</th>
                                        <th className="p-3 font-medium text-right">การดำเนินการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => {
                                        const isSelf = user._id === currentUser?.id; // NEW

                                        return (
                                            <tr key={user._id} className="border-t border-border">
                                                <td className="p-3">
                                                    {user.name}
                                                    {isSelf && (
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            (คุณ)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-muted-foreground">{user.email}</td>
                                                <td className="p-3">
                                                    {ROLE_LABELS[user.role] ?? user.role}
                                                </td>
                                                <td className="p-3">
                                                    <span
                                                        className={`rounded-md px-2 py-0.5 text-xs ${
                                                            user.status === "active"
                                                                ? "bg-success/15 text-success"
                                                                : "bg-destructive/15 text-destructive"
                                                        }`}
                                                    >
                                                        {user.status === "active" ? "ใช้งานอยู่" : "ถูกระงับ"}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {user.lastLoginAt
                                                        ? new Date(user.lastLoginAt).toLocaleDateString("th-TH")
                                                        : "ไม่เคยเข้าสู่ระบบ"}
                                                </td>
                                                <td className="p-3">
                                                    {isSelf ? (
                                                        <span className="block text-right text-xs text-muted-foreground">
                                                            ไม่สามารถดำเนินการกับบัญชีตัวเอง
                                                        </span>
                                                    ) : (
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={actioningId === user._id}
                                                                onClick={() => handlePasswordReset(user)}
                                                            >
                                                                {actioningId === user._id ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={actioningId === user._id}
                                                                onClick={() => handleRevokeSessions(user)}
                                                            >
                                                                <LogOut className="mr-1 size-3.5" />
                                                                ยกเลิกเซสชัน
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={actioningId === user._id}
                                                                onClick={() => handleToggleStatus(user)}
                                                            >
                                                                {user.status === "active" ? (
                                                                    <>
                                                                        <Ban className="mr-1 size-3.5" />
                                                                        ระงับ
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="mr-1 size-3.5" />
                                                                        เปิดใช้งาน
                                                                    </>
                                                                )}
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                disabled={actioningId === user._id}
                                                                onClick={() => setConfirmDeleteId(user._id)}
                                                            >
                                                                <Trash2 className="mr-1 size-3.5" />
                                                                ลบ
                                                            </Button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>

                {confirmDeleteId && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                        onClick={() => {
                            setConfirmDeleteId(null);
                            setDeleteCurrentPassword("");
                        }}
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-lg font-semibold">ลบผู้ใช้งาน?</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                การลบผู้ใช้งานนี้ไม่สามารถย้อนกลับได้ ข้อมูลบัญชีทั้งหมดจะถูกลบถาวร
                            </p>

                            <label className="mt-4 block space-y-1.5 text-sm">
                                <span>ยืนยันรหัสผ่านปัจจุบันของคุณ</span>
                                <Input
                                    type="password"
                                    autoComplete="current-password"
                                    value={deleteCurrentPassword}
                                    onChange={(event) => setDeleteCurrentPassword(event.target.value)}
                                />
                            </label>

                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => {
                                    setConfirmDeleteId(null);
                                    setDeleteCurrentPassword("");
                                }}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={actioningId === confirmDeleteId || !deleteCurrentPassword}
                                    onClick={() => handleDelete(confirmDeleteId, deleteCurrentPassword)}
                                >
                                    {actioningId === confirmDeleteId ? "กำลังลบ..." : "ลบถาวร"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {confirmRevokeAll && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                            <h2 className="text-lg font-semibold">ออกจากระบบทุกบัญชี?</h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                การดำเนินการนี้จะยกเลิกเซสชันของผู้ใช้และผู้ดูแลระบบทุกคน รวมถึงบัญชีนี้
                            </p>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setConfirmRevokeAll(false)}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={actioningId === "all-sessions"}
                                    onClick={handleRevokeAllSessions}
                                >
                                    {actioningId === "all-sessions" ? "กำลังยกเลิก..." : "ยืนยันออกจากทุกบัญชี"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}