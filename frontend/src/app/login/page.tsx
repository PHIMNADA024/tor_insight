import type { Metadata } from "next";
import LoginPage from "@/components/pages/login_page";

const metadata: Metadata = {
    title: "เข้าสู่ระบบ",
    description:
        "เข้าสู่ระบบ TOR Insight เพื่อบันทึกการค้นหาและติดตาม TOR ของหน่วยงานกรุงเทพมหานคร",
    openGraph: {
        title: "เข้าสู่ระบบ — TOR Insight",
        description:
            "เข้าสู่ระบบเพื่อบันทึกการค้นหาและติดตาม TOR ภาครัฐ",
    },
};

export default function Page() {
    return <LoginPage />;
}