import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Slotwise", template: "%s · Slotwise" },
  description:
    "Share one link, set your hours once, and let clients book you without the back-and-forth.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
        <SiteFooter />
        <Analytics
          apiKey={process.env.NEXT_PUBLIC_POSTHOG_KEY ?? null}
          host={process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"}
        />
      </body>
    </html>
  );
}
