import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "GoDigital Finance OS",
  description: "Сметководител — интерен финансиски систем на АЛМА ДИЗАЈН ДООЕЛ Скопје",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mk" className={manrope.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
