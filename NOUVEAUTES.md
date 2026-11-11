# Elec Habitat – ce qui change par rapport à Kalisud

## Retiré
- L'étape ARC (contrôle, PDF, mail, compteur).

## Ajouté
- **Couleurs et logo Elec Habitat** (bleu nuit #222468, orange #FF741B), dans l'appli et dans les mails.
- **Deux rôles.** Administrateur : accès à tout. Technicien : voit les chantiers (sans pouvoir en créer), écrit dans la discussion, dépose ses photos et documents, demande du matériel, réceptionne, fait le PV, et gère ses propres présences, trajets et absences.
- **Adresse mail, téléphone et option SMS** pour chaque utilisateur (Réglages > Utilisateurs).
- **Recherche à plusieurs mots** : dans le tableau de bord, les archives, et une page « Chercher dans l'agenda » (tous les mots doivent être présents, dans n'importe quel ordre). Depuis un rendez-vous trouvé, on peut créer un dossier.
- **Documents rangés par type** : Plans, Devis, Photos, Fiches techniques, Schémas, Factures, PV, Réserves, Divers. La liste est modifiable. Dans les réglages (administrateur seulement), un tableau « Accès aux dossiers de documents » permet de cocher, technicien par technicien, les dossiers qu'il peut ouvrir et où il peut déposer. Un technicien sans case cochée ne voit aucun document. Une ligne « Par défaut » s'applique aux nouveaux techniciens (devis et factures décochés).
- **Discussion par chantier** : messages, photos et documents, visibles par toute l'équipe, mise à jour toutes les 30 secondes.
- **Localisation du chantier** : adresse saisie à la main, ou position du téléphone sur place. L'appli affiche la distance, la zone, et des liens Google Maps et Waze.
- **Bouton « Matériel à commander »** : la liste part par mail à l'administrateur et reste dans le chantier. On y indique ensuite la commande (fournisseur, livraison) puis la réception.
- **Ma journée** : présent ou absent, et sur quel(s) chantier(s). Distance à vol d’oiseau depuis le centre d’Heugas (point de départ réglable) et zone (1A : 0-5 km, 1B : 5-10, 2 : 10-20, 3 : 20-30, 4 : 30-40, 5 : 40-50, puis grand déplacement ; zones réglables). Si le technicien passe sur plusieurs lieux, la zone retenue est celle du plus éloigné.
- **Relevé des trajets en PDF**, à tout moment : un technicien ou toute l'équipe, sur la période choisie. Une copie est rangée dans Drive.
- **Rappel quotidien à 15 h, du lundi au vendredi** (réglable), envoyé à chaque technicien qui n'a pas rempli sa journée. Pas d'envoi s'il est en congé.
- **Congés et absences** : demande par le technicien (avec la phrase CI BTP), puis validation ou refus par l'administrateur, avec un mail de réponse. Les absences validées sont inscrites dans l'agenda. Motif « Absence école » inclus. L'administrateur peut aussi saisir directement une absence (par exemple un calendrier d'alternance).
- **Équipe et présences** : tableau de la semaine par technicien. On peut remplir une journée à la place d'un technicien.
- **Mail d'avancement des chantiers** vers l'administrateur (par défaut le vendredi à 17 h, réglable).
- **SMS en plus du mail** (facultatif, compte Brevo, quelques centimes par SMS), à cocher mail par mail. **Boutons WhatsApp** (gratuits, envoi à la main) dans la fiche chantier, l'équipe et les absences.
- **Agenda dans les deux sens** : planifier dans l'appli écrit dans l'agenda, avec le prénom des techniciens. Si une intervention est déplacée ou supprimée dans Google Agenda, l'appli se met à jour dans l'heure et prévient l'administrateur.

- **Temps du chantier** : le temps prévu (en jours, demi-journées ou heures) se saisit à la validation du devis. L'appli calcule le temps planifié et le temps passé d'après l'agenda, en ne comptant que les heures de travail (hors week-ends, jours fériés et jours non travaillés réglables). Elle additionne aussi les heures déclarées par chaque technicien dans « Ma journée » : nombre de personnes sur le chantier, heures par personne, présents du jour.

- **Nouveaux messages** : pastille du nombre de messages non lus (menu, cartes des chantiers, tableau de bord), repère « Nouveaux messages » dans la discussion, et mail (+ SMS si coché) aux administrateurs et à l'équipe du chantier, au plus un mail toutes les 15 minutes par chantier et par personne.

- **Appli sur le téléphone** : installation sur l'écran d'accueil (iPhone et Android), écran « pas de réseau », et **notifications** sur les téléphones pour chaque mail envoyé par l'appli (réglage Firebase : voir GUIDE-NOTIFICATIONS.md).

## Plus tard
- Reprise des chantiers existants depuis Kraft (il faudra un export Excel ou CSV).

## Installation (même principe que Kalisud)
1. Sur le compte Google de l'entreprise, créer un projet Apps Script. Y coller `apps-script/Code.gs` et `appsscript.json`.
2. Remplir `CONFIG.CLIENT_ID` et `CONFIG.APP_URL` dans Code.gs, et `web/config.js`.
3. Lancer une fois la fonction `installer`, puis déployer en « Application Web ».
4. Mettre `web/` sur GitHub puis sur Vercel.
5. Dans Réglages : vérifier le point de départ, ajouter les 5 techniciens, et laisser le mode test tant que les essais ne sont pas finis.
