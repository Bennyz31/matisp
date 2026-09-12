import { prisma, versionCatalogue } from "@/lib/db";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

export const GET = () =>
  gerer(async () => {
    await prisma.$queryRaw`SELECT 1`;
    const [produits, utilisateurs] = await Promise.all([
      prisma.produit.count(),
      prisma.utilisateur.count(),
    ]);
    return {
      ok: true,
      versionCatalogue: await versionCatalogue(),
      produits,
      utilisateurs,
      catalogueCharge: produits > 0,
    };
  });
