import type { Metadata } from "next";
import AdminUsersPage from "@/components/pages/admin_users_page";

export const metadata: Metadata = {
    title: "จัดการผู้ใช้งาน",
};

export default function Page() {
    return <AdminUsersPage />;
}