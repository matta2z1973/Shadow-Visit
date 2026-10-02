import type { Metadata } from "next";
import { Source_Serif_4, Work_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/site-nav";

// Greenhill's brand website typefaces (Plantin for headlines, Halyard for
// body copy) are Adobe-licensed fonts we don't have a kit for — Source Serif
// 4 and Work Sans are the closest open equivalents in the same registers
// (transitional serif / humanist grotesque) per the Style Guide, Aug 2024.
const heading = Source_Serif_4({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Greenhill Shadow Visit",
  description: "Admissions shadow-visit matching & scheduling for Greenhill School",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Unmissable in the sandbox, absent in production. Two deployments
            of the same app that look identical is how someone ends up
            editing real student records believing they're testing. */}
        {process.env.NEXT_PUBLIC_APP_ENV === "sandbox" ? (
          <div className="bg-copper px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white">
            Sandbox — test data only. Nothing here affects the live Shadow Visit site.
          </div>
        ) : null}
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
