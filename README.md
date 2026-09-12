# MATISP

Application de déclaration des consommations en intervention et de réassort — SDIS 82.

Progressive Web App : elle s'installe sur l'écran d'accueil d'un iPhone comme d'un
Android, fonctionne sans réseau, et se met à jour toute seule. Rien à publier sur
l'App Store ni le Play Store.

---

## Mise en ligne — sans ligne de commande

1. **Créer un compte GitHub** (gratuit) sur github.com.
2. **Créer un dépôt** vide, appelé `matisp`, en privé.
3. **Téléverser le dossier** : sur la page du dépôt, *Add file* → *Upload files*, puis
   glisser tout le contenu de ce dossier. *Commit changes*.
4. **Créer un compte Vercel** sur vercel.com, avec « Continue with GitHub ».
5. **Importer le projet** : *Add New* → *Project* → choisir `matisp` → *Deploy*.
   Le premier déploiement échouera : c'est normal, il n'y a pas encore de base.
6. **Créer la base** : onglet *Storage* → *Create Database* → *Neon* (formule gratuite).
   La variable `DATABASE_URL` est renseignée automatiquement.
7. **Relancer le déploiement** : onglet *Deployments* → *Redeploy*. Cette fois les tables
   sont créées et l'application démarre.
8. **Ouvrir l'adresse** fournie par Vercel, aller sur `/admin` et téléverser le classeur
   `MATISP_catalogue.xlsx`.

À partir de là, l'adresse se partage aux ISP : ils l'ouvrent, font « Ajouter à
l'écran d'accueil », et l'appli se comporte comme une application installée.

### Envoi automatique des e-mails — facultatif

Sans cela, l'appli enregistre le PDF sur le téléphone et l'ISP le transmet par sa
messagerie : rien n'est perdu, c'est juste un geste de plus.

Pour l'activer : créer un compte sur resend.com (gratuit, 3 000 e-mails par mois),
copier la clé d'API, puis dans Vercel *Settings* → *Environment Variables*, ajouter
`RESEND_API_KEY`. Redéployer.

Pour que l'expéditeur soit une adresse du SDIS plutôt que l'adresse de test, ajouter
aussi `RESEND_FROM` (par exemple `MATISP <matisp@sdis82.fr>`) — cela suppose d'avoir
validé le domaine dans Resend, ce qui demande un accès DNS.

---

## Mettre à jour le catalogue

Écran `/admin`, téléverser le nouveau classeur. C'est tout : les produits sont reconnus
par leur code, les compositions remplacées, les mots de passe déjà changés préservés.
Les téléphones récupèrent la nouvelle version à leur prochaine ouverture avec du réseau.

Le classeur porte huit onglets. Trois sont à remplir par toi :

- **CIS** — les centres de secours, un code et un nom.
- **UTILISATEURS** — matricule, nom, prénom, fonction (`ISP`, `MSP`, `CONDUCTEUR`,
  `PHARMACIEN` ou `ADMIN`), code CIS, dotation habituelle. **La première ligne reçoit
  automatiquement le rôle administrateur** : mets-toi en premier.
- **DESTINATAIRES** — libellé et adresse e-mail. La pharmacie est cochée par défaut.

Le mot de passe initial de chacun est son matricule. Il est haché à l'import : il n'est
stocké en clair nulle part, et chacun peut le changer depuis *Mon compte*.

---

## Ce que l'application fait

**Connexion** — nom dans une liste filtrable, matricule en mot de passe. La session dure
90 jours : en pratique on ne se reconnecte jamais.

**Saisie** — un appui sur `+` enregistre une unité, sans confirmation. La ligne passe au
vert avec ses boutons `−` / `+`. La recherche accepte les termes partiels, les noms
commerciaux, les couleurs et les calibres : « perf » donne le Perfalgan et le perfuseur,
« 18 » et « vert » donnent le même cathéter. Tant qu'il n'y a pas d'historique, l'écran
propose les produits de la dotation triés par quantité.

**Hors connexion** — tout fonctionne : créer l'intervention, saisir, corriger, terminer,
produire le PDF. Ce qui attend part au retour du réseau, sans rien demander.

**Envoi** — jamais automatique en fin d'intervention. Au retour, l'ISP vérifie, complète
le CRSS s'il l'a, coche les destinataires et envoie.

**Clôture** — par l'ISP ou le MSP, une fois le sac physiquement rempli. La pharmacie
reçoit le document à titre informatif.

---

## Comment c'est construit

Next.js 15 et React 19, Prisma sur PostgreSQL, tout dans un seul projet — l'écran et
l'API se déploient ensemble, il n'y a rien à faire communiquer.

**Une consommation est un événement, jamais une ligne modifiée à distance.** Chaque
saisie porte un identifiant créé sur le téléphone. Corriger une quantité met à jour cette
ligne-là ; deux déclarants qui sortent le même produit ont chacun la leur, et les deux
s'additionnent au réassort. Rejouer un lot de synchronisation est sans effet. Résultat :
aucun algorithme de résolution de conflit à écrire, donc aucun bug de fusion possible —
c'est le point le plus délicat d'une application hors connexion, traité par la forme des
données plutôt que par du code.

**Le PDF est fabriqué sur le téléphone.** Il existe donc aussi sans réseau, et le document
vu à l'aperçu est exactement celui qui part par mail.

**Le catalogue est mis en cache en entier.** 322 produits, quelques centaines de
kilo-octets : la recherche tourne sur le téléphone, jamais sur le réseau. C'est la seule
façon de tenir « une à deux secondes » avec une couverture médiocre.

**Le matériel non consommable reste au catalogue** mais hors de la recherche : il
n'apparaît que si on demande à déclarer une perte ou une casse.

**Les protocoles PISU sont prévus mais vides** — reportés en V2. Créer la table maintenant
coûte une ligne ; l'ajouter plus tard coûterait une reprise de données.

```
prisma/schema.prisma          le modèle de données validé
prisma/migrations/            création des tables, appliquée au déploiement
src/lib/                      base, authentification, réassort, import du classeur
src/client/                   stockage local, synchronisation, recherche, PDF
src/app/                      les écrans et l'API
```

---

## Sauvegarde

Neon conserve un historique de sept jours sur la formule gratuite, ce qui couvre
l'essentiel. Pour une copie à soi : dans Neon, *Backups* → *Export*. Les interventions de
plus d'un an sont purgées automatiquement.

---

## Reste à fournir

Listing ISP actualisé · inventaire du sac médecin · liste ISP / MSP / équipiers VLM avec
matricules · liste des CIS et de ceux qui ont un sac collectif · adresses e-mail des trois
destinataires.
