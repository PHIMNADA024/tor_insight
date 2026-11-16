import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { connection } from "next/server";
import { NotificationProvider } from "@/contexts/notification-context";
import { NotificationToastContainer } from "@/components/NotificationToastContainer";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "TOR Insight — ระบบรวมข้อมูล TOR ซอฟต์แวร์ภาครัฐ กทม.",
    template: "%s — TOR Insight",
  },
  description:
    "แพลตฟอร์มค้นหาและวิเคราะห์ข้อกำหนดขอบเขตงาน (TOR) ด้านซอฟต์แวร์ของหน่วยงานกรุงเทพมหานคร",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render on each request: the CSP nonce in src/proxy.ts is per request, and a
  // page built ahead of time would have scripts without it.
  await connection();

  return (
    <html lang="th" className={`${notoSansThai.variable} h-full antialiased`}>
      <body className={`${notoSansThai.className} min-h-full bg-background text-foreground`}>
        <NotificationProvider>
            {children}
            <NotificationToastContainer />
        </NotificationProvider>
      </body>
    </html>
  );
}
