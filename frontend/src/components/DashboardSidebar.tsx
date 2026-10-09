import Link from "next/link";
import type { LucideIcon } from "lucide-react";

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
    <aside className="sticky top-24 hidden h-fit w-60 shrink-0 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] lg:block">
      <p className="px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">{subtitle}</p>

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
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {content}
                </span>
              )}
              {item.children?.length ? (
                <div className="mb-1 ml-9 flex flex-col gap-1 pt-1">
                  {item.children.map((child) => (
                    <span key={child} className="text-xs text-muted-foreground/70">
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
