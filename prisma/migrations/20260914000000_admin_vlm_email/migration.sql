-- MATISP — droit admin séparé de la fonction, accès VLM, e-mail personnel

ALTER TABLE "Utilisateur" ADD COLUMN "admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Utilisateur" ADD COLUMN "accesVLM" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Utilisateur" ADD COLUMN "email" TEXT;

-- Réparation : le bootstrap du tout premier import avait écrasé la fonction
-- professionnelle du premier compte par "ADMIN". On restaure le droit admin
-- comme un attribut séparé, et on rend sa vraie fonction (médecin, matricule
-- 5173) à ce compte.
UPDATE "Utilisateur" SET "admin" = true WHERE "fonction" = 'ADMIN';
UPDATE "Utilisateur" SET "fonction" = 'MSP' WHERE "matricule" = '5173' AND "fonction" = 'ADMIN';

-- Accès VLM : tous les ISP, plus les trois matricules nommés par Ben
-- (Blonstein, Pereira, Alaux). Provisoire, à affiner en V2.
UPDATE "Utilisateur" SET "accesVLM" = true WHERE "fonction" = 'ISP';
UPDATE "Utilisateur" SET "accesVLM" = true WHERE "matricule" IN ('5173', '4887', '5095');
