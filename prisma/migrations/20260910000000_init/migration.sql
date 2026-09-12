-- MATISP — schéma initial

CREATE TYPE "Fonction" AS ENUM ('ISP', 'MSP', 'CONDUCTEUR', 'PHARMACIEN', 'ADMIN');
CREATE TYPE "TypeDotation" AS ENUM ('SAC_ISP', 'SAC_MED', 'VLM');
CREATE TYPE "PorteeDotation" AS ENUM ('INDIVIDUEL', 'COLLECTIF');
CREATE TYPE "CategorieProduit" AS ENUM ('MEDICAMENT', 'SOLUTE', 'DM_INJECTION', 'VOIES_AERIENNES', 'PANSEMENT', 'HYGIENE', 'DIVERS', 'EQUIPEMENT');
CREATE TYPE "StatutIntervention" AS ENUM ('BROUILLON', 'TERMINEE', 'ENVOYEE', 'CLOTUREE');
CREATE TYPE "TypeConsommation" AS ENUM ('CONSOMME', 'PERDU', 'CASSE');
CREATE TYPE "RoleIntervention" AS ENUM ('CREATEUR', 'CONTRIBUTEUR');
CREATE TYPE "StatutEnvoi" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC');

CREATE TABLE "Cis" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Cis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cis_code_key" ON "Cis"("code");

CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "fonction" "Fonction" NOT NULL,
    "cisId" TEXT,
    "mdpHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Utilisateur_matricule_key" ON "Utilisateur"("matricule");
CREATE INDEX "Utilisateur_nom_prenom_idx" ON "Utilisateur"("nom", "prenom");

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereUtilLe" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");
CREATE INDEX "Session_utilisateurId_idx" ON "Session"("utilisateurId");

CREATE TABLE "Produit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "gamme" TEXT,
    "dci" TEXT,
    "nomCommercial" TEXT,
    "unite" TEXT NOT NULL DEFAULT 'unité',
    "categorie" "CategorieProduit" NOT NULL,
    "synonymes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estConsommable" BOOLEAN NOT NULL DEFAULT true,
    "estMedicament" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "remarque" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Produit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Produit_code_key" ON "Produit"("code");
CREATE INDEX "Produit_categorie_idx" ON "Produit"("categorie");
CREATE INDEX "Produit_gamme_idx" ON "Produit"("gamme");

CREATE TABLE "ModeleDotation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TypeDotation" NOT NULL,
    "libelle" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "majLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModeleDotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModeleDotation_code_key" ON "ModeleDotation"("code");

