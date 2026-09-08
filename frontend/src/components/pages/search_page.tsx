import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tors, formatTHB } from "@/lib/mock-data";

function Select({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option>{value}</option>
            </select>
        </div>
    );
}

export default function SearchPage() {
    return (
        <div className="min-h-screen bg-background">
            <SiteHeader variant="app" />

            <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[260px_1fr]">
                <aside className="h-fit rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">ตัวกรอง</h2>

                        <button className="cursor-pointer text-xs text-primary hover:underline">
                            ล้างทั้งหมด
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                คำสำคัญ
                            </Label>
                            <Input
                                placeholder="พิมพ์คำค้นหา..."
                                className="h-9"
                            />
                        </div>

                        <Select label="หน่วยงาน" value="ทุกหน่วยงาน" />
                        <Select label="หมวดหมู่" value="ทุกหมวดหมู่" />
                        <Select label="ปีงบประมาณ" value="2569" />

                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                ช่วงงบประมาณ (บาท)
                            </Label>

                            <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="ต่ำสุด" className="h-9" />
                                <Input placeholder="สูงสุด" className="h-9" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                วันที่ประกาศ
                            </Label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                    <Input
                                        placeholder="ตั้งแต่"
                                        className="h-9 pr-8"
                                    />
                                    <CalendarDays className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
                                </div>

                                <div className="relative">
                                    <Input
                                        placeholder="ถึง"
                                        className="h-9 pr-8"
                                    />
                                    <CalendarDays className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
                                </div>
                            </div>
                        </div>

                        <Button className="w-full">ใช้ตัวกรอง</Button>

                        <Button variant="outline" className="w-full">
                            รีเซ็ต
                        </Button>
                    </div>
                </aside>

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