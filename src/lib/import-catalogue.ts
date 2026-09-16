import * as XLSX from "xlsx";
import type { CategorieProduit, Fonction, TypeDotation } from "@prisma/client";
import { prisma, bumpVersionCatalogue } from "./db";
import { hacher } from "./auth";
import { nomComplet } from "./personne";

/**
 * Import du catalogue depuis le classeur validé, déclenché par l'écran
 * d'administration. Idempotent : relançable à chaque nouvelle version du fichier.
 * Les produits sont appariés sur leur code (P001…), les compositions remplacées
 * en bloc. Rien n'est inventé : une cellule vide reste vide.
 */

const CATEGORIES: Record<string, CategorieProduit> = {
  "Medicament": "MEDICAMENT",
  "Médicament": "MEDICAMENT",
  "Solute / antiseptique": "SOLUTE",
  "Soluté / antiseptique": "SOLUTE",
  "DM injection-perfusion-prelevement": "DM_INJECTION",
  "DM injection-perfusion-prélèvement": "DM_INJECTION",
  "Voies aeriennes / ventilation": "VOIES_AERIENNES",
  "Voies aériennes / ventilation": "VOIES_AERIENNES",
  "Pansement / soin / chirurgie": "PANSEMENT",
  "Hygiene / protection": "HYGIENE",
  "Hygiène / protection": "HYGIENE",
  "Divers / administratif": "DIVERS",
  "Equipement non consommable": "EQUIPEMENT",
  "Équipement non consommable": "EQUIPEMENT",
};

const TYPES: Record<string, TypeDotation> = { SAC_ISP: "SAC_ISP", SAC_MED: "SAC_MED", VLM: "VLM" };
/**
 * Le classeur écrit la fonction en clair (« MEDECIN »), le code n'acceptait
 * jusqu'ici que le sigle de l'énum (« MSP ») : les 16 médecins du classeur
 * (dont Ben) tombaient donc tous dans le « ISP par défaut » ci-dessous, sans
 * avertissement voyant puisqu'un ISP est une valeur valide en soi (bug
 * découvert le 16/09/2026 — pastille « Mon sac » disparue chez Ben après un
 * ré-import). Alias tolérant à l'accent et à la casse.
 */
const FONCTIONS_ALIAS: Record<string, Fonction> = {
  ISP: "ISP",
  MSP: "MSP",
  MEDECIN: "MSP",
  "MÉDECIN": "MSP",
  CONDUCTEUR: "CONDUCTEUR",
  PHARMACIEN: "PHARMACIEN",
  ADMIN: "ADMIN",
};
/// Accès VLM (SMUR sapeurs-pompiers) accordé par défaut à tous les ISP, plus ces
/// trois matricules nommément désignés par Ben (Blonstein, Pereira, Alaux).
/// Provisoire : la V2 prévoit des droits plus fins par profil (ISP / ISP VLM /
/// Médecin / Médecin VLM) — décision du 14/09/2026, à revoir alors.
const MATRICULES_VLM = new Set(["5173", "4887", "5095"]);

