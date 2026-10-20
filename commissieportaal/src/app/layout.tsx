import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import { brand, brandCssVars } from "@/config/brand";
import "./globals.css";

const body = Figtree({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: `Gewoon Sales Doen`,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Sales Doen", statusBarStyle: "black" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.kleuren.zwart,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={body.variable} style={brandCssVars() as React.CSSProperties}>
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link href="/" className="logo" aria-label={brand.naam}>
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt={brand.naam} />
              ) : (
                <>
                  Gewoon Doen <span>Marketing</span>
                </>
              )}
            </Link>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
