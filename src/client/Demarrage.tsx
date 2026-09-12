"use client";

import { useEffect } from "react";
import { synchroniser } from "./session";

/**
 * Enregistre le service worker (l'appli s'ouvre alors sans réseau) et pousse
 * ce qui attend, à l'ouverture et à chaque retour de connexion.
 */
export default function Demarrage() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void synchroniser();

    const auRetour = () => void synchroniser();
    window.addEventListener("online", auRetour);
    const minuterie = setInterval(auRetour, 120_000);
    return () => {
      window.removeEventListener("online", auRetour);
      clearInterval(minuterie);
    };
  }, []);

  return null;
}
