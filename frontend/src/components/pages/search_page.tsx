"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { FilterPanel, emptyFilters, type SearchFilters } from "@/components/search/FilterPanel";
import { tors, formatTHB } from "@/lib/mock-data";

export default function SearchPage() {
    const [filters, setFilters] = useState<SearchFilters>(emptyFilters);

    // TODO(connect-search-api): send `filters` to GET /api/tors and replace
    // the mock `tors` list below with the response. Apply/reset only update
    // local state for now.
    function handleApply() {
        console.log("apply filters", filters);
    }

    function handleReset() {
        setFilters(emptyFilters);
    }

    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[260px_1fr]">
                <FilterPanel
                    value={filters}
                    onChange={setFilters}
                    onApply={handleApply}
                    onReset={handleReset}
                />

                <section>
                    <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm font-medium">พบ 351 รายการ</p>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                เรียงตาม
                            </span>

                            <select className="h-8 rounded-md border border-input bg-card px-2 text-xs">
                                <option>ล่าสุด</option>
                                <option>งบประมาณสูงสุด</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {tors.map((t) => (
                            <article
                                key={t.id}
                                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <Link
                                            href="/tor"
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {t.title}
                                        </Link>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {t.agency}
                                        </p>

                                        <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="size-3" />
                                                ประกาศ: {t.published}
                                            </span>

                                            <span>• ปิดรับ: {t.deadline}</span>
                                        </p>

                                        <span className="mt-3 inline-block rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                                            {t.category}
                                        </span>
                                    </div>

                                    <div className="text-right">
                                        <p className="font-semibold text-success">
                                            {formatTHB(t.budget)} บาท
                                        </p>

                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                            className="mt-8"
                                        >
                                            <Link href="/tor">ดูรายละเอียด</Link>
                                        </Button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-1.5 text-sm">
                        {["1", "2", "3", "4", "5", "...", "16", "›"].map(
                            (p, i) => (
                                <button
                                    key={i}
                                    className={`size-8 cursor-pointer rounded-md border border-border ${p === "1"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-card text-muted-foreground"
                                        }`}
                                >
                                    {p}
                                </button>
                            ),
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}