import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ClientLayout from './ClientLayout';

// UI / body copy — a neutral grotesque (deliberately not Inter).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

// Display / editorial headings — Fraunces is a variable serif with an optical
// size axis, which keeps large headings from looking like scaled-up body text.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

// Metadata, ranks and scores — tabular figures matter more than elegance here.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TheoCompass | Open Beta — Match Your Beliefs to 230+ Christian Denominations",
  description: "Discover your theological alignment. Take the quiz, match your beliefs against 230+ Christian denominations across 13 dimensions, and find exactly where you stand in the Christian landscape.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f1faee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* GA4 - Safe in Server Component */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-4S4RJ1Y66Z" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-4S4RJ1Y66Z');
            `,
          }}
        />
        <link rel="icon" href="/icon.png" type="image/png" sizes="any" />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="skip-link absolute left-4 top-4 z-50 bg-ink px-4 py-2 text-sm font-medium text-paper focus:static"
        >
          Skip to main content
        </a>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

