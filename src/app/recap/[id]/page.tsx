"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { synchroniser } from "@/client/session";
import {
  ecrireIntervention,
  lignesDe,
  lireCatalogue,
  lireIntervention,
  type Catalogue,
  type ConsommationLocale,
  type InterventionLocale,
  type Produit,
} from "@/client/stockage";
import { Barre, Chargement, useProfil } from "@/client/ui";

export default function Recapitulatif() {
  const router = useRouter();
  const moi = useProfil();
  const { id } = useParams<{ id: string }>();

  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [intervention, setIntervention] = useState<InterventionLocale | undefined>();
  const [lignes, setLignes] = useState<ConsommationLocale[]>([]);
  const [crss, setCrss] = useState("");

  const charger = useCallback(async () => {
    const [cat, inter, carte] = await Promise.all([
      lireCatalogue(),
      lireIntervention(id),
      lignesDe(id),
    ]);
    setCatalogue(cat);
    setIntervention(inter);
    setCrss(inter?.crss ?? "");
    setLignes([...carte.values()].filter((l) => l.quantite > 0));
  }, [id]);

  useEffect(() => {
    // On rapatrie d'abord ce que d'autres déclarants ont ajouté à cette même
    // intervention (ex. ISP + médecin sur un VLM), pour que le récapitulatif
    // n'en oublie aucun avant l'envoi.
    void synchroniser().then(charger);
  }, [charger]);

  const blocs = useMemo(() => {
    if (!catalogue) return [];
    const parProduit = new Map(catalogue.produits.map((p) => [p.id, p]));
    const parDotation = new Map<string, ConsommationLocale[]>();
    for (const l of lignes) {
      parDotation.set(l.dotationId, [...(parDotation.get(l.dotationId) ?? []), l]);
    }
    return [...parDotation.entries()].map(([dotationId, liste]) => {
      // Un même produit peut avoir une ligne par déclarant (même dotation
      // partagée) : on additionne pour n'afficher qu'un seul total.
      const groupes = new Map<string, ConsommationLocale & { produit: Produit | undefined }>();
      for (const l of liste) {
        const cle = `${l.produitId}|${l.type}`;
        const existant = groupes.get(cle);
        if (existant) existant.quantite += l.quantite;
        else groupes.set(cle, { ...l, produit: parProduit.get(l.produitId) });
      }
      return {
        dotationId,
        nom: catalogue.dotations.find((d) => d.id === dotationId)?.libelle ?? "Dotation",
        lignes: [...groupes.values()]
          .filter((l) => l.produit)
          .sort((a, b) => a.produit!.designation.localeCompare(b.produit!.designation, "fr")),
      };
    });
  }, [catalogue, lignes]);

  if (moi === undefined || !catalogue) return <Chargement />;
  if (!moi) return null;
  if (!intervention) {
    return (
      <div className="ecran">
        <Barre titre="Récapitulatif" retour="/" />
        <div className="centre">Cette intervention n&apos;est pas sur ce téléphone.</div>
      </div>
    );
  }

  async function valider() {
    if (!intervention) return;
    await ecrireIntervention({
      ...intervention,
      crss: crss.trim() || null,
      statut: "TERMINEE",
      finLe: new Date().toISOString(),
      synchronisee: false,
    });
    void synchroniser();
    router.replace(`/envoi/${id}`);
  }

  const total = lignes.reduce((s, l) => s + l.quantite, 0);

  return (
    <div className="ecran">
      <Barre titre="Récapitulatif" retour={`/saisie/${id}`} />
      <div className="corps">
        {lignes.length === 0 && (
          <div className="avertissement">
            Rien n&apos;a été saisi. Reviens à la saisie ou quitte sans valider.
          </div>
        )}

        {blocs.map((bloc) => (
          <div key={bloc.dotationId}>
            <p className="titre-bloc">{bloc.nom}</p>
            {bloc.lignes.map((l) => (
              <div key={l.id} className="recap">
                <span>
                  {l.produit!.designation}
                  {l.type !== "CONSOMME" && (
                    <span className="etiquette et-envoyer" style={{ marginLeft: 6 }}>
                      {l.type === "PERDU" ? "perdu" : "cassé"}
                    </span>
                  )}
                </span>
                <b>
                  {l.quantite} {l.produit!.unite}
                </b>
              </div>
            ))}
          </div>
        ))}

        <p className="libelle">CRSS</p>
        <input
          id="crss"
          className="champ"
          placeholder="non renseigné"
          value={crss}
          onChange={(e) => setCrss(e.target.value)}
          autoComplete="off"
        />

        <button className="bouton ardoise" disabled={lignes.length === 0} onClick={valider}>
          Valider — {lignes.length} réf. · {total} u.
        </button>
        <button className="bouton fantome" onClick={() => router.push(`/saisie/${id}`)}>
          Reprendre la saisie
        </button>
        <p className="note">
          Rien ne part maintenant. L&apos;envoi se fait au retour, après vérification.
        </p>
      </div>
    </div>
  );
}
