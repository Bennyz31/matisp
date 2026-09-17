"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, nouvelleIntervention, synchroniser } from "@/client/session";
import { ecrireIntervention, lireCatalogue, type Catalogue } from "@/client/stockage";
import { Barre, Chargement, useProfil } from "@/client/ui";

type InterventionDistante = {
  id: string;
  debutLe: string;
  finLe: string | null;
  crss: string | null;
  statut: "BROUILLON" | "TERMINEE" | "ENVOYEE" | "CLOTUREE";
  dotations: { dotationId: string }[];
};

export default function Nouvelle() {
  const router = useRouter();
  const moi = useProfil();
  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [choisies, setChoisies] = useState<string[]>([]);
  const [crss, setCrss] = useState("");
  const [rejoint, setRejoint] = useState<"repos" | "recherche" | "aucune">("repos");

  useEffect(() => {
    void lireCatalogue().then((c) => {
      setCatalogue(c);
      // La dotation habituelle est présélectionnée : dans le cas courant,
      // un seul appui suffit pour démarrer.
      const habituelle = moi?.dotations[0]?.id;
      if (habituelle) setChoisies([habituelle]);
    });
  }, [moi]);

  if (moi === undefined || !catalogue) return <Chargement />;
  if (!moi) return null;

  const basculer = (id: string) =>
    setChoisies((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  /**
   * Un collègue (ex. l'ISP quand on est le médecin sur une sortie VLM) a
   * peut-être déjà commencé la saisie sous ce même CRSS : on rejoint alors
   * son intervention au lieu d'en créer une seconde, pour que les deux
   * téléphones se voient l'un l'autre (voir rapatriement dans session.ts).
   */
  async function rejoindre() {
    const c = crss.trim();
    if (!c) return;
    setRejoint("recherche");
    try {
      const { intervention: i } = await api<{ intervention: InterventionDistante | null }>(
        `/interventions/rejoindre?crss=${encodeURIComponent(c)}`,
      );
      if (!i) {
        setRejoint("aucune");
        return;
      }
      await ecrireIntervention({
        id: i.id,
        debutLe: i.debutLe,
        finLe: i.finLe,
        crss: i.crss,
        statut: i.statut,
        dotationIds: i.dotations.map((d) => d.dotationId),
        archiveeLe: null,
        // Non synchronisée sur CE téléphone : le prochain envoi m'inscrit
        // comme contributeur de l'intervention, sans rien écraser.
        synchronisee: false,
      });
      void synchroniser();
      router.replace(`/saisie/${i.id}`);
    } catch {
      setRejoint("aucune");
    }
  }

  async function commencer() {
    const intervention = {
      ...nouvelleIntervention(choisies),
      crss: crss.trim() || null,
    };
    await ecrireIntervention(intervention);
    void synchroniser();
    router.replace(`/saisie/${intervention.id}`);
  }

  return (
    <div className="ecran">
      <Barre titre="Nouvelle intervention" retour="/" />
      <div className="corps">
        <p className="libelle">CRSS — facultatif</p>
        <input
          id="crss"
          className="champ"
          placeholder="à renseigner plus tard si tu ne l'as pas"
          value={crss}
          onChange={(e) => {
            setCrss(e.target.value);
            setRejoint("repos");
          }}
          autoComplete="off"
        />
        {crss.trim() && (
          <button className="bouton fantome" disabled={rejoint === "recherche"} onClick={rejoindre}>
            {rejoint === "recherche" ? "Recherche…" : "Rejoindre l'intervention de ce CRSS"}
          </button>
        )}
        {rejoint === "aucune" && (
          <p className="note">
            Aucune intervention en cours avec ce CRSS. Choisis une dotation ci-dessous pour en
            commencer une.
          </p>
        )}
        <p className="note">
          Un collègue a déjà commencé la saisie sur cette sortie (ex. l&apos;ISP sur un VLM) ? Rejoins
          son intervention au lieu d&apos;en commencer une seconde — les deux téléphones se
          complètent au lieu de se marcher dessus.
        </p>

        <p className="libelle">Dotation utilisée</p>
        <div className="puces">
          {catalogue.dotations.map((d) => (
            <button
              key={d.id}
              className={`puce ${choisies.includes(d.id) ? "active" : ""}`}
              onClick={() => basculer(d.id)}
            >
              {d.libelle}
            </button>
          ))}
        </div>
        <p className="note">
          Plusieurs dotations possibles sur une même sortie — sac médecin et VLM par exemple.
        </p>

        <button className="bouton" disabled={choisies.length === 0} onClick={commencer}>
          Commencer la saisie
        </button>
      </div>
    </div>
  );
}
