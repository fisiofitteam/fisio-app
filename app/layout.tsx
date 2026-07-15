import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FisioFit App",
  description: "Readaptación para atletas de CrossFit",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon-192.svg" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FisioFit",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // "cover" hace que el viewport se extienda por debajo del notch/status bar
  // en iOS. Sin esto, un modal fixed inset-0 queda dentro del safe area y se
  // ve una franja del contenido por detrás en la parte superior — es el bug
  // reportado con el timer.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-neutral-50 text-neutral-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
