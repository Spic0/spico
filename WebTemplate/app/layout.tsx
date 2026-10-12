import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@/styles/main.scss";
import { Toaster } from "@/components/layout/Toaster";
import { FlashToasts } from "@/components/layout/FlashToasts";

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
      <body>
        {children}
        <Toaster />
        <FlashToasts />
      </body>
    </html>
  );
}
