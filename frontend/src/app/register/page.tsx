import type { Metadata } from "next";
import RegisterPage from "@/components/pages/register_page";

const metadata: Metadata = {
    title: "สมัครสมาชิก",
    description:
        "สมัครสมาชิก TOR Insight เพื่อบันทึกการค้นหาและติดตาม TOR ของหน่วยงานกรุงเทพมหานคร",
    openGraph: {
        title: "สมัครสมาชิก — TOR Insight",
        description:
            "สมัครสมาชิกเพื่อบันทึกการค้นหาและติดตาม TOR ภาครัฐ",
    },
};

export default function Page() {
    return <RegisterPage />;
}