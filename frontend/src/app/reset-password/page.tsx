import type { Metadata } from "next";
import ResetPasswordPage from "@/components/pages/reset_password_page";

export const metadata: Metadata = {
    title: "ตั้งรหัสผ่านใหม่",
};

export default function Page() {
    return <ResetPasswordPage />;
}