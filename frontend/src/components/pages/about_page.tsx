import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const steps = [
    {
        n: "01",
        title: "เก็บรวบรวมข้อมูลรายวัน",
        text: "ระบบอัตโนมัติดึงประกาศ TOR ใหม่จากเว็บไซต์จัดซื้อจัดจ้างของหน่วยงาน",
    },
    {
        n: "02",
        title: "จัดระเบียบข้อมูลให้เป็นมาตรฐาน",
        text: "งบประมาณ กำหนดเวลา หน่วยงาน และหมวดหมู่ ถูกจัดรูปแบบให้เป็นมาตรฐานเดียวกัน",
    },
    {
        n: "03",
        title: "ค้นหาและวิเคราะห์",
        text: "ค้นหาผลลัพธ์ เปรียบเทียบงบประมาณ และติดตามการค้นหาที่บันทึกไว้",
    },
];

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
                <h1 className="text-3xl font-semibold tracking-tight">
                    เกี่ยวกับ TOR Insight
                </h1>

                <p className="mt-3 text-muted-foreground">
                    TOR Insight เป็นแพลตฟอร์มตัวอย่าง (mockup) ที่รวบรวมข้อกำหนดขอบเขตงาน
                    (TOR) ด้านซอฟต์แวร์ ที่ประกาศโดยหน่วยงานของกรุงเทพมหานคร
                    เพื่อให้ทีมงานค้นหาโอกาสทางธุรกิจ
                    และเข้าใจแนวโน้มงบประมาณได้อย่างรวดเร็ว
                </p>

                <h2 className="mt-10 text-lg font-semibold">
                    วิธีการทำงาน
                </h2>

                <ol className="mt-4 space-y-4">
                    {steps.map((s) => (
                        <li
                            key={s.n}
                            className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
                        >
                            <span className="text-xs font-medium text-primary">
                                {s.n}
                            </span>

                            <p className="mt-1 font-medium">{s.title}</p>

                            <p className="mt-1 text-sm text-muted-foreground">
                                {s.text}
                            </p>
                        </li>
                    ))}
                </ol>

                <div className="mt-10 flex gap-3">
                    <Button asChild>
                        <Link href="/search">เริ่มค้นหา</Link>
                    </Button>

                    <Button asChild variant="outline">
                        <Link href="/dashboard">ดูแดชบอร์ด</Link>
                    </Button>
                </div>
            </main>
        </div>
    );
}