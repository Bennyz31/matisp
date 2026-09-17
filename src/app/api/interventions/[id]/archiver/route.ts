import { prisma } from "@/lib/db";
import { ErreurHttp, exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Masque une intervention clôturée de l'historique, sans l'effacer (décision
 * du 17/09/2026, Ben). Accessible à tout déclarant de l'intervention, pas
 * seulement à un administrateur — contrairement à la suppression définitive.
 */
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { id } = await params;

    const intervention = await prisma.intervention.findUnique({
      where: { id },
      include: { utilisateurs: { select: { utilisateurId: true } } },
    });
    if (!intervention) throw new ErreurHttp(404, "Intervention introuvable.");
    if (!moi.admin && !intervention.utilisateurs.some((u) => u.utilisateurId === moi.sub)) {
      throw new ErreurHttp(403, "Tu ne participes pas à cette intervention.");
    }
    if (intervention.statut !== "CLOTUREE") {
      throw new ErreurHttp(400, "Seule une intervention clôturée peut être archivée.");
    }

    await prisma.intervention.update({ where: { id }, data: { archiveeLe: new Date() } });
    return { archivee: id };
  });
