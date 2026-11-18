import type { Metadata } from "next";
import GoogleCallbackPage from "@/components/pages/google_callback_page";

export const metadata: Metadata = {
    title: "เข้าสู่ระบบด้วย Google",
    robots: { index: false, follow: false },
};

export default function Page() {
    return <GoogleCallbackPage />;
}
