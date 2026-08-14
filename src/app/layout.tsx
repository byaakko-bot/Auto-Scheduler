import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buildora — Construction Schedule Platform",
  description:
    "Automatically generate realistic, dependency-aware construction schedules with critical path, RACI, and live delay propagation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
