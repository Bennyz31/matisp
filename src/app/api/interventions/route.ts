import { prisma } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/** Historique — §19 du cahier des charges. */
export const GET = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);

    // Le pharmacien consulte ce qui lui a été adressé ; il ne clôture rien.
    const filtre =
      moi.fonction === "PHARMACIEN" || moi.admin
        ? { envois: { some: {} } }
        : { utilisateurs: { some: { utilisateurId: moi.sub } } };

    const interventions = await prisma.intervention.findMany({
      where: filtre,
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
        declarants: i.utilisateurs.map((u) => `${u.utilisateur.prenom} ${u.utilisateur.nom}`),
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
