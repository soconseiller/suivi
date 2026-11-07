# Elec Habitat – Suivi des chantiers

Appli de suivi des dossiers (du rendez-vous « devis » à la facture), des chantiers et de l'équipe
(présences, trajets, congés). Réalisée par So Conseiller à partir de l'appli « Suivi affaires ».

- `apps-script/` : le programme Google (Code.gs + appsscript.json) à coller dans Google Apps Script.
- `web/` : les écrans, à déposer sur GitHub puis Vercel (site statique, aucune construction).

Avant de déployer, remplir :
- dans `apps-script/Code.gs` : `CONFIG.CLIENT_ID` et `CONFIG.APP_URL` ;
- dans `web/config.js` : `API_URL` et `CLIENT_ID`.

Installation : lancer une fois la fonction `installer` dans l'éditeur Apps Script, puis déployer en « Application Web ».
