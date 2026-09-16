"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, jeton, rafraichirCatalogue } from "@/client/session";
import { Barre, Chargement } from "@/client/ui";

type Etat = {
  produits: number;
  consommables: number;
  modeles: number;
  dotations: number;
  utilisateurs: number;
  destinataires: number;
  aVerifier: number;
  horsCatalogue: number;
  messagerieConfiguree: boolean;
};

type Resultat = {
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

export default function Admin() {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<Etat | null | "interdit">(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      setEtat(await api<Etat>("/admin/etat"));
    } catch (e) {
      setEtat(e instanceof Error && e.message.includes("administrateur") ? "interdit" : "interdit");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function importer(fichier: File) {
    setOccupe(true);
    setErreur(null);
    setResultat(null);
    try {
      const donnees = new FormData();
      donnees.append("fichier", fichier);
      const entetes = new Headers();
      const j = jeton();
      if (j) entetes.set("Authorization", `Bearer ${j}`);

      const reponse = await fetch("/api/admin/import", {
        method: "POST",
        body: donnees,
        headers: entetes,
      });
      const corps = await reponse.json();
      if (!reponse.ok) throw new Error(corps.erreur ?? "Import impossible.");

      setResultat(corps.resultat as Resultat);
      await rafraichirCatalogue();
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setOccupe(false);
      if (champ.current) champ.current.value = "";
    }
  }

  if (etat === null) return <Chargement />;

  if (etat === "interdit") {
    return (
      <div className="ecran">
        <Barre titre="Configuration" retour="/" />
        <div className="corps">
          <div className="avertissement">
            Cet écran est réservé aux administrateurs. Connecte-toi avec un compte administrateur.
          </div>
          <button className="bouton ardoise" onClick={() => router.push("/connexion")}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const vide = etat.produits === 0;

  return (
    <div className="ecran">
      <Barre titre="Configuration" retour="/" />
      <div className="corps">
        {vide && (
          <div className="avertissement">
            Première mise en route. Téléverse le classeur <b>MATISP_catalogue.xlsx</b> : il crée le
            catalogue, les dotations, les comptes et les destinataires en une fois.
          </div>
        )}

        {erreur && <div className="erreur">{erreur}</div>}

        {resultat && (
          <div className="succes">
            <b>Import terminé.</b>
            <br />
            {resultat.produitsCrees} produit(s) créé(s), {resultat.produitsMisAJour} mis à jour,{" "}
            {resultat.lignesComposition} ligne(s) de composition, {resultat.modeles} dotation(s),{" "}
            {resultat.utilisateurs} personnel(s), {resultat.destinataires} destinataire(s).
            <br />
            Version du catalogue : {resultat.version}.
          </div>
        )}

        {resultat?.avertissements.map((a, i) => (
          <div className="avertissement" key={i}>
            {a}
          </div>
        ))}

        <p className="libelle">Importer le catalogue</p>
        <input
          ref={champ}
          id="classeur"
          className="champ"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={occupe}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importer(f);
          }}
        />
        <p className="note">
          Le fichier peut être réimporté autant de fois qu&apos;on veut : les produits sont
          reconnus par leur code, les compositions remplacées. Les mots de passe déjà changés ne
          sont pas réinitialisés.
        </p>

        {occupe && <p className="note">Import en cours, ça prend une minute…</p>}

        <p className="libelle">État actuel</p>
        <table className="tableau">
          <tbody>
            <tr>
              <td>Produits au catalogue</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.produits}</b> dont {etat.consommables} consommables
              </td>
            </tr>
            <tr>
              <td>Dotations</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.modeles}</b> modèle(s), {etat.dotations} physique(s)
              </td>
            </tr>
            <tr>
              <td>Personnels</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.utilisateurs}</b>
              </td>
            </tr>
            <tr>
              <td>Destinataires des PDF</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.destinataires}</b>
              </td>
            </tr>
            <tr>
              <td>Produits marqués « à vérifier »</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.aVerifier}</b>
              </td>
            </tr>
            <tr>
              <td>Déclarations hors catalogue</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.horsCatalogue}</b>
              </td>
            </tr>
            <tr>
              <td>Envoi automatique des mails</td>
              <td style={{ textAlign: "right" }}>
                <b>{etat.messagerieConfiguree ? "actif" : "non branché"}</b>
              </td>
            </tr>
          </tbody>
        </table>

        {!etat.messagerieConfiguree && (
          <p className="note">
            Sans envoi automatique, l&apos;appli enregistre le PDF sur le téléphone et l&apos;ISP le
            transmet par sa messagerie. Rien n&apos;est perdu.
          </p>
        )}

        {etat.utilisateurs === 0 && etat.produits > 0 && (
          <div className="avertissement">
            Aucun personnel importé : personne ne peut se connecter. Remplis l&apos;onglet
            UTILISATEURS du classeur et réimporte-le.
          </div>
        )}
      </div>
    </div>
  );
}
