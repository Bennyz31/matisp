import { prisma } from "@/lib/db";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/**
 * Liste des noms pour l'écran de connexion. Volontairement publique, et
 * volontairement sans matricule : le matricule est le mot de passe.
 */
export const GET = () =>
  gerer(async () => ({
    utilisateurs: await prisma.utilisateur.findMany({
      where: { actif: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        fonction: true,
        cis: { select: { code: true, nom: true } },
      },
    }),
  }));
