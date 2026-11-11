// Réglages de connexion des écrans — à remplir lors de l'installation (voir le guide)
self.SUIVI_CONFIG = {  // « self » : lisible par les écrans et par sw.js
  // Lien du programme Google (déploiement « Application Web »), se termine par /exec
  API_URL: 'https://script.google.com/macros/s/AKfycbyHB_zVUhTQQQVSnVTQnRe6S9yVmEt0dBj5h1Aw7-RKlXiUfMsCHzvO7H7OQCEwJk5vPg/exec',
  // Identifiant client OAuth créé dans Google Cloud (le même que dans Code.gs)
  CLIENT_ID: '874401973638-i7ua7thfncj4hstbjo7k39rk60p0ie5q.apps.googleusercontent.com',

  // Notifications sur les téléphones (Firebase) — voir le guide « Notifications »
  // Firebase > Paramètres du projet > Général > Vos applications > Configuration du SDK
  FIREBASE: {
    apiKey: 'AIzaSyAReb7tQSm75ptiN7D2x0jTJLwKqygLy64',
    authDomain: 'suivi-elec-514013.firebaseapp.com',
    projectId: 'suivi-elec-514013',
    storageBucket: 'suivi-elec-514013.firebasestorage.app',
    messagingSenderId: '874401973638',
    appId: '1:874401973638:web:eb6da2abab4dcab8761807'
  },
  // Firebase > Paramètres du projet > Cloud Messaging > Certificats Web Push > Paire de clés
  VAPID_KEY: 'BB4CM4nsRCn_mEnw4mbrJqRCs32Z91mBByBwqbz_cntkXYrJ89NQ_aSKMjHUNtdsySkzxclvld_P4HAPGq9N_zE'
};
