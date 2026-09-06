import type { Metadata } from "next";
import ForgotPasswordPage from "@/components/pages/forgot_password_page";

export const metadata: Metadata = {
    title: "ลืมรหัสผ่าน",
};

export default function Page() {
    return <ForgotPasswordPage />;
}