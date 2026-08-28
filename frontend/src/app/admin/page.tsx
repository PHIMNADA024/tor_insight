import type { Metadata } from "next";
import AdminPage from "@/components/pages/admin_page";

const metadata: Metadata = {
    title: "ภาพรวมผู้ดูแลระบบ",
    description:
        "ระบบหลังบ้านสำหรับดูสถานะ TOR งานเก็บรวบรวมข้อมูล และข้อเสนอแนะจากผู้ใช้",
    openGraph: {
        title: "ภาพรวมผู้ดูแลระบบ — TOR Insight",
        description: "สถานะ TOR งานเก็บข้อมูล และข้อเสนอแนะในที่เดียว",
    },
};

export default function Page() {
    return <AdminPage />;
}