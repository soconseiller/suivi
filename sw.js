/* Elec Habitat – programme d'arrière-plan du téléphone (service worker)
 *  - garde une copie des écrans pour démarrer même sans réseau ;
 *  - reçoit les notifications (Firebase Cloud Messaging) et les affiche ;
 *  - ouvre la bonne page de l'appli quand on touche une notification.
 * Ce fichier doit rester à la racine du site (à côté de index.html).
 */
const VERSION_CACHE = 'eh-2026-11-11-1';
// Le site enlève « .html » des adresses (réglage cleanUrls de Vercel) : on demande donc « / » et « /hors-ligne »
const FICHIERS = ['/', '/app.js', '/styles.css', '/config.js', '/logo.png', '/favicon.svg',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.json', '/hors-ligne'];

/* ---------- Notifications (Firebase) ---------- */
// Les réglages Firebase sont dans config.js (le même fichier que les écrans)
try {
  importScripts('/config.js');
  const fb = (self.SUIVI_CONFIG || {}).FIREBASE;
  if (fb && fb.apiKey && fb.apiKey.indexOf('A_REMPLIR') < 0) {
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    firebase.initializeApp(fb);
    // Les messages envoyés avec un titre et un texte s'affichent tout seuls quand l'appli est fermée
    firebase.messaging();
  }
} catch (e) {
  // Pas de notifications si Firebase n'est pas réglé : le reste de l'appli fonctionne
}

/** Toucher une notification : on ouvre (ou on remet devant) l'appli sur la bonne page */
self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  const lien = (data.FCM_MSG && data.FCM_MSG.data && data.FCM_MSG.data.url) || data.url || '/';
  n.close();
  event.waitUntil((async () => {
    const url = new URL(lien, self.location.origin).href;
    const fenetres = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fenetres) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        try { await c.navigate(url); } catch (e) { c.postMessage({ type: 'ouvrir', url }); }
        return;
      }
    }
    await clients.openWindow(url);
  })());
});

/* ---------- Copie des écrans (démarrage sans réseau) ---------- */
self.addEventListener('install', (event) => {
  // Fichier par fichier : un fichier manquant n'empêche pas les autres d'être gardés
  event.waitUntil(caches.open(VERSION_CACHE).then((c) => Promise.all(FICHIERS.map((f) => c.add(f).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n !== VERSION_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Réseau d'abord (pour avoir toujours la dernière version), copie si pas de réseau
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const rep = await fetch(req);
      if (rep && rep.ok) {
        const copie = rep.clone();
        caches.open(VERSION_CACHE).then((c) => c.put(req, copie)).catch(() => {});
      }
      return rep;
    } catch (e) {
      const enCache = await caches.match(req, { ignoreSearch: true });
      if (enCache) return enCache;
      if (req.mode === 'navigate') return (await caches.match('/')) || caches.match('/hors-ligne');
      return Response.error();
    }
  })());
});
