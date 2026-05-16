import Script from "next/script";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFloat } from "@/components/shared/whatsapp-float";
import { siteConfig } from "@/lib/constants/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: `${siteConfig.name} | ${siteConfig.tagline}`,
  description: "Global education marketplace and consultancy platform",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: "Global education marketplace and consultancy platform",
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.name} logo` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: "Global education marketplace and consultancy platform",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" strategy="afterInteractive" />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`window.OneSignalDeferred = window.OneSignalDeferred || []; OneSignalDeferred.push(async function(OneSignal) { await OneSignal.init({ appId: "${siteConfig.onesignal.appId}", safari_web_id: "${siteConfig.onesignal.safariWebId}", notifyButton: { enable: true, position: "bottom-left" } }); });`}
        </Script>
        <SiteHeader />
        <main className="min-h-[calc(100vh-200px)] pb-8">{children}</main>
        <SiteFooter />
        <WhatsAppFloat />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
