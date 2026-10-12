import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@/styles/main.scss";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spico",
  description: "AI hospitality platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
