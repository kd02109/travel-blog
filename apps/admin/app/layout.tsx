import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import { Providers } from "./providers";
import { AdminFrame } from "./admin-frame";
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
  title: "오늘도 함께 걷다 · 관리",
  description: "세상을 여행하고 삶을 기록합니다.",
  robots: { index: false, follow: false },
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
          <AdminFrame>{children}</AdminFrame>
        </Providers>
      </body>
    </html>
  );
}
