"use client";

import type { Produit } from "./stockage";

/**
 * Recherche locale. Doit accepter les termes partiels, les noms commerciaux et
 * les couleurs : « perf » donne Perfalgan et le perfuseur, « 18 » et « vert »
 * donnent le même cathéter, puisque la couleur et le calibre sont la même
 * information (arbitrage du 10/09).
 */

const sansAccent = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");

export type ProduitIndexe = Produit & { _index: string; _debut: string };

export function indexer(produits: Produit[]): ProduitIndexe[] {
  return produits.map((p) => ({
    ...p,
    _debut: sansAccent(p.designation),
    _index: sansAccent(
      [p.designation, p.dci, p.nomCommercial, p.gamme, p.code, ...p.synonymes]
        .filter(Boolean)
        .join(" "),
    ),
  }));
}

/**
 * Le tri privilégie ce que l'utilisateur sort le plus souvent : à pertinence
 * égale, un produit déjà utilisé remonte au-dessus d'un produit jamais sorti.
 */
export function chercher(
  index: ProduitIndexe[],
  requete: string,
  options: { frequents?: string[]; inclureEquipements?: boolean; limite?: number } = {},
): ProduitIndexe[] {
  const { frequents = [], inclureEquipements = false, limite = 40 } = options;
  const termes = sansAccent(requete).split(/\s+/).filter(Boolean);
  if (termes.length === 0) return [];

  const rang = new Map(frequents.map((id, i) => [id, i]));
  const resultats: { p: ProduitIndexe; score: number }[] = [];

  for (const p of index) {
    if (!inclureEquipements && !p.estConsommable) continue;
    if (!termes.every((t) => p._index.includes(t))) continue;

    let score = 0;
    const premier = termes[0]!;
    if (p._debut.startsWith(premier)) score += 100;
    else if (p._debut.includes(` ${premier}`)) score += 60;
    else if (p._debut.includes(premier)) score += 30;
    if (rang.has(p.id)) score += 40 - Math.min(39, rang.get(p.id)!);

    resultats.push({ p, score });
  }

  return resultats
    .sort((a, b) => b.score - a.score || a.p._debut.localeCompare(b.p._debut, "fr"))
    .slice(0, limite)
    .map((r) => r.p);
}
