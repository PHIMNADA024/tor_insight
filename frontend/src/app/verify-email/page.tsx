import type { Metadata } from "next";
import VerifyEmailPage from "@/components/pages/verify_email_page";

export const metadata: Metadata = {
    title: "ยืนยันอีเมล",
};

export default function Page() {
    return <VerifyEmailPage />;
}