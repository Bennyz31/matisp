import { prisma } from "@/lib/db";
import { calculerReassort } from "@/lib/reassort";
import { ErreurHttp, exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Réassort calculé côté serveur, à partir de TOUTES les consommations connues
 * de l'intervention (tous déclarants confondus, sommées par produit) — la
 * source la plus fiable pour construire le PDF final quand le téléphone est
 * en ligne, plutôt que de ne compter que ce que cet appareil a lui-même vu.
 * Le téléphone garde un calcul local équivalent pour fonctionner hors ligne.
 */
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { id } = await params;

    if (moi.fonction !== "PHARMACIEN" && !moi.admin) {
      const lien = await prisma.interventionUtilisateur.findUnique({
        where: { interventionId_utilisateurId: { interventionId: id, utilisateurId: moi.sub } },
      });
      if (!lien) throw new ErreurHttp(403, "Tu ne participes pas à cette intervention.");
    }

    return calculerReassort(id);
  });
