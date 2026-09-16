-- MATISP — permet de déclarer un produit absent du catalogue.
--
-- Décision du 16/09/2026 (Ben) : l'appli ne doit jamais être limitative en
-- intervention. Si un médecin utilise une drogue ou un dispositif oublié au
-- catalogue, il doit pouvoir le déclarer quand même, avec juste son nom. Le
-- catalogue reste géré à la main par Ben via le classeur (rien n'y est ajouté
-- automatiquement) : la ligne reste identifiée comme « hors catalogue » côté
-- appli jusqu'à ce qu'il l'intègre lui-même.
ALTER TABLE "Consommation" ALTER COLUMN "produitId" DROP NOT NULL;
ALTER TABLE "Consommation" ADD COLUMN "nomLibre" TEXT;
