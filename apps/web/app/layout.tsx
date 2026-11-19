import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `${APP_NAME}: AI support chat for any website.`,
  applicationName: APP_NAME,
  openGraph: { title: APP_NAME, description: `${APP_NAME}: AI support chat for any website.`, siteName: APP_NAME },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* No ClerkProvider here: /embed runs in third-party iframes, where Clerk's JS throws
          (blocked localStorage). The dashboard, sign-in and sign-up layouts each add it. */}
      <body className="antialiased">{children}</body>
    </html>
  );
}
