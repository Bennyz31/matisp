"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { profil, type Profil } from "./session";

export function Barre({
  titre,
  retour,
  action,
}: {
  titre: string;
  retour?: string;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const enLigne = useEnLigne();
  return (
    <div className="barre">
      {retour && (
        <button className="retour" aria-label="Retour" onClick={() => router.push(retour)}>
          ‹
        </button>
      )}
      <span>{titre}</span>
      <span className="etat">
        {action ?? (enLigne ? "" : <span className="hors-ligne">hors ligne</span>)}
      </span>
    </div>
  );
}

/** L'état réseau est affiché en permanence : l'utilisateur doit savoir où il en est. */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(true);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);
  return enLigne;
}

/** Redirige vers la connexion si aucune session locale n'est ouverte. */
export function useProfil(): Profil | null | undefined {
  const router = useRouter();
  const [p, setP] = useState<Profil | null | undefined>(undefined);
  useEffect(() => {
    const courant = profil();
    setP(courant);
    if (!courant) router.replace("/connexion");
  }, [router]);
  return p;
}

const CLE_THEME = "matisp.theme";

export type Theme = "systeme" | "clair" | "sombre";

/** Thème d'affichage : « systeme » suit l'appareil, sinon forcé et mémorisé. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("systeme");

  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_THEME);
      if (brut === "dark") setTheme("sombre");
      else if (brut === "light") setTheme("clair");
    } catch {
      /* navigation privée : on reste sur systeme */
    }
  }, []);

  const definir = (t: Theme) => {
    setTheme(t);
    const attr = t === "sombre" ? "dark" : t === "clair" ? "light" : null;
    try {
      if (attr) localStorage.setItem(CLE_THEME, attr);
      else localStorage.removeItem(CLE_THEME);
    } catch {
      /* ignoré */
    }
    if (attr) document.documentElement.setAttribute("data-theme", attr);
    else document.documentElement.removeAttribute("data-theme");
  };

  return [theme, definir];
}

export function Chargement({ texte = "Un instant…" }: { texte?: string }) {
  return <div className="centre">{texte}</div>;
}

export function Compteur({
  valeur,
  onChange,
}: {
  valeur: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="compteur">
      <button aria-label="Retirer une unité" onClick={() => onChange(Math.max(0, valeur - 1))}>
        −
      </button>
      <b>{valeur}</b>
      <button aria-label="Ajouter une unité" onClick={() => onChange(valeur + 1)}>
        +
      </button>
    </div>
  );
}
