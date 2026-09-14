import { z } from "zod";
import { prisma, journaliser } from "@/lib/db";
import { exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

/** Permet à un utilisateur de renseigner ou modifier sa propre adresse mail,
 * utilisée pour s'envoyer une copie des réassorts (écran d'envoi). */
export const POST = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { email } = z
      .object({ email: z.string().email("Adresse mail invalide.").nullable() })
      .parse(await req.json());

    await prisma.utilisateur.update({ where: { id: moi.sub }, data: { email } });
    await journaliser(moi.sub, "MAJ_EMAIL");
    return { ok: true, email };
  });
