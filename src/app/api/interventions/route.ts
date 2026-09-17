import { prisma } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";
import { nomComplet } from "@/lib/personne";

export const dynamic = "force-dynamic";

/** Historique — §19 du cahier des charges. */
export const GET = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);

    // Décision du 17/09/2026 (Ben) : un administrateur voit l'historique de
    // tous les agents, quel que soit le statut (pas seulement ce qui a été
    // envoyé). Le pharmacien, lui, ne consulte que ce qui lui a été adressé —
    // il ne clôture rien. Un agent normal ne voit que ses propres interventions.
    const filtre = moi.admin
      ? {}
      : moi.fonction === "PHARMACIEN"
        ? { envois: { some: {} } }
        : { utilisateurs: { some: { utilisateurId: moi.sub } } };

    const interventions = await prisma.intervention.findMany({
      // Archivée = masquée de l'historique sans être effacée (décision du
      // 17/09/2026) : n'importe quel déclarant peut archiver une intervention
      // clôturée pour ne pas polluer sa liste.
      where: { ...filtre, archiveeLe: null },
      orderBy: { debutLe: "desc" },
      take: 80,
      include: {
        dotations: { include: { dotation: { select: { identifiant: true } } } },
        utilisateurs: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
        consommations: { select: { produitId: true, nomLibre: true, quantite: true } },
      },
    });

    return {
      interventions: interventions.map((i) => ({
        id: i.id,
        debutLe: i.debutLe,
        crss: i.crss,
        statut: i.statut,
        verrouilleeLe: i.verrouilleeLe,
        dotations: i.dotations.map((d) => d.dotation.identifiant),
        declarants: i.utilisateurs.map((u) => nomComplet(u.utilisateur.prenom, u.utilisateur.nom)),
        // Un produit hors catalogue (produitId vide) se distingue par son nom
        // libre, sinon plusieurs produits différents saisis à la main se
        // compteraient comme une seule référence.
        nbReferences: new Set(
          i.consommations
            .filter((c) => c.quantite > 0)
            .map((c) => c.produitId ?? `libre:${(c.nomLibre ?? "").trim().toLowerCase()}`),
        ).size,
        nbUnites: i.consommations.reduce((s, c) => s + Math.max(0, c.quantite), 0),
      })),
    };
  });
