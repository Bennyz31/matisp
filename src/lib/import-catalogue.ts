import * as XLSX from "xlsx";
import argon2 from "argon2";
import type { CategorieProduit, Fonction, TypeDotation } from "@prisma/client";
import { prisma, bumpVersionCatalogue } from "./db";

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
const FONCTIONS = ["ISP", "MSP", "CONDUCTEUR", "PHARMACIEN", "ADMIN"] as const;

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
  const idParCode = new Map<string, string>();
  let produitsCrees = 0;
  let produitsMisAJour = 0;

  for (const l of feuille("PRODUITS")) {
    const code = texte(l["ID"]);
    const designation = texte(l["DESIGNATION"]);
    if (!code || !designation) continue;

    const brute = texte(l["CATEGORIE"]);
    const categorie = CATEGORIES[brute];
    if (!categorie) throw new Error(`Catégorie inconnue pour ${code} : « ${brute} ».`);

    const data = {
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
    };

    const existant = await prisma.produit.findUnique({ where: { code } });
    const produit = existant
      ? await prisma.produit.update({ where: { code }, data })
      : await prisma.produit.create({ data: { code, ...data } });
    existant ? produitsMisAJour++ : produitsCrees++;
    idParCode.set(code, produit.id);
  }

  // ------------------------------------------------------------- DOTATIONS
  const modeleParCode = new Map<string, string>();
  for (const l of feuille("DOTATIONS")) {
    const code = texte(l["CODE"]);
    if (!code) continue;
    const type = TYPES[texte(l["TYPE"])];
    if (!type) throw new Error(`Type de dotation inconnu : « ${texte(l["TYPE"])} ».`);

    const modele = await prisma.modeleDotation.upsert({
      where: { code },
      create: { code, type, libelle: texte(l["LIBELLE"]) || code },
      update: { libelle: texte(l["LIBELLE"]) || code },
    });
    modeleParCode.set(code, modele.id);

    await prisma.dotation.upsert({
      where: { identifiant: code },
      create: {
        modeleId: modele.id,
        identifiant: code,
        portee: texte(l["PORTEE"]) === "COLLECTIF" ? "COLLECTIF" : "INDIVIDUEL",
      },
      update: {},
    });
  }

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
  let utilisateurs = 0;
  if (wb.SheetNames.includes("UTILISATEURS")) {
    const premierCompte = (await prisma.utilisateur.count()) === 0;
    let rang = 0;

    for (const l of feuille("UTILISATEURS")) {
      const matricule = texte(l["MATRICULE"]);
      const nom = texte(l["NOM"]);
      if (!matricule || !nom || nom.toUpperCase() === "EXEMPLE") continue;

      const brute = texte(l["FONCTION"]).toUpperCase();
      const fonction = (FONCTIONS as readonly string[]).includes(brute)
        ? (brute as Fonction)
        : "ISP";
      if (!(FONCTIONS as readonly string[]).includes(brute)) {
        avertissements.push(`Fonction « ${brute} » inconnue pour ${nom} : ISP par défaut.`);
      }

      const cisId = cisParCode.get(texte(l["CIS"])) ?? null;
      const existant = await prisma.utilisateur.findUnique({ where: { matricule } });

      const utilisateur = existant
        ? await prisma.utilisateur.update({
            where: { matricule },
            data: {
              nom,
              prenom: texte(l["PRENOM"]),
              fonction,
              cisId,
              actif: texte(l["ACTIF"]) === "" ? true : oui(l["ACTIF"]),
            },
          })
        : await prisma.utilisateur.create({
            data: {
              matricule,
              nom,
              prenom: texte(l["PRENOM"]),
              // Le tout premier utilisateur importé devient administrateur,
              // sans quoi personne ne pourrait ouvrir cet écran ensuite.
              fonction: premierCompte && rang === 0 ? "ADMIN" : fonction,
              cisId,
              actif: texte(l["ACTIF"]) === "" ? true : oui(l["ACTIF"]),
              // Mot de passe initial = matricule, haché. Jamais stocké en clair.
              mdpHash: await argon2.hash(matricule, { type: argon2.argon2id }),
            },
          });

      if (premierCompte && rang === 0) {
        avertissements.push(
          `${utilisateur.prenom} ${utilisateur.nom} a reçu le rôle administrateur (premier compte créé).`,
        );
      }

      const codeDotation = texte(l["DOTATION HABITUELLE"]);
      if (codeDotation) {
        await prisma.dotation
          .update({ where: { identifiant: codeDotation }, data: { detenteurId: utilisateur.id } })
          .catch(() => undefined);
      }
      utilisateurs++;
      rang++;
    }
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