const texte = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const oui = (v: unknown) => texte(v).toUpperCase().startsWith("O");
const entier = (v: unknown) => {
  const n = Number(texte(v).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export type ResultatImport = {
  produitsCrees: number;
  produitsMisAJour: number;
  lignesComposition: number;
  lignesIgnorees: number;
  modeles: number;
  utilisateurs: number;
  destinataires: number;
  version: number;
  avertissements: string[];
};

export async function importerCatalogue(fichier: ArrayBuffer): Promise<ResultatImport> {
  const wb = XLSX.read(fichier, { type: "array" });
  const avertissements: string[] = [];

  const feuille = (nom: string): Record<string, unknown>[] => {
    const ws = wb.Sheets[nom];
    if (!ws) throw new Error(`L'onglet « ${nom} » est absent du classeur.`);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  };

  // ------------------------------------------------------------------- CIS
  const cisParCode = new Map<string, string>();
  if (wb.SheetNames.includes("CIS")) {
    for (const l of feuille("CIS")) {
      const code = texte(l["CODE"]);
      if (!code) continue;
      const cis = await prisma.cis.upsert({
        where: { code },
        create: { code, nom: texte(l["NOM"]) || code },
        update: { nom: texte(l["NOM"]) || code },
      });
      cisParCode.set(code, cis.id);
    }
  }

  // -------------------------------------------------------------- PRODUITS
  // Écritures groupées plutôt qu'une requête par produit : sur un premier import
  // (des centaines de lignes), l'aller-retour un par un vers la base risquait de
  // dépasser la limite de temps de la fonction serveur.
  const idParCode = new Map<string, string>();
  let produitsCrees = 0;
  let produitsMisAJour = 0;

  type DonneesProduit = {
    designation: string;
    gamme: string | null;
    dci: string | null;
    nomCommercial: string | null;
    unite: string;
    categorie: CategorieProduit;
    synonymes: string[];
    estConsommable: boolean;
    estMedicament: boolean;
    actif: boolean;
    remarque: string | null;
  };
  type LigneProduit = { code: string; designation: string; data: DonneesProduit };
  const lignesProduits: LigneProduit[] = [];
  for (const l of feuille("PRODUITS")) {
    const code = texte(l["ID"]);
    const designation = texte(l["DESIGNATION"]);
    if (!code || !designation) continue;

    const brute = texte(l["CATEGORIE"]);
    const categorie = CATEGORIES[brute];
    if (!categorie) throw new Error(`Catégorie inconnue pour ${code} : « ${brute} ».`);

    lignesProduits.push({
      code,
      designation,
      data: {
        designation,
        gamme: texte(l["GAMME"]) || null,
        dci: texte(l["DCI"]) || null,
        nomCommercial: texte(l["NOM COMMERCIAL"]) || null,
        unite: texte(l["UNITE"]) || "unité",
        categorie,
        synonymes: texte(l["SYNONYMES DE RECHERCHE"])
          .split(";")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
        estConsommable: oui(l["CONSOMMABLE"]),
        estMedicament: oui(l["MEDICAMENT"]),
        actif: texte(l["STATUT"]).toUpperCase() !== "INACTIF",
        remarque: texte(l["A VERIFIER"]) || null,
      },
    });
  }

  const codesExistants = new Set(
    (
      await prisma.produit.findMany({
        where: { code: { in: lignesProduits.map((p) => p.code) } },
        select: { code: true },
      })
    ).map((p) => p.code),
  );
  const aCreer = lignesProduits.filter((p) => !codesExistants.has(p.code));
  const aMettreAJour = lignesProduits.filter((p) => codesExistants.has(p.code));

  if (aCreer.length > 0) {
    await prisma.produit.createMany({
      data: aCreer.map((p) => ({ code: p.code, ...p.data })),
      skipDuplicates: true,
    });
  }
  // Chaque produit peut avoir une donnée différente : la mise à jour reste une
  // requête par ligne, mais lancée en parallèle plutôt qu'en séquence.
  await Promise.all(
    aMettreAJour.map((p) => prisma.produit.update({ where: { code: p.code }, data: p.data })),
  );
  produitsCrees = aCreer.length;
  produitsMisAJour = aMettreAJour.length;

  for (const p of await prisma.produit.findMany({
    where: { code: { in: lignesProduits.map((l) => l.code) } },
    select: { id: true, code: true },
  })) {
    idParCode.set(p.code, p.id);
  }

  // ------------------------------------------------------------- DOTATIONS
  // Peu de lignes en général, mais lancées en parallèle par cohérence avec le
  // reste de l'import.
  const lignesDotations = feuille("DOTATIONS")
    .map((l) => ({ code: texte(l["CODE"]), l }))
    .filter((x) => x.code);
  for (const { code, l } of lignesDotations) {
    if (!TYPES[texte(l["TYPE"])]) throw new Error(`Type de dotation inconnu : « ${texte(l["TYPE"])} » (${code}).`);
  }
  const modeleParCode = new Map<string, string>(
    await Promise.all(
      lignesDotations.map(async ({ code, l }) => {
        const type = TYPES[texte(l["TYPE"])];
        const modele = await prisma.modeleDotation.upsert({
          where: { code },
          create: { code, type, libelle: texte(l["LIBELLE"]) || code },
          update: { libelle: texte(l["LIBELLE"]) || code },
        });
        await prisma.dotation.upsert({
          where: { identifiant: code },
          create: {
            modeleId: modele.id,
            identifiant: code,
            portee: texte(l["PORTEE"]) === "COLLECTIF" ? "COLLECTIF" : "INDIVIDUEL",
          },
          update: {},
        });
        return [code, modele.id] as const;
      }),
    ),
  );

  // ----------------------------------------------------------- COMPOSITION
  const parModele = new Map<
    string,
    { produitId: string; quantiteTheorique: number; emplacement: string | null }[]
  >();
  let lignesIgnorees = 0;
  let lignesComposition = 0;

  for (const l of feuille("COMPOSITION")) {
    const modeleId = modeleParCode.get(texte(l["DOTATION"]));
    const produitId = idParCode.get(texte(l["PRODUIT ID"]));
    if (!modeleId || !produitId) {
      lignesIgnorees++;
      continue;
    }
    // Informatif en V1, prévu pour le contrôle de dotation en V2.
    const emplacement = texte(l["EMPLACEMENT (info, V2)"]) || null;
    const quantiteTheorique = entier(l["QUANTITE THEORIQUE"]);

    const liste = parModele.get(modeleId) ?? [];
    const deja = liste.find((x) => x.produitId === produitId && x.emplacement === emplacement);
    if (deja) {
      // Le même produit listé deux fois au même endroit vient d'une ambiguïté du
      // document source, pas d'un stock double : on retient la plus grande des
      // deux quantités et on le signale plutôt que d'échouer.
      avertissements.push(
        `${texte(l["DESIGNATION"]) || texte(l["PRODUIT ID"])} apparaît deux fois dans « ${
          emplacement ?? texte(l["DOTATION"])
        } » (${deja.quantiteTheorique} et ${quantiteTheorique}) : ${Math.max(
          deja.quantiteTheorique,
          quantiteTheorique,
        )} retenu, à trancher dans le classeur.`,
      );
      deja.quantiteTheorique = Math.max(deja.quantiteTheorique, quantiteTheorique);
      continue;
    }

    liste.push({ produitId, quantiteTheorique, emplacement });
    parModele.set(modeleId, liste);
    lignesComposition++;
  }
  if (lignesIgnorees > 0) {
    avertissements.push(
      `${lignesIgnorees} ligne(s) de composition ignorée(s) : code produit ou dotation inconnu.`,
    );
  }

  for (const [modeleId, lignes] of parModele) {
    await prisma.$transaction([
      prisma.modeleLigne.deleteMany({ where: { modeleId } }),
      prisma.modeleLigne.createMany({ data: lignes.map((l) => ({ modeleId, ...l })) }),
      prisma.modeleDotation.update({ where: { id: modeleId }, data: { version: { increment: 1 } } }),
    ]);
  }

  // --------------------------------------------------------- UTILISATEURS
  // Le hachage du mot de passe (argon2) et l'écriture en base se font en
  // parallèle par utilisateur plutôt qu'en séquence : sur 80+ comptes, faire
  // les deux l'un après l'autre pour chacun risquait, cumulé au reste de
  // l'import, de dépasser la limite de temps de la fonction serveur.
  let utilisateurs = 0;
  if (wb.SheetNames.includes("UTILISATEURS")) {
    const premierCompte = (await prisma.utilisateur.count()) === 0;

    const lignesUtil = feuille("UTILISATEURS")
      // « NOM (+PRENOM) » : classeur où le nom complet n'est pas scindé (source sans prénom séparé).
      .map((l) => ({ l, matricule: texte(l["MATRICULE"]), nom: texte(l["NOM"]) || texte(l["NOM (+PRENOM)"]) }))
      .filter(({ matricule, nom }) => matricule && nom && nom.toUpperCase() !== "EXEMPLE");

    const existantsUtil = new Map(
      (
        await prisma.utilisateur.findMany({
          where: { matricule: { in: lignesUtil.map((x) => x.matricule) } },
          select: { id: true, matricule: true },
        })
      ).map((u) => [u.matricule, u.id] as const),
    );

    const resultats = await Promise.all(
      lignesUtil.map(async ({ l, matricule, nom }, rang) => {
        const brute = texte(l["FONCTION"]).toUpperCase();
        const fonction: Fonction = FONCTIONS_ALIAS[brute] ?? "ISP";
        if (!FONCTIONS_ALIAS[brute]) {
          avertissements.push(`Fonction « ${brute} » inconnue pour ${nom} : ISP par défaut.`);
        }

        const cisId = cisParCode.get(texte(l["CIS"])) ?? null;
        const actif = texte(l["ACTIF"]) === "" ? true : oui(l["ACTIF"]);
        const estAdmin = premierCompte && rang === 0;
        // Recalculé à chaque import : un ISP nouvellement ajouté récupère l'accès
        // VLM automatiquement, sans repasser par l'administration.
        const accesVLM = fonction === "ISP" || MATRICULES_VLM.has(matricule);
        const existantId = existantsUtil.get(matricule);

        const utilisateur = existantId
          ? await prisma.utilisateur.update({
              where: { matricule },
              data: { nom, prenom: texte(l["PRENOM"]), fonction, cisId, actif, accesVLM },
            })
          : await prisma.utilisateur.create({
              data: {
                matricule,
                nom,
                prenom: texte(l["PRENOM"]),
                fonction,
                // Le tout premier utilisateur importé devient administrateur — droit
                // technique séparé de la fonction professionnelle (voir schéma) :
                // il reste ISP/MSP/etc., il n'est pas transformé en « ADMIN ».
                admin: estAdmin,
                accesVLM,
                cisId,
                actif,
                // Mot de passe initial = matricule, haché. Jamais stocké en clair.
                mdpHash: await hacher(matricule),
              },
            });

        if (estAdmin) {
          avertissements.push(
            `${nomComplet(utilisateur.prenom, utilisateur.nom)} a reçu le rôle administrateur (premier compte créé).`,
          );
        }
        return { utilisateur, codeDotation: texte(l["DOTATION HABITUELLE"]) };
      }),
    );

    /**
     * Un code de dotation individuelle ne doit être réclamé que par un seul
     * compte : deux comptes pointant sur le même code (erreur de saisie dans
     * l'onglet, cf. Alaux/Blonstein sur SAC_MED_BLONSTEIN le 16/09/2026)
     * lançaient auparavant deux `update` en parallèle, et le dernier à finir
     * gagnait silencieusement — sans avertissement, sans garantie d'ordre.
     * Le regroupement ci-dessous détecte le conflit et laisse le detenteur
     * actuel intact plutôt que de deviner.
     */
    const parCodeDotation = new Map<string, { matricule: string; nom: string; utilisateurId: string }[]>();
    for (const { utilisateur, codeDotation } of resultats) {
      if (!codeDotation) continue;
      const liste = parCodeDotation.get(codeDotation) ?? [];
      liste.push({ matricule: utilisateur.matricule, nom: utilisateur.nom, utilisateurId: utilisateur.id });
      parCodeDotation.set(codeDotation, liste);
    }

    await Promise.all(
      Array.from(parCodeDotation.entries()).map(([codeDotation, claimants]) => {
        if (claimants.length > 1) {
          avertissements.push(
            `Dotation « ${codeDotation} » réclamée par plusieurs comptes (${claimants
              .map((c) => `${c.nom} #${c.matricule}`)
              .join(", ")}) : detenteur non modifié, à corriger dans le classeur.`,
          );
          return undefined;
        }
        return prisma.dotation
          .update({ where: { identifiant: codeDotation }, data: { detenteurId: claimants[0].utilisateurId } })
          .catch(() => undefined);
      }),
    );
    utilisateurs = resultats.length;
  }

  // --------------------------------------------------------- DESTINATAIRES
  let destinataires = 0;
  if (wb.SheetNames.includes("DESTINATAIRES")) {
    const lignes = feuille("DESTINATAIRES")
      .filter((l) => texte(l["EMAIL"]).includes("@"))
      .map((l, i) => ({
        libelle: texte(l["LIBELLE"]),
        email: texte(l["EMAIL"]),
        cocheParDefaut: oui(l["COCHE PAR DEFAUT"]),
        actif: texte(l["ACTIF"]) === "" ? true : oui(l["ACTIF"]),
        ordre: i,
      }));
    if (lignes.length > 0) {
      await prisma.$transaction([
        prisma.destinataire.deleteMany({}),
        prisma.destinataire.createMany({ data: lignes }),
      ]);
      destinataires = lignes.length;
    } else {
      avertissements.push(
        "Aucun destinataire importé : la colonne e-mail de l'onglet DESTINATAIRES est vide.",
      );
    }
  }

  return {
    produitsCrees,
    produitsMisAJour,
    lignesComposition,
    lignesIgnorees,
    modeles: modeleParCode.size,
    utilisateurs,
    destinataires,
    version: await bumpVersionCatalogue(),
    avertissements,
  };
}
