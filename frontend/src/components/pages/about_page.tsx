import Link from "next/link";
import {
    Search,
    BarChart3,
    BellRing,
    MessageSquare,
    Database,
    ShieldCheck,
    Clock,
    FileSearch,
    Layers,
    LineChart,
    type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const highlights: { icon: LucideIcon; title: string; text: string }[] = [
    {
        icon: Database,
        title: "ข้อมูลจากแหล่งภาครัฐ",
        text: "รวบรวมข้อมูลจาก BMA Open Contracting และประกาศ e-GP ที่ระบบรองรับ",
    },
    {
        icon: Clock,
        title: "รองรับการเก็บข้อมูลอัตโนมัติ",
        text: "ระบบรองรับงานเก็บข้อมูลตามรอบเวลาที่ตั้งค่าไว้ ซึ่งแตกต่างกันตามแหล่งข้อมูล",
    },
    {
        icon: BellRing,
        title: "แจ้งเตือนตามความสนใจ",
        text: "รับการแจ้งเตือนในแอปเมื่อมี TOR ใหม่ที่ตรงกับเกณฑ์ที่บันทึกไว้ และรับอีเมลเมื่อเปิดใช้",
    },
];

const problems = [
    "ข้อมูลอยู่หลายแหล่ง ต้องเปิดหลายเว็บไซต์เพื่อค้นหาและเปรียบเทียบ",
    "งบประมาณและปีงบประมาณมีรูปแบบแตกต่างกัน จึงเปรียบเทียบได้ยาก",
    "การติดตามประกาศใหม่และโครงการที่ตรงกับความสนใจต้องใช้เวลา",
];

const steps: { n: string; icon: LucideIcon; title: string; text: string }[] = [
    {
        n: "01",
        icon: FileSearch,
        title: "รวบรวมประกาศ",
        text: "ดึงข้อมูลจากแหล่งจัดซื้อจัดจ้างภาครัฐที่ระบบเชื่อมต่อ โดยรอบการทำงานขึ้นกับการตั้งค่าและแหล่งข้อมูล",
    },
    {
        n: "02",
        icon: Layers,
        title: "จัดระเบียบข้อมูล",
        text: "ปรับรูปแบบหน่วยงาน งบประมาณ ปีงบประมาณ และหมวดหมู่ให้ค้นหาและเปรียบเทียบได้ โดยเน้นรายการที่ระบบจัดว่าเกี่ยวข้องกับไอที",
    },
    {
        n: "03",
        icon: LineChart,
        title: "ค้นหา วิเคราะห์ และติดตาม",
        text: "ค้นหา TOR วิเคราะห์งบประมาณ และตั้งเกณฑ์ความสนใจเพื่อรับแจ้งเตือนเมื่อมีรายการใหม่ที่ตรงกัน",
    },
];

const features: { icon: LucideIcon; title: string; text: string }[] = [
    {
        icon: Search,
        title: "ค้นหา TOR",
        text: "ค้นหาด้วยคำสำคัญ และกรองตามหน่วยงาน หมวดหมู่ ปีงบประมาณ สถานะการรับสมัคร และช่วงงบประมาณ",
    },
    {
        icon: BarChart3,
        title: "แดชบอร์ดวิเคราะห์งบประมาณ",
        text: "ดูงบประมาณรวมและเฉลี่ย แยกตามหน่วยงาน หมวดหมู่ และปีงบประมาณ พร้อมรายการ TOR ที่มีงบประมาณสูง",
    },
    {
        icon: BellRing,
        title: "แจ้งเตือน TOR ใหม่",
        text: "ตั้งเกณฑ์ตามหมวดหมู่ หน่วยงาน คำสำคัญ งบประมาณ หรือปีงบประมาณ รับแจ้งเตือนในแอป และทางอีเมลเมื่อเปิดใช้",
    },
    {
        icon: MessageSquare,
        title: "แจ้งปัญหาและติดตามผล",
        text: "แจ้งข้อมูล TOR ที่ไม่ถูกต้อง ล้าสมัย หรือลิงก์เสีย ผู้ดูแลสามารถตรวจสอบ แก้ไขข้อมูล และตอบกลับได้",
    },
];

/** Same container as the header, so every edge on the page lines up with it. */
const pageContainer = "mx-auto max-w-7xl px-4 sm:px-6";

const cardClass =
    "rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]";

const outlineOnDarkClass =
    "border-white/30 bg-transparent text-navy-foreground hover:bg-white/10 hover:text-navy-foreground";

/** Left-aligned heading used by every section, so spacing stays consistent. */
function SectionHeading({ title, text }: { title: string; text?: string }) {
    return (
        <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {text && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{text}</p>
            )}
        </div>
    );
}

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background">
            <SiteHeader />

            <section className="bg-[image:var(--gradient-hero)] text-navy-foreground">
                <div className={`${pageContainer} py-16 sm:py-20`}>
                    <p className="text-xs font-medium uppercase tracking-wider text-navy-foreground/70">
                        เกี่ยวกับ TOR Insight
                    </p>
                    <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                        ทุกโอกาสจาก TOR ด้านซอฟต์แวร์และไอที รวมไว้ในที่เดียว
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm text-navy-foreground/75 sm:text-base">
                        TOR Insight รวบรวมข้อมูล TOR จาก BMA Open Contracting และประกาศ e-GP ที่ระบบรองรับ
                        ช่วยให้ค้นหาโครงการด้านซอฟต์แวร์และไอที วิเคราะห์แนวโน้มงบประมาณ
                        และติดตามรายการใหม่ที่ตรงกับความสนใจ
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <Button asChild>
                            <Link href="/search">เริ่มค้นหา TOR</Link>
                        </Button>
                        <Button asChild variant="outline" className={outlineOnDarkClass}>
                            <Link href="/dashboard">ดูแดชบอร์ด</Link>
                        </Button>
                    </div>
                </div>
            </section>

            <main className={`${pageContainer} space-y-12 py-12`}>
                <section className="grid gap-4 sm:grid-cols-3">
                    {highlights.map((highlight) => (
                        <div key={highlight.title} className={cardClass}>
                            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                                <highlight.icon className="size-4" />
                            </span>
                            <p className="mt-3 font-medium">{highlight.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{highlight.text}</p>
                        </div>
                    ))}
                </section>

                <section className="space-y-5">
                    <SectionHeading
                        title="ทำไมต้อง TOR Insight"
                        text="ประกาศจัดซื้อจัดจ้างกระจายอยู่หลายระบบและใช้รูปแบบข้อมูลต่างกัน ทำให้การติดตามและเปรียบเทียบโครงการด้านไอทีด้วยตนเองใช้เวลามาก"
                    />
                    <ul className="grid gap-4 sm:grid-cols-3">
                        {problems.map((text) => (
                            <li key={text} className={`${cardClass} text-sm`}>
                                {text}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="space-y-5">
                    <SectionHeading title="วิธีการทำงาน" />
                    <ol className="grid gap-4 md:grid-cols-3">
                        {steps.map((step) => (
                            <li key={step.n} className={cardClass}>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-primary">{step.n}</span>
                                    <step.icon className="size-5 text-primary" />
                                </div>
                                <p className="mt-3 font-medium">{step.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="space-y-5">
                    <SectionHeading title="สิ่งที่คุณทำได้" />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {features.map((feature) => (
                            <div key={feature.title} className={cardClass}>
                                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                                    <feature.icon className="size-4" />
                                </span>
                                <p className="mt-3 font-medium">{feature.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" />
                        <div>
                            <h2 className="font-semibold">ตรวจสอบข้อมูลกับแหล่งที่มา</h2>
                            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                เมื่อ TOR มีลิงก์แหล่งข้อมูลต้นทาง คุณสามารถเปิดเพื่อตรวจสอบรายละเอียดได้
                                หากพบข้อมูลไม่ถูกต้องหรือล้าสมัย สามารถแจ้งผู้ดูแลให้ตรวจสอบ แก้ไขข้อมูล และตอบกลับได้
                            </p>
                        </div>
                    </div>

                    <Button asChild variant="outline" className="shrink-0">
                        <Link href="/my-feedback">
                            <MessageSquare className="mr-1.5 size-4" />
                            แจ้งปัญหา / ส่งข้อเสนอแนะ
                        </Link>
                    </Button>
                </section>

                <section className="flex flex-col gap-6 rounded-xl bg-[image:var(--gradient-hero)] p-8 text-navy-foreground md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">เริ่มสำรวจ TOR ได้ที่นี่</h2>
                        <p className="mt-2 max-w-xl text-sm text-navy-foreground/75">
                            ค้นหาโครงการและวิเคราะห์ข้อมูลจากแดชบอร์ด หรือเข้าสู่ระบบเพื่อตั้งค่าเกณฑ์แจ้งเตือน
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild>
                            <Link href="/search">ค้นหา TOR</Link>
                        </Button>
                        <Button asChild variant="outline" className={outlineOnDarkClass}>
                            <Link href="/settings">ตั้งค่าบัญชี</Link>
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    );
}