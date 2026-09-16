"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, synchroniser, type Profil } from "@/client/session";
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

/** Forme renvoyée par GET /api/interventions/:id/reassort (voir src/lib/reassort.ts). */
type ReassortServeur = {
  crss: string | null;
  debutLe: string;
  declarants: { nom: string; fonction: string }[];
  blocs: {
    dotation: string;
    declarants: string[];
    lignes: {
      code: string;
      designation: string;
      unite: string;
      quantite: number;
      type: "CONSOMME" | "PERDU" | "CASSE";
      commentaire: string | null;
      horsCatalogue: boolean;
    }[];
  }[];
};

const mentionDe = (type: "CONSOMME" | "PERDU" | "CASSE", horsCatalogue: boolean): string | undefined =>
  [type === "PERDU" ? "perdu" : type === "CASSE" ? "cassé" : null, horsCatalogue ? "hors catalogue" : null]
    .filter((x): x is string => Boolean(x))
    .join(", ") || undefined;

function convertirReassort(r: ReassortServeur): DonneesPdf {
  return {
    crss: r.crss,
    debutLe: r.debutLe,
    declarants:
      r.declarants.length > 0 ? r.declarants.map((d) => `${d.nom} (${d.fonction})`) : ["—"],
    blocs: r.blocs.map((b) => ({
      dotation: b.dotation,
      declarants: b.declarants.length > 0 ? b.declarants : ["—"],
      lignes: b.lignes.map((l) => ({
        code: l.code,
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        mention: mentionDe(l.type, l.horsCatalogue),
      })),
    })),
  };
}

/**
 * Regroupe les lignes d'un même produit (même type) au sein d'une dotation :
 * quand plusieurs déclarants sortent la même dotation partagée (ex. VLM, ISP
 * + médecin), chacun a sa propre ligne côté serveur — on les additionne ici
 * pour n'afficher qu'une seule quantité totale par produit, sans rien perdre.
 */
function grouperParProduit(liste: ConsommationLocale[]) {
  const groupes = new Map<string, { l: ConsommationLocale; total: number; auteurs: Set<string> }>();
  for (const l of liste) {
    const cle = l.produitId
      ? `${l.produitId}|${l.type}`
      : `libre:${(l.nomLibre ?? "").trim().toLowerCase()}|${l.type}`;
    const g = groupes.get(cle);
    if (g) {
      g.total += l.quantite;
      if (l.auteur) g.auteurs.add(l.auteur);
    } else {
      groupes.set(cle, { l, total: l.quantite, auteurs: new Set(l.auteur ? [l.auteur] : []) });
    }
  }
  return [...groupes.values()];
}

function construireDonnees(
  catalogue: Catalogue,
  intervention: InterventionLocale,
  lignes: ConsommationLocale[],
  moi: Profil,
): DonneesPdf {
  const parProduit = new Map(catalogue.produits.map((p) => [p.id, p]));
  const parDotation = new Map<string, ConsommationLocale[]>();
  for (const l of lignes) {
    parDotation.set(l.dotationId, [...(parDotation.get(l.dotationId) ?? []), l]);
  }
  const tousAuteurs = new Set(lignes.map((l) => l.auteur).filter((a): a is string => Boolean(a)));

  return {
    crss: intervention.crss,
    debutLe: intervention.debutLe,
    declarants: tousAuteurs.size > 0 ? [...tousAuteurs] : [`${moi.prenom} ${moi.nom} (${moi.fonction})`],
    blocs: [...parDotation.entries()].map(([dotationId, liste]) => {
      const groupes = grouperParProduit(liste)
        .map((g) => ({ ...g, p: g.l.produitId ? parProduit.get(g.l.produitId) : undefined }))
        .filter((x) => x.p || x.l.nomLibre)
        .sort((a, b) =>
          (a.p?.designation ?? a.l.nomLibre ?? "").localeCompare(b.p?.designation ?? b.l.nomLibre ?? "", "fr"),
        );
      const declarantsBloc = new Set<string>();
      for (const g of groupes) for (const a of g.auteurs) declarantsBloc.add(a);
      return {
        // Identifiant brut (pas « Mon sac ») : ce document est lu par un tiers
        // (pharmacie), pas seulement par son auteur.
        dotation: catalogue.dotations.find((d) => d.id === dotationId)?.identifiant ?? "Dotation",
        declarants: declarantsBloc.size > 0 ? [...declarantsBloc] : [`${moi.prenom} ${moi.nom}`],
        lignes: groupes.map(({ l, total, p }) => ({
          code: p?.code ?? "—",
          designation: p?.designation ?? l.nomLibre ?? "Produit inconnu",
          quantite: total,
          unite: p?.unite ?? "unité",
          mention: mentionDe(l.type, !p),
        })),
      };
    }),
  };
}

