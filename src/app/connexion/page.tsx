"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ouvrirSession, rafraichirCatalogue, type Profil } from "@/client/session";
import { Barre } from "@/client/ui";

type Compte = {
  id: string;
  nom: string;
  prenom: string;
  fonction: string;
  cis: { code: string; nom: string } | null;
};

export default function Connexion() {
  const router = useRouter();
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [filtre, setFiltre] = useState("");
  const [choisi, setChoisi] = useState<Compte | null>(null);
  const [matricule, setMatricule] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    api<{ utilisateurs: Compte[] }>("/auth/utilisateurs")
      .then((r) => setComptes(r.utilisateurs))
      .catch(() => setErreur("Impossible de joindre le serveur. Vérifie ta connexion."));
  }, []);

  const visibles = (comptes ?? [])
    .filter((c) =>
      `${c.nom} ${c.prenom}`.toLowerCase().includes(filtre.trim().toLowerCase()),
    )
    .slice(0, 40);

  async function connecter(e: React.FormEvent) {
    e.preventDefault();
    if (!choisi) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await api<{ jeton: string; utilisateur: Profil }>("/auth/connexion", {
        method: "POST",
        body: JSON.stringify({ utilisateurId: choisi.id, motDePasse: matricule.trim() }),
      });
      ouvrirSession(r.jeton, r.utilisateur);
      await rafraichirCatalogue();
      router.replace("/");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Connexion impossible.");
      setOccupe(false);
    }
  }

  if (comptes !== null && comptes.length === 0) {
    return (
      <div className="ecran">
        <Barre titre="MATISP" />
        <div className="corps">
          <div className="avertissement">
            Aucun compte n&apos;existe encore. Il faut d&apos;abord importer le catalogue et la liste
            des personnels.
          </div>
          <a className="bouton ardoise" href="/admin" style={{ textDecoration: "none" }}>
            Ouvrir la configuration
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="ecran">
      <Barre titre="MATISP" />
      <form className="corps" onSubmit={connecter}>
        {erreur && <div className="erreur">{erreur}</div>}

        <p className="libelle">Qui es-tu ?</p>
        {choisi ? (
          <button type="button" className="ligne active" onClick={() => setChoisi(null)}>
            <span className="nom">
              {choisi.nom} {choisi.prenom}
              <small>
                {choisi.fonction}
                {choisi.cis ? ` · ${choisi.cis.nom}` : ""} — appuie pour changer
              </small>
            </span>
          </button>
        ) : (
          <>
            <input
              id="filtre-nom"
              className="champ"
              placeholder="Tape les premières lettres de ton nom"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            {comptes === null ? (
              <p className="note">Chargement de la liste…</p>
            ) : (
              visibles.map((c) => (
                <button type="button" key={c.id} className="ligne" onClick={() => setChoisi(c)}>
                  <span className="nom">
                    {c.nom} {c.prenom}
                    <small>
                      {c.fonction}
                      {c.cis ? ` · ${c.cis.nom}` : ""}
                    </small>
                  </span>
                </button>
              ))
            )}
          </>
        )}

        {choisi && (
          <>
            <p className="libelle">Matricule</p>
            <input
              id="matricule"
              className="champ"
              type="password"
              inputMode="numeric"
              placeholder="Ton matricule SDIS"
              value={matricule}
              onChange={(e) => setMatricule(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <button className="bouton" disabled={occupe || matricule.trim().length === 0}>
              {occupe ? "Connexion…" : "Se connecter"}
            </button>
            <p className="note">
              Une seule fois. Ensuite l&apos;appli s&apos;ouvre directement, même sans réseau.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
