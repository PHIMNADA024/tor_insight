"use client";

import {
    LayoutDashboard,
    FileStack,
    Database,
    MessageSquare,
    Users,
    Building2,
    BarChart3,
    Settings,
} from "lucide-react";
import {
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { StatCard } from "@/components/StatCard";

const items = [
    {
        label: "ภาพรวม",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        label: "จัดการ TOR",
        icon: FileStack,
    },
    {
        label: "การเก็บรวบรวมข้อมูล",
        icon: Database,
    },
    {
        label: "ข้อเสนอแนะ",
        icon: MessageSquare,
    },
    {
        label: "ผู้ใช้งาน",
        icon: Users,
    },
    {
        label: "หน่วยงาน",
        icon: Building2,
    },
    {
        label: "รายงาน",
        icon: BarChart3,
    },
    {
        label: "ตั้งค่าระบบ",
        icon: Settings,
    },
];

const statusData = [
    {
        name: "เผยแพร่แล้ว",
        value: 82,
        color: "var(--chart-1)",
    },
    {
        name: "รอตรวจสอบ",
        value: 7,
        color: "var(--chart-4)",
    },
    {
        name: "ไม่ผ่าน",
        value: 11,
        color: "var(--chart-5)",
    },
];

const feedback = [
    {
        title: "ข้อมูลงบประมาณไม่ถูกต้อง",
        sub: "โครงการพัฒนาระบบบริหารจัดการข้อมูลด้วยปัญญาประดิษฐ์",
        date: "10 ส.ค. 2569",
    },
    {
        title: "ลิงก์แหล่งที่มาใช้งานไม่ได้",
        sub: "โครงการพัฒนาระบบขออนุญาตออนไลน์",
        date: "9 ส.ค. 2569",
    },
    {
        title: "TOR ซ้ำซ้อน",
        sub: "โครงการพัฒนาแอปพลิเคชันบริการประชาชนบนมือถือ",
        date: "8 ส.ค. 2569",
    },
];

const jobs = [
    {
        source: "สำนักดิจิทัลกรุงเทพมหานคร",
        records: 56,
        last: "10 ส.ค. 2569, 02:00 น.",
    },
    {
        source: "สำนักงานเมืองอัจฉริยะ กทม.",
        records: 42,
        last: "10 ส.ค. 2569, 02:00 น.",
    },
    {
        source: "สำนักการวางผังเมือง กทม.",
        records: 35,
        last: "10 ส.ค. 2569, 02:00 น.",
    },
];

export default function AdminPage() {
    return (
        <div className="flex min-h-screen bg-background">
            <DashboardSidebar
                subtitle="ผู้ดูแลระบบ"
                items={items}
                activeLabel="ภาพรวม"
            />

            <main className="flex-1 space-y-6 p-6">
                <h1 className="text-xl font-semibold tracking-tight">
                    ภาพรวมผู้ดูแลระบบ
                </h1>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="จำนวน TOR ทั้งหมด"
                        value="351"
                        delta="+12 รายการสัปดาห์นี้"
                    />

                    <StatCard
                        label="เผยแพร่แล้ว"
                        value="289"
                        delta="+21% เดือนนี้"
                    />

                    <StatCard
                        label="รอตรวจสอบ"
                        value="24"
                        delta="-7% เดือนนี้"
                        tone="down"
                    />

                    <StatCard
                        label="ไม่ผ่าน"
                        value="38"
                        delta="+11% เดือนนี้"
                        tone="down"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="text-sm font-semibold">
                            ภาพรวมสถานะ TOR
                        </h2>

                        <div className="mt-2 flex items-center gap-4">
                            <div className="h-44 flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={statusData}
                                            dataKey="value"
                                            innerRadius={45}
                                            outerRadius={70}
                                            paddingAngle={2}
                                        >
                                            {statusData.map((d) => (
                                                <Cell
                                                    key={d.name}
                                                    fill={d.color}
                                                />
                                            ))}
                                        </Pie>

                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <ul className="w-40 space-y-1.5 text-xs">
                                {statusData.map((d) => (
                                    <li
                                        key={d.name}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <span
                                                className="size-2 rounded-full"
                                                style={{ background: d.color }}
                                            />
                                            {d.name}
                                        </span>

                                        <span className="font-medium">
                                            {d.value}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <h2 className="mb-3 text-sm font-semibold">
                            ข้อเสนอแนะล่าสุด
                        </h2>

                        <ul className="space-y-3">
                            {feedback.map((f) => (
                                <li
                                    key={f.title}
                                    className="flex items-start justify-between gap-3"
                                >
                                    <span>
                                        <span className="block text-sm font-medium">
                                            {f.title}
                                        </span>

                                        <span className="block text-xs text-muted-foreground">
                                            {f.sub}
                                        </span>
                                    </span>

                                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                                        {f.date}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <button
                            type="button"
                            className="mt-4 cursor-pointer text-xs text-primary hover:underline"
                        >
                            ดูข้อเสนอแนะทั้งหมด →
                        </button>
                    </section>
                </div>

                <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                    <h2 className="mb-3 text-sm font-semibold">
                        งานเก็บรวบรวมข้อมูลล่าสุด
                    </h2>

                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted-foreground">
                            <tr>
                                <th className="pb-2 font-medium">
                                    แหล่งข้อมูล
                                </th>

                                <th className="pb-2 font-medium">
                                    สถานะ
                                </th>

                                <th className="pb-2 font-medium">
                                    จำนวนรายการ
                                </th>

                                <th className="pb-2 font-medium">
                                    รันล่าสุด
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {jobs.map((j) => (
                                <tr
                                    key={j.source}
                                    className="border-t border-border"
                                >
                                    <td className="py-2.5">
                                        {j.source}
                                    </td>

                                    <td className="py-2.5">
                                        <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs text-success">
                                            สำเร็จ
                                        </span>
                                    </td>

                                    <td className="py-2.5 text-muted-foreground">
                                        {j.records}
                                    </td>

                                    <td className="py-2.5 text-muted-foreground">
                                        {j.last}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button
                        type="button"
                        className="mt-3 cursor-pointer text-xs text-primary hover:underline"
                    >
                        ดูงานทั้งหมด →
                    </button>
                </section>
            </main>
        </div>
    );
}