import { z } from "zod";
import { prisma, journaliser } from "@/lib/db";
import { ErreurHttp, exigerUtilisateur } from "@/lib/auth";
import { gerer } from "@/lib/reponse";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const corps = z.object({
  interventionId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  destinataireIds: z.array(z.string().uuid()).min(1, "Coche au moins un destinataire."),
  /// PDF produit sur le téléphone : il existe donc aussi hors connexion.
  pdfBase64: z.string().min(100),
  nomFichier: z.string().max(120).default("reassort.pdf"),
});

/**
 * Envoi différé : jamais automatique en fin d'intervention (règle impérative n°10).
 * Le PDF est fabriqué par le téléphone et transmis ici pour expédition, ce qui
 * garantit que le document vu à l'aperçu est exactement celui qui part.
 */
export const POST = (req: Request) =>
  gerer(async () => {
    const moi = await exigerUtilisateur(req);
    const { interventionId, destinataireIds, pdfBase64, nomFichier } = corps.parse(await req.json());

    const lien = await prisma.interventionUtilisateur.findUnique({
      where: { interventionId_utilisateurId: { interventionId, utilisateurId: moi.sub } },
    });
    if (!lien) throw new ErreurHttp(403, "Tu ne participes pas à cette intervention.");

    const intervention = await prisma.intervention.findUnique({ where: { id: interventionId } });
    if (!intervention) throw new ErreurHttp(404, "Intervention introuvable.");

    const destinataires = await prisma.destinataire.findMany({
      where: { id: { in: destinataireIds }, actif: true },
    });
    if (destinataires.length === 0) throw new ErreurHttp(400, "Aucun destinataire valide.");

    const cle = process.env.RESEND_API_KEY;
    const expediteur = process.env.RESEND_FROM || "MATISP <onboarding@resend.dev>";

    const dateFr = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Paris",
    }).format(intervention.debutLe);

    const envoi = await prisma.envoi.create({
      data: {
        interventionId,
        destinataires: destinataires.map((d) => d.email),
        statut: "EN_ATTENTE",
      },
    });

    // Sans clé d'envoi configurée, on ne perd rien : le PDF existe déjà sur le
    // téléphone, l'appli propose alors de le partager par la messagerie du mobile.
    if (!cle) {
      await journaliser(moi.sub, "ENVOI_SANS_MESSAGERIE", interventionId);
      return {
        envoi,
        messagerieConfiguree: false,
        destinataires: destinataires.map((d) => ({ libelle: d.libelle, email: d.email })),
      };
    }

    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: destinataires.map((d) => d.email),
        subject: `Réassort MATISP — ${intervention.crss ?? "sans CRSS"} — ${dateFr}`,
        text: [
          "Liste de réassort générée par MATISP.",
          "",
          `Intervention du ${dateFr}`,
          `CRSS : ${intervention.crss ?? "non renseigné"}`,
          `Déclarée par ${moi.nom}`,
          "",
          "Le détail est dans le PDF joint.",
          "Ce message ne contient aucune donnée nominative de patient.",
        ].join("\n"),
        attachments: [{ filename: nomFichier, content: pdfBase64 }],
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      await prisma.envoi.update({
        where: { id: envoi.id },
        data: { statut: "ECHEC", erreur: detail.slice(0, 400) },
      });
      throw new ErreurHttp(502, "L'envoi a échoué. Le PDF reste disponible sur le téléphone.");
    }

    const maj = await prisma.envoi.update({
      where: { id: envoi.id },
      data: { statut: "ENVOYE", envoyeLe: new Date() },
    });
    await prisma.intervention.update({
      where: { id: interventionId },
      data: { statut: "ENVOYEE" },
    });
    await journaliser(
      moi.sub,
      "ENVOI",
      interventionId,
      destinataires.map((d) => d.libelle).join(", "),
    );

    return { envoi: maj, messagerieConfiguree: true };
  });
