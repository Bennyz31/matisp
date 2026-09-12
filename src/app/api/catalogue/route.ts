import { prisma, versionCatalogue } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Catalogue complet, mis en cache dans IndexedDB au premier lancement.
 * La recherche tourne ensuite entièrement sur le téléphone : c'est la seule
 * façon de tenir « 1 à 2 secondes » avec un réseau médiocre ou absent.
 */
export const GET = (req: Request) =>
  gerer(async () => {
    await exigerUtilisateur(req);

    const [produits, modeles, dotations, destinataires, cis, version] = await Promise.all([
      prisma.produit.findMany({
        where: { actif: true },
        orderBy: { designation: "asc" },
        select: {
          id: true,
          code: true,
          designation: true,
          gamme: true,
          dci: true,
          nomCommercial: true,
          unite: true,
          categorie: true,
          synonymes: true,
          estConsommable: true,
          estMedicament: true,
        },
      }),
      prisma.modeleDotation.findMany({
        where: { actif: true },
        select: {
          id: true,
          code: true,
          type: true,
          libelle: true,
          lignes: { select: { produitId: true, quantiteTheorique: true } },
        },
      }),
      prisma.dotation.findMany({
        where: { actif: true },
        orderBy: { identifiant: "asc" },
        select: { id: true, identifiant: true, portee: true, modeleId: true, detenteurId: true },
      }),
      prisma.destinataire.findMany({
        where: { actif: true },
        orderBy: { ordre: "asc" },
        select: { id: true, libelle: true, email: true, cocheParDefaut: true },
      }),
      prisma.cis.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
      versionCatalogue(),
    ]);

    return { version, produits, modeles, dotations, destinataires, cis };
  });
