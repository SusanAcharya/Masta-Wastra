import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Tenor_Sans } from "next/font/google";
import { ConnectivityBanner } from "@/components/pwa/connectivity";
import { InstallSheet } from "@/components/pwa/install-sheet";
import { ServiceWorker } from "@/components/pwa/sw-register";
import { TagRunner } from "@/components/tag-runner";
import { ThemeWatcher } from "@/components/theme-watcher";
import { copy } from "@/lib/copy";
import { THEME_COLOR, themeScript } from "@/lib/theme";
import "@/styles/globals.css";

// Self-hosted by next/font, so both faces work offline.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});

const tenor = Tenor_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-tenor",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: copy.app.name, template: `%s · ${copy.app.name}` },
  description: copy.app.description,
  applicationName: copy.app.name,
  appleWebApp: { capable: true, title: copy.app.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodoni.variable} ${tenor.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ThemeWatcher />
        <TagRunner />
        <ServiceWorker />
        <ConnectivityBanner />
        <InstallSheet />
      </body>
    </html>
  );
}