CREATE TABLE "ModeleLigne" (
    "id" TEXT NOT NULL,
    "modeleId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantiteTheorique" INTEGER NOT NULL DEFAULT 0,
    "emplacement" TEXT,
    "remarque" TEXT,
    CONSTRAINT "ModeleLigne_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModeleLigne_modeleId_produitId_emplacement_key" ON "ModeleLigne"("modeleId", "produitId", "emplacement");
CREATE INDEX "ModeleLigne_modeleId_idx" ON "ModeleLigne"("modeleId");

CREATE TABLE "Dotation" (
    "id" TEXT NOT NULL,
    "modeleId" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "portee" "PorteeDotation" NOT NULL,
    "cisId" TEXT,
    "detenteurId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Dotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Dotation_identifiant_key" ON "Dotation"("identifiant");
CREATE INDEX "Dotation_cisId_idx" ON "Dotation"("cisId");
CREATE INDEX "Dotation_detenteurId_idx" ON "Dotation"("detenteurId");

CREATE TABLE "Protocole" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Protocole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Protocole_code_key" ON "Protocole"("code");

CREATE TABLE "ProtocoleProduit" (
    "id" TEXT NOT NULL,
    "protocoleId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantiteSuggeree" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProtocoleProduit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProtocoleProduit_protocoleId_produitId_key" ON "ProtocoleProduit"("protocoleId", "produitId");

CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "crss" TEXT,
    "debutLe" TIMESTAMP(3) NOT NULL,
    "finLe" TIMESTAMP(3),
    "statut" "StatutIntervention" NOT NULL DEFAULT 'BROUILLON',
    "verrouilleeLe" TIMESTAMP(3),
    "clotureeLe" TIMESTAMP(3),
    "protocoleId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Intervention_crss_idx" ON "Intervention"("crss");
CREATE INDEX "Intervention_statut_idx" ON "Intervention"("statut");
CREATE INDEX "Intervention_debutLe_idx" ON "Intervention"("debutLe");

CREATE TABLE "InterventionUtilisateur" (
    "interventionId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "role" "RoleIntervention" NOT NULL DEFAULT 'CONTRIBUTEUR',
    "rejointLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionUtilisateur_pkey" PRIMARY KEY ("interventionId", "utilisateurId")
);
CREATE INDEX "InterventionUtilisateur_utilisateurId_idx" ON "InterventionUtilisateur"("utilisateurId");

CREATE TABLE "InterventionDotation" (
    "interventionId" TEXT NOT NULL,
    "dotationId" TEXT NOT NULL,
    CONSTRAINT "InterventionDotation_pkey" PRIMARY KEY ("interventionId", "dotationId")
);

CREATE TABLE "Consommation" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "dotationId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "type" "TypeConsommation" NOT NULL DEFAULT 'CONSOMME',
    "commentaire" TEXT,
    "saisiLe" TIMESTAMP(3) NOT NULL,
    "synchroLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consommation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Consommation_interventionId_idx" ON "Consommation"("interventionId");
CREATE INDEX "Consommation_utilisateurId_idx" ON "Consommation"("utilisateurId");
CREATE INDEX "Consommation_produitId_idx" ON "Consommation"("produitId");

CREATE TABLE "Destinataire" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cocheParDefaut" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Destinataire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Envoi" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "destinataires" TEXT[],
    "pdfChemin" TEXT,
    "statut" "StatutEnvoi" NOT NULL DEFAULT 'EN_ATTENTE',
    "erreur" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyeLe" TIMESTAMP(3),
    CONSTRAINT "Envoi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Envoi_interventionId_idx" ON "Envoi"("interventionId");

CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "action" TEXT NOT NULL,
    "cible" TEXT,
    "detail" TEXT,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Journal_horodatage_idx" ON "Journal"("horodatage");

CREATE TABLE "MetaCatalogue" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "majLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaCatalogue_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_cisId_fkey" FOREIGN KEY ("cisId") REFERENCES "Cis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModeleLigne" ADD CONSTRAINT "ModeleLigne_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "ModeleDotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModeleLigne" ADD CONSTRAINT "ModeleLigne_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dotation" ADD CONSTRAINT "Dotation_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "ModeleDotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dotation" ADD CONSTRAINT "Dotation_cisId_fkey" FOREIGN KEY ("cisId") REFERENCES "Cis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dotation" ADD CONSTRAINT "Dotation_detenteurId_fkey" FOREIGN KEY ("detenteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProtocoleProduit" ADD CONSTRAINT "ProtocoleProduit_protocoleId_fkey" FOREIGN KEY ("protocoleId") REFERENCES "Protocole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProtocoleProduit" ADD CONSTRAINT "ProtocoleProduit_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_protocoleId_fkey" FOREIGN KEY ("protocoleId") REFERENCES "Protocole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterventionUtilisateur" ADD CONSTRAINT "InterventionUtilisateur_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterventionUtilisateur" ADD CONSTRAINT "InterventionUtilisateur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterventionDotation" ADD CONSTRAINT "InterventionDotation_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterventionDotation" ADD CONSTRAINT "InterventionDotation_dotationId_fkey" FOREIGN KEY ("dotationId") REFERENCES "Dotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consommation" ADD CONSTRAINT "Consommation_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consommation" ADD CONSTRAINT "Consommation_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consommation" ADD CONSTRAINT "Consommation_dotationId_fkey" FOREIGN KEY ("dotationId") REFERENCES "Dotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consommation" ADD CONSTRAINT "Consommation_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Envoi" ADD CONSTRAINT "Envoi_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
