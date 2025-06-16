import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Feedbax – Featurebase Clone Powered by Notion",
  description:
    "Submit feedback, feature requests, and bug reports for Feedbax, a Featurebase clone using Notion as the database.",
  keywords: [
    "feedback",
    "featurebase",
    "notion",
    "roadmap",
    "feature requests",
    "bug reports",
    "product management",
    "customer feedback",
    "open source",
  ],
  authors: [{ name: "Feedbax Team" }],
  creator: "Feedbax",
  publisher: "Feedbax",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://feedbax.pages.dev"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Feedbax – Featurebase Clone Powered by Notion",
    description:
      "Submit feedback, feature requests, and bug reports for Feedbax, a Featurebase clone using Notion as the database.",
    siteName: "Feedbax",
    images: [
      {
        url: "/feedbax-opengraph.jpg",
        width: 1200,
        height: 675,
        alt: "Feedbax - Modern feedback and roadmap system",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Feedbax – Featurebase Clone Powered by Notion",
    description:
      "Submit feedback, feature requests, and bug reports for Feedbax, a Featurebase clone using Notion as the database.",
    images: ["/feedbax-opengraph.jpg"],
    creator: "@feedbax",
    site: "@feedbax",
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
