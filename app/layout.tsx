import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["200", "300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Character Studio",
  description: "Multi-character AI content platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sk">
      <body className={`${outfit.variable} font-sans bg-bg text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
