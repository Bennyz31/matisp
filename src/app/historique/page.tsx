"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, archiverIntervention, synchroniser } from "@/client/session";
import {
  ecrireIntervention,
  listerConsommations,
  listerInterventions,
  lireCatalogue,
  lireIntervention,
} from "@/client/stockage";
import { Barre, Chargement, useProfil } from "@/client/ui";

type Ligne = {
  id: string;
  debutLe: string;
  crss: string | null;
  statut: string;
  dotations: string[];
  declarants: string[];
  nbReferences: number;
  nbUnites: number;
};

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

const ETIQUETTES: Record<string, { texte: string; classe: string }> = {
  BROUILLON: { texte: "brouillon", classe: "et-brouillon" },
  TERMINEE: { texte: "à envoyer", classe: "et-envoyer" },
  ENVOYEE: { texte: "envoyée", classe: "et-fait" },
  CLOTUREE: { texte: "clôturée", classe: "et-fait" },
};

export default function Historique() {
  const router = useRouter();
  const moi = useProfil();
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [source, setSource] = useState<"serveur" | "local">("serveur");
  const [occupe, setOccupe] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await api<{ interventions: Ligne[] }>("/interventions");
      setSource("serveur");
      setLignes(r.interventions);
    } catch {
      // Hors connexion : on retombe sur ce que contient le téléphone.
      setSource("local");
      const [locales, consommations, catalogue] = await Promise.all([
        listerInterventions(),
        listerConsommations(),
        lireCatalogue(),
      ]);
      setLignes(
        locales
          // Une intervention archivée localement ne doit pas non plus polluer
          // la vue hors connexion.
          .filter((i) => !i.archiveeLe)
          .sort((a, b) => b.debutLe.localeCompare(a.debutLe))
          .map((i) => {
            const siennes = consommations.filter((c) => c.interventionId === i.id && c.quantite > 0);
            return {
              id: i.id,
              debutLe: i.debutLe,
              crss: i.crss,
              statut: i.statut,
              dotations: i.dotationIds.map(
                (d) => catalogue?.dotations.find((x) => x.id === d)?.libelle ?? "dotation",
              ),
              declarants: [],
              nbReferences: siennes.length,
              nbUnites: siennes.reduce((s, c) => s + c.quantite, 0),
            };
          }),
      );
    }
  }, []);

  useEffect(() => {
    if (!moi) return;
    void charger();
  }, [moi, charger]);

  async function archiver(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOccupe(id);
    try {
      if (source === "serveur") {
        await api(`/interventions/${id}/archiver`, { method: "POST" });
      } else {
        // Hors connexion : écrit localement, repartira au prochain réseau.
        const locale = await lireIntervention(id);
        if (locale) {
          await ecrireIntervention(archiverIntervention(locale));
          void synchroniser();
        }
      }
      setLignes((l) => l?.filter((x) => x.id !== id) ?? l);
    } finally {
      setOccupe(null);
    }
  }

  async function supprimer(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Supprimer définitivement cette intervention ? Cette action est irréversible.")) {
      return;
    }
    setOccupe(id);
    try {
      await api(`/interventions/${id}`, { method: "DELETE" });
      setLignes((l) => l?.filter((x) => x.id !== id) ?? l);
    } finally {
      setOccupe(null);
    }
  }

  if (moi === undefined || lignes === null) return <Chargement />;
  if (!moi) return null;

  return (
    <div className="ecran">
      <Barre titre="Historique" retour="/" />
      <div className="corps">
        {source === "local" && (
          <p className="note">Hors connexion : seules les interventions de ce téléphone sont listées.</p>
        )}
        {lignes.length === 0 && <p className="note">Aucune intervention pour le moment.</p>}
        {lignes.map((i) => {
          const e = ETIQUETTES[i.statut] ?? ETIQUETTES.BROUILLON!;
          return (
            <div
              key={i.id}
              className="ligne"
              style={{ cursor: "pointer" }}
              onClick={() => router.push(i.statut === "BROUILLON" ? `/saisie/${i.id}` : `/envoi/${i.id}`)}
            >
              <span className="nom">
                {dateCourte(i.debutLe)}
                <small>
                  {i.crss ? `CRSS ${i.crss}` : "sans CRSS"} · {i.dotations.join(" + ")} ·{" "}
                  {i.nbReferences} réf. · {i.nbUnites} u.
                  {i.declarants.length > 1 ? ` · ${i.declarants.length} déclarants` : ""}
                </small>
              </span>
              <span className={`etiquette ${e.classe}`}>{e.texte}</span>
              {i.statut === "CLOTUREE" && (
                <button className="action" disabled={occupe === i.id} onClick={(ev) => void archiver(i.id, ev)}>
                  Archiver
                </button>
              )}
              {moi.admin && (
                <button
                  className="action"
                  disabled={occupe === i.id || source === "local"}
                  onClick={(ev) => void supprimer(i.id, ev)}
                >
                  Supprimer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
