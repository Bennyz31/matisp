"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type BlocPdf = {
  dotation: string;
  declarants: string[];
  lignes: { code: string; designation: string; quantite: number; unite: string; mention?: string }[];
};

export type DonneesPdf = {
  crss: string | null;
  debutLe: string;
  declarants: string[];
  blocs: BlocPdf[];
};

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

/**
 * Le PDF est fabriqué sur le téléphone : il existe donc aussi hors connexion,
 * et le document vu à l'aperçu est exactement celui qui part par mail.
 * Aucune donnée nominative de patient — cahier des charges §18.
 */
export function construirePdf(d: DonneesPdf): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marge = 16;
  let y = 20;

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20, 24, 31);
  doc.text(d.crss ? `MATISP — liste de réassort — ${d.crss}` : "MATISP — liste de réassort", marge, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(74, 82, 94);
  doc.text("SDIS 82 · Service de santé et de secours médical", marge, y);
  y += 3;
  doc.setDrawColor(20, 24, 31).setLineWidth(0.5).line(marge, y, 210 - marge, y);
  y += 8;

  const total = d.blocs.reduce(
    (acc, b) => ({
      references: acc.references + b.lignes.length,
      unites: acc.unites + b.lignes.reduce((s, l) => s + l.quantite, 0),
    }),
    { references: 0, unites: 0 },
  );

  const entete: [string, string][] = [
    ["Date de l'intervention", dateFr(d.debutLe)],
    ["CRSS", d.crss || "non renseigné"],
    ["Déclarants", d.declarants.join(", ") || "—"],
    ["Total", `${total.references} réf. · ${total.unites} u.`],
  ];
  doc.setFontSize(8);
  for (const [etiquette, valeur] of entete) {
    doc.setTextColor(121, 130, 143).text(etiquette.toUpperCase(), marge, y);
    doc.setFontSize(10).setTextColor(20, 24, 31).text(valeur, marge + 34, y);
    doc.setFontSize(8);
    y += 5.5;
  }
  y += 4;

  for (const bloc of d.blocs) {
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(20, 24, 31);
    doc.text(bloc.dotation, marge, y);
    y += 4.5;
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(74, 82, 94);
    doc.text(`Déclaré par ${bloc.declarants.join(", ") || "—"}`, marge, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: marge, right: marge },
      head: [["Réf.", "Désignation", "Qté", "Unité"]],
      body: bloc.lignes.map((l) => [
        l.code,
        l.mention ? `${l.designation} (${l.mention})` : l.designation,
        String(l.quantite),
        l.unite,
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: [20, 24, 31] },
      headStyles: {
        fillColor: [237, 239, 243],
        textColor: [90, 98, 110],
        fontStyle: "normal",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 16, textColor: [121, 130, 143] },
        2: { cellWidth: 14, halign: "right" },
        3: { cellWidth: 22 },
      },
      theme: "grid",
      tableLineColor: [220, 224, 231],
      tableLineWidth: 0.1,
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5).setTextColor(121, 130, 143);
    doc.text(
      `Généré par MATISP le ${dateFr(new Date().toISOString())} — aucune donnée nominative de patient.`,
      marge,
      288,
    );
    doc.text(`${p} / ${pages}`, 210 - marge, 288, { align: "right" });
  }

  return doc;
}

export const nomFichierPdf = (crss: string | null, debutLe: string) =>
  `reassort-${crss || new Date(debutLe).toISOString().slice(0, 16).replace(/[:T]/g, "")}.pdf`;

/** Renvoie le PDF encodé, prêt à être joint à un mail par le serveur. */
export function pdfEnBase64(doc: jsPDF): string {
  const uri = doc.output("datauristring");
  return uri.slice(uri.indexOf(",") + 1);
}
