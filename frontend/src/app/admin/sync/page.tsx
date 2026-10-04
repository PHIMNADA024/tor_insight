import type { Metadata } from "next";
import AdminSyncPage from "@/components/pages/admin_sync_page";

export const metadata: Metadata = {
    title: "การเก็บรวบรวมข้อมูล",
};

export default function Page() {
    return <AdminSyncPage />;
}