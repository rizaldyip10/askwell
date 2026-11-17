import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { DASHBOARD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "../lib/auth/routes";
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
      <body className="antialiased">
        <ClerkProvider
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={DASHBOARD_PATH}
          signUpFallbackRedirectUrl={DASHBOARD_PATH}
          afterSignOutUrl={SIGN_IN_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
