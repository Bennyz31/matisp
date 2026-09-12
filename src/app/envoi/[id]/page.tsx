"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, synchroniser } from "@/client/session";
import {
  ecrireIntervention,
  lignesDe,
  lireCatalogue,
  lireIntervention,
  type Catalogue,
  type ConsommationLocale,
  type InterventionLocale,
} from "@/client/stockage";
import { construirePdf, nomFichierPdf, pdfEnBase64, type DonneesPdf } from "@/client/pdf";
import { Barre, Chargement, useEnLigne, useProfil } from "@/client/ui";

export default function Envoi() {
  const router = useRouter();
  const moi = useProfil();
  const enLigne = useEnLigne();
  const { id } = useParams<{ id: string }>();

  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [intervention, setIntervention] = useState<InterventionLocale | undefined>();
  const [lignes, setLignes] = useState<ConsommationLocale[]>([]);
  const [coches, setCoches] = useState<string[]>([]);
  const [etat, setEtat] = useState<{ type: "erreur" | "succes" | "info"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const [cat, inter, carte] = await Promise.all([
      lireCatalogue(),
      lireIntervention(id),
      lignesDe(id),
    ]);
    setCatalogue(cat);
    setIntervention(inter);
    setLignes([...carte.values()].filter((l) => l.quantite > 0));
    setCoches((cat?.destinataires ?? []).filter((d) => d.cocheParDefaut).map((d) => d.id));
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const donneesPdf: DonneesPdf | null = useMemo(() => {
    if (!catalogue || !intervention || !moi) return null;
    const parProduit = new Map(catalogue.produits.map((p) => [p.id, p]));
    const parDotation = new Map<string, ConsommationLocale[]>();
    for (const l of lignes) {
      parDotation.set(l.dotationId, [...(parDotation.get(l.dotationId) ?? []), l]);
    }
    return {
      crss: intervention.crss,
      debutLe: intervention.debutLe,
      declarants: [`${moi.prenom} ${moi.nom} (${moi.fonction})`],
      blocs: [...parDotation.entries()].map(([dotationId, liste]) => ({
        dotation: catalogue.dotations.find((d) => d.id === dotationId)?.identifiant ?? "Dotation",
        declarants: [`${moi.prenom} ${moi.nom}`],
        lignes: liste
          .map((l) => ({ l, p: parProduit.get(l.produitId) }))
          .filter((x) => x.p)
          .sort((a, b) => a.p!.designation.localeCompare(b.p!.designation, "fr"))
          .map(({ l, p }) => ({
            code: p!.code,
            designation: p!.designation,
            quantite: l.quantite,
            unite: p!.unite,
            mention: l.type === "PERDU" ? "perdu" : l.type === "CASSE" ? "cassé" : undefined,
          })),
      })),
    };
  }, [catalogue, intervention, lignes, moi]);

  if (moi === undefined || !catalogue) return <Chargement />;
  if (!moi || !intervention || !donneesPdf) return null;

  const nomFichier = nomFichierPdf(intervention.crss, intervention.debutLe);

  function telecharger() {
    construirePdf(donneesPdf!).save(nomFichier);
  }

  async function envoyer() {
    setOccupe(true);
    setEtat(null);
    try {
      // On pousse d'abord la saisie : le serveur doit connaître l'intervention
      // avant de pouvoir enregistrer l'envoi.
      await synchroniser();
      const doc = construirePdf(donneesPdf!);
      const reponse = await api<{ messagerieConfiguree: boolean; destinataires?: { libelle: string; email: string }[] }>(
        "/envoi",
        {
          method: "POST",
          body: JSON.stringify({
            interventionId: id,
            destinataireIds: coches,
            pdfBase64: pdfEnBase64(doc),
            nomFichier,
          }),
        },
      );

      if (!reponse.messagerieConfiguree) {
        doc.save(nomFichier);
        setEtat({
          type: "info",
          texte:
            "L'envoi automatique n'est pas encore branché. Le PDF vient d'être enregistré sur ton téléphone : transmets-le par ta messagerie.",
        });
      } else {
        setEtat({ type: "succes", texte: "Réassort envoyé." });
      }

      await ecrireIntervention({ ...intervention!, statut: "ENVOYEE", synchronisee: false });
      void synchroniser();
      await charger();
    } catch (e) {
      setEtat({
        type: "erreur",
        texte: e instanceof Error ? e.message : "L'envoi a échoué.",
      });
    } finally {
      setOccupe(false);
    }
  }

  async function cloturer() {
    // C'est le déclarant qui clôture, une fois le sac physiquement rempli.
    await ecrireIntervention({ ...intervention!, statut: "CLOTUREE", synchronisee: false });
    void synchroniser();
    router.replace("/");
  }

  const total = lignes.reduce((s, l) => s + l.quantite, 0);
  const dejaEnvoyee = intervention.statut === "ENVOYEE" || intervention.statut === "CLOTUREE";

  return (
    <div className="ecran">
      <Barre titre="Vérifier et envoyer" retour="/" />
      <div className="corps">
        {etat && (
          <div className={etat.type === "erreur" ? "erreur" : etat.type === "succes" ? "succes" : "avertissement"}>
            {etat.texte}
          </div>
        )}

        <div className="ligne">
          <span className="nom">
            {lignes.length} référence{lignes.length > 1 ? "s" : ""} · {total} unité
            {total > 1 ? "s" : ""}
            <small>{intervention.crss ? `CRSS ${intervention.crss}` : "CRSS non renseigné"}</small>
          </span>
        </div>

        <p className="libelle">Destinataires</p>
        {catalogue.destinataires.length === 0 ? (
          <p className="note">
            Aucun destinataire configuré. Le PDF reste téléchargeable ci-dessous.
          </p>
        ) : (
          catalogue.destinataires.map((d) => (
            <button
              key={d.id}
              className={`ligne ${coches.includes(d.id) ? "active" : ""}`}
              onClick={() =>
                setCoches((c) => (c.includes(d.id) ? c.filter((x) => x !== d.id) : [...c, d.id]))
              }
            >
              <span className="nom">
                {d.libelle}
                <small>{d.cocheParDefaut ? "coché par défaut" : d.email}</small>
              </span>
              <span className="etiquette et-fait">{coches.includes(d.id) ? "✓" : ""}</span>
            </button>
          ))
        )}

        <button className="bouton fantome" onClick={telecharger}>
          Aperçu — télécharger le PDF
        </button>

        <button
          className="bouton"
          disabled={occupe || coches.length === 0 || !enLigne}
          onClick={envoyer}
        >
          {occupe ? "Envoi…" : dejaEnvoyee ? "Renvoyer le réassort" : "Envoyer le réassort"}
        </button>
        {!enLigne && (
          <p className="note">
            Pas de réseau. Le PDF est déjà téléchargeable ; l&apos;envoi se fera au retour de la
            connexion.
          </p>
        )}

        {dejaEnvoyee && (
          <>
            <button className="bouton ardoise" onClick={cloturer}>
              Réassort fait — clôturer
            </button>
            <p className="note">
              À faire une fois le sac rempli. La pharmacie reçoit le document à titre informatif.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
