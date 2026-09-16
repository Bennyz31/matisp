-- MATISP — répare les médecins importés à tort comme ISP.
--
-- Le classeur UTILISATEURS écrit la fonction en clair ("MEDECIN"/"MÉDECIN"),
-- alors que l'import n'acceptait jusqu'ici que le sigle "MSP" : tout médecin
-- tombait donc dans le repli "ISP par défaut", sans que ça saute aux yeux
-- puisque ISP est une valeur normale par ailleurs. Conséquence : jusqu'à 16
-- médecins avaient la fonction ISP en base, et parmi eux 13 récupéraient un
-- accès VLM auquel ils n'ont pas droit (l'accès VLM était alors accordé à
-- tout ISP). Bug découvert le 16/09/2026 (Ben a vu sa pastille "Mon sac"
-- disparaître après un ré-import). Le code d'import est corrigé en parallèle
-- (src/lib/import-catalogue.ts) — cette migration répare seulement l'état
-- actuel, pour les 16 matricules identifiés dans l'onglet UTILISATEURS du
-- classeur source (colonne FONCTION = MEDECIN/MÉDECIN).

-- Les 3 médecins à qui Ben a nommément accordé l'accès VLM.
UPDATE "Utilisateur" SET "fonction" = 'MSP', "accesVLM" = true
WHERE "matricule" IN ('5173', '4887', '5095');

-- Les 13 autres médecins : fonction MSP, pas d'accès VLM par défaut.
UPDATE "Utilisateur" SET "fonction" = 'MSP', "accesVLM" = false
WHERE "matricule" IN (
  '2884', '2189', '2853', '2591', '4532', '5215',
  '5292', '5304', '5508', '5548', '3062', '1123', '4655'
);
