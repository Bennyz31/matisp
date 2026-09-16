import { z } from "zod";
import { prisma, journaliser } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

const ULID = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Identifiant ULID attendu.");

const intervention = z.object({
  id: ULID,
  debutLe: z.coerce.date(),
  finLe: z.coerce.date().nullish(),
  crss: z.string().trim().max(40).nullish(),
  statut: z.enum(["BROUILLON", "TERMINEE", "ENVOYEE", "CLOTUREE"]).default("BROUILLON"),
  dotationIds: z.array(z.string().uuid()).min(1),
});

const consommation = z
  .object({
    id: ULID,
    interventionId: ULID,
    dotationId: z.string().uuid(),
    // L'un ou l'autre : un produit du catalogue, ou un nom saisi à la main
    // quand il en manque un (décision du 16/09/2026 — jamais bloquant).
    produitId: z.string().uuid().nullish(),
    nomLibre: z.string().trim().min(1).max(200).nullish(),
    quantite: z.number().int().min(0).max(999),
    type: z.enum(["CONSOMME", "PERDU", "CASSE"]).default("CONSOMME"),
    commentaire: z.string().trim().max(500).nullish(),
    saisiLe: z.coerce.date(),
  })
  .refine((c) => c.produitId || c.nomLibre, {
    message: "produitId ou nomLibre requis.",
  });

const corps = z.object({
  interventions: z.array(intervention).max(100).default([]),
  consommations: z.array(consommation).max(3000).default([]),
});

/**
 * Synchronisation par événements. Rien n'est jamais écrasé côté serveur :
 * chaque consommation porte un identifiant généré sur le téléphone, donc rejouer
 * un lot est sans effet. Corriger une quantité, c'est un nouvel événement ;
 * annuler, c'est une quantité ramenée à zéro. Aucune résolution de conflit à
 * écrire, donc aucun bug de fusion possible — c'est le point délicat d'une appli
 * hors connexion, traité par la forme des données plutôt que par du code.
 */
export const POST = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { interventions, consommations } = corps.parse(await req.json());

    const acceptes: string[] = [];
    const refuses: { id: string; raison: string }[] = [];

    for (const i of interventions) {
      try {
        await prisma.$transaction(async (tx) => {
          const existante = await tx.intervention.findUnique({ where: { id: i.id } });
          if (existante) {
            await tx.intervention.update({
              where: { id: i.id },
              data: {
                crss: i.crss ?? undefined,
                finLe: i.finLe ?? undefined,
                // Le statut n'est jamais rétrogradé par une synchro tardive.
                statut: rangStatut(i.statut) > rangStatut(existante.statut) ? i.statut : undefined,
              },
            });
          } else {
            await tx.intervention.create({
              data: {
                id: i.id,
                debutLe: i.debutLe,
                finLe: i.finLe ?? null,
                crss: i.crss ?? null,
                statut: i.statut,
              },
            });
          }

          await tx.interventionUtilisateur.upsert({
            where: { interventionId_utilisateurId: { interventionId: i.id, utilisateurId: moi.sub } },
            create: {
              interventionId: i.id,
              utilisateurId: moi.sub,
              role: existante ? "CONTRIBUTEUR" : "CREATEUR",
            },
            update: {},
          });

          for (const dotationId of i.dotationIds) {
            await tx.interventionDotation.upsert({
              where: { interventionId_dotationId: { interventionId: i.id, dotationId } },
              create: { interventionId: i.id, dotationId },
              update: {},
            });
          }
        });
        acceptes.push(i.id);
      } catch (e) {
        refuses.push({ id: i.id, raison: (e as Error).message });
      }
    }

    for (const c of consommations) {
      try {
        await prisma.consommation.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            interventionId: c.interventionId,
            utilisateurId: moi.sub,
            dotationId: c.dotationId,
            produitId: c.produitId ?? null,
            nomLibre: c.produitId ? null : (c.nomLibre ?? null),
            quantite: c.quantite,
            type: c.type,
            commentaire: c.commentaire ?? null,
            saisiLe: c.saisiLe,
          },
          // Même identifiant = même ligne de saisie : une correction de quantité
          // faite sur le téléphone met à jour cette ligne, elle n'en crée pas une
          // seconde. Deux déclarants qui sortent le même produit ont chacun leur
          // ligne, avec leur propre identifiant, et les deux s'additionnent au
          // réassort. Rejouer le même lot est donc sans effet.
          update: {
            quantite: c.quantite,
            commentaire: c.commentaire ?? null,
            saisiLe: c.saisiLe,
            synchroLe: new Date(),
          },
        });
        acceptes.push(c.id);
      } catch (e) {
        refuses.push({ id: c.id, raison: (e as Error).message });
      }
    }

    if (refuses.length > 0) {
      await journaliser(moi.sub, "SYNC_PARTIELLE", undefined, `${refuses.length} refusé(s)`);
    }

    return { acceptes, refuses, horodatage: new Date() };
  });

const ORDRE = ["BROUILLON", "TERMINEE", "ENVOYEE", "CLOTUREE"];
const rangStatut = (s: string) => ORDRE.indexOf(s);

/**
 * Rapatriement : ce que les autres déclarants ont ajouté aux interventions
 * auxquelles je participe (cas ISP + MSP sur une sortie VLM).
 */
export const GET = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const depuis = new Date(new URL(req.url).searchParams.get("depuis") ?? 0);

    const [interventions, consommations] = await Promise.all([
      prisma.intervention.findMany({
        where: { utilisateurs: { some: { utilisateurId: moi.sub } }, majLe: { gte: depuis } },
        include: { dotations: { select: { dotationId: true } } },
      }),
      prisma.consommation.findMany({
        where: {
          intervention: { utilisateurs: { some: { utilisateurId: moi.sub } } },
          synchroLe: { gte: depuis },
        },
        include: { utilisateur: { select: { nom: true, prenom: true } } },
      }),
    ]);

    return { interventions, consommations, horodatage: new Date() };
  });
