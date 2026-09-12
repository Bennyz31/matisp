"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nouvelleIntervention, synchroniser } from "@/client/session";
import { ecrireIntervention, lireCatalogue, type Catalogue } from "@/client/stockage";
import { Barre, Chargement, useProfil } from "@/client/ui";

export default function Nouvelle() {
  const router = useRouter();
  const moi = useProfil();
  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [choisies, setChoisies] = useState<string[]>([]);
  const [crss, setCrss] = useState("");

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
        <p className="libelle">Dotation utilisée</p>
        <div className="puces">
          {catalogue.dotations.map((d) => (
            <button
              key={d.id}
              className={`puce ${choisies.includes(d.id) ? "active" : ""}`}
              onClick={() => basculer(d.id)}
            >
              {d.identifiant}
            </button>
          ))}
        </div>
        <p className="note">
          Plusieurs dotations possibles sur une même sortie — sac médecin et VLM par exemple.
        </p>

        <p className="libelle">CRSS — facultatif</p>
        <input
          id="crss"
          className="champ"
          placeholder="à renseigner plus tard si tu ne l'as pas"
          value={crss}
          onChange={(e) => setCrss(e.target.value)}
          autoComplete="off"
        />

        <button className="bouton" disabled={choisies.length === 0} onClick={commencer}>
          Commencer la saisie
        </button>
      </div>
    </div>
  );
}
