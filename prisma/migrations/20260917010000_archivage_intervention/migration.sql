-- MATISP — archivage d'intervention (masque sans effacer).
-- Décision du 17/09/2026 (Ben) : tout déclarant peut archiver une
-- intervention clôturée pour ne plus la voir dans l'historique ; seul un
-- administrateur peut la supprimer pour de bon.
ALTER TABLE "Intervention" ADD COLUMN "archiveeLe" TIMESTAMP(3);
