/**
 * Applique les migrations au démarrage du build.
 * Neon (et la plupart des Postgres managés) exposent deux chaînes de connexion :
 * une « poolée » pour l'application, une directe pour les migrations. On choisit
 * la bonne automatiquement pour que rien ne soit à configurer à la main.
 */
import { execFileSync } from "node:child_process";

const directe =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!directe) {
  console.error("\nAucune base de données configurée : la variable DATABASE_URL est vide.");
  console.error("Sur Vercel : Storage > Create Database > Neon, elle sera renseignée toute seule.\n");
  process.exit(1);
}

try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: directe },
  });
} catch {
  console.error("\nLes migrations ont échoué. Vérifie que la base est bien créée et accessible.\n");
  process.exit(1);
}
