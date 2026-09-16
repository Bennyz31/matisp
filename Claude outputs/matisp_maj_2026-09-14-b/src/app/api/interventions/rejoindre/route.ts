import { prisma } from "@/lib/db";
import { ErreurHttp, exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Recherche une intervention déjà en cours par CRSS, pour permettre à un
 * second déclarant (ex. le médecin sur une sortie VLM où l'ISP a commencé la
 * saisie) de la rejoindre plutôt que d'en créer une seconde en double — les
 * deux téléphones partagent alors le même identifiant d'intervention et se
 * voient l'un l'autre via le rapatriement (voir /api/sync).
 */
export const GET = (req: Request) =>
  gerer(async () => {
    await exigerUtilisateur(req);
    const crss = new URL(req.url).searchParams.get("crss")?.trim();
    if (!crss) throw new ErreurHttp(400, "CRSS manquant.");

    const intervention = await prisma.intervention.findFirst({
      where: { crss, statut: { in: ["BROUILLON", "TERMINEE"] } },
      orderBy: { debutLe: "desc" },
      include: { dotations: { select: { dotationId: true } } },
    });

    return { intervention };
  });
