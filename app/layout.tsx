import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Realm of Dits",
  description: "Every Dit, ready to copy.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
