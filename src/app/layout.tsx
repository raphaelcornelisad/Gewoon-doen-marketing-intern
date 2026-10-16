import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import { brand, brandCssVars } from "@/config/brand";
import "./globals.css";

const body = Figtree({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: `${brand.appNaam} · ${brand.naam}`,
  robots: { index: false, follow: false },
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
            <Link href="/indienen" className="logo" aria-label={brand.naam}>
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt={brand.naam} />
              ) : (
                <>
                  Gewoon Doen <span>Marketing</span>
                </>
              )}
            </Link>
            <span className="site-header__app">{brand.appNaam}</span>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
