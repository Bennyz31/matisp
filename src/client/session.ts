"use client";

import { ulid } from "ulid";
import {
  ecrireCatalogue,
  ecrireConsommation,
  ecrireIntervention,
  listerConsommations,
  listerInterventions,
  lireCatalogue,
  lireIntervention,
  vider,
  type Catalogue,
  type ConsommationLocale,
  type InterventionLocale,
} from "./stockage";

const CLE_JETON = "matisp.jeton";
const CLE_PROFIL = "matisp.profil";
const CLE_DERNIER_RAPATRIEMENT = "matisp.dernierRapatriement";

export type Profil = {
  id: string;
  nom: string;
  prenom: string;
  fonction: string;
  admin: boolean;
  accesVLM: boolean;
  email: string | null;
  motDePasseParDefaut: boolean;
  dotations: { id: string; identifiant: string; type: string }[];
};

const local = {
  lire: (cle: string) => {
    try {
      return localStorage.getItem(cle);
    } catch {
      return null;
    }
  },
  ecrire: (cle: string, valeur: string) => {
    try {
      localStorage.setItem(cle, valeur);
    } catch {
      /* navigation privée : la session ne survivra pas, ce n'est pas bloquant */
    }
  },
  effacer: (cle: string) => {
    try {
      localStorage.removeItem(cle);
    } catch {
      /* ignoré */
    }
  },
};

export const jeton = () => local.lire(CLE_JETON);

export function profil(): Profil | null {
  const brut = local.lire(CLE_PROFIL);
  if (!brut) return null;
  try {
    return JSON.parse(brut) as Profil;
  } catch {
    return null;
  }
}

export function ouvrirSession(jetonSigne: string, p: Profil): void {
  local.ecrire(CLE_JETON, jetonSigne);
  local.ecrire(CLE_PROFIL, JSON.stringify(p));
}

/** Met à jour le profil mis en cache localement (ex. après changement d'e-mail),
 * sans repasser par une reconnexion. */
export function mettreAJourProfil(partiel: Partial<Profil>): void {
  const actuel = profil();
  if (!actuel) return;
  local.ecrire(CLE_PROFIL, JSON.stringify({ ...actuel, ...partiel }));
}

export async function fermerSession(): Promise<void> {
  local.effacer(CLE_JETON);
  local.effacer(CLE_PROFIL);
  await vider();
}

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const entetes = new Headers(options.headers);
  const j = jeton();
  if (j) entetes.set("Authorization", `Bearer ${j}`);
  if (options.body && !(options.body instanceof FormData)) {
    entetes.set("Content-Type", "application/json");
  }

  const reponse = await fetch(`/api${chemin}`, { ...options, headers: entetes });
  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    if (reponse.status === 401) {
      local.effacer(CLE_JETON);
      local.effacer(CLE_PROFIL);
    }
    throw new ErreurApi(reponse.status, (donnees as { erreur?: string }).erreur ?? "Erreur réseau.");
  }
  return donnees as T;
}

// ------------------------------------------------------------- catalogue

/** Télécharge le catalogue s'il a changé (contenu OU forme). Silencieux hors connexion. */
export async function rafraichirCatalogue(): Promise<Catalogue | undefined> {
  const cache = await lireCatalogue();
  try {
    const frais = await api<Catalogue>("/catalogue");
    if (!cache || frais.version !== cache.version || frais.schemaVersion !== cache.schemaVersion) {
      await ecrireCatalogue(frais);
      return frais;
    }
  } catch {
    // Hors connexion : on garde ce qu'on a, c'est précisément le but du cache.
  }
  return cache;
}

// ---------------------------------------------------------------- saisie

export function nouvelleIntervention(dotationIds: string[]): InterventionLocale {
  return {
    id: ulid(),
    debutLe: new Date().toISOString(),
    finLe: null,
    crss: null,
    statut: "BROUILLON",
    dotationIds,
    synchronisee: false,
  };
}

export function nouvelleLigne(
  interventionId: string,
  dotationId: string,
  produitId: string | null,
  type: ConsommationLocale["type"] = "CONSOMME",
  auteur: string | null = null,
  nomLibre: string | null = null,
): ConsommationLocale {
  return {
    id: ulid(),
    interventionId,
    dotationId,
    produitId,
    nomLibre,
    quantite: 0,
    type,
    commentaire: null,
    saisiLe: new Date().toISOString(),
    synchronisee: false,
    auteur,
  };
}

// -------------------------------------------------------- synchronisation

let enCours = false;

/**
 * Pousse tout ce qui n'est pas encore parti. Appelée à l'ouverture de l'appli,
 * au retour du réseau et après chaque validation. Un échec est sans conséquence :
 * les données restent sur le téléphone et repartiront au prochain passage.
 */
