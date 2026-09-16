import { z } from "zod";
import { prisma, journaliser } from "@/lib/db";
import { ErreurHttp, signerJeton, verifierMotDePasse } from "@/lib/auth";
import { gerer } from "@/lib/reponse";
import { nomComplet } from "@/lib/personne";

export const dynamic = "force-dynamic";

const corps = z.object({ utilisateurId: z.string().uuid(), motDePasse: z.string().min(1) });

export const POST = (req: Request) =>
  gerer(async () => {
    const { utilisateurId, motDePasse } = corps.parse(await req.json());

    const utilisateur = await prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      include: { cis: true, dotationsDetenues: { include: { modele: true } } },
    });

    // Message identique dans tous les cas : on ne révèle pas si le compte existe.
    if (!utilisateur || !utilisateur.actif || !(await verifierMotDePasse(utilisateur.mdpHash, motDePasse))) {
      throw new ErreurHttp(401, "Nom ou matricule incorrect.");
    }

    await journaliser(utilisateur.id, "CONNEXION");

    return {
      jeton: await signerJeton({
        sub: utilisateur.id,
        fonction: utilisateur.fonction,
        nom: nomComplet(utilisateur.prenom, utilisateur.nom),
        admin: utilisateur.admin,
        accesVLM: utilisateur.accesVLM,
      }),
      utilisateur: {
        id: utilisateur.id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        fonction: utilisateur.fonction,
        admin: utilisateur.admin,
        accesVLM: utilisateur.accesVLM,
        email: utilisateur.email,
        cis: utilisateur.cis,
        motDePasseParDefaut: await verifierMotDePasse(utilisateur.mdpHash, utilisateur.matricule),
        dotations: utilisateur.dotationsDetenues.map((d) => ({
          id: d.id,
          identifiant: d.identifiant,
          type: d.modele.type,
        })),
      },
    };
  });
