import { prisma } from "@/lib/db";
import { ErreurHttp, exigerAdmin } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Suppression définitive, réservée aux administrateurs (décision du
 * 17/09/2026, Ben) : même une intervention clôturée peut être supprimée,
 * contrairement à l'archivage (accessible à tout déclarant) qui ne fait que
 * la masquer. Les consommations, participations et envois liés partent avec
 * elle (onDelete: Cascade côté schéma) — pas de confirmation à double niveau
 * ici, l'écran qui appelle cette route s'en charge.
 */
export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  gerer(async () => {
    await exigerAdmin(req);
    const { id } = await params;
    const existante = await prisma.intervention.findUnique({ where: { id }, select: { id: true } });
    if (!existante) throw new ErreurHttp(404, "Intervention introuvable.");
    await prisma.intervention.delete({ where: { id } });
    return { supprimee: id };
  });
