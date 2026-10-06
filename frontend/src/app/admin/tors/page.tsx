import type { Metadata } from "next";
import AdminTorManagementPage from "@/components/pages/admin_tor_management_page";

export const metadata: Metadata = {
    title: "จัดการ TOR",
};

export default function Page() {
    return <AdminTorManagementPage />;
}