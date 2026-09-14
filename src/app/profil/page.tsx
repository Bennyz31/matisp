"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, fermerSession, mettreAJourProfil, rafraichirCatalogue, synchroniser } from "@/client/session";
import { Barre, Chargement, useProfil, useTheme, type Theme } from "@/client/ui";

export default function Profil() {
  const router = useRouter();
  const moi = useProfil();
  const [theme, definirTheme] = useTheme();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [email, setEmail] = useState(moi?.email ?? "");
  const [etatEmail, setEtatEmail] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupeEmail, setOccupeEmail] = useState(false);

  if (moi === undefined) return <Chargement />;
  if (!moi) return null;

  async function enregistrerEmail(e: React.FormEvent) {
    e.preventDefault();
    setOccupeEmail(true);
    setEtatEmail(null);
    try {
      const nouvelEmail = email.trim() || null;
      await api("/auth/email", {
        method: "POST",
        body: JSON.stringify({ email: nouvelEmail }),
      });
      mettreAJourProfil({ email: nouvelEmail });
      setEtatEmail({ ok: true, texte: "Adresse enregistrée." });
    } catch (e) {
      setEtatEmail({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setOccupeEmail(false);
    }
  }

  async function changer(e: React.FormEvent) {
    e.preventDefault();
    setOccupe(true);
    setEtat(null);
    try {
      await api("/auth/motdepasse", {
        method: "POST",
        body: JSON.stringify({ ancien: ancien.trim(), nouveau: nouveau.trim() }),
      });
      setEtat({ ok: true, texte: "Mot de passe changé." });
      setAncien("");
      setNouveau("");
    } catch (e) {
      setEtat({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="ecran">
      <Barre titre="Mon compte" retour="/" />
      <div className="corps">
        <div className="ligne">
          <span className="nom">
            {moi.prenom} {moi.nom}
            <small>
              {moi.fonction}
              {moi.dotations.length > 0
                ? ` · ${moi.dotations.map((d) => d.identifiant).join(", ")}`
                : ""}
            </small>
          </span>
        </div>

        <form onSubmit={changer} style={{ display: "grid", gap: 12 }}>
          <p className="libelle">Changer de mot de passe</p>
          {etat && <div className={etat.ok ? "succes" : "erreur"}>{etat.texte}</div>}
          <input
            id="ancien"
            className="champ"
            type="password"
            placeholder="Mot de passe actuel (ton matricule au départ)"
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
            autoComplete="current-password"
          />
          <input
            id="nouveau"
            className="champ"
            type="password"
            placeholder="Nouveau mot de passe (4 caractères minimum)"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            autoComplete="new-password"
          />
          <button className="bouton ardoise" disabled={occupe || !ancien || nouveau.length < 4}>
            Enregistrer
          </button>
        </form>

        <form onSubmit={enregistrerEmail} style={{ display: "grid", gap: 12 }}>
          <p className="libelle">Mon adresse mail (pour recevoir une copie des réassorts)</p>
          {etatEmail && <div className={etatEmail.ok ? "succes" : "erreur"}>{etatEmail.texte}</div>}
          <input
            id="email"
            className="champ"
            type="email"
            placeholder="prenom.nom@sdis82.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <button className="bouton fantome" disabled={occupeEmail}>
            Enregistrer l'adresse
          </button>
        </form>

        <p className="libelle">Affichage</p>
        <div className="puces">
          {(["systeme", "clair", "sombre"] as Theme[]).map((t) => (
            <button
              key={t}
              className={`puce ${theme === t ? "active" : ""}`}
              onClick={() => definirTheme(t)}
            >
              {t === "systeme" ? "Auto" : t === "clair" ? "Clair" : "Sombre"}
            </button>
          ))}
        </div>

        <p className="libelle">Données</p>
        <button
          className="bouton fantome"
          onClick={async () => {
            await synchroniser();
            await rafraichirCatalogue();
            setEtat({ ok: true, texte: "Synchronisé et catalogue à jour." });
          }}
        >
          Forcer la synchronisation
        </button>

        {moi.admin && (
          <button className="bouton fantome" onClick={() => router.push("/admin")}>
            Administration
          </button>
        )}

        <button
          className="bouton fantome"
          style={{ color: "var(--rouge)" }}
          onClick={async () => {
            if (!confirm("Se déconnecter ? Les saisies non synchronisées seront perdues.")) return;
            await fermerSession();
            router.replace("/connexion");
          }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
