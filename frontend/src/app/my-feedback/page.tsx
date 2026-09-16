import type { Metadata } from "next";
import MyFeedbackPage from "../../components/pages/my_feedback_page";

export const metadata: Metadata = {
    title: "ข้อเสนอแนะของฉัน",
};

export default function Page() {
    return <MyFeedbackPage />;
}