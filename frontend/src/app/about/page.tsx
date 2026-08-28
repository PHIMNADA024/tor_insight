import type { Metadata } from "next";
import AboutPage from "@/components/pages/about_page";

export const metadata: Metadata = {
    title: "เกี่ยวกับเรา & วิธีการทำงาน",
    description:
        "TOR Insight รวบรวม จัดระเบียบ และวิเคราะห์ TOR ด้านซอฟต์แวร์จากหน่วยงานกรุงเทพมหานครอย่างไร",
    openGraph: {
        title: "เกี่ยวกับเรา & วิธีการทำงาน — TOR Insight",
        description:
            "วิธีที่ TOR Insight รวบรวมและวิเคราะห์ TOR ซอฟต์แวร์ภาครัฐ",
    },
};

export default function Page() {
    return <AboutPage />;
}