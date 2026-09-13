import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyEmailPage from "@/components/pages/verify_email_page";

export const metadata: Metadata = {
    title: "ยืนยันอีเมล",
};

export default function Page() {
    return (
        <Suspense>
            <VerifyEmailPage />
        </Suspense>
    );
}