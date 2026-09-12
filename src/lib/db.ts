import { PrismaClient } from "@prisma/client";

// En développement, Next recharge les modules à chaque édition : sans ce cache
// global, on ouvrirait une connexion de plus à chaque sauvegarde de fichier.
const global_ = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  global_.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") global_.prisma = prisma;

/** Le téléphone ne retélécharge le catalogue que si ce numéro a bougé. */
export async function versionCatalogue(): Promise<number> {
  const meta = await prisma.metaCatalogue.findUnique({ where: { id: 1 } });
  return meta?.version ?? 0;
}

export async function bumpVersionCatalogue(): Promise<number> {
  const meta = await prisma.metaCatalogue.upsert({
    where: { id: 1 },
    create: { id: 1, version: 1 },
    update: { version: { increment: 1 } },
  });
  return meta.version;
}

export async function journaliser(
  utilisateurId: string | null,
  action: string,
  cible?: string,
  detail?: string,
): Promise<void> {
  try {
    await prisma.journal.create({
      data: { utilisateurId, action, cible: cible ?? null, detail: detail ?? null },
    });
  } catch {
    // Le journal ne doit jamais faire échouer une opération métier.
  }
}
