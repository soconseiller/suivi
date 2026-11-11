# Notifications sur les téléphones – mise en place

Durée : environ 20 minutes, une seule fois. Tout est gratuit.
À faire avec le compte Google qui a créé le projet Google Cloud de l'appli.

---

## Étape 1 – Ajouter Firebase au projet Google Cloud

1. Allez sur **console.firebase.google.com**.
2. Cliquez sur **« Créer un projet »**. En bas de l'écran, choisissez **« Ajouter Firebase à un projet Google Cloud existant »**, puis sélectionnez le projet **Elec Habitat** (celui de l'identifiant de connexion).
3. Acceptez les conditions. À la question **Google Analytics**, choisissez **Ne pas activer**, puis **Ajouter Firebase**.

## Étape 2 – Déclarer l'appli web et copier ses réglages

1. Sur la page d'accueil du projet, cliquez sur l'icône **Web `</>`** (« Ajouter une application »).
2. Surnom : **Elec Habitat**. Ne cochez pas « Firebase Hosting ». Cliquez sur **Enregistrer l'application**.
3. Firebase affiche un bloc `firebaseConfig = { apiKey: "…", authDomain: "…", … }`.
   Recopiez chaque valeur dans le fichier **`web/config.js`**, partie `FIREBASE` :

   ```js
   FIREBASE: {
     apiKey: 'AIza…',
     authDomain: 'elec-habitat.firebaseapp.com',
     projectId: 'elec-habitat',
     storageBucket: 'elec-habitat.appspot.com',
     messagingSenderId: '874401973638',
     appId: '1:874401973638:web:…'
   },
   ```

   Ces valeurs ne sont pas secrètes : elles peuvent être dans le fichier public.
   Pour les retrouver plus tard : ⚙️ **Paramètres du projet → Général → Vos applications**.

## Étape 3 – Créer la clé « Web Push »

1. ⚙️ **Paramètres du projet**, onglet **Cloud Messaging**.
2. Vérifiez que **« API Firebase Cloud Messaging (V1) »** est **activée**.
3. Plus bas, dans **Configuration Web → Certificats Web Push**, cliquez sur **Générer une paire de clés**.
4. Copiez la longue clé affichée (elle commence souvent par `B`) dans **`web/config.js`**, ligne `VAPID_KEY: '…'`.

## Étape 4 – Donner au programme Google le droit d'envoyer les notifications

1. ⚙️ **Paramètres du projet**, onglet **Comptes de service**.
2. Cliquez sur **Générer une nouvelle clé privée**, puis **Générer la clé**. Un fichier `.json` est téléchargé.
3. Ouvrez ce fichier avec le Bloc-notes (Windows) ou TextEdit (Mac), **sélectionnez tout** et **copiez**.
4. Dans l'appli, en administrateur : **Réglages → Notifications sur les téléphones**, collez dans le cadre, puis **Enregistrer la clé**.
   L'appli vérifie tout de suite la clé auprès de Google et affiche **« Réglées »**.
5. Supprimez ensuite le fichier `.json` de l'ordinateur : il est secret, et il est maintenant gardé dans le programme Google.

## Étape 5 – Mettre en ligne la nouvelle version

**Sur GitHub, dossier `web`**, remplacez ou ajoutez ces fichiers :
`app.js`, `styles.css`, `index.html`, `manifest.json`, `config.js` (rempli aux étapes 2 et 3),
et les nouveaux : `sw.js`, `hors-ligne.html`, `apple-touch-icon.png`, `icon-maskable-512.png`.

**Dans Apps Script** : collez le nouveau `Code.gs`, enregistrez, puis
*Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer*.

Le bas du menu de l'appli doit afficher **« n°11 »** pour les écrans et pour le programme.

## Étape 6 – Sur chaque téléphone (chaque utilisateur)

**iPhone (iOS 16.4 ou plus récent)**
1. Ouvrir l'adresse de l'appli dans **Safari**.
2. Bouton **Partager** → **« Sur l'écran d'accueil »** → **Ajouter**.
3. Ouvrir l'appli **depuis la nouvelle icône**, se connecter.
4. Toucher **Activer les notifications**, puis **Autoriser**.

**Android**
1. Ouvrir l'adresse de l'appli dans **Chrome**.
2. Menu **⋮** → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Ouvrir l'appli depuis son icône, se connecter, toucher **Activer les notifications**, puis **Autoriser**.

Pour vérifier : page **🔔 Notifications → M'envoyer une notification d'essai**.

---

## À savoir

- **Ce qui déclenche une notification** : tout mail envoyé par l'appli à une personne (nouveau message dans un chantier, matériel demandé, rappel de 15 h, réponse à une demande d'absence, livraison, réception non conforme…). Dans *Réglages → Mails, notifications et SMS*, chaque mail a une case **« Envoyer aussi une notification sur le téléphone »**.
- **Mode test** : comme les mails, les notifications partent uniquement vers l'adresse de test. Pour que chaque technicien reçoive les siennes, il faut désactiver le mode test.
- **Plusieurs appareils** : une personne peut activer les notifications sur son téléphone et sur son ordinateur. Elle les voit dans la page 🔔 Notifications et peut les retirer.
- Un téléphone qui ne répond plus (appli supprimée, notifications coupées) est **retiré automatiquement** de la liste.
- Le **nombre d'appareils** de chaque personne est visible dans *Réglages → Utilisateurs* (colonne 🔔).
