import type { Metadata, Viewport } from "next";
import "./globals.css";
import Demarrage from "@/client/Demarrage";

export const metadata: Metadata = {
  title: "MATISP",
  description: "Réassort du matériel et des médicaments — SDIS 82",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MATISP", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#31506f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Demarrage />
        {children}
      </body>
    </html>
  );
}
