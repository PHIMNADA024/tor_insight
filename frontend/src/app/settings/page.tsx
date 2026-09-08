import type { Metadata } from "next";
import AccountSettingsPage from "@/components/pages/account_settings_page";

export const metadata: Metadata = {
    title: "ตั้งค่าบัญชี",
};

export default function Page() {
    return <AccountSettingsPage />;
}