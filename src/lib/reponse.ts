import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ErreurHttp } from "./auth";

/**
 * Enveloppe commune à toutes les routes : une erreur métier devient un message
 * lisible, une erreur de validation liste les champs, le reste est masqué.
 */
export function gerer<T>(travail: () => Promise<T>): Promise<NextResponse> {
  return travail()
    .then((donnees) => NextResponse.json(donnees ?? { ok: true }))
    .catch((e: unknown) => {
      if (e instanceof ErreurHttp) {
        return NextResponse.json({ erreur: e.message }, { status: e.statut });
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          {
            erreur: "Requête invalide.",
            champs: e.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      console.error(e);
      const message = e instanceof Error ? e.message : "Erreur interne.";
      return NextResponse.json({ erreur: message }, { status: 500 });
    });
}
