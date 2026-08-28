import type { Metadata } from "next";
import DashboardPage from "@/components/pages/dashboard_page";

const metadata: Metadata = {
  title: "แดชบอร์ดราคา",
  description:
    "วิเคราะห์งบประมาณ TOR ด้านซอฟต์แวร์ของหน่วยงาน กทม. แยกตามหน่วยงาน หมวดหมู่ และปีงบประมาณ",
  openGraph: {
    title: "แดชบอร์ดราคา — TOR Insight",
    description: "วิเคราะห์งบประมาณตามหน่วยงาน หมวดหมู่ และปีงบประมาณ",
  },
};

export default function Page() {
  return <DashboardPage />;
}