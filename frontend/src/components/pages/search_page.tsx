"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { FilterPanel, emptyFilters, type SearchFilters } from "@/components/search/FilterPanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type SortValue = "date" | "budget" | "relevance";

type TorResult = {
    id: string;
    title: string;
    agency: string;
    category: string;
    budgetAmount?: number;
    fiscalYear?: number;
    publishedDate?: string;
};

type Pagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

const CATEGORY_LABELS: Record<string, string> = {
    software: "ซอฟต์แวร์",
    it_equipment: "ครุภัณฑ์คอมพิวเตอร์/ไอที",
};

function formatDate(iso?: string) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatTHB(n?: number) {
    if (n === undefined) return "-";
    return n.toLocaleString("th-TH");
}

/** Builds the GET /api/tors query string from filter/sort/page state. */
function buildQuery(filters: SearchFilters, sort: SortValue, page: number) {
    const params = new URLSearchParams();

    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.agency.trim()) params.set("agency", filters.agency.trim());
    if (filters.category.trim()) params.set("category", filters.category.trim());
    if (filters.fiscalYear.trim()) params.set("fiscalYear", filters.fiscalYear.trim());
    if (filters.budgetMin.trim()) params.set("budgetMin", filters.budgetMin.trim());
    if (filters.budgetMax.trim()) params.set("budgetMax", filters.budgetMax.trim());
    params.set("sort", sort);
    params.set("page", String(page));

    return params.toString();
}

export default function SearchPage() {
    const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(emptyFilters);
    const [sort, setSort] = useState<SortValue>("date");
    const [page, setPage] = useState(1);

    const [results, setResults] = useState<TorResult[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function runSearch() {
            setIsLoading(true);
            setError(null);

            try {
                const query = buildQuery(appliedFilters, sort, page);
                const res = await fetch(`${API_URL}/api/tors?${query}`, {
                    signal: controller.signal,
                });
                const data = await res.json();

                if (!res.ok) {
                    setError(data.message ?? "ค้นหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
                    setResults([]);
                    setPagination(null);
                    return;
                }

                setResults(data.results);
                setPagination(data.pagination);
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
                setResults([]);
                setPagination(null);
            } finally {
                setIsLoading(false);
            }
        }

        runSearch();
        return () => controller.abort();
    }, [appliedFilters, sort, page]);

    function handleApply() {
        setPage(1);
        setAppliedFilters(filters);
    }

    function handleReset() {
        setFilters(emptyFilters);
        setAppliedFilters(emptyFilters);
        setSort("date");
        setPage(1);
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
                        <p className="text-sm font-medium">
                            {pagination ? `พบ ${pagination.total} รายการ` : ""}
                        </p>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">เรียงตาม</span>

                            <select
                                value={sort}
                                onChange={(e) => {
                                    setPage(1);
                                    setSort(e.target.value as SortValue);
                                }}
                                className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                            >
                                <option value="date">ล่าสุด</option>
                                <option value="budget">งบประมาณสูงสุด</option>
                                <option value="relevance">ความเกี่ยวข้อง</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <p className="mb-4 text-sm text-destructive">{error}</p>
                    )}

                    {isLoading ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            กำลังโหลด...
                        </p>
                    ) : results.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                            ไม่พบ TOR ที่ตรงกับเงื่อนไขการค้นหา
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {results.map((t) => (
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
                                                    ประกาศ: {formatDate(t.publishedDate)}
                                                </span>
                                                {t.fiscalYear && (
                                                    <span>• ปีงบประมาณ: {t.fiscalYear}</span>
                                                )}
                                            </p>

                                            <span className="mt-3 inline-block rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                                                {CATEGORY_LABELS[t.category] ?? t.category}
                                            </span>
                                        </div>

                                        <div className="text-right">
                                            <p className="font-semibold text-success">
                                                {formatTHB(t.budgetAmount)} บาท
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
                    )}

                    {pagination && pagination.totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={pagination.page <= 1}
                                className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                ‹ ก่อนหน้า
                            </button>

                            <span className="text-muted-foreground">
                                หน้า {pagination.page} จาก {pagination.totalPages}
                            </span>

                            <button
                                onClick={() =>
                                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                                }
                                disabled={pagination.page >= pagination.totalPages}
                                className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                ถัดไป ›
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
