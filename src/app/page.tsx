"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rafraichirCatalogue, synchroniser } from "@/client/session";
import {
  listerConsommations,
  listerInterventions,
  lireCatalogue,
  type Catalogue,
  type InterventionLocale,
} from "@/client/stockage";
import { Barre, Chargement, useProfil } from "@/client/ui";

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

export default function Accueil() {
  const router = useRouter();
  const moi = useProfil();
  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [interventions, setInterventions] = useState<InterventionLocale[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});

  const charger = useCallback(async () => {
    const [cat, liste, consommations] = await Promise.all([
      lireCatalogue(),
      listerInterventions(),
      listerConsommations(),
    ]);
    setCatalogue(cat);
    setInterventions(
      liste
        .filter((i) => i.statut !== "CLOTUREE")
        .sort((a, b) => b.debutLe.localeCompare(a.debutLe))
        .slice(0, 8),
    );
    const c: Record<string, number> = {};
    for (const l of consommations) {
      if (l.quantite > 0) c[l.interventionId] = (c[l.interventionId] ?? 0) + 1;
    }
    setComptes(c);
  }, []);

  useEffect(() => {
    if (!moi) return;
    void charger();
    void rafraichirCatalogue().then((c) => c && setCatalogue(c));
    void synchroniser().then(charger);
  }, [moi, charger]);

  if (moi === undefined) return <Chargement />;
  if (!moi) return null;

  const maDotation = moi.dotations[0];
  const nomDotation = (id: string) => catalogue?.dotations.find((d) => d.id === id)?.libelle ?? "dotation";

  return (
    <div className="ecran">
      <Barre titre={`Bonjour ${moi.prenom || moi.nom}`} />
      <div className="corps">
        {moi.motDePasseParDefaut && (
          <button
            className="avertissement"
            style={{ textAlign: "left", width: "100%" }}
            onClick={() => router.push("/profil")}
          >
            Ton mot de passe est encore ton matricule. Appuie pour en choisir un autre.
          </button>
        )}

        {!catalogue && (
          <div className="avertissement">
            Le catalogue n&apos;est pas encore chargé sur ce téléphone. Connecte-toi une fois avec du
            réseau.
          </div>
        )}

        <button
          className="bouton gros"
          disabled={!catalogue}
          onClick={() => router.push("/nouvelle")}
        >
          + Nouvelle intervention
        </button>

        {maDotation && (
          <>
            <p className="libelle">Ma dotation</p>
            <div className="ligne">
              <span className="nom">
                {nomDotation(maDotation.id)}
                <small>{maDotation.type.replace("_", " ").toLowerCase()}</small>
              </span>
            </div>
          </>
        )}

        {interventions.length > 0 && (
          <>
            <p className="libelle">En cours et à envoyer</p>
            {interventions.map((i) => (
              <button
                key={i.id}
                className="ligne"
                onClick={() =>
                  router.push(i.statut === "BROUILLON" ? `/saisie/${i.id}` : `/recap/${i.id}`)
                }
              >
                <span className="nom">
                  {dateCourte(i.debutLe)}
                  <small>
                    {i.crss ? `CRSS ${i.crss}` : "CRSS non renseigné"} ·{" "}
                    {i.dotationIds.map(nomDotation).join(" + ")} · {comptes[i.id] ?? 0} réf.
                    {i.synchronisee ? "" : " · non synchronisé"}
                  </small>
                </span>
                <span className={`etiquette ${i.statut === "BROUILLON" ? "et-brouillon" : "et-envoyer"}`}>
                  {i.statut === "BROUILLON" ? "brouillon" : "à envoyer"}
                </span>
              </button>
            ))}
          </>
        )}

        <div style={{ marginTop: "auto", display: "grid", gap: 10, paddingTop: 20 }}>
          <button className="bouton fantome" onClick={() => router.push("/historique")}>
            Historique
          </button>
          <button className="bouton fantome" onClick={() => router.push("/profil")}>
            Mon compte
          </button>
        </div>
      </div>
    </div>
  );
}
