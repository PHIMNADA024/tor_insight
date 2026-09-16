import type { Metadata } from "next";
import AdminFeedbackPage from "@/components/pages/admin_feedback_page";

export const metadata: Metadata = {
    title: "จัดการข้อเสนอแนะ",
};

export default function Page() {
    return <AdminFeedbackPage />;
}