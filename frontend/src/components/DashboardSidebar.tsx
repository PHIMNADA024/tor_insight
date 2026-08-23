import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";

export type SidebarItem = { label: string; href?: string; icon?: LucideIcon; children?: string[] };

export function DashboardSidebar({
  subtitle,
  items,
  activeLabel,
}: {
  subtitle: string;
  items: SidebarItem[];
  activeLabel: string;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Search className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">TOR Insight</span>
          <span className="block text-xs text-sidebar-foreground/60">{subtitle}</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.label === activeLabel;
          const content = (
            <>
              {Icon ? <Icon className="size-4" /> : null}
              {item.label}
            </>
          );
          return (
            <div key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/75"
                  }`}
                >
                  {content}
                </span>
              )}
              {item.children?.length ? (
                <div className="mb-1 ml-9 flex flex-col gap-1 pt-1">
                  {item.children.map((child) => (
                    <span key={child} className="text-xs text-sidebar-foreground/55">
                      {child}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
