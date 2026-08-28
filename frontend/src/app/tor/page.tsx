import type { Metadata } from "next";
import { TorPage } from "@/components/pages/tor_detail_page";

export const metadata: Metadata = {
    title: "ระบบบริหารจัดการข้อมูลด้วย AI — รายละเอียด TOR",
    description:
        "รายละเอียด TOR ฉบับเต็ม: งบประมาณ วันปิดรับข้อเสนอ วิธีจัดซื้อจัดจ้าง เอกสารแนบ และแหล่งที่มาต้นฉบับ",
};

export default function Page() {
    return <TorPage />;
}