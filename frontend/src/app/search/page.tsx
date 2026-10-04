import type { Metadata } from "next";
import SearchPage from "@/components/pages/search_page";

export const metadata: Metadata = {
    title: "ค้นหา TOR",
    description:
        "กรอง TOR ด้านซอฟต์แวร์ของหน่วยงาน กทม. ตามคำสำคัญ หน่วยงาน หมวดหมู่ ปีงบประมาณ และงบประมาณ",
    openGraph: {
        title: "ค้นหา TOR — TOR Insight",
        description: "กรอง TOR ภาครัฐตามหน่วยงาน หมวดหมู่ และงบประมาณ",
    },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
    const { q, category } = await searchParams;
    return <SearchPage initialKeyword={q ?? ""} initialCategory={category ?? ""} />;
}