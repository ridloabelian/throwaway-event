import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "throwaway-event · Ephemeral Micro-Apps for Real-World Gatherings",
  description:
    "1 shareable link, zero attendee registration, privacy-first, and automatically wiped after your event.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF7F2] text-[#191715] selection:bg-[#C85A32]/20">
        {children}
      </body>
    </html>
  );
}
