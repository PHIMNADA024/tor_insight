"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { label: "หน้าแรก", href: "/" },
  { label: "ค้นหา TOR", href: "/search" },
  { label: "แดชบอร์ด", href: "/dashboard" },
  { label: "เกี่ยวกับเรา", href: "/about" },
];

export function SiteHeader({ variant = "public" }: { variant?: "public" | "app" }) {
  const pathname = usePathname();

  return (
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

        {variant === "public" ? (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">เข้าสู่ระบบ</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">สมัครสมาชิก</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative text-muted-foreground transition-colors hover:text-foreground"
              aria-label="การแจ้งเตือน"
            >
              <Bell className="size-5" />
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            </Link>
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-4" />
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
