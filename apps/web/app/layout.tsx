import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import { Providers } from "./providers";
import { SiteFrame } from "./site-frame";
import "./globals.css";

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const editorialFont = Noto_Serif_KR({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "오늘도 함께 걷다",
  description: "세상을 여행하고 삶을 기록합니다.",
  robots:
    process.env.VERCEL_ENV === "preview"
      ? { index: false, follow: false }
      : undefined,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "오늘도 함께 걷다",
    title: "오늘도 함께 걷다",
    description: "세상을 여행하고 삶을 기록합니다.",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${bodyFont.variable} ${editorialFont.variable}`}
    >
      <body suppressHydrationWarning>
        <Providers>
          <SiteFrame>{children}</SiteFrame>
        </Providers>
      </body>
    </html>
  );
}
