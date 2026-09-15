import type { Metadata, Viewport } from "next";
import "./globals.css";
import Demarrage from "@/client/Demarrage";

export const metadata: Metadata = {
  title: "MATISP",
  description: "Réassort du matériel et des médicaments — SDIS 82",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MATISP", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#31506f" },
    { media: "(prefers-color-scheme: dark)", color: "#12151a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Applique le thème choisi avant le premier rendu, pour éviter un
            flash clair→sombre au chargement. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('matisp.theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
      </head>
      <body>
        <Demarrage />
        {children}
      </body>
    </html>
  );
}
