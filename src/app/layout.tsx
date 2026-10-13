import type { Metadata } from "next";
import AdminChrome from "./AdminChrome";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://abhishek-mess.local"),
  applicationName: "Abhishek Mess",
  title: {
    default: "Abhishek Mess | Smart Mess Management",
    template: "%s | Abhishek Mess",
  },
  description:
    "Smart mess management for subscriptions, meals, attendance, payments, and student administration.",
  icons: {
    icon: "/abhishek-mess-icon.svg",
    shortcut: "/abhishek-mess-icon.svg",
    apple: "/abhishek-mess-icon.svg",
  },
  openGraph: {
    title: "Abhishek Mess",
    description: "Smart Mess Management",
    siteName: "Abhishek Mess",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Abhishek Mess",
    description: "Smart Mess Management",
  },
};

export const viewport = {
  themeColor: "#0d4b3d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><AdminChrome>{children}</AdminChrome></body>
    </html>
  );
}
