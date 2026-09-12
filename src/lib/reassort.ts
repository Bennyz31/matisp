import { prisma } from "./db";


export type LigneReassort = {
  produitId: string;
  code: string;
  designation: string;
  gamme: string | null;
  unite: string;
  quantite: number;
  type: "CONSOMME" | "PERDU" | "CASSE";
  commentaire: string | null;
};

export type BlocReassort = {
  dotationId: string;
  dotation: string;
  declarants: string[];
  lignes: LigneReassort[];
  totalReferences: number;
  totalUnites: number;
};

export type Reassort = {
  interventionId: string;
  crss: string | null;
  debutLe: Date;
  finLe: Date | null;
  statut: string;
  declarants: { nom: string; fonction: string }[];
  blocs: BlocReassort[];
  totalReferences: number;
  totalUnites: number;
};

/**
 * Réassort V1 = somme des consommations déclarées, groupées par dotation.
 * Pas d'emplacement (décision du 10/09), pas de comparaison au stock théorique.
 */
export async function calculerReassort(interventionId: string): Promise<Reassort> {
  const intervention = await prisma.intervention.findUnique({
    where: { id: interventionId },
    include: {
      utilisateurs: { include: { utilisateur: true } },
      consommations: {
        include: { produit: true, dotation: { include: { modele: true } }, utilisateur: true },
        orderBy: { saisiLe: "asc" },
      },
    },
  });
  if (!intervention) throw new Error("Intervention introuvable.");

  // Une ligne par (dotation, produit, type) : les appuis successifs sur + s'additionnent.
  const parDotation = new Map<string, BlocReassort>();

  for (const c of intervention.consommations) {
    if (c.quantite <= 0) continue; // quantité ramenée à 0 = ligne annulée
    let bloc = parDotation.get(c.dotationId);
    if (!bloc) {
      bloc = {
        dotationId: c.dotationId,
        dotation: c.dotation.identifiant,
        declarants: [],
        lignes: [],
        totalReferences: 0,
        totalUnites: 0,
      };
      parDotation.set(c.dotationId, bloc);
    }
    const nomDeclarant = `${c.utilisateur.prenom} ${c.utilisateur.nom}`;
    if (!bloc.declarants.includes(nomDeclarant)) bloc.declarants.push(nomDeclarant);

    const existante = bloc.lignes.find((l) => l.produitId === c.produitId && l.type === c.type);
    if (existante) {
      existante.quantite += c.quantite;
      if (c.commentaire) {
        existante.commentaire = existante.commentaire
          ? `${existante.commentaire} · ${c.commentaire}`
          : c.commentaire;
      }
    } else {
      bloc.lignes.push({
        produitId: c.produitId,
        code: c.produit.code,
        designation: c.produit.designation,
        gamme: c.produit.gamme,
        unite: c.produit.unite,
        quantite: c.quantite,
        type: c.type,
        commentaire: c.commentaire,
      });
    }
  }

  const blocs = [...parDotation.values()];
  for (const bloc of blocs) {
    bloc.lignes.sort((a, b) => a.designation.localeCompare(b.designation, "fr"));
    bloc.totalReferences = bloc.lignes.length;
    bloc.totalUnites = bloc.lignes.reduce((s, l) => s + l.quantite, 0);
  }
  blocs.sort((a, b) => a.dotation.localeCompare(b.dotation, "fr"));

  return {
    interventionId: intervention.id,
    crss: intervention.crss,
    debutLe: intervention.debutLe,
    finLe: intervention.finLe,
    statut: intervention.statut,
    declarants: intervention.utilisateurs.map((u) => ({
      nom: `${u.utilisateur.prenom} ${u.utilisateur.nom}`,
      fonction: u.utilisateur.fonction,
    })),
    blocs,
    totalReferences: blocs.reduce((s, b) => s + b.totalReferences, 0),
    totalUnites: blocs.reduce((s, b) => s + b.totalUnites, 0),
  };
}
