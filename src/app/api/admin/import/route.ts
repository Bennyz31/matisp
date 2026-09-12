import { prisma } from "@/lib/db";
import { ErreurHttp, aucunCompte, exigerUtilisateur } from "@/lib/auth";
import { importerCatalogue } from "@/lib/import-catalogue";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import du catalogue par téléversement du classeur, depuis l'écran
 * d'administration. Évite toute ligne de commande.
 *
 * Tant qu'aucun compte n'existe, l'import est ouvert : c'est lui qui crée le
 * premier administrateur. Dès qu'un compte existe, il faut être administrateur.
 */
export const POST = (req: Request) =>
  gerer(async () => {
    const premierDemarrage = await aucunCompte();
    if (!premierDemarrage) {
      const moi = await exigerUtilisateur(req);
      if (moi.fonction !== "ADMIN") throw new ErreurHttp(403, "Réservé aux administrateurs.");
    }

    const donnees = await req.formData();
    const fichier = donnees.get("fichier");
    if (!(fichier instanceof File)) throw new ErreurHttp(400, "Aucun fichier reçu.");
    if (fichier.size > 8 * 1024 * 1024) throw new ErreurHttp(400, "Fichier trop volumineux (8 Mo max).");

    const resultat = await importerCatalogue(await fichier.arrayBuffer());
    return { resultat, premierDemarrage };
  });
