/**
 * Beaucoup de comptes importés n'ont pas de prénom séparé (classeur source
 * avec une colonne « NOM (+PRENOM) » fusionnée) : `prenom` est alors une
 * chaîne vide. Un simple `${prenom} ${nom}` laisse un espace en trop devant
 * le nom dans ce cas (visible notamment sur la ligne « Déclarants » du PDF,
 * bug repéré par Ben le 16/09/2026). Ce filtre l'évite.
 */
export const nomComplet = (prenom: string, nom: string) => [prenom, nom].filter(Boolean).join(" ");