export default function Envoi() {
  const router = useRouter();
  const moi = useProfil();
  const enLigne = useEnLigne();
  const { id } = useParams<{ id: string }>();

  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [intervention, setIntervention] = useState<InterventionLocale | undefined>();
  const [lignes, setLignes] = useState<ConsommationLocale[]>([]);
  const [coches, setCoches] = useState<string[]>([]);
  const [emailsManuels, setEmailsManuels] = useState<string[]>([]);
  const [saisieEmail, setSaisieEmail] = useState("");
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
    return construireDonnees(catalogue, intervention, lignes, moi);
  }, [catalogue, intervention, lignes, moi]);

  if (moi === undefined || !catalogue) return <Chargement />;
  if (!moi || !intervention || !donneesPdf) return null;

  const nomFichier = nomFichierPdf(intervention.crss, intervention.debutLe);

  function telecharger() {
    construirePdf(donneesPdf!).save(nomFichier);
  }

  function ajouterEmail() {
    const e = saisieEmail.trim().toLowerCase();
    if (!e) return;
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setEtat({ type: "erreur", texte: "Adresse mail invalide." });
      return;
    }
    if (!emailsManuels.includes(e)) setEmailsManuels((l) => [...l, e]);
    setSaisieEmail("");
  }

  function basculerEnvoiPersonnel() {
    if (!moi?.email) return;
    setEmailsManuels((l) =>
      l.includes(moi.email!) ? l.filter((x) => x !== moi.email) : [...l, moi.email!],
    );
  }

  async function envoyer() {
    setOccupe(true);
    setEtat(null);
    try {
      // On pousse d'abord la saisie (le serveur doit connaître l'intervention
      // avant d'enregistrer l'envoi), puis on demande le réassort calculé par
      // le serveur — la somme de TOUS les déclarants (ex. ISP + médecin sur
      // un VLM), pas seulement ce que ce téléphone a vu. Hors connexion, on
      // retombe sur le calcul local (rapatriement inclus dans synchroniser).
      await synchroniser();
      let donneesAJour: DonneesPdf;
      try {
        const reassort = await api<ReassortServeur>(`/interventions/${id}/reassort`);
        donneesAJour = convertirReassort(reassort);
      } catch {
        const carteAJour = await lignesDe(id);
        const lignesAJour = [...carteAJour.values()].filter((l) => l.quantite > 0);
        donneesAJour = construireDonnees(catalogue!, intervention!, lignesAJour, moi!);
      }
      const doc = construirePdf(donneesAJour);
      const reponse = await api<{ messagerieConfiguree: boolean; destinataires?: { libelle: string; email: string }[] }>(
        "/envoi",
        {
          method: "POST",
          body: JSON.stringify({
            interventionId: id,
            destinataireIds: coches,
            emailsManuels,
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

        {moi.email ? (
          <button
            className={`ligne ${emailsManuels.includes(moi.email) ? "active" : ""}`}
            onClick={basculerEnvoiPersonnel}
          >
            <span className="nom">
              M&apos;envoyer une copie
              <small>{moi.email}</small>
            </span>
            <span className="etiquette et-fait">{emailsManuels.includes(moi.email) ? "✓" : ""}</span>
          </button>
        ) : (
          <p className="note">
            Renseigne ton adresse mail dans « Mon compte » pour pouvoir t&apos;envoyer une copie.
          </p>
        )}

        {emailsManuels
          .filter((e) => e !== moi.email)
          .map((e) => (
            <div key={e} className="ligne">
              <span className="nom">{e}</span>
              <button
                className="bouton fantome"
                onClick={() => setEmailsManuels((l) => l.filter((x) => x !== e))}
              >
                Retirer
              </button>
            </div>
          ))}

        <div className="ligne">
          <input
            className="champ"
            type="email"
            placeholder="Autre adresse mail"
            value={saisieEmail}
            onChange={(e) => setSaisieEmail(e.target.value)}
          />
          <button className="bouton fantome" onClick={ajouterEmail}>
            Ajouter
          </button>
        </div>

        <button className="bouton fantome" onClick={telecharger}>
          Aperçu — télécharger le PDF
        </button>

        <button
          className="bouton"
          disabled={occupe || (coches.length === 0 && emailsManuels.length === 0) || !enLigne}
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
