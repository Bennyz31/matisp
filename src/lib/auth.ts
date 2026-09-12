import argon2 from "argon2";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Fonction } from "@prisma/client";
import { prisma } from "./db";

/**
 * Le secret n'est pas à saisir : s'il n'est pas fourni, on le dérive de la chaîne
 * de connexion à la base, qui est déjà secrète et stable. Une variable de moins
 * à configurer, et aucun risque d'oublier de la changer.
 */
function secret(): Uint8Array {
  const source = process.env.JWT_SECRET || process.env.DATABASE_URL || "";
  if (!source) throw new Error("Ni JWT_SECRET ni DATABASE_URL ne sont configurés.");
  return crypto.createHash("sha256").update(`matisp:${source}`).digest();
}

const JOURS_SESSION = 90;

export type Jeton = { sub: string; fonction: Fonction; nom: string };

const OPTIONS_ARGON: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const hacher = (valeur: string) => argon2.hash(valeur, OPTIONS_ARGON);

export async function verifierMotDePasse(hash: string, valeur: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, valeur);
  } catch {
    return false;
  }
}

export async function signerJeton(j: Jeton): Promise<string> {
  return new SignJWT({ fonction: j.fonction, nom: j.nom })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(j.sub)
    .setIssuedAt()
    .setExpirationTime(`${JOURS_SESSION}d`)
    .sign(secret());
}

export async function lireJeton(jeton: string): Promise<Jeton | null> {
  try {
    const { payload } = await jwtVerify(jeton, secret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      fonction: payload.fonction as Fonction,
      nom: String(payload.nom ?? ""),
    };
  } catch {
    return null;
  }
}

/** Lit le jeton d'une requête API. Renvoie null plutôt que de lever : l'appelant décide. */
export async function utilisateurDeLaRequete(req: Request): Promise<Jeton | null> {
  const entete = req.headers.get("authorization");
  if (!entete?.startsWith("Bearer ")) return null;
  return lireJeton(entete.slice(7));
}

export class ErreurHttp extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

export async function exigerUtilisateur(req: Request): Promise<Jeton> {
  const u = await utilisateurDeLaRequete(req);
  if (!u) throw new ErreurHttp(401, "Reconnecte-toi.");
  return u;
}

export async function exigerAdmin(req: Request): Promise<Jeton> {
  const u = await exigerUtilisateur(req);
  if (u.fonction !== "ADMIN") throw new ErreurHttp(403, "Réservé aux administrateurs.");
  return u;
}

/**
 * Au tout premier lancement, aucun compte n'existe : le premier utilisateur importé
 * ou créé devient administrateur, sinon personne ne pourrait ouvrir l'administration.
 */
export async function aucunCompte(): Promise<boolean> {
  return (await prisma.utilisateur.count()) === 0;
}
