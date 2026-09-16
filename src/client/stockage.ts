"use client";

/**
 * Stockage local du téléphone. Tout passe par ici : le catalogue mis en cache,
 * les interventions et les consommations saisies. Une saisie est écrite ici
 * d'abord, toujours — aucun écran n'attend le réseau.
 */

const BASE = "matisp";
const VERSION_BASE = 1;
const TABLES = ["catalogue", "interventions", "consommations", "file"] as const;
type Table = (typeof TABLES)[number];

let connexion: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (connexion) return connexion;
  connexion = new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, VERSION_BASE);
    requete.onupgradeneeded = () => {
      const bdd = requete.result;
      for (const table of TABLES) {
        if (!bdd.objectStoreNames.contains(table)) bdd.createObjectStore(table);
      }
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
  return connexion;
}

async function transaction<T>(
  table: Table,
  mode: IDBTransactionMode,
  action: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const bdd = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const tx = bdd.transaction(table, mode);
    const requete = action(tx.objectStore(table));
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

export const lire = <T>(table: Table, cle: string) =>
  transaction<T | undefined>(table, "readonly", (m) => m.get(cle) as IDBRequest<T | undefined>);

export const ecrire = <T>(table: Table, cle: string, valeur: T) =>
  transaction(table, "readwrite", (m) => m.put(valeur, cle));

export const supprimer = (table: Table, cle: string) =>
  transaction(table, "readwrite", (m) => m.delete(cle));

export const tout = <T>(table: Table) =>
  transaction<T[]>(table, "readonly", (m) => m.getAll() as IDBRequest<T[]>);

export async function vider(): Promise<void> {
  for (const table of TABLES) {
    await transaction(table, "readwrite", (m) => m.clear());
  }
}

// ------------------------------------------------------------------ types

export type Produit = {
  id: string;
  code: string;
  designation: string;
  gamme: string | null;
  dci: string | null;
  nomCommercial: string | null;
  unite: string;
  categorie: string;
  synonymes: string[];
  estConsommable: boolean;
  estMedicament: boolean;
};

export type Modele = {
  id: string;
  code: string;
  type: string;
  libelle: string;
  lignes: { produitId: string; quantiteTheorique: number }[];
};

export type Dotation = {
  id: string;
  identifiant: string;
  /// Libellé d'affichage court, calculé côté serveur selon le profil de
  /// l'utilisateur (« ISP », « VLM », « MSP » ou « Mon sac » pour une dotation
  /// médecin personnelle) — à utiliser à la place de `identifiant` dans l'UI.
  libelle: string;
  portee: string;
  modeleId: string;
  detenteurId: string | null;
};

export type Destinataire = { id: string; libelle: string; email: string; cocheParDefaut: boolean };

export type Catalogue = {
  version: number;
  /** Incrémenté à la main côté serveur à chaque changement de FORME du
   * catalogue (ex. ajout de `libelle`) — indépendant de `version`, qui ne
   * bouge qu'au ré-import du fichier Excel. Sans ça, un téléphone qui a déjà
   * mis le catalogue en cache ne verrait jamais la nouvelle forme tant que
   * personne ne réimporte, même après une mise à jour de l'appli. */
  schemaVersion: number;
  produits: Produit[];
  modeles: Modele[];
  dotations: Dotation[];
  destinataires: Destinataire[];
};

export type InterventionLocale = {
  id: string;
  debutLe: string;
  finLe: string | null;
  crss: string | null;
  statut: "BROUILLON" | "TERMINEE" | "ENVOYEE" | "CLOTUREE";
  dotationIds: string[];
  synchronisee: boolean;
};

export type ConsommationLocale = {
  id: string;
  interventionId: string;
  dotationId: string;
  /// Vide quand le produit n'est pas au catalogue : voir `nomLibre`.
  produitId: string | null;
  /// Nom saisi à la main pour un produit hors catalogue (sinon vide). L'appli
  /// ne doit jamais bloquer une saisie faute de fiche catalogue (décision du
  /// 16/09/2026) — le catalogue reste géré à la main par Ben via le classeur.
  nomLibre: string | null;
  quantite: number;
  type: "CONSOMME" | "PERDU" | "CASSE";
  commentaire: string | null;
  saisiLe: string;
  synchronisee: boolean;
  /// Prénom + nom de l'auteur — utile quand plusieurs déclarants sortent la
  /// même dotation partagée (ex. VLM) : permet de fusionner sans se marcher
  /// dessus et de savoir qui a saisi quoi. Renseigné localement à la création
  /// et par le rapatriement des lignes des autres déclarants (voir session.ts).
  auteur?: string | null;
};

// -------------------------------------------------------------- catalogue

export const lireCatalogue = () => lire<Catalogue>("catalogue", "courant");
export const ecrireCatalogue = (c: Catalogue) => ecrire("catalogue", "courant", c);

// ----------------------------------------------------------- interventions

export const lireIntervention = (id: string) => lire<InterventionLocale>("interventions", id);
export const listerInterventions = () => tout<InterventionLocale>("interventions");
export const ecrireIntervention = (i: InterventionLocale) => ecrire("interventions", i.id, i);

export const listerConsommations = () => tout<ConsommationLocale>("consommations");
export const ecrireConsommation = (c: ConsommationLocale) => ecrire("consommations", c.id, c);

export async function consommationsDe(interventionId: string): Promise<ConsommationLocale[]> {
  return (await listerConsommations()).filter((c) => c.interventionId === interventionId);
}

/**
 * Une ligne par (intervention, dotation, produit, type), identifiée par un ULID
 * créé au premier appui. Les boutons − / + modifient sa quantité ; la ligne garde
 * son identifiant, donc la resynchroniser met à jour la même ligne côté serveur
 * au lieu d'en créer une seconde.
 */
export const cleLigne = (
  dotationId: string,
  produitId: string | null,
  type = "CONSOMME",
  nomLibre?: string | null,
) =>
  produitId
    ? `${dotationId}|${produitId}|${type}`
    : `${dotationId}|libre:${(nomLibre ?? "").trim().toLowerCase()}|${type}`;

export async function lignesDe(
  interventionId: string,
): Promise<Map<string, ConsommationLocale>> {
  const carte = new Map<string, ConsommationLocale>();
  for (const c of await consommationsDe(interventionId)) {
    carte.set(cleLigne(c.dotationId, c.produitId, c.type, c.nomLibre), c);
  }
  return carte;
}
