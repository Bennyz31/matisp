import { prisma } from "@/lib/db";
import { aucunCompte, exigerAdmin } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  gerer(async () => {
    if (!(await aucunCompte())) await exigerAdmin(req);

    const [produits, consommables, modeles, dotations, utilisateurs, destinataires, aVerifier, horsCatalogue] =
      await Promise.all([
        prisma.produit.count({ where: { actif: true } }),
        prisma.produit.count({ where: { actif: true, estConsommable: true } }),
        prisma.modeleDotation.count(),
        prisma.dotation.count(),
        prisma.utilisateur.count(),
        prisma.destinataire.count({ where: { actif: true } }),
        prisma.produit.count({ where: { remarque: { not: null } } }),
        // Déclarations saisies en intervention sans fiche catalogue (voir
        // Consommation.nomLibre) : à examiner pour intégration au classeur.
        prisma.consommation.count({ where: { produitId: null } }),
      ]);

    return {
      produits,
      consommables,
      modeles,
      dotations,
      utilisateurs,
      destinataires,
      aVerifier,
      horsCatalogue,
      messagerieConfiguree: Boolean(process.env.RESEND_API_KEY),
    };
  });
