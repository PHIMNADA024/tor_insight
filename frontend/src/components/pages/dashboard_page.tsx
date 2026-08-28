"use client";

import {
    LayoutDashboard,
    Search,
    Bookmark,
    Bell,
    Info,
} from "lucide-react";
import {
    Bar,
    BarChart,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { StatCard } from "@/components/StatCard";
import {
    budgetByAgency,
    budgetByCategory,
    budgetByYear,
    tors,
    formatTHB,
} from "@/lib/mock-data";

const chartColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
];

const items = [
    {
        label: "แดชบอร์ด",
        href: "/dashboard",
        icon: LayoutDashboard,
        children: [
            "ภาพรวม",
            "ตามหน่วยงาน",
            "ตามหมวดหมู่",
            "ตามปี",
            "โครงการเด่น",
            "แนวโน้ม",
        ],
    },
    {
        label: "ค้นหา TOR",
        href: "/search",
        icon: Search,
    },
    {
        label: "การค้นหาที่บันทึกไว้",
        icon: Bookmark,
    },
    {
        label: "การแจ้งเตือน",
        href: "/notifications",
        icon: Bell,
    },
    {
        label: "เกี่ยวกับเรา",
        href: "/about",
        icon: Info,
    },
];

function Donut({
    title,
    data,
}: {
    title: string;
    data: { name: string; value: number }[];
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-semibold">{title}</h2>

            <div className="mt-2 flex items-center gap-4">
                <div className="h-44 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={2}
                            >
                                {data.map((_, i) => (
                                    <Cell
                                        key={i}
                                        fill={chartColors[i % chartColors.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <ul className="w-40 space-y-1.5 text-xs">
                    {data.map((d, i) => (
                        <li
                            key={d.name}
                            className="flex items-center justify-between gap-2"
                        >
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span
                                    className="size-2 rounded-full"
                                    style={{
                                        background:
                                            chartColors[i % chartColors.length],
                                    }}
                                />
                                {d.name}
                            </span>

                            <span className="font-medium">{d.value}%</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar
                subtitle="การวิเคราะห์"
                items={items}
                activeLabel="แดชบอร์ด"
            />

            <main className="flex-1 space-y-6 p-6">
                <h1 className="text-xl font-semibold tracking-tight">
                    ภาพรวมแดชบอร์ดราคา
                </h1>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="งบประมาณรวม"
                        value="1,243,750,000"
                        unit="บาท"
                        delta="+8.5% ปีนี้"
                    />

                    <StatCard
                        label="งบประมาณเฉลี่ย"
                        value="7,892,857"
                        unit="บาท"
                        delta="+4.2% ปีนี้"
                    />

                    <StatCard
                        label="จำนวน TOR ทั้งหมด"
                        value="351"
                        delta="+12 รายการสัปดาห์นี้"
                    />

                    <StatCard
                        label="หน่วยงาน"
                        value="24"
                        delta="ทุกหน่วยงานใน กทม."
                        tone="neutral"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Donut
                        title="งบประมาณตามหน่วยงาน (5 อันดับแรก)"
                        data={budgetByAgency}
                    />

                    <Donut
                        title="งบประมาณตามหมวดหมู่"
                        data={budgetByCategory}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="text-sm font-semibold">
                            งบประมาณตามปีงบประมาณ
                        </h2>

                        <p className="text-xs text-muted-foreground">
                            หน่วย: ล้านบาท
                        </p>

                        <div className="mt-3 h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={budgetByYear}>
                                    <XAxis
                                        dataKey="year"
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={12}
                                    />

                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={12}
                                    />

                                    <Tooltip />

                                    <Bar
                                        dataKey="total"
                                        fill="var(--chart-1)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="mb-3 text-sm font-semibold">
                            5 โครงการงบประมาณสูงสุด
                        </h2>

                        <ol className="space-y-3 text-sm">
                            {[...tors]
                                .sort((a, b) => b.budget - a.budget)
                                .map((t, i) => (
                                    <li
                                        key={t.id}
                                        className="flex items-start justify-between gap-4"
                                    >
                                        <span className="text-muted-foreground">
                                            {i + 1}. {t.title}
                                        </span>

                                        <span className="whitespace-nowrap font-medium">
                                            {formatTHB(t.budget)} บาท
                                        </span>
                                    </li>
                                ))}
                        </ol>
                    </div>
                </div>
            </main>
        </div>
    );
}