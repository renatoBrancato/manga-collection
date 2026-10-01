import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Manga Collection",
  description: "Registra e valuta la tua collezione di tankōbon e Shonen Jump",
  openGraph: {
    type: "website",
    siteName: "Manga Collection",
    locale: "it_IT",
    url: "/",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Manga Collection" }],
    title: "Manga Collection",
    description: "Registra e valuta la tua collezione di tankōbon e Shonen Jump",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.jpg"],
    title: "Manga Collection",
    description: "Registra e valuta la tua collezione di tankōbon e Shonen Jump",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
