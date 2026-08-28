import { Bell, CheckCircle2, Info } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

const notifications = [
  {
    icon: Bell,
    tone: "primary",
    title: "มี TOR ใหม่ที่ตรงกับความสนใจของคุณ",
    body: 'TOR ใหม่ "โครงการพัฒนาแอปพลิเคชันบริการประชาชนบนมือถือ" ตรงกับเงื่อนไขที่คุณบันทึกไว้',
    time: "10 ส.ค. 2569, 09:30 น.",
    unread: true,
  },
  {
    icon: Bell,
    tone: "primary",
    title: "มี TOR ใหม่ที่ตรงกับความสนใจของคุณ",
    body: 'TOR ใหม่ "โครงการพัฒนาระบบบริหารจัดการข้อมูลด้วยปัญญาประดิษฐ์" ตรงกับเงื่อนไขที่คุณบันทึกไว้',
    time: "9 ส.ค. 2569, 16:15 น.",
    unread: false,
  },
  {
    icon: CheckCircle2,
    tone: "success",
    title: "ข้อมูลที่คุณแจ้งได้รับการแก้ไขแล้ว",
    body: 'ปัญหาที่คุณแจ้งใน "โครงการพัฒนาระบบขออนุญาตออนไลน์" ได้รับการแก้ไขเรียบร้อยแล้ว',
    time: "8 ส.ค. 2569, 11:20 น.",
    unread: false,
  },
  {
    icon: Info,
    tone: "muted",
    title: "อัปเดตสถานะ TOR",
    body: 'สถานะของ "โครงการพัฒนาระบบบริหารโครงสร้างพื้นฐานคลาวด์" เปลี่ยนเป็น เผยแพร่แล้ว',
    time: "6 ส.ค. 2569, 10:05 น.",
    unread: false,
  },
];

const toneClass: Record<string, string> = {
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/15 text-success",
  muted: "bg-muted text-muted-foreground",
};

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader variant="app" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">
          การแจ้งเตือนของฉัน
        </h1>

        <div className="mt-4 flex items-center justify-between border-b border-border">
          <div className="flex gap-6 text-sm">
            {["ทั้งหมด", "ยังไม่อ่าน", "อ่านแล้ว"].map((tab, i) => (
              <button
                key={tab}
                type="button"
                className={`-mb-px border-b-2 pb-2.5 ${i === 0
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pb-2.5 text-xs text-primary hover:underline"
          >
            ทำเครื่องหมายว่าอ่านทั้งหมด
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {notifications.map((n, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${toneClass[n.tone]}`}
              >
                <n.icon className="size-4" />
              </span>

              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{n.title}</p>

                  {n.unread ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  {n.body}
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  {n.time}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <Button variant="outline" className="mt-5 w-full">
          ดูการแจ้งเตือนทั้งหมด
        </Button>
      </main>
    </div>
  );
}