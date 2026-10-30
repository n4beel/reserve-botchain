import type { Metadata, Viewport } from "next";
import { Red_Hat_Display, Atkinson_Hyperlegible, Azeret_Mono } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import { app } from "@/lib/app-config";
import "./globals.css";

const redHatDisplay = Red_Hat_Display({
  variable: "--font-redhat",
  subsets: ["latin"],
  display: "swap",
});

const atkinsonHyperlegible = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: { title: app.name, description: app.tagline, type: "website", url: app.url },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E8F1FF",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${redHatDisplay.variable} ${atkinsonHyperlegible.variable} ${azeretMono.variable} h-full`}
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased">
        <EvmProvider>
          <ToastProvider>
            <WrongNetworkBar />
            {children}
          </ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
