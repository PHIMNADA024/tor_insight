// site-header.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, LogOut, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const nav = [
  { label: "หน้าแรก", href: "/" },
  { label: "ค้นหา TOR", href: "/search" },
  { label: "แดชบอร์ด", href: "/dashboard" },
  { label: "เกี่ยวกับเรา", href: "/about" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoaded, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  function handleConfirmLogout() {
    logout();
    setShowLogoutConfirm(false);
    router.push("/");
  }

  function truncateName(name: string, maxLength = 20) {
    if (name.length <= maxLength) return name;
    return `${name.slice(0, maxLength)}...`;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Search className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">TOR Insight</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors hover:text-foreground ${
                  pathname === item.href ? "font-medium text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {!isLoaded ? (
            <div className="h-8 w-20" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/notifications"
                className="relative text-muted-foreground transition-colors hover:text-foreground"
                aria-label="การแจ้งเตือน"
              >
                <Bell className="size-5" />
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              </Link>

              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </span>
                <span
                  className="hidden w-[100px] truncate text-sm font-medium sm:inline"
                  title={user.name}
                >
                  {truncateName(user.name)}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowLogoutConfirm(true)}
                aria-label="ออกจากระบบ"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">เข้าสู่ระบบ</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">สมัครสมาชิก</Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">ออกจากระบบ?</h2>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              คุณต้องการออกจากระบบใช่หรือไม่
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowLogoutConfirm(false)}
              >
                ยกเลิก
              </Button>
              <Button variant="destructive" onClick={handleConfirmLogout}>
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}