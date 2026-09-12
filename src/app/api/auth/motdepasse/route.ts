import { z } from "zod";
import { prisma, journaliser } from "@/lib/db";
import { ErreurHttp, exigerUtilisateur, hacher, verifierMotDePasse } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { ancien, nouveau } = z
      .object({ ancien: z.string().min(1), nouveau: z.string().min(4, "4 caractères minimum.") })
      .parse(await req.json());

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: moi.sub } });
    if (!(await verifierMotDePasse(utilisateur.mdpHash, ancien))) {
      throw new ErreurHttp(400, "Mot de passe actuel incorrect.");
    }
    await prisma.utilisateur.update({
      where: { id: moi.sub },
      data: { mdpHash: await hacher(nouveau) },
    });
    await journaliser(moi.sub, "CHANGEMENT_MDP");
    return { ok: true };
  });
