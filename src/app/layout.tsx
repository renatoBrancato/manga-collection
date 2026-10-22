import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";
import { getLocale, getDictionary } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale).layout;

  return {
    metadataBase: new URL(siteUrl()),
    title: t.title,
    description: t.description,
    openGraph: {
      type: "website",
      siteName: "Manga Collection",
      locale: locale === "it" ? "it_IT" : "en_US",
      url: "/",
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Manga Collection" }],
      title: t.title,
      description: t.description,
    },
    twitter: {
      card: "summary_large_image",
      images: ["/og.jpg"],
      title: t.title,
      description: t.description,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