export async function synchroniser(): Promise<{ envoyees: number } | null> {
  if (enCours || !navigator.onLine || !jeton()) return null;
  enCours = true;
  try {
    const [interventions, consommations] = await Promise.all([
      listerInterventions(),
      listerConsommations(),
    ]);
    const aEnvoyer = interventions.filter((i) => !i.synchronisee);
    const lignes = consommations.filter((c) => !c.synchronisee);

    // Une consommation ne peut pas partir avant l'intervention qui la porte.
    const idsConnus = new Set(interventions.filter((i) => i.synchronisee).map((i) => i.id));
    for (const i of aEnvoyer) idsConnus.add(i.id);
    const lignesValides = lignes.filter((c) => idsConnus.has(c.interventionId));

    if (aEnvoyer.length === 0 && lignesValides.length === 0) {
      await rapatrier().catch(() => undefined);
      return { envoyees: 0 };
    }

    const { acceptes } = await api<{ acceptes: string[] }>("/sync", {
      method: "POST",
      body: JSON.stringify({
        interventions: aEnvoyer.map((i) => ({
          id: i.id,
          debutLe: i.debutLe,
          finLe: i.finLe,
          crss: i.crss,
          statut: i.statut,
          dotationIds: i.dotationIds,
        })),
        consommations: lignesValides.map((c) => ({
          id: c.id,
          interventionId: c.interventionId,
          dotationId: c.dotationId,
          produitId: c.produitId,
          nomLibre: c.nomLibre,
          quantite: c.quantite,
          type: c.type,
          commentaire: c.commentaire,
          saisiLe: c.saisiLe,
        })),
      }),
    });

    const ok = new Set(acceptes);
    for (const i of aEnvoyer) {
      if (ok.has(i.id)) await ecrireIntervention({ ...i, synchronisee: true });
    }
    for (const c of lignesValides) {
      if (ok.has(c.id)) await ecrireConsommation({ ...c, synchronisee: true });
    }
    await rapatrier().catch(() => undefined);
    return { envoyees: ok.size };
  } catch {
    return null;
  } finally {
    enCours = false;
  }
}

type ConsommationDistante = {
  id: string;
  interventionId: string;
  dotationId: string;
  produitId: string | null;
  nomLibre: string | null;
  quantite: number;
  type: ConsommationLocale["type"];
  commentaire: string | null;
  saisiLe: string;
  utilisateur: { nom: string; prenom: string };
};

type InterventionDistante = {
  id: string;
  debutLe: string;
  finLe: string | null;
  crss: string | null;
  statut: InterventionLocale["statut"];
  dotations: { dotationId: string }[];
};

/**
 * Rapatrie ce que les autres déclarants ont ajouté aux interventions
 * auxquelles je participe (ex. ISP + MSP sur une même sortie VLM), pour que
 * le récapitulatif et le PDF envoyés depuis ce téléphone ne perdent jamais ce
 * qu'un autre a saisi sur le sien. Sans conflit possible : chaque ligne garde
 * l'identifiant donné par le téléphone qui l'a créée, on ne fait qu'ajouter
 * celles qu'on ne connaît pas encore ou mettre à jour celles déjà connues.
 */
async function rapatrier(): Promise<void> {
  const depuis = local.lire(CLE_DERNIER_RAPATRIEMENT) ?? new Date(0).toISOString();
  const { interventions, consommations, horodatage } = await api<{
    interventions: InterventionDistante[];
    consommations: ConsommationDistante[];
    horodatage: string;
  }>(`/sync?depuis=${encodeURIComponent(depuis)}`);

  for (const i of interventions) {
    const locale = await lireIntervention(i.id);
    await ecrireIntervention({
      id: i.id,
      debutLe: i.debutLe,
      finLe: i.finLe,
      crss: i.crss,
      // Le statut local, s'il est plus avancé (ex. clôturé sur ce téléphone
      // sans être encore reparti), n'est jamais rétrogradé par le rapatriement.
      statut: rangStatutClient(locale?.statut) > rangStatutClient(i.statut) ? locale!.statut : i.statut,
      dotationIds: Array.from(
        new Set([...(locale?.dotationIds ?? []), ...i.dotations.map((d) => d.dotationId)]),
      ),
      synchronisee: true,
    });
  }

  for (const c of consommations) {
    await ecrireConsommation({
      id: c.id,
      interventionId: c.interventionId,
      dotationId: c.dotationId,
      produitId: c.produitId,
      nomLibre: c.nomLibre,
      quantite: c.quantite,
      type: c.type,
      commentaire: c.commentaire,
      saisiLe: c.saisiLe,
      synchronisee: true,
      auteur: `${c.utilisateur.prenom} ${c.utilisateur.nom}`,
    });
  }

  // Petite marge de recouvrement pour tolérer un décalage d'horloge entre le
  // téléphone et le serveur : mieux vaut rapatrier deux fois la même ligne
  // (sans effet, même identifiant) qu'en manquer une.
  const marge = new Date(new Date(horodatage).getTime() - 5 * 60_000).toISOString();
  local.ecrire(CLE_DERNIER_RAPATRIEMENT, marge);
}

const ORDRE_STATUT = ["BROUILLON", "TERMINEE", "ENVOYEE", "CLOTUREE"];
const rangStatutClient = (s: string | undefined) => (s ? ORDRE_STATUT.indexOf(s) : -1);
