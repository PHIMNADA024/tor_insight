import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full antialiased`}>
      <body className={`${notoSansThai.className} min-h-full bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}
