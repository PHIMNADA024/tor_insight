import type { Metadata } from "next";
import NotificationsPage from "@/components/pages/notifications_page";

export const metadata: Metadata = {
    title: "การแจ้งเตือน",
    description:
        "แจ้งเตือน TOR ใหม่ที่ตรงกับเงื่อนไขที่บันทึกไว้ การอัปเดตสถานะ และผลการแก้ไขข้อมูลที่แจ้ง",
    openGraph: {
        title: "การแจ้งเตือน — TOR Insight",
        description:
            "แจ้งเตือน TOR ใหม่ที่ตรงเงื่อนไขและการอัปเดตสถานะ",
    },
};

export default function Page() {
    return <NotificationsPage />;
}