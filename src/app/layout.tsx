import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { appConfig } from "@/config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: appConfig.seo.title,
  description: appConfig.seo.description,
  keywords: appConfig.seo.keywords,
  authors: [{ name: appConfig.seo.author }],
  creator: appConfig.seo.creator,
  publisher: appConfig.seo.publisher,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || appConfig.urls.app
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: appConfig.seo.title,
    description: appConfig.seo.description,
    siteName: appConfig.seo.siteName,
    images: [
      {
        url: appConfig.seo.ogImage,
        width: 1200,
        height: 675,
        alt: `${appConfig.name} - ${appConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appConfig.seo.title,
    description: appConfig.seo.description,
    images: [appConfig.seo.ogImage],
    creator: appConfig.seo.twitterHandle,
    site: appConfig.seo.twitterHandle,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
