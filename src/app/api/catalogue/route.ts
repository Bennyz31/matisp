import { prisma, versionCatalogue } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Catalogue complet, mis en cache dans IndexedDB au premier lancement.
 * La recherche tourne ensuite entièrement sur le téléphone : c'est la seule
 * façon de tenir « 1 à 2 secondes » avec un réseau médiocre ou absent.
 */
/**
 * Visibilité des dotations par profil (décision du 14/09/2026, Ben) :
 * - ISP : dotation ISP + VLM (si accès VLM).
 * - MSP (médecin) : dotation ISP + sa dotation médecin personnelle (ou la
 *   générique si aucune ne lui est propre) + VLM (si accès VLM).
 * - CONDUCTEUR / PHARMACIEN : rien par défaut (aucune consigne de Ben à ce
 *   jour) — à ajuster s'il le précise.
 * V2 (à revoir, noté par Ben) : droits plus fins par profil (ISP / ISP VLM /
 * Médecin / Médecin VLM), et clarification de qui a réellement une dotation
 * médecin personnelle.
 */
export const GET = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);

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

    const typeParModeleId = new Map(modeles.map((m) => [m.id, m.type] as const));
    const aDotationPersonnelle = dotations.some(
      (d) => d.detenteurId === moi.sub && typeParModeleId.get(d.modeleId) === "SAC_MED",
    );

    /**
     * Libellé et ordre d'affichage (décision du 14/09/2026, Ben) : la dotation
     * qui correspond à la fonction de l'utilisateur passe en premier, pour
     * limiter le nombre de références proposées par défaut sans jamais bloquer
     * l'accès aux autres (rien n'est masqué, seul l'ordre change) :
     * - ISP : « ISP » puis « VLM ».
     * - MSP sans dotation personnelle : « MSP » (générique) puis « VLM » puis « ISP ».
     * - MSP avec dotation personnelle (ex. Blonstein) : « Mon sac » puis « VLM » puis « ISP ».
     */
    const dotationsVisibles = dotations
      .filter((d) => {
        const type = typeParModeleId.get(d.modeleId);
        if (type === "VLM") return moi.accesVLM;
        if (type === "SAC_ISP") return moi.fonction === "ISP" || moi.fonction === "MSP";
        if (type === "SAC_MED") {
          if (moi.fonction !== "MSP") return false;
          if (d.detenteurId) return d.detenteurId === moi.sub;
          return !aDotationPersonnelle;
        }
        return false;
      })
      .map((d) => {
        const type = typeParModeleId.get(d.modeleId);
        const personnelle = type === "SAC_MED" && d.detenteurId === moi.sub;
        const libelle = type === "VLM" ? "VLM" : type === "SAC_ISP" ? "ISP" : personnelle ? "Mon sac" : "MSP";
        const ordre =
          type === "SAC_MED" ? 0 : type === "VLM" ? 1 : moi.fonction === "ISP" ? 0 : 2;
        return { ...d, libelle, ordre };
      })
      .sort((a, b) => a.ordre - b.ordre)
      .map(({ ordre: _ordre, ...d }) => d);

    return { version, produits, modeles, dotations: dotationsVisibles, destinataires, cis };
  });
