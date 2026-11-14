// Réglages de connexion des écrans — à remplir lors de l'installation (voir le guide)
self.SUIVI_CONFIG = {  // « self » : lisible par les écrans et par sw.js
  // Lien du programme Google (déploiement « Application Web »), se termine par /exec
  API_URL: 'https://script.google.com/macros/s/AKfycbxUH5ZBS3N7DuaTIZdSKS-6Aok_V3AcLEwqGHuEzcHqud6S9Tt_Wxf2zOz2z6LYLrZM/exec',
  // Identifiant client OAuth créé dans Google Cloud (le même que dans Code.gs)
  CLIENT_ID: '874401973638-i7ua7thfncj4hstbjo7k39rk60p0ie5q.apps.googleusercontent.com',

  // Notifications sur les téléphones (Firebase) — voir le guide « Notifications »
  // Firebase > Paramètres du projet > Général > Vos applications > Configuration du SDK
  FIREBASE: {
    apiKey: 'AIzaSyBvc931kRP6jIM-5793m9cumATeu0UHHDs',
    authDomain: 'suivi-elec-habitat.firebaseapp.com',
    projectId: 'suivi-elec-habitat',
    storageBucket: 'suivi-elec-habitat.firebasestorage.app',
    messagingSenderId: '986194509339',
    appId: '1:986194509339:web:49bde50a2e6c52b67cc2be'
  },
  // Firebase > Paramètres du projet > Cloud Messaging > Certificats Web Push > Paire de clés
  VAPID_KEY: 'BBXe53h4wDhibqa5qKEZkz22am3LOBjXIAIOnZ3gwdLUNonsZGhGKmOGXDPRAfVeERqGr5JQJDIHNRk6GV0-ioo'
};
