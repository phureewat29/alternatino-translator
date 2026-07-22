import type { Metadata } from "next";
import { Instrument_Sans, Anuphan, Geist_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://translator.morroc.ai"),
  title: "Translator™",
  description:
    "Every message arrives with feelings attached. We expose them.",
  openGraph: {
    title: "Translator™",
    description:
      "Every message arrives with feelings attached. We expose them.",
    type: "website",
    images: [{ url: "/cover.jpg", width: 1728, height: 1226 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/cover.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${anuphan.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
