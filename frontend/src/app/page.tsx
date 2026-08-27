import type { Metadata } from "next";
import { HomePage } from "@/components/pages/home_page";

export const metadata: Metadata = {
  title: "TOR Insight — รวม TOR ซอฟต์แวร์ของหน่วยงาน กทม.",
  description:
    "ค้นหา วิเคราะห์ และติดตามข้อกำหนดขอบเขตงาน (TOR) ด้านซอฟต์แวร์จากหน่วยงานกรุงเทพมหานคร ในแพลตฟอร์มเดียว",
};

export default function Page() {
  return <HomePage />;
}
