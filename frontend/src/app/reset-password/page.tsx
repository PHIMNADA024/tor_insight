import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordPage from "@/components/pages/reset_password_page";

export const metadata: Metadata = {
    title: "ตั้งรหัสผ่านใหม่",
};

export default function Page() {
    return (
        <Suspense>
            <ResetPasswordPage />
        </Suspense>
    );
}