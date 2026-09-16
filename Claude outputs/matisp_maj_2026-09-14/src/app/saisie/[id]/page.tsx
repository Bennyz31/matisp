"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { nouvelleLigne, synchroniser } from "@/client/session";
import {
  cleLigne,
  ecrireConsommation,
  lignesDe,
  lireCatalogue,
  lireIntervention,
  type Catalogue,
  type ConsommationLocale,
  type InterventionLocale,
} from "@/client/stockage";
import { chercher, indexer, type ProduitIndexe } from "@/client/recherche";
import { Barre, Chargement, Compteur, useProfil } from "@/client/ui";

export default function Saisie() {
  const router = useRouter();
  const moi = useProfil();
  const { id } = useParams<{ id: string }>();

  const [catalogue, setCatalogue] = useState<Catalogue | undefined>();
  const [intervention, setIntervention] = useState<InterventionLocale | undefined>();
  const [lignes, setLignes] = useState<Map<string, ConsommationLocale>>(new Map());
  const [requete, setRequete] = useState("");
  const [dotationActive, setDotationActive] = useState<string | null>(null);
  const [avecEquipements, setAvecEquipements] = useState(false);
  const [vue, setVue] = useState<"tous" | "favoris">("tous");

  const recharger = useCallback(async () => setLignes(await lignesDe(id)), [id]);

  useEffect(() => {
    void (async () => {
      const [cat, inter] = await Promise.all([lireCatalogue(), lireIntervention(id)]);
      setCatalogue(cat);
      setIntervention(inter);
      setDotationActive(inter?.dotationIds[0] ?? null);
      await recharger();
    })();
  }, [id, recharger]);

  const index = useMemo(() => indexer(catalogue?.produits ?? []), [catalogue]);

  /**
   * Favoris : on ne dispose pas encore d'historique côté serveur au premier
   * lancement, donc on part de la composition de la dotation, triée par
   * quantité théorique. Les PISU étant reportés en V2, c'est le seul raccourci —
   * il ne doit jamais afficher un écran vide. Sert aussi à booster la recherche.
   */
  const frequents = useMemo(() => {
    if (!catalogue || !dotationActive) return [];
    const dotation = catalogue.dotations.find((d) => d.id === dotationActive);
    const modele = catalogue.modeles.find((m) => m.id === dotation?.modeleId);
    if (!modele) return [];
    const parId = new Map(catalogue.produits.map((p) => [p.id, p]));
    return modele.lignes
      .map((l) => ({ produit: parId.get(l.produitId), quantite: l.quantiteTheorique }))
      .filter((l) => l.produit?.estConsommable)
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 24)
      .map((l) => l.produit!);
  }, [catalogue, dotationActive]);

  /** Vue « Tous » : l'ensemble des consommables de la dotation active, par
   * ordre alphabétique — vue par défaut demandée par Ben, pour ne pas cacher
   * un produit moins courant derrière les 24 favoris. */
  const tousProduits = useMemo(() => {
    if (!catalogue || !dotationActive) return [];
    const dotation = catalogue.dotations.find((d) => d.id === dotationActive);
    const modele = catalogue.modeles.find((m) => m.id === dotation?.modeleId);
    if (!modele) return [];
    const parId = new Map(catalogue.produits.map((p) => [p.id, p]));
    return modele.lignes
      .map((l) => parId.get(l.produitId))
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.estConsommable))
      .sort((a, b) => a.designation.localeCompare(b.designation, "fr"));
  }, [catalogue, dotationActive]);

  const resultats = useMemo(
    () =>
      requete.trim().length >= 1
        ? chercher(index, requete, {
            frequents: frequents.map((p) => p.id),
            inclureEquipements: avecEquipements,
          })
        : [],
    [index, requete, frequents, avecEquipements],
  );

  if (moi === undefined || !catalogue) return <Chargement />;
  if (!moi) return null;
  if (!intervention) {
    return (
      <div className="ecran">
        <Barre titre="Saisie" retour="/" />
        <div className="centre">Cette intervention n&apos;est pas sur ce téléphone.</div>
      </div>
    );
  }

  /**
   * Un appui sur + enregistre immédiatement une unité, sans confirmation.
   * La ligne garde son identifiant : corriger la quantité met à jour la même
   * ligne, ici comme sur le serveur.
   */
  async function ajuster(produitId: string, quantite: number) {
    if (!dotationActive) return;
    const cle = cleLigne(dotationActive, produitId);
    const existante = lignes.get(cle);
    const ligne: ConsommationLocale = existante
      ? { ...existante, quantite, saisiLe: new Date().toISOString(), synchronisee: false }
      : { ...nouvelleLigne(id, dotationActive, produitId), quantite };
    await ecrireConsommation(ligne);
    await recharger();
    void synchroniser();
  }

  const quantite = (produitId: string) =>
    dotationActive ? (lignes.get(cleLigne(dotationActive, produitId))?.quantite ?? 0) : 0;

  const totaux = [...lignes.values()].reduce(
    (acc, l) => ({
      references: acc.references + (l.quantite > 0 ? 1 : 0),
      unites: acc.unites + Math.max(0, l.quantite),
    }),
    { references: 0, unites: 0 },
  );

  const affiches: ProduitIndexe[] | typeof frequents = requete.trim()
    ? resultats
    : vue === "tous"
      ? tousProduits
      : frequents;

  return (
    <div className="ecran">
      <Barre titre="Saisie" retour="/" />

      <div className="corps">
        <input
          id="recherche"
          className="champ"
          placeholder="Rechercher : perf, 18, vert, seringue…"
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />

        {intervention.dotationIds.length > 1 && (
          <>
            <p className="libelle">Sortie de quelle dotation ?</p>
            <div className="puces">
              {intervention.dotationIds.map((did) => (
                <button
                  key={did}
                  className={`puce ${dotationActive === did ? "active" : ""}`}
                  onClick={() => setDotationActive(did)}
                >
                  {catalogue.dotations.find((d) => d.id === did)?.identifiant ?? "dotation"}
                </button>
              ))}
            </div>
          </>
        )}

        {!requete.trim() && (
          <div className="puces">
            <button className={`puce ${vue === "tous" ? "active" : ""}`} onClick={() => setVue("tous")}>
              Tous
            </button>
            <button
              className={`puce ${vue === "favoris" ? "active" : ""}`}
              onClick={() => setVue("favoris")}
            >
              Favoris
            </button>
          </div>
        )}

        <p className="libelle">
          {requete.trim()
            ? `Résultats (${affiches.length})`
            : vue === "tous"
              ? `Tous les produits (${affiches.length})`
              : "Favoris"}
        </p>

        {affiches.length === 0 && (
          <p className="note">
            {requete.trim()
              ? "Rien trouvé. Essaie le nom commercial, la couleur ou le calibre."
              : "Aucun produit dans cette dotation."}
          </p>
        )}

        {affiches.map((p) => {
          const q = quantite(p.id);
          return (
            <div key={p.id} className={`ligne ${q > 0 ? "active" : ""}`}>
              <span className="nom">
                {p.designation}
                <small>
                  {p.gamme ?? p.categorie.replace(/_/g, " ").toLowerCase()}
                  {p.nomCommercial ? ` · ${p.nomCommercial}` : ""}
                  {p.estConsommable ? "" : " · équipement"}
                </small>
              </span>
              {q > 0 ? (
                <Compteur valeur={q} onChange={(v) => void ajuster(p.id, v)} />
              ) : (
                <button
                  className="plus"
                  aria-label={`Ajouter ${p.designation}`}
                  onClick={() => void ajuster(p.id, 1)}
                >
                  +
                </button>
              )}
            </div>
          );
        })}

        {requete.trim() && !avecEquipements && (
          <button className="bouton fantome" onClick={() => setAvecEquipements(true)}>
            Inclure le matériel non consommable (perte ou casse)
          </button>
        )}
      </div>

      <div className="pied">
        <span className="total">
          {totaux.references} réf. · {totaux.unites} u.
        </span>
        <button className="terminer" onClick={() => router.push(`/recap/${id}`)}>
          Terminer
        </button>
      </div>
    </div>
  );
}
