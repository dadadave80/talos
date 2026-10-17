import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The same .woff files feed the OG images (satori cannot read woff2), so the web and the share cards match.
const brygada = localFont({
  variable: "--font-brygada",
  src: [
    { path: "../assets/fonts/brygada-1918-latin-500-normal.woff", weight: "500" },
    { path: "../assets/fonts/brygada-1918-latin-600-normal.woff", weight: "600" },
  ],
});
const schibsted = localFont({
  variable: "--font-schibsted",
  src: [
    { path: "../assets/fonts/schibsted-grotesk-latin-400-normal.woff", weight: "400" },
    { path: "../assets/fonts/schibsted-grotesk-latin-500-normal.woff", weight: "500" },
    { path: "../assets/fonts/schibsted-grotesk-latin-600-normal.woff", weight: "600" },
  ],
});
const commit = localFont({
  variable: "--font-commit",
  src: [
    { path: "../assets/fonts/commit-mono-latin-400-normal.woff", weight: "400" },
    { path: "../assets/fonts/commit-mono-latin-500-normal.woff", weight: "500" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://talos-treasury.vercel.app"),
  title: "Talos",
  description:
    "Talos runs an open-source project's treasury on Arc. Try to rob it. The most you can take is a contract parameter.",
  openGraph: { siteName: "Talos", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${brygada.variable} ${schibsted.variable} ${commit.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
