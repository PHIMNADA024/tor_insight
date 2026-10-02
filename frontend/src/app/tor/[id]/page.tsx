import type { Metadata } from "next";
import { TorPage } from "@/components/pages/tor_detail_page";

export const metadata: Metadata = {
    title: "รายละเอียด TOR — TOR Insight",
    description:
        "รายละเอียด TOR ฉบับเต็ม: งบประมาณ วันปิดรับข้อเสนอ วิธีจัดซื้อจัดจ้าง เอกสารแนบ และแหล่งที่มาต้นฉบับ",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <TorPage id={id} />;
}