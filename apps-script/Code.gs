/**
 * ELEC HABITAT — SUIVI DES CHANTIERS — programme Google (Apps Script)
 * So Conseiller (version issue de « Suivi affaires »)
 *
 * Ce programme fait tout le travail « en coulisses » :
 *  - il range les données dans un Google Sheets ;
 *  - il lit l'agenda Google et repère les rendez-vous « devis » ;
 *  - il écrit les interventions et les congés dans l'agenda, et remonte les changements faits dans l'agenda ;
 *  - il range les documents et les photos dans Google Drive ;
 *  - il gère les présences, les trajets (zones à vol d'oiseau) et les congés des techniciens ;
 *  - il envoie les mails (et les SMS si un compte Brevo est branché) aux heures choisies.
 *
 * Les écrans (hébergés sur Vercel) lui parlent par le lien de « déploiement web ».
 *
 * ------------------------------------------------------------------
 * À REMPLIR AVANT LA PREMIÈRE INSTALLATION (voir le guide)
 * ------------------------------------------------------------------
 */
const CONFIG = {
  // Identifiant client OAuth créé dans Google Cloud (se termine par .apps.googleusercontent.com)
  CLIENT_ID: '874401973638-i7ua7thfncj4hstbjo7k39rk60p0ie5q.apps.googleusercontent.com',
  // Adresse des écrans sur Vercel, sans / à la fin (ex : https://elec-habitat.vercel.app)
  APP_URL: 'https://suivi-tau.vercel.app'
};

const NOM_APPLI = 'Elec Habitat';
// Numéro de version, affiché en bas du menu de l'appli (pour vérifier que le dernier déploiement est en service)
const VERSION_PROGRAMME = '2026-11-12 n°17';

/* ==================================================================
 * 1. STRUCTURE DES DONNÉES
 * ================================================================== */

const SCHEMA = {
  Dossiers: ['id', 'eventKey', 'dateRdv', 'heureRdv', 'titreRdv', 'lieu', 'descriptionRdv', 'client', 'etape',
    'numDevis', 'dateDevis', 'commentaireDevis', 'delaiRelance', 'prochaineRelance', 'notesRelance',
    'motifRefus', 'commentaireRefus', 'numCommande', 'dateValidation', 'chantier', 'dateDebut', 'dateFin',
    'techniciens', 'avancement', 'dateFinChantier', 'factureFaite', 'dateCloture', 'dossierDrive', 'demo',
    'creeLe', 'majLe', 'pvStatut', 'pvReserves', 'pvDate', 'lat', 'lng', 'distanceKm', 'zone', 'source',
    // Temps du chantier, en heures : prévu au devis, planifié dans l'agenda, passé à ce jour (heures de travail seulement)
    'tempsValeur', 'tempsUnite', 'tempsPrevu', 'tempsPlanifie', 'tempsPasse', 'tempsMaj',
    // Heures déclarées par les techniciens (« Ma journée ») : total, et détail par personne (JSON)
    'tempsDeclare', 'techsDeclares',
    // Reprise Kraaft : identifiant de la conversation Kraaft d'origine
    'kraaft'],
  // statut : demandee (liste envoyée par un technicien) → commandee (fournisseur et livraison saisis)
  Commandes: ['id', 'dossierId', 'statut', 'demande', 'demandePar', 'dateDemande', 'fournisseur', 'dateCommande',
    'dateLivraison', 'commentaire', 'demo', 'creeLe', 'receptionStatut', 'dateReception', 'receptionPar', 'numBL',
    'receptionCommentaire', 'receptionPhoto'],
  Factures: ['id', 'dossierId', 'type', 'pourcentage', 'commentaire', 'dateDemande', 'demandePar', 'faite',
    'dateFaite', 'demo'],
  // Discussion du chantier : texte, photo ou document, visible par toute l'équipe
  // kraaft : identifiant du message ou du fichier Kraaft repris (évite les doublons)
  Commentaires: ['id', 'dossierId', 'date', 'auteur', 'auteurEmail', 'texte', 'photo', 'fichier', 'nomFichier', 'mime', 'demo', 'kraaft'],
  Documents: ['id', 'dossierId', 'type', 'fichier', 'nom', 'mime', 'date', 'auteur', 'demo', 'kraaft'],
  // techniciens : ceux prévus sur cette période (adresses séparées par des virgules)
  Interventions: ['id', 'dossierId', 'date', 'creneau', 'travaux', 'eventId', 'demo', 'creeLe', 'dateFin', 'creneauFin', 'techniciens'],
  Historique: ['date', 'dossierId', 'qui', 'action', 'note'],
  // docs : dossiers de documents visibles par ce technicien (vide = réglage par défaut, « aucun » = rien)
  Utilisateurs: ['email', 'nom', 'role', 'actif', 'telephone', 'sms', 'docs'],
  // Présence du jour et lieux d'intervention (lieux : liste JSON), un enregistrement par technicien et par jour
  Pointages: ['id', 'date', 'email', 'statut', 'motif', 'lieux', 'distanceKm', 'zone', 'commentaire', 'saisiPar', 'majLe', 'demo'],
  // statut : demande | accepte | refuse
  Conges: ['id', 'email', 'motif', 'dateDebut', 'creneauDebut', 'dateFin', 'creneauFin', 'commentaire', 'statut',
    'dateDemande', 'decidePar', 'dateDecision', 'reponse', 'eventId', 'demo'],
  // Dernière lecture de la discussion d'un chantier, par personne (pour les messages non lus)
  Lectures: ['email', 'dossierId', 'vuLe'],
  // Téléphones et ordinateurs qui reçoivent les notifications (jeton Firebase), par personne
  Appareils: ['id', 'email', 'jeton', 'appareil', 'creeLe', 'vuLe'],
  Reglages: ['cle', 'valeur'],
  // push : comment prévenir — vide ou « oui » = mail + notification, « non » = mail seul, « seule » = notification seule
  Mails: ['cle', 'nom', 'active', 'destinataires', 'delaiJours', 'rythmeJours', 'jours', 'heure', 'objet', 'texte',
    'copieTechniciens', 'sms', 'push'],
  Relances: ['cle', 'dernierEnvoi'],
  Journal: ['date', 'relance', 'dossierId', 'destinataires', 'resultat']
};

/** Types de documents proposés par défaut (modifiables dans les réglages) */
const TYPES_DOCS_DEFAUT = 'plan:Plans,devis:Devis,photo:Photos,technique:Fiches techniques,schema:Schémas électriques,facture:Factures,pv:PV de réception,reserve:Réserves,divers:Divers';

/** Étapes d'un dossier, dans l'ordre */
const ETAPES = {
  devis_a_faire: 'Devis à faire',
  devis_envoye: 'Devis envoyé',
  commande: 'Matériel à commander',
  materiel: 'Matériel commandé',
  planifie: 'Chantier planifié',
  en_cours: 'Chantier en cours',
  termine: 'À facturer',
  facture: 'Facturé',
  refuse: 'Refusé',
  ignore: 'Ignoré'
};

const REGLAGES_DEFAUT = {
  entreprise: 'Elec Habitat',
  motsCles: 'devis',
  // Point de départ des trajets (zones à vol d'oiseau)
  departNom: 'Centre d\'Heugas',
  departAdresse: 'Mairie, 40180 Heugas',
  departLat: '43.6440',
  departLng: '-1.0782',
  // Zones de trajet « nom:km maximum », séparées par des virgules (au-delà de la dernière : grand déplacement)
  zones: '1A:5,1B:10,2:20,3:30,4:40,5:50',
  // Types de documents (cle:Libellé) et ceux que les techniciens peuvent voir
  typesDocs: TYPES_DOCS_DEFAUT,
  docsTech: 'plan,photo,technique,schema,pv,reserve,divers',
  // Congés et absences
  motifsAbsence: 'Congés payés,Absence école,Maladie,Récupération,Sans solde,Autre',
  phraseConges: 'Vous trouverez votre solde de congés payés en vous connectant sur votre compte CI BTP.',
  congesAgenda: 'oui',
  // Jours non travaillés en plus des week-ends et des jours fériés (ponts, fermeture) : dates AAAA-MM-JJ ou périodes AAAA-MM-JJ/AAAA-MM-JJ
  joursNonTravailles: '',
  // SMS (facultatif, compte Brevo)
  smsActif: 'non',
  smsCle: '',
  smsExpediteur: 'ElecHabitat',
  motifsRefus: 'Prix,Délai,Concurrent,Projet abandonné,Autre',
  agendaActif: 'non',
  agendaId: '',
  modeTest: 'oui',
  emailTest: '',
  emailContact: '',
  // Adresse qui reçoit les réponses aux mails de l'appli (vide = le compte qui fait tourner le programme)
  emailReponses: '',
  joursAgendaPasse: '60',
  joursAgendaFutur: '60',
  matinDebut: '08:00',
  matinFin: '12:00',
  apremDebut: '13:30',
  apremFin: '17:30'
};

const JOURS_OUVRES = '1,2,3,4,5';

const MAILS_DEFAUT = [
  ['devis_a_faire', 'Devis à faire', 'oui', '', '2', '3', JOURS_OUVRES, '8',
    'Devis à faire : {client}',
    'Bonjour,\n\nLe devis pour {client} (rendez-vous du {date_rdv}) n\'est pas encore fait.\n\nPensez à l\'indiquer dans l\'appli dès qu\'il est envoyé.'],
  ['relance_client', 'Relance client', 'oui', '', '15', '3', JOURS_OUVRES, '9',
    'Client à relancer : {client} (devis {numero_devis})',
    'Bonjour,\n\nLe devis {numero_devis} envoyé à {client} attend une réponse.\n\nAprès votre appel, indiquez dans l\'appli : report, refusé ou validé.'],
  ['nouvelle_commande', 'Nouvelle commande', 'oui', '', '0', '0', '', '',
    'Nouvelle commande : {client}',
    'Bonjour,\n\nBonne nouvelle : le devis {numero_devis} de {client} est validé.\nNuméro de commande : {numero_commande}.'],
  ['commande_materiel', 'Commander le matériel', 'oui', '', '3', '2', JOURS_OUVRES, '8',
    'Matériel à commander : {client}',
    'Bonjour,\n\nLe devis {numero_devis} de {client} a été validé le {date_validation}.\nLe matériel n\'est pas encore commandé.'],
  ['materiel_demande', 'Matériel demandé par un technicien', 'oui', '', '0', '1', JOURS_OUVRES, '8',
    'Matériel demandé : {chantier}',
    'Bonjour,\n\n{demande_par} a besoin de matériel pour le chantier {chantier} :\n\n{liste_materiel}\n\nIndiquez la commande dans l\'appli dès qu\'elle est passée.', 'non', 'non'],
  ['livraison', 'Livraison à venir', 'oui', '', '1', '0', '1,2,3,4,5,6,7', '7',
    'Livraison {quand} : {chantier}',
    'Bonjour,\n\nLe matériel de {fournisseur} pour le chantier {chantier} doit arriver {quand} ({date_livraison}).'],
  ['reception', 'Réception à valider', 'oui', '', '0', '1', JOURS_OUVRES, '18',
    'Réception à valider : {chantier} ({fournisseur})',
    'Bonjour,\n\nLe matériel de {fournisseur} pour le chantier {chantier} était attendu le {date_livraison}.\nÉtat de la réception : {reception}.\n\nPensez à valider la réception dans l\'appli.'],
  ['reception_nc', 'Réception non conforme', 'oui', '', '0', '0', '', '',
    'Réception non conforme : {chantier} ({fournisseur})',
    'Bonjour,\n\nLa livraison de {fournisseur} pour le chantier {chantier} a été déclarée non conforme par {receptionne_par}.\n\n{commentaire}\n\nLa commande est remise en attente de traitement.'],
  ['pv_reserves', 'PV avec réserves', 'oui', '', '0', '0', '', '',
    'Réserves sur le chantier : {chantier}',
    'Bonjour,\n\nLe client {client} a signé le PV de réception du chantier {chantier} avec des réserves :\n\n{reserves}\n\nLe PV et les photos sont joints à ce mail.', 'oui'],
  ['facture_inter', 'Facture intermédiaire', 'oui', '', '0', '2', JOURS_OUVRES, '8',
    'Facture intermédiaire à faire : {chantier} ({pourcentage} %)',
    'Bonjour,\n\nUne facture intermédiaire de {pourcentage} % est demandée pour le chantier {chantier} ({client}).\n\n{commentaire}'],
  ['a_facturer', 'À facturer', 'oui', '', '0', '2', JOURS_OUVRES, '8',
    'Chantier terminé, à facturer : {chantier}',
    'Bonjour,\n\nLe chantier {chantier} ({client}) est terminé.\nLa facture finale reste à faire.'],
  ['recap', 'Récapitulatif', 'oui', '', '0', '7', '1', '8',
    'Récapitulatif Elec Habitat',
    'Bonjour,\n\nVoici tout ce qui reste à faire.'],
  ['avancement', 'Avancement des chantiers', 'oui', '', '0', '7', '5', '17',
    'Avancement des chantiers – {entreprise}',
    'Bonjour,\n\nVoici où en sont les chantiers.'],
  ['presence', 'Rappel présence (techniciens)', 'oui', '', '0', '1', JOURS_OUVRES, '15',
    'Ta journée du {date} : présence et chantier',
    'Bonjour {prenom},\n\nPense à indiquer dans l\'appli si tu étais présent aujourd\'hui et sur quel chantier tu es intervenu.\n\nÇa prend 30 secondes et ça sert au calcul des trajets.', 'non', 'non'],
  ['conge_demande', 'Demande de congé reçue', 'oui', '', '0', '0', '', '',
    'Demande d\'absence : {technicien}',
    'Bonjour,\n\n{technicien} demande une absence ({motif}) {periode}.\n\n{commentaire}\n\nValidez ou refusez la demande dans l\'appli.', 'non', 'non'],
  ['conge_reponse', 'Réponse à une demande de congé', 'oui', '', '0', '0', '', '',
    'Ta demande d\'absence est {decision}',
    'Bonjour {prenom},\n\nTa demande d\'absence ({motif}) {periode} est {decision}.\n\n{reponse}\n\n{phrase_conges}', 'non', 'non'],
  ['nouveau_message', 'Nouveau message sur un chantier', 'oui', '', '0', '0', '', '',
    'Nouveau message : {chantier}',
    'Bonjour,\n\n{auteur} a écrit sur le chantier {chantier} :\n\n{message}', 'oui', 'non'],
  ['agenda_modifie', 'Intervention modifiée dans l\'agenda', 'oui', '', '0', '0', '', '',
    'Planning modifié dans l\'agenda : {chantier}',
    'Bonjour,\n\nUne intervention du chantier {chantier} a été changée directement dans l\'agenda Google.\n\n{changement}\n\nL\'appli a été mise à jour.', 'non', 'non']
];

/** Mails envoyés sur le moment (pas d'heure ni de jours d'envoi) */
const MAILS_IMMEDIATS = ['nouvelle_commande', 'reception_nc', 'pv_reserves', 'conge_demande', 'conge_reponse', 'agenda_modifie', 'nouveau_message'];

/* ==================================================================
 * 2. INSTALLATION (à lancer une fois depuis l'éditeur)
 * ================================================================== */

/**
 * Crée le Google Sheets, le dossier Drive, les réglages par défaut,
 * et programme le rappel horaire. Peut être relancé sans risque.
 */
function installer() {
  const props = PropertiesService.getScriptProperties();
  const moi = Session.getEffectiveUser().getEmail();

  // Google Sheets
  let ss;
  const ssId = props.getProperty('SHEET_ID');
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('Elec Habitat – Données');
    props.setProperty('SHEET_ID', ss.getId());
  }
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
      .setBackground('#222468').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
  const feuille1 = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuille1 && ss.getSheets().length > 1) ss.deleteSheet(feuille1);

  // Dossier Drive
  if (!props.getProperty('FOLDER_ID')) {
    const folder = DriveApp.createFolder('Elec Habitat – Fichiers');
    props.setProperty('FOLDER_ID', folder.getId());
  }

  // Réglages par défaut (sans écraser l'existant)
  const reg = lireReglages_();
  Object.keys(REGLAGES_DEFAUT).forEach(function (k) {
    if (reg[k] === undefined) {
      let v = REGLAGES_DEFAUT[k];
      if (k === 'emailTest' || k === 'emailContact') v = moi;
      insert_('Reglages', { cle: k, valeur: v });
    }
  });

  // Mails par défaut
  const mails = all_('Mails');
  MAILS_DEFAUT.forEach(function (m) {
    if (!mails.some(function (x) { return x.cle === m[0]; })) {
      const obj = {};
      SCHEMA.Mails.forEach(function (h, i) { obj[h] = m[i]; });
      insert_('Mails', obj);
    }
  });

  // Premier utilisateur : le compte qui installe
  const users = all_('Utilisateurs');
  if (!users.some(function (u) { return u.email === moi.toLowerCase(); })) {
    insert_('Utilisateurs', { email: moi.toLowerCase(), nom: 'Compte contact', role: 'admin', actif: 'oui' });
  }

  // Point de départ des trajets : coordonnées retrouvées à partir de l'adresse
  try { majDepart_(lireReglages_().departAdresse); } catch (e) { Logger.log('Point de départ : ' + e); }

  // Rappel horaire
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'chaqueHeure') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('chaqueHeure').timeBased().everyHours(1).create();

  PropertiesService.getScriptProperties().setProperty('STRUCT_V', STRUCT_V);
  Logger.log('Installation terminée.');
  Logger.log('Google Sheets : ' + ss.getUrl());
  Logger.log('Dossier Drive : ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
}

/** Version de la structure du Google Sheets. À augmenter quand on ajoute des colonnes ou des mails. */
const STRUCT_V = '9';

/**
 * Met à jour le Google Sheets d'une installation existante (nouvelles colonnes, nouveaux mails),
 * sans rien effacer. Ne s'exécute qu'une fois par version.
 */
function miseAJourStructure_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('SHEET_ID');
  if (!ssId || props.getProperty('STRUCT_V') === STRUCT_V) return;
  const ss = SpreadsheetApp.openById(ssId);
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
      .setBackground('#222468').setFontColor('#FFFFFF');
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
  CACHE_ = {};
  const mails = all_('Mails');
  MAILS_DEFAUT.forEach(function (m) {
    if (!mails.some(function (x) { return x.cle === m[0]; })) {
      const obj = {};
      SCHEMA.Mails.forEach(function (h, i) { obj[h] = m[i]; });
      insert_('Mails', obj);
    }
  });
  // Réglages ajoutés par les mises à jour (horaires des interventions…)
  const regs = lireReglages_();
  Object.keys(REGLAGES_DEFAUT).forEach(function (k) {
    if (regs[k] === undefined && ['emailTest', 'emailContact'].indexOf(k) < 0) insert_('Reglages', { cle: k, valeur: REGLAGES_DEFAUT[k] });
  });
  // Zones : l'ancien réglage par défaut passe aux zones 1A / 1B / 2 / 3 / 4 / 5, et les zones sont recalculées
  if (lireReglages_().zones === '10,20,30,40,50') {
    update_('Reglages', 'cle', 'zones', { valeur: REGLAGES_DEFAUT.zones });
    CACHE_ = {};
    try { recalculerDistances_(); } catch (e) { Logger.log('Zones : ' + e); }
  }
  props.setProperty('STRUCT_V', STRUCT_V);
}

/** Vrai si le compte qui fait tourner le programme en est le propriétaire (en cas de doute : vrai) */
function estProprietaire_() {
  try {
    const proprio = DriveApp.getFileById(ScriptApp.getScriptId()).getOwner().getEmail();
    return String(proprio).toLowerCase() === String(Session.getEffectiveUser().getEmail()).toLowerCase();
  } catch (e) {
    return true;
  }
}

/** Lancé automatiquement toutes les heures */
function chaqueHeure() {
  // Après un changement de compte : l'ancien compte (resté éditeur) arrête son propre rappel horaire,
  // pour que les mails ne partent pas en double depuis deux comptes.
  if (!estProprietaire_()) {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'chaqueHeure') ScriptApp.deleteTrigger(t);
    });
    Logger.log('Rappel horaire supprimé : ce compte n\'est plus propriétaire du programme.');
    return;
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    miseAJourStructure_();
    const reg = lireReglages_();
    if (reg.agendaActif === 'oui' && reg.modeTest !== 'oui') {
      try { scannerAgenda_(); } catch (e) { Logger.log('Agenda : ' + e); noterAgenda_(e); }
    }
    // Interventions déplacées ou supprimées directement dans l'agenda
    try { synchroAgenda_(); noterAgenda_(null); } catch (e) { Logger.log('Synchro agenda : ' + e); noterAgenda_(e); }
    try { syncKraaft_(); } catch (e) { Logger.log('Synchro Kraaft : ' + e); }
    try { majTempsChantiers_(); } catch (e) { Logger.log('Temps des chantiers : ' + e); }
    lancerRelances_(new Date());
  } finally {
    lock.releaseLock();
  }
}

/* ==================================================================
 * 3. POINT D'ENTRÉE DES ÉCRANS
 * ================================================================== */

function doGet() {
  return ContentService.createTextOutput(NOM_APPLI + ' : le programme Google répond.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    miseAJourStructure_();
    const user = verifierUtilisateur_(req.token);
    out = { ok: true, data: router_(req.action, req.data || {}, user) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err), code: (err && err.code) || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function erreur_(message, code) {
  const e = new Error(message);
  e.code = code || '';
  return e;
}

/** Vérifie le jeton Google envoyé par les écrans et retrouve l'utilisateur autorisé */
function verifierUtilisateur_(token) {
  if (!token) throw erreur_('Merci de vous connecter.', 'NON_CONNECTE');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  let email = cache.get(key);
  if (!email) {
    const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw erreur_('Session expirée, merci de vous reconnecter.', 'NON_CONNECTE');
    const info = JSON.parse(res.getContentText());
    if (info.aud !== CONFIG.CLIENT_ID) throw erreur_('Connexion non reconnue.', 'NON_CONNECTE');
    if (String(info.email_verified) !== 'true') throw erreur_('Adresse mail non vérifiée.', 'NON_CONNECTE');
    email = String(info.email).toLowerCase();
    cache.put(key, email, 600);
  }
  const user = all_('Utilisateurs').filter(function (u) {
    return u.email === email && u.actif !== 'non';
  })[0];
  if (!user) throw erreur_('L\'adresse ' + email + ' n\'est pas autorisée. Demandez à l\'administrateur de l\'ajouter.', 'ACCES_REFUSE');
  return user;
}

/**
 * Ce que chaque rôle peut faire.
 *  - administrateur : tout ;
 *  - technicien : voir les chantiers (sans en créer), noter l'avancement, discuter, déposer des documents et photos,
 *    demander du matériel, réceptionner, PV, fin de chantier, et gérer SES présences, trajets et demandes de congé.
 */
const ACTIONS_TECHNICIEN = ['avancement', 'commentaire', 'envoyerFichier', 'receptionCommande', 'enregistrerPV',
  'chantierTermine', 'demandeFactureInter', 'demanderMateriel', 'localiserChantier', 'enregistrerPointage',
  'demanderConge', 'annulerConge', 'modifierCommentaire', 'supprimerCommentaire',
  'enregistrerAppareil', 'supprimerAppareil', 'pushTest'];

/** Aiguillage des demandes */
function router_(action, d, user) {
  const lectures = {
    boot: function () { return boot_(user); },
    dossier: function () { return detailDossier_(d.id, user); },
    trajetsPdf: function () { return trajetsPdf_(d, user); },
    chercherAgenda: function () { adminSeul_(user); return chercherAgenda_(d); }
  };
  if (lectures[action]) return lectures[action]();

  const ecritures = {
    scannerAgenda: function () { return { nouveaux: scannerAgenda_() }; },
    synchroAgenda: function () { return { changements: synchroAgenda_() }; },
    dossierDepuisAgenda: function () { return dossierDepuisAgenda_(d, user); },
    modifierDossier: function () { return modifierDossier_(d, user); },
    ignorer: function () { return changerEtape_(d.id, 'ignore', user, 'Rendez-vous ignoré'); },
    devisFait: function () { return devisFait_(d, user); },
    reponseClient: function () { return reponseClient_(d, user); },
    ajouterCommande: function () { return ajouterCommande_(d, user); },
    modifierCommande: function () { return modifierCommande_(d, user); },
    demanderMateriel: function () { return demanderMateriel_(d, user); },
    envoyerFichier: function () { return envoyerFichier_(d, user); },
    planifier: function () { return planifier_(d, user); },
    avancement: function () { return avancement_(d, user); },
    commentaire: function () { return commentaire_(d, user); },
    demandeFactureInter: function () { return demandeFactureInter_(d, user); },
    chantierTermine: function () { return chantierTermine_(d, user); },
    factureFaite: function () { return factureFaite_(d, user); },
    etapePrecedente: function () { return etapePrecedente_(d, user); },
    creerDossier: function () { return creerDossier_(d, user); },
    supprimerDossier: function () { return supprimerDossier_(d, user); },
    supprimerDossiers: function () { return supprimerDossiers_(d, user); },
    supprimerCommande: function () { return supprimerCommande_(d, user); },
    receptionCommande: function () { return receptionCommande_(d, user); },
    enregistrerPV: function () { return enregistrerPV_(d, user); },
    supprimerDocument: function () { return supprimerDocument_(d, user); },
    renommerDocument: function () { return renommerDocument_(d, user); },
    classerDocument: function () { return classerDocument_(d, user); },
    annulerReception: function () { return annulerReception_(d, user); },
    modifierFacture: function () { return modifierFacture_(d, user); },
    supprimerFacture: function () { return supprimerFacture_(d, user); },
    annulerFacture: function () { return annulerFacture_(d, user); },
    modifierCommentaire: function () { return modifierCommentaire_(d, user); },
    supprimerCommentaire: function () { return supprimerCommentaire_(d, user); },
    localiserChantier: function () { return localiserChantier_(d, user); },
    enregistrerPointage: function () { return enregistrerPointage_(d, user); },
    supprimerPointage: function () { return supprimerPointage_(d, user); },
    demanderConge: function () { return demanderConge_(d, user); },
    deciderConge: function () { return deciderConge_(d, user); },
    annulerConge: function () { return annulerConge_(d, user); },
    enregistrerReglages: function () { return enregistrerReglages_(d); },
    enregistrerMails: function () { return enregistrerMails_(d.mails); },
    enregistrerUtilisateurs: function () { return enregistrerUtilisateurs_(d.users); },
    enregistrerAccesDocs: function () { return enregistrerAccesDocs_(d); },
    importKraaft: function () { adminSeul_(user); return importKraaft_(d, user); },
    kraaftCle: function () { adminSeul_(user); return enregistrerCleKraaft_(d); },
    kraaftExplorer: function () { adminSeul_(user); return explorerKraaft_(); },
    kraaftConversations: function () { adminSeul_(user); return conversationsKraaft_(); },
    kraaftReprendre: function () { adminSeul_(user); return reprendreKraaft_(d, user); },
    kraaftAuteurs: function () { adminSeul_(user); return nommerAuteursKraaft_(d); },
    kraaftSync: function () { adminSeul_(user); return reglerSyncKraaft_(d); },
    mailTest: function () { return mailTest_(d.cle, user); },
    smsTest: function () { return smsTest_(d, user); },
    enregistrerAppareil: function () { return enregistrerAppareil_(d, user); },
    supprimerAppareil: function () { return supprimerAppareil_(d, user); },
    pushTest: function () { return pushTest_(user); },
    enregistrerCleFirebase: function () { return enregistrerCleFirebase_(d); },
    demoCharger: function () { return chargerDemo_(); },
    demoSupprimer: function () { return supprimerDemo_(); }
  };
  if (!ecritures[action]) throw erreur_('Action inconnue : ' + action);
  if (user.role !== 'admin' && ACTIONS_TECHNICIEN.indexOf(action) < 0) {
    throw erreur_('Cette action est réservée à l\'administrateur.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let resultat = null;
  try {
    resultat = ecritures[action]();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  CACHE_ = {};
  const out = boot_(user);
  out.resultat = resultat;
  return out;
}

function adminSeul_(user) {
  if (user.role !== 'admin') throw erreur_('Seul un administrateur peut faire cette action.');
}

const estAdmin_ = function (user) { return user && user.role === 'admin'; };

/** Étapes où un dossier est un « chantier » visible par les techniciens */
function estChantier_(d) {
  return ['planifie', 'en_cours', 'termine'].indexOf(d.etape) >= 0 ||
    (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0);
}

/** Types de documents : [{ cle, lib }] */
function typesDocs_() {
  return String(lireReglages_().typesDocs || TYPES_DOCS_DEFAUT).split(',').map(function (x) {
    const p = x.split(':');
    return { cle: normaliser_(p[0]).trim().replace(/[^a-z0-9_]/g, ''), lib: (p[1] || p[0]).trim() };
  }).filter(function (t) { return t.cle; });
}

/** Dossiers de documents visibles par défaut (nouveau technicien) */
function docsTech_() {
  return String(lireReglages_().docsTech || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** Dossiers de documents qu'un utilisateur peut voir (l'administrateur voit tout) */
function docsDe_(user) {
  if (estAdmin_(user)) return typesDocs_().map(function (t) { return t.cle; });
  const u = utilisateur_(user.email) || user;
  const v = String(u.docs || '').trim();
  if (v === 'aucun') return [];
  if (!v) return docsTech_();
  return v.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** Dossiers visibles par au moins un technicien actif (ceux-là s'ouvrent par lien) */
function docsPartages_() {
  const vus = {};
  techniciensActifs_().forEach(function (u) { docsDe_(u).forEach(function (t) { vus[t] = true; }); });
  return Object.keys(vus);
}

/** Un utilisateur voit-il ce document ? */
function docVisible_(doc, user) {
  return estAdmin_(user) || docsDe_(user).indexOf(doc.type) >= 0;
}

/**
 * Accès aux dossiers de documents, technicien par technicien (administrateur seulement).
 * d.acces = { email: ['plan', 'photo'…] } ; d.defaut = ['plan', …] pour les nouveaux techniciens.
 */
function enregistrerAccesDocs_(d) {
  const cles = typesDocs_().map(function (t) { return t.cle; });
  const propre = function (l) { return (l || []).filter(function (x) { return cles.indexOf(x) >= 0; }); };
  if (d.defaut) update_('Reglages', 'cle', 'docsTech', { valeur: propre(d.defaut).join(',') });
  Object.keys(d.acces || {}).forEach(function (email) {
    const u = utilisateur_(email);
    if (!u || u.role === 'admin') return;
    const l = propre(d.acces[email]);
    update_('Utilisateurs', 'email', u.email, { docs: l.length ? l.join(',') : 'aucun' });
  });
  CACHE_ = {};
  appliquerPartageDocs_();
}

function boot_(user) {
  const reg = lireReglages_();
  const admin = estAdmin_(user);
  // La clé SMS ne quitte jamais le programme Google : les écrans savent seulement si elle est remplie
  const regPublics = {};
  Object.keys(reg).forEach(function (k) { if (k !== 'smsCle') regPublics[k] = reg[k]; });
  regPublics.smsCleOk = reg.smsCle ? 'oui' : 'non';
  const compteFcm = compteFirebase_();
  regPublics.firebaseOk = compteFcm ? 'oui' : 'non';
  regPublics.kraaftOk = PropertiesService.getScriptProperties().getProperty('KRAAFT_CLE') ? 'oui' : 'non';
  regPublics.firebaseProjet = compteFcm ? compteFcm.project_id : '';
  const appareils = all_('Appareils');
  const dossiers = all_('Dossiers');
  const visibles = admin ? dossiers : dossiers.filter(estChantier_);
  const ids = {};
  visibles.forEach(function (d) { ids[d.id] = true; });
  const pourMoi = function (x) { return admin || x.email === user.email; };
  return {
    user: user,
    etapes: ETAPES,
    reglages: regPublics,
    typesDocs: typesDocs_(),
    mesDocs: docsDe_(user),
    mails: admin ? all_('Mails') : [],
    users: all_('Utilisateurs').map(function (u) {
      if (admin) {
        const c = JSON.parse(JSON.stringify(u));
        c.docsEffectifs = docsDe_(u);
        c.nbAppareils = appareils.filter(function (a) { return a.email === u.email; }).length;
        return c;
      }
      return { email: u.email, nom: u.nom, role: u.role, actif: u.actif, telephone: u.telephone };
    }),
    dossiers: visibles,
    commandes: all_('Commandes').filter(function (c) { return ids[c.dossierId]; }),
    factures: admin ? all_('Factures') : [],
    documents: all_('Documents').filter(function (x) { return ids[x.dossierId] && docVisible_(x, user); }),
    interventions: all_('Interventions').filter(function (x) { return ids[x.dossierId]; }),
    versionProgramme: VERSION_PROGRAMME,
    alerteAgenda: admin ? (PropertiesService.getScriptProperties().getProperty('ERREUR_AGENDA') || '') : '',
    mesAppareils: appareils.filter(function (a) { return a.email === user.email; })
      .map(function (a) { return { id: a.id, appareil: a.appareil, creeLe: a.creeLe, fin: String(a.jeton).slice(-12) }; }),
    nonLus: nonLus_(user, ids),
    derniersMessages: derniersNonLus_(user, ids),
    pointages: all_('Pointages').filter(pourMoi),
    conges: all_('Conges').filter(pourMoi),
    aujourdhui: jour_(new Date())
  };
}

function detailDossier_(id, user) {
  const dossier = trouver_('Dossiers', 'id', id);
  if (!dossier) throw erreur_('Dossier introuvable.');
  const admin = estAdmin_(user);
  if (!admin && !estChantier_(dossier)) throw erreur_('Ce dossier n\'est pas encore un chantier.');
  try { Object.assign(dossier, majTemps_(id)); } catch (e) { Logger.log('Temps : ' + e); }
  const vuAvant = marquerLu_(user.email, id);
  return {
    vuAvant: vuAvant,
    dossier: dossier,
    commandes: all_('Commandes').filter(function (c) { return c.dossierId === id; }),
    factures: admin ? all_('Factures').filter(function (f) { return f.dossierId === id; }) : [],
    commentaires: all_('Commentaires').filter(function (c) { return c.dossierId === id; }),
    documents: all_('Documents').filter(function (x) { return x.dossierId === id && docVisible_(x, user); }),
    interventions: interventionsDe_(id),
    historique: admin ? all_('Historique').filter(function (h) { return h.dossierId === id; }).reverse() : []
  };
}

/* ==================================================================
 * 4. ACTIONS SUR LES DOSSIERS
 * ================================================================== */

function dossierOuErreur_(id) {
  const d = trouver_('Dossiers', 'id', id);
  if (!d) throw erreur_('Dossier introuvable.');
  return d;
}

function majDossier_(id, patch) {
  patch.majLe = horodatage_(new Date());
  update_('Dossiers', 'id', id, patch);
}

function changerEtape_(id, etape, user, note) {
  if (!ETAPES[etape]) throw erreur_('Étape inconnue.');
  dossierOuErreur_(id);
  majDossier_(id, { etape: etape });
  log_(id, user, ETAPES[etape], note || '');
}

/** Champs modifiables librement depuis la fiche */
function modifierDossier_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const permis = ['client', 'lieu', 'numDevis', 'commentaireDevis', 'delaiRelance', 'prochaineRelance',
    'numCommande', 'chantier', 'dateDebut', 'dateFin', 'techniciens'];
  const patch = {};
  const changes = [];
  permis.forEach(function (k) {
    if (d.champs && d.champs[k] !== undefined && String(d.champs[k]) !== String(dos[k])) {
      patch[k] = String(d.champs[k]);
      changes.push(k);
    }
  });
  // Un nouveau délai de relance recalcule la prochaine relance
  if (patch.delaiRelance !== undefined && patch.prochaineRelance === undefined && dos.dateDevis && dos.etape === 'devis_envoye') {
    patch.prochaineRelance = jour_(ajouterJours_(dos.dateDevis, Number(patch.delaiRelance || delaiMail_('relance_client'))));
  }
  if (d.champs && d.champs.tempsValeur !== undefined) {
    const t = tempsPrevuDe_(d.champs.tempsValeur, d.champs.tempsUnite);
    if (t.tempsPrevu !== String(dos.tempsPrevu || '') || t.tempsUnite !== String(dos.tempsUnite || '') || t.tempsValeur !== String(dos.tempsValeur || '')) {
      Object.keys(t).forEach(function (k) { patch[k] = t[k]; });
      changes.push('temps prévu');
    }
  }
  if (!changes.length) return;
  majDossier_(d.id, patch);
  log_(d.id, user, 'Modification', changes.join(', '));
  if (patch.lieu !== undefined) {
    try { localiserParAdresse_(d.id, patch.lieu); } catch (e) { Logger.log('Localisation : ' + e); }
  }
}

function devisFait_(d, user) {
  const dos = dossierOuErreur_(d.id);
  if (!d.numDevis) throw erreur_('Le numéro de devis est obligatoire.');
  if (!d.client) throw erreur_('Le nom du client est obligatoire.');
  const today = jour_(new Date());
  const delai = Number(dos.delaiRelance || delaiMail_('relance_client'));
  majDossier_(d.id, {
    numDevis: d.numDevis, client: d.client, commentaireDevis: d.commentaire || '',
    dateDevis: today, prochaineRelance: jour_(ajouterJours_(today, delai)), etape: 'devis_envoye'
  });
  log_(d.id, user, 'Devis fait', 'N° ' + d.numDevis + (d.commentaire ? ' – ' + d.commentaire : ''));
  if (dos.eventKey) cocherAgenda_(dos.eventKey);
}

function reponseClient_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const today = jour_(new Date());
  if (d.type === 'report') {
    if (!d.date) throw erreur_('Indiquez la date de la prochaine relance.');
    const notes = (dos.notesRelance ? dos.notesRelance + '\n' : '') + formatFr_(today) + ' : ' + (d.notes || 'report');
    majDossier_(d.id, { prochaineRelance: d.date, notesRelance: notes });
    resetRelance_('relance_client|' + d.id);
    log_(d.id, user, 'Relance : report', 'Nouvelle relance le ' + formatFr_(d.date) + (d.notes ? ' – ' + d.notes : ''));
  } else if (d.type === 'refuse') {
    majDossier_(d.id, { etape: 'refuse', motifRefus: d.motif || '', commentaireRefus: d.commentaire || '', dateCloture: today });
    log_(d.id, user, 'Devis refusé', (d.motif || '') + (d.commentaire ? ' – ' + d.commentaire : ''));
  } else if (d.type === 'valide') {
    const patch = { etape: 'commande', numCommande: d.numCommande || '', dateValidation: today };
    const t = tempsPrevuDe_(d.tempsValeur, d.tempsUnite);
    Object.keys(t).forEach(function (k) { patch[k] = t[k]; });
    majDossier_(d.id, patch);
    log_(d.id, user, 'Devis validé', (d.numCommande ? 'Commande n° ' + d.numCommande : 'Numéro de commande à saisir') +
      (t.tempsPrevu ? ' – temps prévu : ' + libelleTemps_(Number(t.tempsPrevu)) : ''));
    envoyerMaintenant_('nouvelle_commande', varsDossier_(trouver_('Dossiers', 'id', d.id)), d.id);
  } else {
    throw erreur_('Réponse inconnue.');
  }
}

function ajouterCommande_(d, user) {
  const dos = dossierOuErreur_(d.dossierId);
  if (!d.fournisseur) throw erreur_('Indiquez le fournisseur.');
  if (!d.dateLivraison) throw erreur_('Indiquez la date de livraison.');
  const chantier = d.chantier || dos.chantier;
  if (!chantier) throw erreur_('Indiquez le nom du chantier.');
  const champs = {
    statut: 'commandee', fournisseur: d.fournisseur,
    dateCommande: d.dateCommande || jour_(new Date()), dateLivraison: d.dateLivraison, commentaire: d.commentaire || ''
  };
  const demande = d.commandeId ? trouver_('Commandes', 'id', d.commandeId) : null;
  if (demande) {
    // La liste demandée par le technicien devient une vraie commande
    update_('Commandes', 'id', demande.id, champs);
  } else {
    champs.id = nouvelId_('C'); champs.dossierId = d.dossierId; champs.demo = dos.demo; champs.creeLe = horodatage_(new Date());
    insert_('Commandes', champs);
  }
  const patch = { chantier: chantier };
  if (dos.etape === 'commande') patch.etape = 'materiel';
  majDossier_(d.dossierId, patch);
  log_(d.dossierId, user, 'Commande matériel', d.fournisseur + ' – livraison le ' + formatFr_(d.dateLivraison));
}

function modifierCommande_(d, user) {
  const c = trouver_('Commandes', 'id', d.id);
  if (!c) throw erreur_('Commande introuvable.');
  const patch = {};
  ['fournisseur', 'dateCommande', 'dateLivraison', 'commentaire', 'demande'].forEach(function (k) {
    if (d[k] !== undefined) patch[k] = String(d[k]);
  });
  update_('Commandes', 'id', d.id, patch);
  if (patch.dateLivraison && patch.dateLivraison !== c.dateLivraison) {
    resetRelance_('livraison|' + d.id);
    resetRelance_('reception|' + d.id);
  }
  log_(c.dossierId, user, c.statut === 'demandee' ? 'Demande de matériel modifiée' : 'Commande modifiée', c.fournisseur || '');
}

/**
 * Bouton « Matériel à commander » (technicien) : la liste part par mail à l'administrateur
 * et reste dans le chantier, où l'on indiquera ensuite la commande puis la réception.
 */
function demanderMateriel_(d, user) {
  const dos = dossierOuErreur_(d.dossierId);
  const liste = String(d.demande || '').trim();
  if (!liste) throw erreur_('Écrivez la liste du matériel.');
  const id = nouvelId_('C');
  insert_('Commandes', {
    id: id, dossierId: dos.id, statut: 'demandee', demande: liste, demandePar: user.nom || user.email,
    dateDemande: jour_(new Date()), commentaire: d.commentaire || '', demo: dos.demo, creeLe: horodatage_(new Date())
  });
  log_(dos.id, user, 'Matériel demandé', liste.slice(0, 120));
  const vars = varsDossier_(dos);
  vars.demande_par = user.nom || user.email;
  vars.liste_materiel = liste + (d.commentaire ? '\n\n' + d.commentaire : '');
  envoyerMaintenant_('materiel_demande', vars, dos.id, 'materiel_demande|' + id);
  return id;
}

function envoyerFichier_(d, user) {
  const dos = dossierOuErreur_(d.dossierId);
  if (!d.base64) throw erreur_('Fichier vide.');
  const types = typesDocs_().map(function (t) { return t.cle; });
  const estDoc = types.indexOf(d.type) >= 0;
  if (!estAdmin_(user)) {
    if (!estChantier_(dos)) throw erreur_('Ce dossier n\'est pas encore un chantier.');
    if (estDoc && docsDe_(user).indexOf(d.type) < 0) throw erreur_('Vous n\'avez pas accès à ce dossier de documents.');
  }
  const folder = dossierDrive_(dos);
  const blob = Utilities.newBlob(Utilities.base64Decode(d.base64), d.mime || 'application/octet-stream', d.nomFichier || d.nom || 'fichier');
  const file = folder.createFile(blob);
  // Partage : les documents visibles par les techniciens (et la discussion) s'ouvrent par lien,
  // les autres (devis, factures…) restent réservés aux administrateurs.
  const partage = !estDoc || docsPartages_().indexOf(d.type) >= 0;
  if (partage) partagerParLien_(file);
  if (estDoc) {
    insert_('Documents', {
      id: nouvelId_('P'), dossierId: dos.id, type: d.type, fichier: file.getId(), nom: d.nom || file.getName(),
      mime: d.mime || '', date: horodatage_(new Date()), auteur: user.nom || user.email, demo: dos.demo
    });
    const lib = (typesDocs_().filter(function (t) { return t.cle === d.type; })[0] || {}).lib || 'Document';
    log_(dos.id, user, 'Document déposé (' + lib + ')', d.nom || '');
  } else if (d.type === 'reception') {
    update_('Commandes', 'id', d.commandeId, { receptionPhoto: file.getId() });
    log_(dos.id, user, 'Photo de réception ajoutée', d.nom || '');
  } else {
    // Discussion du chantier : photo ou document joint à un message
    const image = /^image\//.test(d.mime || '');
    insert_('Commentaires', {
      id: nouvelId_('M'), dossierId: dos.id, date: horodatageSec_(new Date()), auteur: user.nom || user.email,
      auteurEmail: user.email, texte: d.texte || '', photo: image ? file.getId() : '',
      fichier: image ? '' : file.getId(), nomFichier: image ? '' : (d.nomFichier || d.nom || file.getName()),
      mime: d.mime || '', demo: dos.demo
    });
    log_(dos.id, user, image ? 'Photo dans la discussion' : 'Document dans la discussion', d.nom || '');
    marquerLu_(user.email, dos.id);
    notifierMessage_(dos, user, (d.texte ? d.texte + '\n' : '') + (image ? '📷 Une photo a été ajoutée.' : '📎 Document joint : ' + (d.nomFichier || d.nom || file.getName())));
  }
}

/** Le fichier s'ouvre avec son lien (sans compte particulier) ; le lien n'est donné que dans l'appli */
function partagerParLien_(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { Logger.log('Partage : ' + e); }
}
function retirerPartageLien_(file) {
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { Logger.log('Partage : ' + e); }
}

/** Change le type d'un document (plan, devis, photo…) et adapte son partage */
function classerDocument_(d, user) {
  const doc = trouver_('Documents', 'id', d.id);
  if (!doc) throw erreur_('Document introuvable.');
  const types = typesDocs_();
  const t = types.filter(function (x) { return x.cle === d.type; })[0];
  if (!t) throw erreur_('Type de document inconnu.');
  update_('Documents', 'id', doc.id, { type: t.cle });
  try {
    const f = DriveApp.getFileById(doc.fichier);
    if (docsPartages_().indexOf(t.cle) >= 0) partagerParLien_(f); else retirerPartageLien_(f);
  } catch (e) { Logger.log('Classement : ' + e); }
  log_(doc.dossierId, user, 'Document classé en « ' + t.lib + ' »', doc.nom || '');
}

/** Après un changement de réglage, remet le partage de chaque document en accord avec son type */
function appliquerPartageDocs_() {
  const visibles = docsPartages_();
  all_('Documents').forEach(function (doc) {
    try {
      const f = DriveApp.getFileById(doc.fichier);
      if (visibles.indexOf(doc.type) >= 0) partagerParLien_(f); else retirerPartageLien_(f);
    } catch (e) { Logger.log('Partage ' + doc.id + ' : ' + e); }
  });
}

/* ------------------------------------------------------------------
 * Planning : périodes d'intervention, écrites dans l'agenda du compte principal
 * ------------------------------------------------------------------ */

const LIB_CRENEAU = { journee: 'journée', matin: 'matin', apres_midi: 'après-midi' };

function interventionsDe_(dossierId) {
  return all_('Interventions').filter(function (x) { return x.dossierId === dossierId; })
    .sort(function (a, b) {
      const ka = a.date + (a.creneau === 'apres_midi' ? '2' : '1');
      const kb = b.date + (b.creneau === 'apres_midi' ? '2' : '1');
      return ka < kb ? -1 : 1;
    });
}

/** Heures de début et de fin d'une intervention, selon les réglages */
function horairesIntervention_(date, creneau) {
  const reg = lireReglages_();
  const h = function (k) { return String(reg[k] || REGLAGES_DEFAUT[k]).split(':').map(Number); };
  const debut = creneau === 'apres_midi' ? h('apremDebut') : h('matinDebut');
  const fin = creneau === 'matin' ? h('matinFin') : h('apremFin');
  const p = String(date).split('-').map(Number);
  return {
    debut: new Date(p[0], p[1] - 1, p[2], debut[0], debut[1] || 0),
    fin: new Date(p[0], p[1] - 1, p[2], fin[0], fin[1] || 0)
  };
}

/**
 * Jours d'une période : le premier et le dernier jour gardent leur créneau,
 * les jours entre les deux sont des journées entières.
 */
function joursPeriode_(it) {
  const debut = it.date;
  const fin = it.dateFin && it.dateFin >= it.date ? it.dateFin : it.date;
  const out = [];
  for (let j = debut, n = 0; j <= fin && n < 90; j = jour_(ajouterJours_(j, 1)), n++) {
    let creneau = 'journee';
    if (j === debut) creneau = it.creneau || 'journee';
    else if (j === fin) creneau = it.creneauFin || 'journee';
    out.push({ date: j, creneau: creneau });
  }
  return out;
}

function libellePeriode_(it) {
  const jours = joursPeriode_(it);
  if (jours.length === 1) return formatFr_(it.date) + ' (' + LIB_CRENEAU[jours[0].creneau] + ')';
  return 'du ' + formatFr_(it.date) + ' (' + LIB_CRENEAU[jours[0].creneau] + ') au ' +
    formatFr_(jours[jours.length - 1].date) + ' (' + LIB_CRENEAU[jours[jours.length - 1].creneau] + ')';
}

/** Crée un rendez-vous pour chaque jour de la période ; renvoie la liste des identifiants */
function ecrireIntervention_(dos, it) {
  const cal = agenda_();
  const jours = joursPeriode_(it);
  const noms = String(it.techniciens !== undefined && it.techniciens !== '' ? it.techniciens : (dos.techniciens || '')).split(',').filter(Boolean).map(prenomDe_).join(', ');
  const titre = '🔨 ' + (dos.chantier || dos.client || 'Chantier') + ' – ' + (dos.client || '') + (noms ? ' (' + noms + ')' : '');
  return jours.map(function (j, i) {
    const t = horairesIntervention_(j.date, j.creneau);
    const notes = (it.travaux ? 'Travaux à faire :\n' + it.travaux + '\n\n' : '') +
      'Créneau : ' + LIB_CRENEAU[j.creneau] + (jours.length > 1 ? ' – jour ' + (i + 1) + ' sur ' + jours.length : '') +
      '\nDossier : ' + CONFIG.APP_URL + '/?depuis=mail#/dossier/' + dos.id;
    const ev = cal.createEvent(titre, t.debut, t.fin, { description: notes, location: dos.lieu || '' });
    try { ev.setTag('suiviAffaires', 'intervention'); } catch (e) { /* marque facultative */ }
    return ev.getId();
  });
}

/** Supprime les rendez-vous d'une période (identifiants séparés par des virgules) */
function effacerEvenement_(eventIds) {
  String(eventIds || '').split(',').filter(Boolean).forEach(function (id) {
    try {
      const ev = agenda_().getEventById(id);
      if (ev) ev.deleteEvent();
    } catch (e) { Logger.log('Suppression agenda : ' + e); }
  });
}

/** Supprime toutes les interventions d'un dossier (et leurs rendez-vous) */
function supprimerInterventions_(dossierId) {
  interventionsDe_(dossierId).forEach(function (it) {
    effacerEvenement_(it.eventId);
    delete_('Interventions', 'id', it.id);
  });
}

/**
 * Planifie le chantier : d.interventions = [{ id?, date, creneau, dateFin, creneauFin, travaux }].
 * Chaque période donne un rendez-vous par jour dans l'agenda ; à chaque enregistrement,
 * les rendez-vous des périodes modifiées ou retirées sont recréés ou supprimés.
 */
function planifier_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const liste = (d.interventions || []).filter(function (x) { return x && x.date; });
  if (!liste.length) throw erreur_('Ajoutez au moins une période d\'intervention.');
  liste.forEach(function (x) {
    if (!x.dateFin) x.dateFin = x.date;
    if (x.dateFin < x.date) throw erreur_('Une période se termine avant de commencer (' + formatFr_(x.date) + ').');
    if (ecartJours_(x.date, x.dateFin) > 60) throw erreur_('Une période ne peut pas dépasser 60 jours.');
    if (!LIB_CRENEAU[x.creneau]) x.creneau = 'journee';
    if (!LIB_CRENEAU[x.creneauFin] || x.dateFin === x.date) x.creneauFin = x.dateFin === x.date ? x.creneau : 'journee';
    x.travaux = String(x.travaux || '').trim();
    // Techniciens de la période ; à défaut, ceux du chantier
    x.techniciens = String(x.techniciens !== undefined ? x.techniciens : (d.techniciens || '')).split(',')
      .map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean).join(',');
  });
  const debuts = liste.map(function (x) { return x.date; }).sort();
  const fins = liste.map(function (x) { return x.dateFin; }).sort();
  // Techniciens du chantier = tous ceux prévus sur au moins une période
  const tous = {};
  liste.forEach(function (x) { x.techniciens.split(',').filter(Boolean).forEach(function (e) { tous[e] = true; }); });
  const patch = { dateDebut: debuts[0], dateFin: fins[fins.length - 1], techniciens: Object.keys(tous).join(',') };
  if (d.chantier) patch.chantier = d.chantier;
  if (['commande', 'materiel'].indexOf(dos.etape) >= 0) patch.etape = 'planifie';
  majDossier_(d.id, patch);
  const dosMaj = trouver_('Dossiers', 'id', d.id);
  const agendaOk = dos.demo !== 'oui';

  const existantes = interventionsDe_(d.id);
  const gardees = {};
  liste.forEach(function (x) { if (x.id) gardees[x.id] = true; });
  existantes.forEach(function (it) {
    if (!gardees[it.id]) { effacerEvenement_(it.eventId); delete_('Interventions', 'id', it.id); }
  });
  liste.forEach(function (x) {
    const ancienne = x.id ? existantes.filter(function (it) { return it.id === x.id; })[0] : null;
    if (ancienne) effacerEvenement_(ancienne.eventId);
    let eventIds = '';
    if (agendaOk) {
      try { eventIds = ecrireIntervention_(dosMaj, x).join(','); } catch (e) { Logger.log('Agenda : ' + e); }
    }
    const ligne = { date: x.date, creneau: x.creneau, dateFin: x.dateFin, creneauFin: x.creneauFin, travaux: x.travaux, eventId: eventIds, techniciens: x.techniciens };
    if (ancienne) update_('Interventions', 'id', ancienne.id, ligne);
    else {
      ligne.id = nouvelId_('I'); ligne.dossierId = d.id; ligne.demo = dos.demo; ligne.creeLe = horodatage_(new Date());
      insert_('Interventions', ligne);
    }
  });
  log_(d.id, user, 'Chantier planifié', liste.map(function (x) {
    const noms = x.techniciens.split(',').filter(Boolean).map(prenomDe_).join(', ');
    return libellePeriode_(x) + (noms ? ' (' + noms + ')' : '');
  }).join(', '));
  try { majTemps_(d.id); } catch (e) { Logger.log('Temps : ' + e); }
  if (!dosMaj.lat && dosMaj.lieu) {
    try { localiserParAdresse_(d.id, dosMaj.lieu); } catch (e) { Logger.log('Localisation : ' + e); }
  }
}

function avancement_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const pct = Math.max(0, Math.min(100, Math.round(Number(d.pct) || 0)));
  const patch = { avancement: String(pct) };
  if (pct > 0 && ['commande', 'materiel', 'planifie'].indexOf(dos.etape) >= 0) patch.etape = 'en_cours';
  majDossier_(d.id, patch);
  log_(d.id, user, 'Avancement', pct + ' %');
}

function commentaire_(d, user) {
  const dos = dossierOuErreur_(d.id);
  if (!d.texte || !String(d.texte).trim()) throw erreur_('Le commentaire est vide.');
  insert_('Commentaires', {
    id: nouvelId_('M'), dossierId: d.id, date: horodatageSec_(new Date()), auteur: user.nom || user.email,
    auteurEmail: user.email, texte: String(d.texte).trim(), photo: '', demo: dos.demo
  });
  log_(d.id, user, 'Message', String(d.texte).slice(0, 80));
  marquerLu_(user.email, d.id);
  notifierMessage_(dos, user, String(d.texte).trim());
}

function demandeFactureInter_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const pct = Math.round(Number(d.pct) || 0);
  if (pct <= 0 || pct >= 100) throw erreur_('Indiquez un pourcentage entre 1 et 99.');
  const id = nouvelId_('F');
  insert_('Factures', {
    id: id, dossierId: d.id, type: 'intermediaire', pourcentage: String(pct), commentaire: d.commentaire || '',
    dateDemande: jour_(new Date()), demandePar: user.nom || user.email, faite: 'non', dateFaite: '', demo: dos.demo
  });
  log_(d.id, user, 'Facture intermédiaire demandée', pct + ' %' + (d.commentaire ? ' – ' + d.commentaire : ''));
  const vars = varsDossier_(dos);
  vars.pourcentage = String(pct);
  vars.commentaire = d.commentaire || '';
  envoyerMaintenant_('facture_inter', vars, d.id, 'facture_inter|' + id);
}

function chantierTermine_(d, user) {
  const dos = dossierOuErreur_(d.id);
  if (d.pvStatut && ['sans_reserves', 'avec_reserves'].indexOf(d.pvStatut) < 0) {
    throw erreur_('Indiquez si le PV est sans réserves ou avec réserves.');
  }
  const today = jour_(new Date());
  majDossier_(d.id, { etape: 'termine', avancement: '100', dateFinChantier: today });
  const existe = all_('Factures').some(function (f) { return f.dossierId === d.id && f.type === 'finale'; });
  if (!existe) {
    insert_('Factures', {
      id: nouvelId_('F'), dossierId: d.id, type: 'finale', pourcentage: '100', commentaire: d.commentaire || '',
      dateDemande: today, demandePar: user.nom || user.email, faite: 'non', dateFaite: '', demo: dos.demo
    });
  }
  log_(d.id, user, 'Chantier terminé', d.commentaire || '');
  if (d.pvStatut) enregistrerPV_(d, user);
  envoyerMaintenant_('a_facturer', varsDossier_(trouver_('Dossiers', 'id', d.id)), d.id, 'a_facturer|' + d.id);
}

function factureFaite_(d, user) {
  const f = trouver_('Factures', 'id', d.factureId);
  if (!f) throw erreur_('Facture introuvable.');
  const today = jour_(new Date());
  update_('Factures', 'id', f.id, { faite: 'oui', dateFaite: today });
  if (f.type === 'finale') {
    majDossier_(f.dossierId, { etape: 'facture', factureFaite: 'oui', dateCloture: today });
    log_(f.dossierId, user, 'Facture finale faite', 'Dossier clos');
  } else {
    log_(f.dossierId, user, 'Facture intermédiaire faite', f.pourcentage + ' %');
  }
}

/* ==================================================================
 * 4 ter. RÉCEPTION DU MATÉRIEL (une réception par commande fournisseur)
 * ================================================================== */

const LIB_RECEPTION = {
  '': 'pas encore réceptionné',
  conforme: 'conforme',
  non_conforme: 'non conforme, en attente de traitement',
  partielle: 'reçu en partie'
};

/**
 * Enregistre la réception d'une commande.
 * statut : conforme (commande close) | non_conforme (remise en attente de traitement) | partielle (reste à livrer)
 */
function receptionCommande_(d, user) {
  const c = trouver_('Commandes', 'id', d.id);
  if (!c) throw erreur_('Commande introuvable.');
  const statut = String(d.statut || '');
  if (['conforme', 'non_conforme', 'partielle'].indexOf(statut) < 0) {
    throw erreur_('Indiquez si la livraison est conforme, non conforme ou partielle.');
  }
  const today = jour_(new Date());
  const patch = {
    receptionStatut: statut,
    dateReception: d.dateReception || today,
    receptionPar: d.receptionPar || user.nom || user.email,
    numBL: d.numBL || '',
    receptionCommentaire: d.commentaire || ''
  };
  if (statut === 'partielle') {
    if (!d.nouvelleDate) throw erreur_('Indiquez la date de livraison prévue pour le reste.');
    patch.dateLivraison = d.nouvelleDate;
  }
  update_('Commandes', 'id', c.id, patch);

  if (statut === 'partielle') {
    // Le reste est attendu à la nouvelle date : les rappels repartent de là
    resetRelance_('livraison|' + c.id);
    resetRelance_('reception|' + c.id);
  } else if (statut === 'non_conforme') {
    // La relance « réception » reprendra au rythme choisi, pas dans l'heure
    marquerRelance_('reception|' + c.id, today);
  }

  const note = c.fournisseur + (patch.numBL ? ' – BL ' + patch.numBL : '') +
    (statut === 'partielle' ? ' – reste attendu le ' + formatFr_(patch.dateLivraison) : '') +
    (patch.receptionCommentaire ? ' – ' + patch.receptionCommentaire : '');
  log_(c.dossierId, user, 'Réception : ' + LIB_RECEPTION[statut], note);

  if (statut === 'non_conforme') {
    const dos = trouver_('Dossiers', 'id', c.dossierId);
    const vars = varsDossier_(dos, trouver_('Commandes', 'id', c.id));
    vars.commentaire = patch.receptionCommentaire;
    envoyerMaintenant_('reception_nc', vars, dos.id);
  }
}

/** Annule une réception saisie par erreur : la commande redevient « à réceptionner » */
function annulerReception_(d, user) {
  const c = trouver_('Commandes', 'id', d.id);
  if (!c) throw erreur_('Commande introuvable.');
  const motif = motifObligatoire_(d);
  update_('Commandes', 'id', c.id, {
    receptionStatut: '', dateReception: '', receptionPar: '', numBL: '', receptionCommentaire: ''
  });
  marquerRelance_('reception|' + c.id, jour_(new Date()));
  log_(c.dossierId, user, 'Réception annulée', c.fournisseur + ' – ' + motif);
}

/* ==================================================================
 * 4 quater. PV DE RÉCEPTION DU CHANTIER
 * ================================================================== */

const LIB_PV = { '': 'pas encore de PV', sans_reserves: 'sans réserves', avec_reserves: 'avec réserves' };

/** Documents du PV (et photos des réserves) d'un dossier */
function documentsPV_(dossierId) {
  return all_('Documents').filter(function (x) { return x.dossierId === dossierId && (x.type === 'pv' || x.type === 'reserve'); });
}

/**
 * Enregistre le PV : sans réserves ou avec réserves (les fichiers sont envoyés juste avant par « envoyerFichier »).
 * Avec réserves : mail immédiat (PV et photos joints).
 */
function enregistrerPV_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const statut = String(d.pvStatut || '');
  if (['sans_reserves', 'avec_reserves'].indexOf(statut) < 0) throw erreur_('Indiquez si le PV est sans réserves ou avec réserves.');
  const reserves = String(d.reserves || '').trim();
  majDossier_(dos.id, { pvStatut: statut, pvReserves: statut === 'avec_reserves' ? reserves : '', pvDate: jour_(new Date()) });
  log_(dos.id, user, 'PV de réception ' + LIB_PV[statut], reserves);
  if (statut === 'avec_reserves') {
    const vars = varsDossier_(trouver_('Dossiers', 'id', dos.id));
    envoyerMaintenant_('pv_reserves', vars, dos.id);
  }
}

/** Renomme un document (dans l'appli et dans Google Drive, en gardant l'extension du fichier) */
function renommerDocument_(d, user) {
  const doc = trouver_('Documents', 'id', d.id);
  if (!doc) throw erreur_('Document introuvable.');
  const nom = String(d.nom || '').trim();
  if (!nom) throw erreur_('Indiquez un nom.');
  update_('Documents', 'id', doc.id, { nom: nom });
  try {
    const f = DriveApp.getFileById(doc.fichier);
    const ext = (String(f.getName()).match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    f.setName(nom + (ext && !nom.toLowerCase().endsWith(ext.toLowerCase()) ? ext : ''));
  } catch (e) { Logger.log('Renommage Drive : ' + e); }
  log_(doc.dossierId, user, 'Document renommé', (doc.nom || '') + ' → ' + nom);
}

/** Retire un document du PV ; le fichier part dans la corbeille Google Drive (récupérable 30 jours) */
function supprimerDocument_(d, user) {
  const doc = trouver_('Documents', 'id', d.id);
  if (!doc) throw erreur_('Document introuvable.');
  delete_('Documents', 'id', doc.id);
  try { DriveApp.getFileById(doc.fichier).setTrashed(true); } catch (e) { Logger.log('Corbeille : ' + e); }
  log_(doc.dossierId, user, 'Document retiré', doc.nom || '');
}

/* ==================================================================
 * 4 bis. CORRECTIONS : RETOUR EN ARRIÈRE, SUPPRESSIONS, DOSSIER À LA MAIN
 * ================================================================== */

/** Étape précédente d'un dossier (null s'il n'y en a pas) */
function etapePrecedenteDe_(dos) {
  const aDesCommandes = all_('Commandes').some(function (c) { return c.dossierId === dos.id; });
  return {
    devis_envoye: 'devis_a_faire',
    commande: 'devis_envoye',
    materiel: 'commande',
    planifie: aDesCommandes ? 'materiel' : 'commande',
    en_cours: 'planifie',
    termine: 'en_cours',
    facture: 'termine',
    refuse: 'devis_envoye',
    ignore: 'devis_a_faire'
  }[dos.etape] || null;
}

function motifObligatoire_(d) {
  const m = String(d.motif || '').trim();
  if (!m) throw erreur_('Indiquez le motif du changement.');
  return m;
}

/** Revient d'une étape en arrière, en remettant les rappels à zéro à partir d'aujourd'hui */
function etapePrecedente_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const motif = motifObligatoire_(d);
  const cible = etapePrecedenteDe_(dos);
  if (!cible) throw erreur_('Ce dossier est déjà à la première étape.');
  const today = jour_(new Date());
  const patch = { etape: cible };

  if (cible === 'devis_envoye') {
    // La relance client repart d'aujourd'hui
    const delai = Number(dos.delaiRelance || delaiMail_('relance_client'));
    patch.prochaineRelance = jour_(ajouterJours_(today, delai));
    patch.dateValidation = '';
    patch.motifRefus = '';
    patch.commentaireRefus = '';
    patch.dateCloture = '';
    resetRelance_('relance_client|' + dos.id);
  }
  if (cible === 'devis_a_faire') {
    patch.dateCloture = '';
    marquerRelance_('devis_a_faire|' + dos.id, today);
  }
  if (cible === 'commande') marquerRelance_('commande_materiel|' + dos.id, today);
  if ((dos.etape === 'planifie') && (cible === 'commande' || cible === 'materiel')) {
    patch.dateDebut = '';
    patch.dateFin = '';
    supprimerInterventions_(dos.id);
  }
  if (dos.etape === 'en_cours') patch.avancement = '0';
  if (dos.etape === 'termine') {
    patch.dateFinChantier = '';
    // La facture finale pas encore faite n'a plus lieu d'être
    all_('Factures').forEach(function (f) {
      if (f.dossierId === dos.id && f.type === 'finale' && f.faite !== 'oui') delete_('Factures', 'id', f.id);
    });
  }
  if (dos.etape === 'facture') {
    patch.factureFaite = 'non';
    patch.dateCloture = '';
    all_('Factures').forEach(function (f) {
      if (f.dossierId === dos.id && f.type === 'finale') update_('Factures', 'id', f.id, { faite: 'non', dateFaite: '' });
    });
    marquerRelance_('a_facturer|' + dos.id, today);
  }
  majDossier_(dos.id, patch);
  log_(dos.id, user, 'Retour à « ' + ETAPES[cible] + ' »', motif);
}

/** Dossier créé à la main, sans rendez-vous dans l'agenda */
function creerDossier_(d, user) {
  const client = String(d.client || '').trim();
  if (!client) throw erreur_('Le nom du client est obligatoire.');
  const now = new Date();
  const today = jour_(now);
  const id = nouvelId_('D');
  const dos = {
    id: id, eventKey: '', dateRdv: d.dateRdv || today, heureRdv: '', titreRdv: 'Dossier créé à la main',
    lieu: d.lieu || '', descriptionRdv: d.notes || '', client: client, etape: 'devis_a_faire',
    avancement: '0', demo: 'non', creeLe: horodatage_(now), majLe: horodatage_(now)
  };
  if (d.numDevis) {
    const delai = Number(delaiMail_('relance_client'));
    dos.etape = 'devis_envoye';
    dos.numDevis = d.numDevis;
    dos.dateDevis = today;
    dos.prochaineRelance = jour_(ajouterJours_(today, delai));
  }
  insert_('Dossiers', dos);
  log_(id, user, 'Dossier créé à la main', d.numDevis ? 'Devis ' + d.numDevis : '');
  return id;
}

/** Supprime un dossier et tout ce qui lui est rattaché (les fichiers Drive sont gardés) */
function supprimerDossier_(d, user) {
  const dos = dossierOuErreur_(d.id);
  const motif = motifObligatoire_(d);
  effacerDossier_(dos, user, motif, d.fichiers === 'oui');
}

/** Supprime plusieurs dossiers d'un coup (réservé aux administrateurs) */
function supprimerDossiers_(d, user) {
  const motif = motifObligatoire_(d);
  const ids = (d.ids || []).map(String).filter(Boolean);
  if (!ids.length) throw erreur_('Cochez au moins un dossier.');
  if (ids.length > 100) throw erreur_('100 dossiers au maximum à la fois.');
  if (Number(d.nombre) !== ids.length) throw erreur_('Le nombre tapé ne correspond pas au nombre de dossiers cochés (' + ids.length + ').');
  let n = 0;
  ids.forEach(function (id) {
    const dos = trouver_('Dossiers', 'id', id);
    if (!dos) return;
    effacerDossier_(dos, user, motif, d.fichiers === 'oui');
    n++;
  });
  return { supprimes: n };
}

/** Efface un dossier et tout ce qui lui est rattaché ; ses fichiers Drive vont à la corbeille si demandé (récupérables 30 jours) */
function effacerDossier_(dos, user, motif, fichiers) {
  supprimerInterventions_(dos.id);
  if (fichiers) {
    all_('Documents').concat(all_('Commentaires')).forEach(function (x) {
      if (x.dossierId === dos.id && x.fichier) { try { DriveApp.getFileById(x.fichier).setTrashed(true); } catch (e) { /* déjà retiré */ } }
    });
    if (dos.dossierDrive) { try { DriveApp.getFolderById(dos.dossierDrive).setTrashed(true); } catch (e) { /* déjà retiré */ } }
  }
  ['Commandes', 'Factures', 'Commentaires', 'Documents'].forEach(function (name) {
    supprimerLignes_(name, function (x) { return x.dossierId === dos.id; });
  });
  delete_('Dossiers', 'id', dos.id);
  log_(dos.id, user, 'Dossier supprimé', (dos.client || dos.titreRdv) + ' – ' + motif + (fichiers ? ' (fichiers mis à la corbeille)' : ''));
}

function supprimerCommande_(d, user) {
  const c = trouver_('Commandes', 'id', d.id);
  if (!c) throw erreur_('Commande introuvable.');
  const motif = motifObligatoire_(d);
  delete_('Commandes', 'id', c.id);
  const dos = trouver_('Dossiers', 'id', c.dossierId);
  const reste = all_('Commandes').some(function (x) { return x.dossierId === c.dossierId; });
  if (dos && dos.etape === 'materiel' && !reste) {
    majDossier_(dos.id, { etape: 'commande' });
    marquerRelance_('commande_materiel|' + dos.id, jour_(new Date()));
  }
  log_(c.dossierId, user, 'Commande matériel supprimée', c.fournisseur + ' – ' + motif);
}

function modifierFacture_(d, user) {
  const f = trouver_('Factures', 'id', d.id);
  if (!f) throw erreur_('Facture introuvable.');
  const patch = {};
  if (d.pourcentage !== undefined && f.type === 'intermediaire') {
    const p = Math.round(Number(d.pourcentage) || 0);
    if (p <= 0 || p >= 100) throw erreur_('Indiquez un pourcentage entre 1 et 99.');
    patch.pourcentage = String(p);
  }
  if (d.commentaire !== undefined) patch.commentaire = String(d.commentaire);
  update_('Factures', 'id', f.id, patch);
  log_(f.dossierId, user, 'Facture modifiée', (patch.pourcentage || f.pourcentage) + ' %');
}

function supprimerFacture_(d, user) {
  const f = trouver_('Factures', 'id', d.id);
  if (!f) throw erreur_('Facture introuvable.');
  if (f.type === 'finale') throw erreur_('La facture finale se retire en revenant à l\'étape « Chantier en cours ».');
  const motif = motifObligatoire_(d);
  delete_('Factures', 'id', f.id);
  log_(f.dossierId, user, 'Demande de facture intermédiaire supprimée', f.pourcentage + ' % – ' + motif);
}

/** Annule une « facture faite » */
function annulerFacture_(d, user) {
  const f = trouver_('Factures', 'id', d.id);
  if (!f) throw erreur_('Facture introuvable.');
  const motif = motifObligatoire_(d);
  update_('Factures', 'id', f.id, { faite: 'non', dateFaite: '' });
  marquerRelance_((f.type === 'finale' ? 'a_facturer|' + f.dossierId : 'facture_inter|' + f.id), jour_(new Date()));
  if (f.type === 'finale') {
    const dos = trouver_('Dossiers', 'id', f.dossierId);
    if (dos && dos.etape === 'facture') majDossier_(dos.id, { etape: 'termine', factureFaite: 'non', dateCloture: '' });
  }
  log_(f.dossierId, user, 'Facture remise « à faire »', motif);
}

/** Un technicien ne modifie ou ne supprime que ses propres messages */
function auteurOuAdmin_(c, user) {
  if (!estAdmin_(user) && c.auteurEmail !== user.email) throw erreur_('Vous ne pouvez modifier que vos propres messages.');
}

function modifierCommentaire_(d, user) {
  const c = trouver_('Commentaires', 'id', d.id);
  if (!c) throw erreur_('Commentaire introuvable.');
  auteurOuAdmin_(c, user);
  update_('Commentaires', 'id', c.id, { texte: String(d.texte || '').trim() });
  log_(c.dossierId, user, 'Commentaire modifié', '');
}

function supprimerCommentaire_(d, user) {
  const c = trouver_('Commentaires', 'id', d.id);
  if (!c) throw erreur_('Commentaire introuvable.');
  auteurOuAdmin_(c, user);
  delete_('Commentaires', 'id', c.id);
  log_(c.dossierId, user, c.photo || c.fichier ? 'Fichier retiré de la discussion' : 'Message supprimé', String(c.texte || '').slice(0, 60));
}

/* ==================================================================
 * 5. AGENDA GOOGLE
 * ================================================================== */

function agenda_() {
  const reg = lireReglages_();
  if (!reg.agendaId) return CalendarApp.getDefaultCalendar();
  return agendaParId_(reg.agendaId);
}

/** Agenda partagé (ex. celui du compte de l'entreprise). Jamais d'agenda de secours :
 *  s'il est inaccessible, on s'arrête au lieu d'écrire dans l'agenda personnel du compte qui fait tourner le programme. */
function agendaParId_(id) {
  id = String(id).trim();
  let cal = CalendarApp.getCalendarById(id);
  if (!cal) {
    // Partagé mais pas encore ajouté à la liste : on l'ajoute, sans l'afficher
    try { cal = CalendarApp.subscribeToCalendar(id, { hidden: false, selected: false }); } catch (e) { cal = null; }
  }
  if (!cal) {
    throw erreur_('Agenda « ' + id + ' » inaccessible. Vérifiez qu\'il est bien partagé avec ' +
      Session.getEffectiveUser().getEmail() + ' avec le droit « Apporter des modifications aux événements ».');
  }
  return cal;
}

/** Garde la dernière erreur d'agenda pour l'afficher sur le tableau de bord de l'admin (vide = tout va bien) */
function noterAgenda_(e) {
  const props = PropertiesService.getScriptProperties();
  if (e) props.setProperty('ERREUR_AGENDA', String(e.message || e).slice(0, 400));
  else props.deleteProperty('ERREUR_AGENDA');
}

/** Ajoute l'adresse de réponse choisie dans les Réglages à un mail */
function avecReponse_(mail) {
  const r = String(lireReglages_().emailReponses || '').trim();
  if (r) mail.replyTo = r;
  return mail;
}

function normaliser_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lit l'agenda et crée un dossier pour chaque nouveau rendez-vous « devis ». Renvoie le nombre de dossiers créés. */
function scannerAgenda_() {
  const reg = lireReglages_();
  const mots = String(reg.motsCles || 'devis').split(',').map(normaliser_).map(function (s) { return s.trim(); }).filter(Boolean);
  const now = new Date();
  const debut = ajouterJours_(jour_(now), -Number(reg.joursAgendaPasse || 60));
  const fin = ajouterJours_(jour_(now), Number(reg.joursAgendaFutur || 60));
  const events = agenda_().getEvents(debut, fin);
  const connus = {};
  all_('Dossiers').forEach(function (d) { if (d.eventKey) connus[d.eventKey] = true; });
  let n = 0;
  events.forEach(function (ev) {
    const titre = ev.getTitle() || '';
    if (titre.indexOf('🔨') === 0 || titre.indexOf('🌴') === 0) return;
    try { if (ev.getTag('suiviAffaires')) return; } catch (e) { /* pas de marque */ }
    const texte = normaliser_(titre + ' ' + (ev.getDescription() || ''));
    if (!mots.some(function (m) { return texte.indexOf(m) >= 0; })) return;
    const key = ev.getId() + '|' + ev.getStartTime().toISOString();
    if (connus[key]) return;
    connus[key] = true;
    creerDossierEvenement_(ev, key, mots, { nom: 'Agenda' });
    n++;
  });
  return n;
}

/** Crée le dossier d'un rendez-vous de l'agenda (et le localise si un lieu est indiqué) */
function creerDossierEvenement_(ev, key, mots, qui) {
  const now = new Date();
  const titre = ev.getTitle() || '';
  const id = nouvelId_('D');
  insert_('Dossiers', {
    id: id, eventKey: key, dateRdv: jour_(ev.getStartTime()),
    heureRdv: ev.isAllDayEvent() ? '' : Utilities.formatDate(ev.getStartTime(), tz_(), 'HH:mm'),
    titreRdv: titre, lieu: ev.getLocation() || '', descriptionRdv: String(ev.getDescription() || '').slice(0, 2000),
    client: deviner_client_(titre, mots), etape: titre.indexOf('✅') === 0 ? 'devis_envoye' : 'devis_a_faire',
    avancement: '0', demo: 'non', creeLe: horodatage_(now), majLe: horodatage_(now), source: 'agenda'
  });
  log_(id, qui, 'Rendez-vous repéré', titre);
  if (ev.getLocation()) {
    try { localiserParAdresse_(id, ev.getLocation()); } catch (e) { Logger.log('Localisation : ' + e); }
  }
  return id;
}

function deviner_client_(titre, mots) {
  let t = String(titre).replace('✅', '');
  mots.forEach(function (m) {
    t = t.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '');
  });
  t = t.replace(/\b(rdv|rendez-vous|pour|chez)\b/ig, '');
  return t.replace(/^[\s\-–—:|,/]+|[\s\-–—:|,/]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Ajoute la coche verte au début du titre du rendez-vous */
function cocherAgenda_(eventKey) {
  try {
    const parts = String(eventKey).split('|');
    const start = new Date(parts[1]);
    const evs = agenda_().getEvents(new Date(start.getTime() - 60000), new Date(start.getTime() + 24 * 3600000));
    const ev = evs.filter(function (e) { return e.getId() === parts[0]; })[0];
    if (ev && ev.getTitle().indexOf('✅') !== 0) ev.setTitle('✅ ' + ev.getTitle());
  } catch (e) {
    Logger.log('Coche agenda impossible : ' + e);
  }
}

/* ==================================================================
 * 6. GOOGLE DRIVE
 * ================================================================== */

/* ================================================================
 * REPRISE KRAAFT
 * Reprend dans un dossier la discussion d'une conversation Kraaft (vrais auteurs et vraies dates)
 * et ses documents classés. Les fichiers sont téléchargés depuis Kraaft et rangés dans le dossier Drive.
 * Appelée par lots depuis les écrans (Réglages > Reprise Kraaft). Relancer ne crée pas de doublon.
 *
 * d = {
 *   dossierId, kraaftId (conversation Kraaft),
 *   messages:  [{ kid, auteur, date (ISO), texte, fichier: { url, nom, mime } | null }],
 *   documents: [{ kid, dossier (nom du dossier Kraaft), nom, url, mime, date (ISO), auteur }],
 *   terminer: { date } (chantier « Terminé » dans Kraaft : le dossier part dans les archives)
 * }
 * ================================================================ */
/* ================================================================
 * API KRAAFT (https://api.kraaft.co, clé « Bearer » créée dans les réglages de l'espace Kraaft)
 * La clé reste dans les propriétés du programme : elle n'est jamais renvoyée aux écrans.
 * ================================================================ */
function kraaftApi_(chemin, params, cle) {
  cle = cle || PropertiesService.getScriptProperties().getProperty('KRAAFT_CLE');
  if (!cle) throw erreur_('Clé API Kraaft non enregistrée (Réglages > Reprise Kraaft).');
  const qs = Object.keys(params || {}).filter(function (k) { return params[k] !== undefined && params[k] !== ''; })
    .map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const r = UrlFetchApp.fetch('https://api.kraaft.co/v1/' + chemin + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + cle }, muteHttpExceptions: true
  });
  const code = r.getResponseCode();
  let json = null;
  try { json = JSON.parse(r.getContentText() || 'null'); } catch (e) { json = null; }
  if (code >= 400) {
    const msg = (json && (json.error || json.message)) || r.getContentText().slice(0, 200);
    throw erreur_('Kraaft répond ' + code + (code === 401 ? ' (clé refusée)' : code === 403 ? ' (accès refusé)' : '') + ' : ' + msg);
  }
  const h = r.getAllHeaders();
  const hv = function (n) { const k = Object.keys(h).filter(function (x) { return x.toLowerCase() === n; })[0]; return k ? String(h[k]) : ''; };
  return { json: json, suite: hv('x-kraaft-next-cursor'), encore: hv('x-kraaft-has-more') === 'true' };
}

/** Enregistre la clé API Kraaft après l'avoir essayée */
function enregistrerCleKraaft_(d) {
  const cle = String(d.cle || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (!cle) { props.deleteProperty('KRAAFT_CLE'); props.deleteProperty('KRAAFT_WS'); return { ok: true, efface: true }; }
  const ws = kraaftApi_('workspaces', null, cle).json || [];
  if (!ws.length) throw erreur_('La clé est acceptée, mais aucun espace Kraaft n\'est accessible (l\'API est-elle bien activée ?).');
  props.setProperty('KRAAFT_CLE', cle);
  props.setProperty('KRAAFT_WS', ws[0].workspaceId);
  return { ok: true, espace: ws[0].workspaceName };
}

/** Premier tour d'horizon de l'espace Kraaft : sert à préparer la reprise complète */
function explorerKraaft_() {
  const ws = PropertiesService.getScriptProperties().getProperty('KRAAFT_WS');
  if (!ws) throw erreur_('Enregistrez d\'abord la clé API Kraaft.');
  const out = { espace: ws };
  out.schemas = (kraaftApi_('workspaces/' + ws + '/schemas').json || []).map(function (x) { return x.schemaName + ' [' + x.schemaId + ']'; });
  const sch = kraaftApi_('workspaces/' + ws + '/schemas/room').json || {};
  out.champsConversation = Object.keys(sch.fields || {}).map(function (k) {
    const f = sch.fields[k];
    return k + ' : ' + f.name + ' (' + f.type + (f.options ? ' — ' + f.options.map(function (o) { return o.label; }).join(' / ') : '') + ')';
  });
  // Toutes les conversations (pages de 500)
  const rooms = [];
  let suite = '';
  for (let i = 0; i < 20; i++) {
    const r = kraaftApi_('workspaces/' + ws + '/schemas/room/records', { limit: 500, after: suite });
    (r.json || []).forEach(function (x) { rooms.push(x); });
    if (!r.encore || !r.suite) break;
    suite = r.suite;
  }
  out.nbConversations = rooms.length;
  const libelle = function (k, v) {
    const f = (sch.fields || {})[k];
    if (f && f.options) return (f.options.filter(function (o) { return o.id === v; })[0] || {}).label || v;
    return typeof v === 'object' ? JSON.stringify(v) : v;
  };
  out.exemples = rooms.slice(0, 3).map(function (x) {
    const p = {};
    Object.keys(x.properties || {}).forEach(function (k) { p[k] = libelle(k, x.properties[k].value); });
    return { recordId: x.recordId, roomId: x.roomId, creee: x.createdAt, proprietes: p };
  });
  if (rooms.length) {
    const m = kraaftApi_('workspaces/' + ws + '/rooms/' + rooms[0].roomId + '/messages', { limit: 8 }).json || [];
    out.messagesExemple = m.map(function (x) {
      const c = x.content || {};
      return { id: x.messageId, auteur: x.senderId, date: x.createdAt, type: c.type, texte: c.text ? String(c.text).slice(0, 60) : '', fichier: c.file ? c.file.filename : '' };
    });
    const room = kraaftApi_('workspaces/' + ws + '/rooms/' + rooms[0].roomId).json || {};
    out.conversationExemple = { nom: room.name, archivee: room.archived, privee: room.private, membres: (room.members || []).length, creee: room.createdAt };
  }
  return out;
}

/* ---------- Reprise et synchronisation par l'API ---------- */

const KRAAFT_ETAPES = { 'Non-Assigné': 'devis_a_faire', 'En cours': 'en_cours', 'Terminé': 'facture' };

function kraaftEspace_() {
  const ws = PropertiesService.getScriptProperties().getProperty('KRAAFT_WS');
  if (!ws) throw erreur_('Enregistrez d\'abord la clé API Kraaft.');
  return ws;
}

/** Noms des personnes Kraaft : { identifiant: nom } (l'API ne donne que les identifiants) */
function auteursKraaft_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('KRAAFT_AUTEURS') || '{}'); } catch (e) { return {}; }
}
function ecrireAuteursKraaft_(a) {
  PropertiesService.getScriptProperties().setProperty('KRAAFT_AUTEURS', JSON.stringify(a));
}
/** Nom provisoire d'une personne pas encore nommée */
function nomProvisoireKraaft_(id) {
  return 'Membre Kraaft ' + String(id || '?').slice(-4);
}

/** Schéma des conversations Kraaft (pour traduire les statuts) */
function schemaConversationKraaft_(ws) {
  const sch = kraaftApi_('workspaces/' + ws + '/schemas/room').json || {};
  return sch.fields || {};
}

/** Liste des conversations Kraaft, avec le dossier de l'appli qui leur correspond déjà */
function conversationsKraaft_() {
  const ws = kraaftEspace_();
  const champs = schemaConversationKraaft_(ws);
  const lib = function (k, v) {
    const f = champs[k];
    if (f && f.options) return (f.options.filter(function (o) { return o.id === v; })[0] || {}).label || '';
    return v;
  };
  const lies = {};
  all_('Dossiers').forEach(function (d) { if (d.kraaft) lies[d.kraaft] = d.id; });
  const out = [];
  let suite = '';
  for (let i = 0; i < 20; i++) {
    const r = kraaftApi_('workspaces/' + ws + '/schemas/room/records', { limit: 500, after: suite });
    (r.json || []).forEach(function (x) {
      const p = x.properties || {};
      const v = function (k) { return p[k] ? p[k].value : ''; };
      const g = v('geolocation') || {};
      out.push({
        roomId: x.roomId, titre: v('title') || '(sans titre)', statut: lib('status', v('status')) || 'Non-Assigné',
        description: v('description') || '', lat: g.lat || '', lng: g.lng || '', responsable: v('responsible') || '',
        creee: x.createdAt || '', dossierId: lies[x.roomId] || ''
      });
    });
    if (!r.encore || !r.suite) break;
    suite = r.suite;
  }
  out.sort(function (a, b) { return String(b.creee).localeCompare(String(a.creee)); });
  const props = PropertiesService.getScriptProperties();
  return {
    conversations: out,
    auteurs: auteursKraaft_(),
    inconnus: JSON.parse(props.getProperty('KRAAFT_INCONNUS') || '{}'),
    sync: props.getProperty('KRAAFT_SYNC') === 'oui'
  };
}

/** Transforme un message de l'API en message pour importKraaft_ ; apprend les noms au passage */
function messageKraaft_(roomId, id, senderId, date, c, auteurs, inconnus) {
  c = c || {};
  let texte = c.text ? String(c.text) : '';
  if (c.type === 'geolocation' && c.geolocation) {
    const g = c.geolocation;
    texte = '📍 ' + ((g.address && (g.address.description || g.address.formatted)) || (typeof g.address === 'string' ? g.address : '') || 'Position') +
      (g.latitude ? '\nhttps://maps.google.com/?q=' + g.latitude + ',' + g.longitude : '') + (texte ? '\n' + texte : '');
  }
  let fichier = null;
  if (c.file && c.file.url) {
    const d = new Date(date);
    const ext = (String(c.file.filename || '').match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    const estImage = c.type === 'image' || /\.(jpe?g|png|heic|webp|gif)$/i.test(ext);
    fichier = {
      url: c.file.url,
      nom: estImage ? 'Photo ' + Utilities.formatDate(d, tz_(), "yyyy-MM-dd HH'h'mm") + (ext || '.jpg') : (c.file.filename || 'fichier'),
      mime: ''
    };
  }
  let auteur = auteurs[senderId];
  if (!auteur) {
    auteur = nomProvisoireKraaft_(senderId);
    if (senderId && !inconnus[senderId]) inconnus[senderId] = { exemple: String(texte || (fichier ? fichier.nom : '')).slice(0, 80), roomId: roomId };
  }
  return { kid: 'kraaft:' + id, auteur: auteur, date: date, texte: texte, fichier: fichier };
}

/**
 * Reprend une conversation Kraaft dans l'appli (crée le dossier s'il n'existe pas).
 * Appelée plusieurs fois de suite si la conversation est longue (stop >= 0) ; jamais de doublon.
 */
function reprendreKraaft_(d, user) {
  const ws = kraaftEspace_();
  const roomId = String(d.roomId || '');
  if (!roomId) throw erreur_('Conversation Kraaft manquante.');
  const statut = String(d.statut || '');
  let dos = all_('Dossiers').filter(function (x) { return x.kraaft === roomId; })[0];
  // Création du dossier
  if (!dos) {
    const room = kraaftApi_('workspaces/' + ws + '/rooms/' + roomId).json || {};
    const now = new Date();
    const cree = d.creee ? new Date(d.creee) : now;
    const etape = KRAAFT_ETAPES[statut] || 'devis_a_faire';
    const id = nouvelId_('D');
    dos = {
      id: id, eventKey: '', dateRdv: jour_(cree), heureRdv: '', titreRdv: 'Repris de Kraaft',
      lieu: '', descriptionRdv: [d.description, 'Repris de Kraaft (statut : ' + (statut || 'Non-Assigné') + ').'].filter(Boolean).join(' '),
      client: String(d.titre || room.name || 'Chantier Kraaft').trim(), etape: etape, avancement: etape === 'facture' ? '100' : '0',
      demo: 'non', creeLe: horodatage_(now), majLe: horodatage_(now), source: 'kraaft', kraaft: roomId
    };
    if (etape !== 'devis_a_faire') { dos.numDevis = 'KRAAFT'; dos.dateDevis = jour_(cree); dos.dateValidation = jour_(cree); }
    if (etape === 'en_cours') dos.dateDebut = jour_(cree);
    insert_('Dossiers', dos);
    if (d.lat && d.lng) {
      const lieu = adresseDePosition_(Number(d.lat), Number(d.lng));
      poserPosition_(id, Number(d.lat), Number(d.lng), lieu || undefined);
    }
    log_(id, user, 'Dossier repris de Kraaft', dos.client);
    dos = trouver_('Dossiers', 'id', id);
  }
  // Messages (du plus récent au plus ancien dans l'API : on remet dans l'ordre)
  const brut = [];
  let suite = '';
  for (let i = 0; i < 40; i++) {
    const r = kraaftApi_('workspaces/' + ws + '/rooms/' + roomId + '/messages', { limit: 500, after: suite });
    (r.json || []).forEach(function (m) { brut.push(m); });
    if (!r.encore || !r.suite) break;
    suite = r.suite;
  }
  brut.reverse();
  const auteurs = auteursKraaft_();
  const props = PropertiesService.getScriptProperties();
  const inconnus = JSON.parse(props.getProperty('KRAAFT_INCONNUS') || '{}');
  // Les messages déjà repris (par fichier) apprennent les noms
  const parKid = {};
  all_('Commentaires').forEach(function (c) { if (c.kraaft && c.dossierId === dos.id) parKid[c.kraaft] = c.auteur; });
  let appris = false;
  brut.forEach(function (m) {
    const nom = parKid['kraaft:' + m.messageId];
    if (nom && m.senderId && !auteurs[m.senderId] && !/^Membre Kraaft /.test(nom)) {
      auteurs[m.senderId] = String(nom).replace(/ \(Kraaft\)$/, '');
      delete inconnus[m.senderId];
      appris = true;
    }
  });
  if (appris) ecrireAuteursKraaft_(auteurs);
  const messages = brut.map(function (m) { return messageKraaft_(roomId, m.messageId, m.senderId, m.createdAt, m.content, auteurs, inconnus); });
  props.setProperty('KRAAFT_INCONNUS', JSON.stringify(inconnus));
  const res = importKraaft_({ dossierId: dos.id, kraaftId: roomId, messages: messages }, user);
  // Chantier terminé : date de fin = dernier message
  if (res.stop < 0 && !res.erreurs.length && (KRAAFT_ETAPES[statut] === 'facture') && !dos.dateCloture) {
    const fin = brut.length ? jour_(new Date(brut[brut.length - 1].createdAt)) : jour_(new Date());
    majDossier_(dos.id, { etape: 'facture', avancement: '100', dateFinChantier: fin, dateCloture: fin });
  }
  res.dossierId = dos.id;
  res.total = messages.length;
  return res;
}

/** Donne un nom aux personnes Kraaft et corrige les messages déjà repris */
function nommerAuteursKraaft_(d) {
  const auteurs = auteursKraaft_();
  const props = PropertiesService.getScriptProperties();
  const inconnus = JSON.parse(props.getProperty('KRAAFT_INCONNUS') || '{}');
  const noms = d.noms || {};
  let corriges = 0;
  Object.keys(noms).forEach(function (id) {
    const nom = String(noms[id] || '').trim();
    if (!nom) return;
    const ancien = auteurs[id] || nomProvisoireKraaft_(id);
    auteurs[id] = nom;
    delete inconnus[id];
    lireTable_('Commentaires').forEach(function (c) {
      if (c.kraaft && c.auteur === ancien + ' (Kraaft)') { update_('Commentaires', 'id', c.id, { auteur: nom + ' (Kraaft)' }); corriges++; }
    });
  });
  ecrireAuteursKraaft_(auteurs);
  props.setProperty('KRAAFT_INCONNUS', JSON.stringify(inconnus));
  return { corriges: corriges };
}

/** Active ou coupe la synchronisation horaire (nouveaux messages Kraaft → appli) */
function reglerSyncKraaft_(d) {
  const props = PropertiesService.getScriptProperties();
  if (d.actif === 'oui') {
    kraaftEspace_();
    props.setProperty('KRAAFT_SYNC', 'oui');
    if (!props.getProperty('KRAAFT_CURSEUR')) props.setProperty('KRAAFT_CURSEUR', new Date().toISOString());
  } else {
    props.deleteProperty('KRAAFT_SYNC');
  }
  return { sync: props.getProperty('KRAAFT_SYNC') === 'oui' };
}

/** Lancé chaque heure : reprend les nouveaux messages des conversations Kraaft déjà reliées à un dossier */
function syncKraaft_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('KRAAFT_SYNC') !== 'oui' || !props.getProperty('KRAAFT_CLE')) return;
  const ws = props.getProperty('KRAAFT_WS');
  const parRoom = {};
  all_('Dossiers').forEach(function (x) { if (x.kraaft) parRoom[x.kraaft] = x.id; });
  const auteurs = auteursKraaft_();
  const inconnus = JSON.parse(props.getProperty('KRAAFT_INCONNUS') || '{}');
  let curseur = props.getProperty('KRAAFT_CURSEUR') || new Date().toISOString();
  const aReprendre = {};
  for (let i = 0; i < 10; i++) {
    const r = kraaftApi_('workspaces/' + ws + '/rooms/messages/events', { limit: 500, after: curseur });
    (r.json || []).forEach(function (ev) {
      if (ev.event !== 'sent' || !parRoom[ev.roomId] || !ev.message || !ev.message.after) return;
      (aReprendre[ev.roomId] = aReprendre[ev.roomId] || []).push(
        messageKraaft_(ev.roomId, ev.messageId, ev.senderId, ev.occurredAt, ev.message.after, auteurs, inconnus));
      curseur = ev.flake || curseur;
    });
    if (r.suite) curseur = r.suite;
    if (!r.encore) break;
  }
  props.setProperty('KRAAFT_CURSEUR', curseur);
  props.setProperty('KRAAFT_INCONNUS', JSON.stringify(inconnus));
  const robot = { email: '', nom: 'Synchronisation Kraaft', role: 'admin' };
  Object.keys(aReprendre).forEach(function (roomId) {
    const res = importKraaft_({ dossierId: parRoom[roomId], messages: aReprendre[roomId] }, robot);
    if (res.ajoutes) majDossier_(parRoom[roomId], {});
  });
}

function importKraaft_(d, user) {
  const dos = dossierOuErreur_(d.dossierId);
  const debut = Date.now();
  const out = { ajoutes: 0, deja: 0, erreurs: [], stop: -1 };
  if (d.kraaftId && !dos.kraaft) update_('Dossiers', 'id', dos.id, { kraaft: d.kraaftId });

  const dejaCom = {};
  all_('Commentaires').forEach(function (c) { if (c.kraaft) dejaCom[c.kraaft] = true; });
  const dejaDoc = {};
  all_('Documents').forEach(function (x) { if (x.kraaft) dejaDoc[x.kraaft] = true; });
  const folder = (d.messages || []).some(function (m) { return m.fichier; }) || (d.documents || []).length ? dossierDrive_(dos) : null;

  const messages = d.messages || [];
  for (let i = 0; i < messages.length; i++) {
    if (Date.now() - debut > 240000) { out.stop = i; return out; }
    const m = messages[i];
    if (!m.kid) continue;
    if (dejaCom[m.kid]) { out.deja++; continue; }
    const date = horodatageSec_(m.date ? new Date(m.date) : new Date());
    const ligne = {
      id: nouvelId_('M'), dossierId: dos.id, date: date, auteur: (m.auteur || 'Inconnu') + ' (Kraaft)',
      auteurEmail: '', texte: String(m.texte || '').trim(), photo: '', fichier: '', nomFichier: '', mime: '',
      demo: dos.demo, kraaft: m.kid
    };
    if (m.fichier && m.fichier.url) {
      const f = telechargerKraaft_(m.fichier, folder);
      if (f.erreur) { out.erreurs.push((m.fichier.nom || 'fichier') + ' : ' + f.erreur); continue; }
      partagerParLien_(f.file);
      const mime = f.file.getMimeType();
      if (/^image\//.test(mime)) ligne.photo = f.file.getId();
      else { ligne.fichier = f.file.getId(); ligne.nomFichier = f.file.getName(); }
      ligne.mime = mime;
    }
    if (!ligne.texte && !ligne.photo && !ligne.fichier) continue;
    insert_('Commentaires', ligne);
    dejaCom[m.kid] = true;
    out.ajoutes++;
  }

  const documents = d.documents || [];
  for (let j = 0; j < documents.length; j++) {
    if (Date.now() - debut > 240000) { out.stop = messages.length + j; return out; }
    const x = documents[j];
    if (!x.kid || !x.url) continue;
    if (dejaDoc[x.kid]) { out.deja++; continue; }
    const type = typeDocKraaft_(x.dossier);
    const f = telechargerKraaft_(x, folder);
    if (f.erreur) { out.erreurs.push((x.nom || 'document') + ' : ' + f.erreur); continue; }
    if (docsPartages_().indexOf(type) >= 0) partagerParLien_(f.file);
    insert_('Documents', {
      id: nouvelId_('P'), dossierId: dos.id, type: type, fichier: f.file.getId(), nom: x.nom || f.file.getName(),
      mime: f.file.getMimeType(), date: horodatage_(x.date ? new Date(x.date) : new Date()),
      auteur: (x.auteur || 'Inconnu') + ' (Kraaft)', demo: dos.demo, kraaft: x.kid
    });
    dejaDoc[x.kid] = true;
    out.ajoutes++;
  }

  if (d.terminer) {
    const jourFin = jour_(d.terminer.date ? new Date(d.terminer.date) : new Date());
    majDossier_(dos.id, { etape: 'facture', avancement: '100', dateFinChantier: jourFin, dateCloture: jourFin });
    log_(dos.id, user, 'Reprise Kraaft : chantier terminé, classé dans les archives', '');
  }
  if (out.ajoutes) log_(dos.id, user, 'Reprise Kraaft', out.ajoutes + ' élément(s) repris');
  return out;
}

/** Télécharge un fichier Kraaft (lien signé) dans le dossier Drive. Renvoie { file } ou { erreur }. */
function telechargerKraaft_(f, folder) {
  try {
    const res = UrlFetchApp.fetch(f.url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return { erreur: 'Kraaft a répondu ' + res.getResponseCode() };
    const blob = res.getBlob();
    const mime = f.mime || blob.getContentType() || 'application/octet-stream';
    blob.setContentType(mime);
    blob.setName(f.nom || blob.getName() || 'fichier');
    return { file: folder.createFile(blob) };
  } catch (e) {
    return { erreur: String(e && e.message ? e.message : e) };
  }
}

/**
 * Trouve le dossier de documents de l'appli qui correspond à un dossier Kraaft (Plans → Plans…).
 * S'il n'existe pas (DICT, Arrêtés…), il est créé et ouvert aux techniciens, comme dans Kraaft
 * où tous les membres d'une conversation voient tous ses documents.
 */
function typeDocKraaft_(nomDossier) {
  const nom = String(nomDossier || 'Divers').trim();
  const n = normaliser_(nom).trim();
  const singulier = n.replace(/s$/, '');
  const types = typesDocs_();
  const t = types.filter(function (x) {
    const lib = normaliser_(x.lib).trim();
    return x.cle === n || x.cle === singulier || lib === n || lib.replace(/s$/, '') === singulier;
  })[0];
  if (t) return t.cle;
  let cle = singulier.replace(/[^a-z0-9_]/g, '') || 'divers';
  if (types.some(function (x) { return x.cle === cle; })) return cle;
  // Nouveau dossier de documents
  const liste = types.map(function (x) { return x.cle + ':' + x.lib; }).concat([cle + ':' + nom]).join(',');
  if (lireReglages_().typesDocs === undefined) insert_('Reglages', { cle: 'typesDocs', valeur: liste });
  else update_('Reglages', 'cle', 'typesDocs', { valeur: liste });
  const tech = docsTech_();
  if (tech.indexOf(cle) < 0) {
    tech.push(cle);
    if (lireReglages_().docsTech === undefined) insert_('Reglages', { cle: 'docsTech', valeur: tech.join(',') });
    else update_('Reglages', 'cle', 'docsTech', { valeur: tech.join(',') });
  }
  all_('Utilisateurs').forEach(function (u) {
    const v = String(u.docs || '').trim();
    if (u.role === 'admin' || !v || v === 'aucun') return;
    const l = v.split(',').map(function (x) { return x.trim(); });
    if (l.indexOf(cle) < 0) update_('Utilisateurs', 'email', u.email, { docs: l.concat([cle]).join(',') });
  });
  CACHE_ = {};
  appliquerPartageDocs_();
  return cle;
}

function dossierDrive_(dos) {
  if (dos.dossierDrive) {
    try { return DriveApp.getFolderById(dos.dossierDrive); } catch (e) { /* recréé plus bas */ }
  }
  const root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  const nom = (dos.chantier || dos.client || 'Dossier') + ' – ' + (dos.numDevis || dos.id);
  const f = root.createFolder(nom);
  update_('Dossiers', 'id', dos.id, { dossierDrive: f.getId() });
  return f;
}

/**
 * Donne accès au dossier Drive complet aux administrateurs actifs.
 * Les techniciens n'y ont pas accès : ils ouvrent seulement, par lien, les documents de leurs types autorisés.
 */
function partagerDrive_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) return;
  const folder = DriveApp.getFolderById(id);
  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  const deja = folder.getEditors().map(function (u) { return u.getEmail().toLowerCase(); });
  all_('Utilisateurs').forEach(function (u) {
    if (u.actif !== 'non' && u.role === 'admin' && u.email !== owner && deja.indexOf(u.email) < 0) {
      try { folder.addEditor(u.email); } catch (e) { Logger.log('Partage Drive ' + u.email + ' : ' + e); }
    }
  });
}

/* ==================================================================
 * 7. RÉGLAGES
 * ================================================================== */

function lireReglages_() {
  const out = {};
  all_('Reglages').forEach(function (r) { out[r.cle] = r.valeur; });
  return out;
}

function enregistrerReglages_(d) {
  const existants = lireReglages_();
  if (d.zones !== undefined) {
    const zs = zonesTrajet_(d.zones);
    const noms = {};
    if (!zs.length || zs.some(function (z, i) { const doublon = noms[z.nom]; noms[z.nom] = true; return !(z.max > 0) || (i && z.max <= zs[i - 1].max) || doublon || z.nom === 'GD'; })) {
      throw erreur_('Zones mal écrites. Format : nom:km maximum, séparés par des virgules, avec des kilomètres croissants (ex : 1A:5,1B:10,2:20,3:30,4:40,5:50).');
    }
  }
  // Agenda partagé : on vérifie tout de suite qu'il est accessible
  if (d.agendaId !== undefined) {
    d.agendaId = String(d.agendaId).trim();
    if (d.agendaId) agendaParId_(d.agendaId);
    noterAgenda_(null);
  }
  if (d.emailReponses) {
    d.emailReponses = String(d.emailReponses).trim();
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(d.emailReponses)) throw erreur_('Adresse de réponse mal écrite.');
  }
  // Clé SMS : un champ laissé vide garde la clé déjà enregistrée
  if (d.smsCle === '' && existants.smsCle) delete d.smsCle;
  Object.keys(REGLAGES_DEFAUT).forEach(function (k) {
    if (d[k] === undefined) return;
    if (existants[k] === undefined) insert_('Reglages', { cle: k, valeur: String(d[k]) });
    else update_('Reglages', 'cle', k, { valeur: String(d[k]) });
  });
  CACHE_ = {};
  const departChange = d.departAdresse !== undefined && d.departAdresse !== existants.departAdresse;
  if (departChange) majDepart_(d.departAdresse);
  if (departChange || (d.zones !== undefined && d.zones !== existants.zones)) recalculerDistances_();
  if (d.docsTech !== undefined && d.docsTech !== existants.docsTech) appliquerPartageDocs_();
}

function enregistrerMails_(mails) {
  (mails || []).forEach(function (m) {
    const patch = {};
    ['active', 'destinataires', 'delaiJours', 'rythmeJours', 'jours', 'heure', 'objet', 'texte', 'copieTechniciens', 'sms', 'push'].forEach(function (k) {
      if (m[k] !== undefined) patch[k] = String(m[k]);
    });
    if (patch.push !== undefined && ['oui', 'non', 'seule'].indexOf(patch.push) < 0) patch.push = 'oui';
    update_('Mails', 'cle', m.cle, patch);
  });
}

function enregistrerUtilisateurs_(users) {
  const valides = (users || []).filter(function (u) { return u.email && /@/.test(u.email); });
  if (!valides.some(function (u) { return u.role === 'admin' && u.actif !== 'non'; })) {
    throw erreur_('Il faut garder au moins un administrateur actif.');
  }
  const accesAvant = {};
  all_('Utilisateurs').forEach(function (u) { accesAvant[u.email] = u.docs || ''; });
  const sh = sheet_('Utilisateurs');
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, SCHEMA.Utilisateurs.length).clearContent();
  const rows = valides.map(function (u) {
    return [String(u.email).toLowerCase().trim(), u.nom || '', u.role === 'admin' ? 'admin' : 'technicien', u.actif === 'non' ? 'non' : 'oui',
      String(u.telephone || '').trim(), u.sms === 'oui' ? 'oui' : 'non', accesAvant[String(u.email).toLowerCase().trim()] || ''];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  CACHE_ = {};
  partagerDrive_();
  appliquerPartageDocs_();
}

/* ==================================================================
 * 8. MAILS DE RAPPEL
 * ================================================================== */

function configMail_(cle) {
  return all_('Mails').filter(function (m) { return m.cle === cle; })[0];
}

function delaiMail_(cle) {
  const m = configMail_(cle);
  return m ? Number(m.delaiJours || 0) : 0;
}

function varsDossier_(dos, commande) {
  const reg = lireReglages_();
  return {
    entreprise: reg.entreprise || '',
    client: dos.client || dos.titreRdv || '',
    numero_devis: dos.numDevis || '',
    date_rdv: formatFr_(dos.dateRdv),
    numero_commande: dos.numCommande || '(à saisir)',
    date_validation: formatFr_(dos.dateValidation),
    chantier: dos.chantier || dos.client || '',
    avancement: dos.avancement || '0',
    pv: LIB_PV[dos.pvStatut || ''] || '',
    reserves: dos.pvReserves || '',
    _techniciens: dos.techniciens || '',
    prochaine_relance: formatFr_(dos.prochaineRelance),
    lieu: dos.lieu || '',
    zone: dos.zone ? libelleZone_(dos.zone) : '',
    fournisseur: commande ? commande.fournisseur : '',
    date_livraison: commande ? formatFr_(commande.dateLivraison) : '',
    reception: commande ? LIB_RECEPTION[commande.receptionStatut || ''] || '' : '',
    receptionne_par: commande ? (commande.receptionPar || '') : '',
    numero_bl: commande ? (commande.numBL || '') : '',
    pourcentage: '',
    commentaire: '',
    lien: CONFIG.APP_URL + '/?depuis=mail#/dossier/' + dos.id,
    _id: dos.id
  };
}

function remplir_(modele, vars) {
  return String(modele || '').replace(/\{(\w+)\}/g, function (all, k) {
    return vars[k] !== undefined ? vars[k] : all;
  });
}

function destinataires_(m, vars) {
  const reg = lireReglages_();
  if (reg.modeTest === 'oui') return reg.emailTest || Session.getEffectiveUser().getEmail();
  const liste = String(m.destinataires || reg.emailContact || Session.getEffectiveUser().getEmail()).split(',');
  if (m.copieTechniciens === 'oui' && vars && vars._techniciens) {
    String(vars._techniciens).split(',').forEach(function (t) { liste.push(t); });
  }
  const vus = {};
  return liste.map(function (x) { return x.trim().toLowerCase(); })
    .filter(function (x) { if (!x || vus[x]) return false; vus[x] = true; return true; }).join(',');
}

/** Pièces jointes du PV pour les mails « À facturer » et « PV avec réserves » (15 Mo au total au maximum) */
function piecesPV_(dossierId) {
  const out = { blobs: [], liens: [] };
  let total = 0;
  documentsPV_(dossierId).forEach(function (doc) {
    const lien = 'https://drive.google.com/file/d/' + doc.fichier + '/view';
    out.liens.push({ nom: (doc.type === 'pv' ? 'PV' : 'Réserve') + ' – ' + (doc.nom || 'document'), lien: lien });
    try {
      const blob = DriveApp.getFileById(doc.fichier).getBlob();
      const taille = blob.getBytes().length;
      if (total + taille <= 15 * 1024 * 1024) { out.blobs.push(blob); total += taille; }
    } catch (e) { Logger.log('Pièce jointe : ' + e); }
  });
  return out;
}

function echapper_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function gabaritHtml_(corpsHtml, lien, libelleBouton) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#F3F4F9;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:8px;overflow:hidden;border:1px solid #E1E3EE">' +
    '<div style="background:#222468;padding:14px 24px;border-bottom:4px solid #FF741B">' +
    '<img src="' + CONFIG.APP_URL + '/logo.png" alt="Elec Habitat" width="200" style="display:block;border:0;max-width:200px;height:auto"></div>' +
    '<div style="padding:24px;color:#1F2238;font-size:15px;line-height:1.5">' + corpsHtml +
    (lien ? '<p style="margin-top:24px"><a href="' + lien + '" style="background:#FF741B;color:#FFFFFF;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">' +
      (libelleBouton || 'Ouvrir dans l\'appli') + '</a></p>' : '') +
    '</div><div style="padding:12px 24px;font-size:12px;color:#7A7E94;border-top:1px solid #E1E3EE">' +
    'Mail automatique · Appli Elec Habitat par So Conseiller</div></div></div>';
}

function texteEnHtml_(t) {
  return echapper_(t).replace(/\n/g, '<br>');
}

/** Répartit les destinataires entre mail et notification selon le choix fait dans les Réglages.
 *  « Notification seule » : les personnes qui n'ont activé les notifications sur aucun appareil
 *  reçoivent quand même le mail, pour que personne ne passe à côté. */
function repartir_(m, toCsv) {
  const emails = String(toCsv || '').split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  const canal = m.push === 'non' ? 'mail' : m.push === 'seule' ? 'notif' : 'les2';
  if (canal === 'mail') return { mail: emails.join(','), push: '' };
  if (canal === 'les2') return { mail: emails.join(','), push: emails.join(',') };
  const equipes = {};
  if (compteFirebase_()) all_('Appareils').forEach(function (a) { equipes[String(a.email).toLowerCase()] = true; });
  return {
    mail: emails.filter(function (e) { return !equipes[e.toLowerCase()]; }).join(','),
    push: emails.filter(function (e) { return equipes[e.toLowerCase()]; }).join(',')
  };
}

function envoyer_(m, vars, cleRelance) {
  const reg = lireReglages_();
  const to = destinataires_(m, vars);
  let sujet = remplir_(m.objet, vars);
  if (reg.modeTest === 'oui') sujet = '[TEST] ' + sujet;
  const corps = remplir_(m.texte, vars);
  const pieces = (['a_facturer', 'pv_reserves'].indexOf(m.cle) >= 0 && vars._id) ? piecesPV_(vars._id) : { blobs: [], liens: [] };
  const docsHtml = pieces.liens.length
    ? '<p style="margin-top:16px"><strong>Documents du PV</strong><br>' + pieces.liens.map(function (x) {
      return '<a href="' + x.lien + '" style="color:#222468">' + echapper_(x.nom) + '</a>';
    }).join('<br>') + '</p>' : '';
  const qui = repartir_(m, to);
  let resultat = qui.mail ? 'envoyé' : 'notification seule';
  if (qui.mail) {
    try {
      const mail = {
        to: qui.mail, subject: sujet, body: corps + '\n\n' + vars.lien,
        htmlBody: gabaritHtml_(texteEnHtml_(corps) + docsHtml, vars.lien), name: NOM_APPLI
      };
      if (pieces.blobs.length) mail.attachments = pieces.blobs;
      MailApp.sendEmail(avecReponse_(mail));
    } catch (e) {
      resultat = 'erreur : ' + e;
    }
  }
  if (m.sms === 'oui') resultat += smsPourAdresses_(to, sujet, vars.lien);
  if (qui.push) resultat += pushPourAdresses_(qui.push, sujet, corps, vars.lien);
  insert_('Journal', { date: horodatage_(new Date()), relance: m.cle, dossierId: vars._id || '', destinataires: to, resultat: resultat });
  if (cleRelance) marquerRelance_(cleRelance, jour_(new Date()));
}

/** Mail envoyé tout de suite (nouvelle commande, facture demandée, chantier terminé) */
function envoyerMaintenant_(cle, vars, dossierId, cleRelance) {
  const m = configMail_(cle);
  if (!m || m.active !== 'oui') return;
  envoyer_(m, vars, cleRelance);
}

function etatRelances_() {
  const out = {};
  all_('Relances').forEach(function (r) { out[r.cle] = r.dernierEnvoi; });
  return out;
}

function marquerRelance_(cle, date) {
  if (trouver_('Relances', 'cle', cle)) update_('Relances', 'cle', cle, { dernierEnvoi: date });
  else insert_('Relances', { cle: cle, dernierEnvoi: date });
}

function resetRelance_(cle) {
  if (trouver_('Relances', 'cle', cle)) update_('Relances', 'cle', cle, { dernierEnvoi: '' });
}

/** Liste de ce qui est « dû » pour une relance donnée, à une date donnée */
function elementsDus_(cle, today) {
  const m = configMail_(cle);
  const delai = Number(m.delaiJours || 0);
  const dossiers = all_('Dossiers');
  const parId = {};
  dossiers.forEach(function (d) { parId[d.id] = d; });
  const ouvert = function (d) { return d && ['facture', 'refuse', 'ignore'].indexOf(d.etape) < 0; };
  const out = [];

  if (cle === 'devis_a_faire') {
    dossiers.forEach(function (d) {
      if (d.etape === 'devis_a_faire' && d.dateRdv && jour_(ajouterJours_(d.dateRdv, delai)) <= today) {
        out.push({ key: cle + '|' + d.id, vars: varsDossier_(d) });
      }
    });
  } else if (cle === 'relance_client') {
    dossiers.forEach(function (d) {
      if (d.etape === 'devis_envoye' && d.prochaineRelance && d.prochaineRelance <= today) {
        out.push({ key: cle + '|' + d.id, vars: varsDossier_(d) });
      }
    });
  } else if (cle === 'commande_materiel') {
    dossiers.forEach(function (d) {
      if (d.etape === 'commande' && d.dateValidation && jour_(ajouterJours_(d.dateValidation, delai)) <= today) {
        out.push({ key: cle + '|' + d.id, vars: varsDossier_(d) });
      }
    });
  } else if (cle === 'materiel_demande') {
    all_('Commandes').forEach(function (c) {
      const d = parId[c.dossierId];
      if (ouvert(d) && c.statut === 'demandee' && c.dateDemande && jour_(ajouterJours_(c.dateDemande, delai)) <= today) {
        const v = varsDossier_(d, c);
        v.demande_par = c.demandePar || '';
        v.liste_materiel = c.demande || '';
        out.push({ key: cle + '|' + c.id, vars: v });
      }
    });
  } else if (cle === 'livraison') {
    // Prévenir X jours avant la livraison (0 = le jour même). Un seul mail par livraison ;
    // si le jour prévu n'est pas un jour d'envoi, le mail part au premier jour d'envoi suivant.
    const limite = jour_(ajouterJours_(today, Math.max(0, delai)));
    all_('Commandes').forEach(function (c) {
      const d = parId[c.dossierId];
      if (ouvert(d) && c.dateLivraison && c.dateLivraison >= today && c.dateLivraison <= limite && c.receptionStatut !== 'conforme') {
        const v = varsDossier_(d, c);
        v.quand = quand_(today, c.dateLivraison);
        out.push({ key: cle + '|' + c.id, vars: v, unique: true });
      }
    });
  } else if (cle === 'reception') {
    all_('Commandes').forEach(function (c) {
      const d = parId[c.dossierId];
      if (ouvert(d) && c.receptionStatut !== 'conforme' && c.dateLivraison &&
          jour_(ajouterJours_(c.dateLivraison, delai)) <= today) {
        out.push({ key: cle + '|' + c.id, vars: varsDossier_(d, c) });
      }
    });
  } else if (cle === 'facture_inter') {
    all_('Factures').forEach(function (f) {
      const d = parId[f.dossierId];
      if (d && f.type === 'intermediaire' && f.faite !== 'oui' && jour_(ajouterJours_(f.dateDemande, delai)) <= today) {
        const v = varsDossier_(d);
        v.pourcentage = f.pourcentage;
        v.commentaire = f.commentaire;
        out.push({ key: cle + '|' + f.id, vars: v });
      }
    });
  } else if (cle === 'a_facturer') {
    dossiers.forEach(function (d) {
      if (d.etape === 'termine' && d.dateFinChantier && jour_(ajouterJours_(d.dateFinChantier, delai)) <= today) {
        out.push({ key: cle + '|' + d.id, vars: varsDossier_(d) });
      }
    });
  }
  return out;
}

function lancerRelances_(now) {
  const today = jour_(now);
  const heure = Number(Utilities.formatDate(now, tz_(), 'H'));
  let jourSemaine = now.getDay();
  jourSemaine = jourSemaine === 0 ? 7 : jourSemaine;
  const etat = etatRelances_();

  all_('Mails').forEach(function (m) {
    if (m.active !== 'oui' || m.heure === '' || MAILS_IMMEDIATS.indexOf(m.cle) >= 0) return;
    if (Number(m.heure) !== heure) return;
    const jours = String(m.jours || '').split(',').map(function (x) { return x.trim(); });
    if (jours.indexOf(String(jourSemaine)) < 0) return;

    if (m.cle === 'recap') {
      if (etat.recap !== today) envoyerRecap_(m, today);
      return;
    }
    if (m.cle === 'avancement') {
      if (etat.avancement !== today) envoyerAvancement_(m, today);
      return;
    }
    if (m.cle === 'presence') {
      envoyerRappelsPresence_(m, today, etat);
      return;
    }
    const rythme = Math.max(1, Number(m.rythmeJours || 1));
    elementsDus_(m.cle, today).forEach(function (it) {
      const last = etat[it.key];
      if (it.unique) {
        if (!last) envoyer_(m, it.vars, it.key);
        return;
      }
      if (!last || ecartJours_(last, today) >= rythme) envoyer_(m, it.vars, it.key);
    });
  });
}

/** Mail récapitulatif : tout ce qui reste à faire, étape par étape */
function envoyerRecap_(m, today) {
  const reg = lireReglages_();
  const dossiers = all_('Dossiers');
  const parId = {};
  dossiers.forEach(function (d) { parId[d.id] = d; });
  const nom = function (d) { return echapper_(d.client || d.titreRdv || d.id); };
  const lien = function (d) { return CONFIG.APP_URL + '/?depuis=mail#/dossier/' + d.id; };
  const ligne = function (d, extra) {
    return '<li><a href="' + lien(d) + '" style="color:#222468">' + nom(d) + '</a>' + (extra ? ' – ' + echapper_(extra) : '') + '</li>';
  };
  const sections = [];
  const bloc = function (titre, items) {
    if (items.length) sections.push('<h3 style="font-size:15px;margin:20px 0 6px;color:#222468">' + titre + ' (' + items.length + ')</h3><ul style="margin:0;padding-left:18px">' + items.join('') + '</ul>');
  };
  bloc('Devis à faire', dossiers.filter(function (d) { return d.etape === 'devis_a_faire'; })
    .map(function (d) { return ligne(d, 'rdv du ' + formatFr_(d.dateRdv)); }));
  bloc('Clients à relancer', dossiers.filter(function (d) { return d.etape === 'devis_envoye' && d.prochaineRelance <= today; })
    .map(function (d) { return ligne(d, 'devis ' + d.numDevis + ', relance prévue le ' + formatFr_(d.prochaineRelance)); }));
  bloc('Matériel à commander', dossiers.filter(function (d) { return d.etape === 'commande'; })
    .map(function (d) { return ligne(d, 'validé le ' + formatFr_(d.dateValidation)); }));
  const cmd = all_('Commandes').filter(function (c) { const d = parId[c.dossierId]; return d && ['facture', 'refuse', 'ignore'].indexOf(d.etape) < 0; });
  bloc('Matériel demandé par les techniciens', cmd.filter(function (c) { return c.statut === 'demandee'; })
    .map(function (c) { return ligne(parId[c.dossierId], (c.demandePar ? c.demandePar + ' : ' : '') + String(c.demande || '').replace(/\n/g, ', ').slice(0, 120)); }));
  bloc('Réceptions non conformes', cmd.filter(function (c) { return c.receptionStatut === 'non_conforme'; })
    .map(function (c) { return ligne(parId[c.dossierId], c.fournisseur + (c.receptionCommentaire ? ' – ' + c.receptionCommentaire : '')); }));
  bloc('Réceptions à valider', cmd.filter(function (c) {
    return ['', 'partielle'].indexOf(c.receptionStatut) >= 0 && c.dateLivraison && c.dateLivraison <= today;
  }).map(function (c) { return ligne(parId[c.dossierId], c.fournisseur + ', attendu le ' + formatFr_(c.dateLivraison)); }));
  bloc('Livraisons à venir', cmd.filter(function (c) { return c.dateLivraison > today && c.receptionStatut !== 'conforme'; })
    .sort(function (a, b) { return a.dateLivraison < b.dateLivraison ? -1 : 1; })
    .map(function (c) { return ligne(parId[c.dossierId], c.fournisseur + ', le ' + formatFr_(c.dateLivraison)); }));
  bloc('Chantiers à planifier', dossiers.filter(function (d) { return ['commande', 'materiel'].indexOf(d.etape) >= 0 && !d.dateDebut; })
    .map(function (d) { return ligne(d, d.chantier); }));
  bloc('Chantiers en cours', dossiers.filter(function (d) { return d.etape === 'en_cours'; })
    .map(function (d) { return ligne(d, (d.chantier || '') + ' – ' + (d.avancement || 0) + ' %'); }));
  const congesAttente = all_('Conges').filter(function (c) { return c.statut === 'demande'; });
  if (congesAttente.length) {
    sections.push('<h3 style="font-size:15px;margin:20px 0 6px;color:#222468">Demandes d\'absence à valider (' + congesAttente.length + ')</h3><ul style="margin:0;padding-left:18px">' +
      congesAttente.map(function (c) { return '<li>' + echapper_(nomUtilisateur_(c.email)) + ' – ' + echapper_(c.motif) + ' ' + echapper_(libellePeriodeConge_(c)) + '</li>'; }).join('') + '</ul>');
  }
  const fac = all_('Factures').filter(function (f) { return f.faite !== 'oui' && parId[f.dossierId]; });
  bloc('Factures à faire', fac.map(function (f) {
    return ligne(parId[f.dossierId], f.type === 'finale' ? 'facture finale' : 'facture intermédiaire ' + f.pourcentage + ' %');
  }));

  const intro = texteEnHtml_(remplir_(m.texte, { entreprise: reg.entreprise || '' }));
  const corps = intro + (sections.length ? sections.join('') : '<p>Rien en attente. Bravo !</p>');
  const to = destinataires_(m);
  let sujet = remplir_(m.objet, { entreprise: reg.entreprise || '' });
  if (reg.modeTest === 'oui') sujet = '[TEST] ' + sujet;
  const qui = repartir_(m, to);
  let resultat = qui.mail ? 'envoyé' : 'notification seule';
  try {
    if (qui.mail) MailApp.sendEmail(avecReponse_({ to: qui.mail, subject: sujet, htmlBody: gabaritHtml_(corps, CONFIG.APP_URL, 'Ouvrir l\'appli'), name: NOM_APPLI }));
    if (qui.push) pushPourAdresses_(qui.push, sujet, m.push === 'seule' ? 'Ouvrez l\'appli pour voir ce qui reste à faire.' : 'Le récapitulatif de ce qui reste à faire est dans votre boîte mail.', CONFIG.APP_URL);
  } catch (e) {
    resultat = 'erreur : ' + e;
  }
  insert_('Journal', { date: horodatage_(new Date()), relance: 'recap', dossierId: '', destinataires: to, resultat: resultat });
  marquerRelance_('recap', today);
}

/** Bouton « Envoyer un mail de test » */
function mailTest_(cle, user) {
  const m = configMail_(cle);
  if (!m) throw erreur_('Relance inconnue.');
  const reg = lireReglages_();
  const to = reg.modeTest === 'oui' ? (reg.emailTest || user.email) : user.email;
  if (cle === 'recap' || cle === 'avancement') {
    const copieRecap = JSON.parse(JSON.stringify(m));
    copieRecap.destinataires = to;
    const avant = etatRelances_()[cle];
    if (cle === 'recap') envoyerRecap_(copieRecap, jour_(new Date()));
    else envoyerAvancement_(copieRecap, jour_(new Date()));
    marquerRelance_(cle, avant || '');
    return;
  }
  const exemple = {
    entreprise: reg.entreprise || '', client: 'Client Exemple', numero_devis: 'D-0001',
    date_rdv: formatFr_(jour_(new Date())), numero_commande: 'CMD-0001', date_validation: formatFr_(jour_(new Date())),
    chantier: 'Chantier Exemple', avancement: '40', prochaine_relance: formatFr_(jour_(new Date())),
    fournisseur: 'Fournisseur Exemple', date_livraison: formatFr_(jour_(ajouterJours_(new Date(), 1))),
    pourcentage: '30', commentaire: 'Commentaire exemple', quand: 'demain', reception: 'pas encore réceptionné',
    receptionne_par: 'Technicien Exemple', numero_bl: 'BL-0001', pv: 'avec réserves', lieu: 'Dax', zone: 'Zone 2 (10 à 20 km)',
    reserves: 'Prise de la cuisine à reprendre', demande_par: 'Technicien Exemple',
    liste_materiel: '2 disjoncteurs 16 A\n1 interrupteur différentiel 40 A 30 mA\n25 m de câble R2V 3G2,5',
    prenom: (user.nom || '').split(' ')[0] || 'Paul', date: formatFr_(jour_(new Date())),
    technicien: 'Technicien Exemple', motif: 'Congés payés', periode: 'du 22/12 au 02/01', decision: 'acceptée',
    reponse: 'Bonnes fêtes !', phrase_conges: reg.phraseConges || '', changement: 'Le 12/11 a été déplacé au 14/11.',
    auteur: 'Paul Dufau', message: 'Gaines passées au rez-de-chaussée, je finis le tableau demain.',
    _techniciens: '', lien: CONFIG.APP_URL, _id: ''
  };
  MailApp.sendEmail(avecReponse_({
    to: to, subject: '[ESSAI] ' + remplir_(m.objet, exemple), body: remplir_(m.texte, exemple),
    htmlBody: gabaritHtml_(texteEnHtml_(remplir_(m.texte, exemple)), CONFIG.APP_URL), name: NOM_APPLI
  }));
}

/* ==================================================================
 * 8 bis. LOCALISATION DES CHANTIERS ET ZONES DE TRAJET
 * ================================================================== */

/** Coordonnées d'une adresse (service Google Maps) ; null si introuvable */
function geocoder_(adresse) {
  const a = String(adresse || '').trim();
  if (!a) return null;
  const res = Maps.newGeocoder().setRegion('fr').setLanguage('fr').geocode(a);
  if (!res || res.status !== 'OK' || !res.results || !res.results.length) return null;
  const loc = res.results[0].geometry.location;
  return { lat: Math.round(loc.lat * 1e6) / 1e6, lng: Math.round(loc.lng * 1e6) / 1e6, adresse: res.results[0].formatted_address };
}

/** Adresse d'un point GPS (service Google Maps) ; '' si introuvable */
function adresseDePosition_(lat, lng) {
  try {
    const res = Maps.newGeocoder().setRegion('fr').setLanguage('fr').reverseGeocode(lat, lng);
    if (!res || res.status !== 'OK' || !res.results || !res.results.length) return '';
    // On préfère une vraie adresse (numéro et rue) ; sinon la première réponse
    const precise = res.results.filter(function (r) { return (r.types || []).some(function (t) { return t === 'street_address' || t === 'premise'; }); })[0];
    return String((precise || res.results[0]).formatted_address || '').replace(/, France$/, '');
  } catch (e) {
    Logger.log('Adresse de la position : ' + e);
    return '';
  }
}

/** Met à jour le point de départ des trajets à partir de son adresse */
function majDepart_(adresse) {
  const g = geocoder_(adresse);
  if (!g) throw erreur_('Adresse du point de départ introuvable : ' + adresse);
  update_('Reglages', 'cle', 'departLat', { valeur: String(g.lat) });
  update_('Reglages', 'cle', 'departLng', { valeur: String(g.lng) });
  CACHE_ = {};
}

/** Distance à vol d'oiseau en km (arrondie au dixième) */
function distanceKm_(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Distance depuis le point de départ (réglages) ; null si un point manque */
function distanceDepart_(lat, lng) {
  const reg = lireReglages_();
  const dl = Number(reg.departLat), dg = Number(reg.departLng);
  if (!isFinite(lat) || !isFinite(lng) || !dl || !dg || (!lat && !lng)) return null;
  return distanceKm_(dl, dg, lat, lng);
}

/**
 * Zones de trajet, d'après le réglage « 1A:5,1B:10,2:20… » → [{ nom: '1A', min: 0, max: 5 }, …].
 * Un réglage sans noms (« 10,20,30 ») donne les zones 1, 2, 3.
 */
function zonesTrajet_(texte) {
  const out = [];
  String(texte !== undefined ? texte : (lireReglages_().zones || REGLAGES_DEFAUT.zones)).split(',').forEach(function (x, i) {
    const p = String(x).trim().split(':');
    if (!p[0]) return;
    const nom = p.length > 1 ? p[0].trim().toUpperCase() : String(i + 1);
    const max = Number(String(p.length > 1 ? p[1] : p[0]).trim().replace(',', '.'));
    out.push({ nom: nom, min: out.length ? out[out.length - 1].max : 0, max: max });
  });
  return out;
}

/** Zone d'un trajet : nom de la zone ('1A', '2'…) ou 'GD' (grand déplacement, au-delà de la dernière zone) */
function zonePour_(km) {
  if (km === null || km === undefined || km === '' || !isFinite(Number(km))) return '';
  const z = zonesTrajet_();
  for (let i = 0; i < z.length; i++) if (Number(km) <= z[i].max) return z[i].nom;
  return 'GD';
}

function libelleZone_(nom) {
  if (!nom) return '';
  const z = zonesTrajet_();
  if (nom === 'GD') return 'Grand déplacement (plus de ' + (z.length ? z[z.length - 1].max : 0) + ' km)';
  const t = z.filter(function (x) { return x.nom === nom; })[0];
  return t ? 'Zone ' + t.nom + ' (' + String(t.min).replace('.', ',') + ' à ' + String(t.max).replace('.', ',') + ' km)' : 'Zone ' + nom;
}

function poserPosition_(id, lat, lng, lieu) {
  const km = distanceDepart_(lat, lng);
  const patch = { lat: String(lat), lng: String(lng), distanceKm: km === null ? '' : String(km), zone: zonePour_(km) };
  if (lieu !== undefined) patch.lieu = lieu;
  majDossier_(id, patch);
  return patch;
}

/** Localise un dossier à partir de son adresse ; renvoie false si l'adresse est introuvable */
function localiserParAdresse_(id, adresse) {
  if (!String(adresse || '').trim()) return false;
  const g = geocoder_(adresse);
  if (!g) return false;
  poserPosition_(id, g.lat, g.lng);
  return true;
}

/**
 * Localisation d'un chantier :
 *  - d.mode = 'adresse' : l'adresse saisie à la main est cherchée sur la carte ;
 *  - d.mode = 'gps' : la position du téléphone (sur place) est enregistrée.
 */
function localiserChantier_(d, user) {
  const dos = dossierOuErreur_(d.id);
  if (!estAdmin_(user) && !estChantier_(dos)) throw erreur_('Ce dossier n\'est pas encore un chantier.');
  let p;
  if (d.mode === 'gps') {
    const lat = Number(d.lat), lng = Number(d.lng);
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) throw erreur_('Position du téléphone non reçue.');
    // Le lieu du chantier prend l'adresse retrouvée à partir de la position du téléphone
    const adresse = String(d.adresse || '').trim() || adresseDePosition_(lat, lng) ||
      ('Position GPS ' + String(lat).replace('.', ',') + ' / ' + String(lng).replace('.', ','));
    p = poserPosition_(dos.id, lat, lng, adresse);
    p.lieu = adresse;
    log_(dos.id, user, 'Position du chantier enregistrée sur place', adresse + (p.distanceKm ? ' – ' + p.distanceKm + ' km, ' + libelleZone_(p.zone) : ''));
  } else {
    const adresse = String(d.adresse || '').trim();
    if (!adresse) throw erreur_('Indiquez l\'adresse du chantier.');
    const g = geocoder_(adresse);
    if (!g) throw erreur_('Adresse introuvable sur la carte. Vérifiez la commune ou utilisez la position du téléphone sur place.');
    p = poserPosition_(dos.id, g.lat, g.lng, adresse);
    log_(dos.id, user, 'Adresse du chantier', adresse + (p.distanceKm ? ' – ' + p.distanceKm + ' km, ' + libelleZone_(p.zone) : ''));
  }
  return p;
}

/** Recalcule distances et zones (après un changement de point de départ ou de zones) */
function recalculerDistances_() {
  CACHE_ = {};
  all_('Dossiers').forEach(function (d) {
    if (!d.lat || !d.lng) return;
    const km = distanceDepart_(Number(d.lat), Number(d.lng));
    update_('Dossiers', 'id', d.id, { distanceKm: km === null ? '' : String(km), zone: zonePour_(km) });
  });
  all_('Pointages').forEach(function (p) {
    let lieux = [];
    try { lieux = JSON.parse(p.lieux || '[]'); } catch (e) { lieux = []; }
    let max = null;
    lieux.forEach(function (l) {
      if (l.lat && l.lng) { l.km = distanceDepart_(Number(l.lat), Number(l.lng)); }
      if (l.km !== null && l.km !== undefined && l.km !== '' && (max === null || Number(l.km) > max)) max = Number(l.km);
    });
    update_('Pointages', 'id', p.id, { lieux: JSON.stringify(lieux), distanceKm: max === null ? '' : String(max), zone: zonePour_(max) });
  });
}

/* ==================================================================
 * 8 ter. PRÉSENCES ET TRAJETS DES TECHNICIENS
 * ================================================================== */

function utilisateur_(email) {
  return all_('Utilisateurs').filter(function (u) { return u.email === String(email || '').toLowerCase(); })[0] || null;
}
function nomUtilisateur_(email) {
  const u = utilisateur_(email);
  return u ? (u.nom || u.email) : String(email || '');
}
function prenomDe_(email) {
  const u = utilisateur_(email);
  return u && u.nom ? u.nom.split(' ')[0] : String(email || '').split('@')[0];
}
function techniciensActifs_() {
  return all_('Utilisateurs').filter(function (u) { return u.role === 'technicien' && u.actif !== 'non'; });
}

/**
 * Présence d'un jour :
 * d = { date, email (admin seulement), statut: present|absent, motif, commentaire,
 *       lieux: [{ dossierId } | { libelle, adresse } | { libelle, lat, lng }] }
 * La zone du jour est celle du lieu le plus éloigné du point de départ.
 */
function enregistrerPointage_(d, user) {
  const admin = estAdmin_(user);
  const email = String(admin && d.email ? d.email : user.email).toLowerCase();
  if (!utilisateur_(email)) throw erreur_('Personne inconnue : ' + email);
  const date = String(d.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw erreur_('Indiquez la date.');
  const today = jour_(new Date());
  if (date > today) throw erreur_('On ne peut pas déclarer une journée à venir.');
  if (!admin && ecartJours_(date, today) > 31) throw erreur_('Plus d\'un mois : demandez à l\'administrateur de corriger.');
  const statut = d.statut === 'absent' ? 'absent' : 'present';
  const lieux = [];
  let max = null;
  if (statut === 'present') {
    (d.lieux || []).forEach(function (l) {
      const out = { dossierId: '', libelle: '', lat: '', lng: '', km: '', temps: '', heures: '' };
      // Temps passé sur ce lieu : journée, matin, après-midi ou nombre d'heures
      out.temps = ['journee', 'matin', 'apres_midi', 'heures'].indexOf(l.temps) >= 0 ? l.temps : 'journee';
      out.heures = String(heuresLieu_(out.temps, l.heures));
      if (l.dossierId) {
        let dos = trouver_('Dossiers', 'id', l.dossierId);
        if (!dos) return;
        if ((!dos.lat || !dos.lng) && dos.lieu) {
          try { localiserParAdresse_(dos.id, dos.lieu); dos = trouver_('Dossiers', 'id', l.dossierId); } catch (e) { Logger.log(e); }
        }
        out.dossierId = dos.id; out.libelle = dos.chantier || dos.client || dos.titreRdv; out.lat = dos.lat; out.lng = dos.lng;
      } else {
        out.libelle = String(l.libelle || l.adresse || 'Autre lieu').trim();
        if (l.lat && l.lng) { out.lat = String(l.lat); out.lng = String(l.lng); }
        else if (l.adresse) {
          const g = geocoder_(l.adresse);
          if (!g) throw erreur_('Adresse introuvable : ' + l.adresse);
          out.lat = String(g.lat); out.lng = String(g.lng);
        }
      }
      if (out.lat && out.lng) {
        const km = distanceDepart_(Number(out.lat), Number(out.lng));
        out.km = km === null ? '' : km;
        if (km !== null && (max === null || km > max)) max = km;
      }
      lieux.push(out);
    });
    if (!lieux.length) throw erreur_('Indiquez au moins un chantier ou un lieu.');
    if (lieux.some(function (l) { return !(Number(l.heures) > 0); })) throw erreur_('Indiquez le nombre d\'heures passées.');
    const total = lieux.reduce(function (t, l) { return t + Number(l.heures); }, 0);
    if (total > 14) throw erreur_('Plus de 14 heures dans la journée : vérifiez les temps indiqués.');
  } else if (!d.motif) {
    throw erreur_('Indiquez le motif de l\'absence.');
  }
  const ligne = {
    date: date, email: email, statut: statut, motif: statut === 'absent' ? String(d.motif || '') : '',
    lieux: JSON.stringify(lieux), distanceKm: max === null ? '' : String(max), zone: zonePour_(max),
    commentaire: String(d.commentaire || ''), saisiPar: user.nom || user.email, majLe: horodatage_(new Date())
  };
  const existant = all_('Pointages').filter(function (p) { return p.email === email && p.date === date; })[0];
  // Chantiers à recalculer : ceux d'avant et ceux de maintenant
  const touches = {};
  lieux.forEach(function (l) { if (l.dossierId) touches[l.dossierId] = true; });
  if (existant) {
    try { JSON.parse(existant.lieux || '[]').forEach(function (l) { if (l.dossierId) touches[l.dossierId] = true; }); } catch (e) { /* ancien format */ }
    update_('Pointages', 'id', existant.id, ligne);
  } else { ligne.id = nouvelId_('T'); ligne.demo = 'non'; insert_('Pointages', ligne); }
  CACHE_ = {};
  Object.keys(touches).forEach(function (id) { try { majTemps_(id); } catch (e) { Logger.log('Temps : ' + e); } });
  return { zone: ligne.zone, distanceKm: ligne.distanceKm };
}

function supprimerPointage_(d, user) {
  const p = trouver_('Pointages', 'id', d.id);
  if (!p) throw erreur_('Journée introuvable.');
  delete_('Pointages', 'id', p.id);
}

/** Relevé des trajets en PDF : un technicien (ou tous), jour par jour, sur une période */
function trajetsPdf_(d, user) {
  const admin = estAdmin_(user);
  const du = String(d.du || '').slice(0, 10), au = String(d.au || '').slice(0, 10);
  if (!du || !au || au < du) throw erreur_('Indiquez une période valide.');
  if (ecartJours_(du, au) > 400) throw erreur_('Période trop longue (400 jours au maximum).');
  let emails;
  if (!admin) emails = [user.email];
  else if (d.email) emails = [String(d.email).toLowerCase()];
  else emails = techniciensActifs_().map(function (u) { return u.email; });
  if (!emails.length) throw erreur_('Aucun technicien à éditer.');
  const reg = lireReglages_();
  const pointages = all_('Pointages');
  const conges = all_('Conges').filter(function (c) { return c.statut === 'accepte'; });
  const zonesOrdre = zonesTrajet_().map(function (z) { return z.nom; }).concat(['GD']);
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const e = echapper_;
  const css = 'body{font-family:Arial,Helvetica,sans-serif;color:#1F2238;font-size:10.5pt}' +
    'h1{font-size:16pt;color:#222468;margin:0}h2{font-size:13pt;color:#222468;margin:22px 0 6px;border-bottom:2px solid #FF741B;padding-bottom:4px}' +
    '.bandeau{background:#222468;color:#fff;padding:12px 16px;border-bottom:4px solid #FF741B}.bandeau h1{color:#fff}' +
    '.sous{font-size:9.5pt;color:#555;margin:6px 0 0}table{width:100%;border-collapse:collapse;margin-top:6px}' +
    'th{background:#EEF0F8;color:#222468;text-align:left;font-size:9pt;padding:5px 6px;border:1px solid #D5D8E6}' +
    'td{padding:4px 6px;border:1px solid #D5D8E6;font-size:9.5pt;vertical-align:top}.we td{color:#999}.abs td{background:#FFF4EC}' +
    '.tot td{font-weight:bold;background:#F6F7FB}.saut{page-break-before:always}';
  let html = '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>';
  emails.forEach(function (email, idx) {
    const u = utilisateur_(email) || { nom: email };
    const parZone = {}; zonesOrdre.forEach(function (z) { parZone[z] = 0; });
    let presents = 0, sansLieu = 0;
    const absences = {};
    const lignes = [];
    for (let j = du, n = 0; j <= au && n < 401; j = jour_(ajouterJours_(j, 1)), n++) {
      const dt = ajouterJours_(j, 0);
      const js = dt.getDay();
      const p = pointages.filter(function (x) { return x.email === email && x.date === j; })[0];
      const cg = conges.filter(function (c) { return c.email === email && c.dateDebut <= j && c.dateFin >= j; })[0];
      const weekend = js === 0 || js === 6;
      if (!p && weekend) continue;
      let pres = '', lieu = '', km = '', zone = '', cls = '';
      if (p && p.statut === 'present') {
        presents++;
        pres = 'Présent';
        let ls = [];
        try { ls = JSON.parse(p.lieux || '[]'); } catch (er) { ls = []; }
        lieu = ls.map(function (l) {
          return e(l.libelle || '') + (l.km !== '' && l.km !== undefined ? ' (' + String(l.km).replace('.', ',') + ' km)' : '') +
            (l.heures ? ' · ' + String(Math.round(Number(l.heures) * 10) / 10).replace('.', ',') + ' h' : '');
        }).join('<br>');
        km = p.distanceKm ? String(p.distanceKm).replace('.', ',') : '';
        zone = p.zone ? (p.zone === 'GD' ? 'GD' : 'Zone ' + p.zone) : '';
        if (p.zone) parZone[p.zone] = (parZone[p.zone] || 0) + 1; else sansLieu++;
        if (p.commentaire) lieu += '<br><i>' + e(p.commentaire) + '</i>';
      } else if (p && p.statut === 'absent') {
        pres = 'Absent'; lieu = e(p.motif || ''); cls = 'abs';
        absences[p.motif || 'Autre'] = (absences[p.motif || 'Autre'] || 0) + 1;
      } else if (cg) {
        pres = 'Absent'; lieu = e(cg.motif) + ' (validé)'; cls = 'abs';
        absences[cg.motif] = (absences[cg.motif] || 0) + 1;
      } else {
        pres = '<span style="color:#B8352B">Non déclaré</span>';
      }
      lignes.push('<tr class="' + (weekend ? 'we ' : '') + cls + '"><td>' + JOURS[js] + ' ' + formatFr_(j) + '</td><td>' + pres + '</td><td>' + lieu + '</td><td style="text-align:right">' + km + '</td><td>' + zone + '</td></tr>');
    }
    html += (idx ? '<div class="saut"></div>' : '') +
      '<div class="bandeau"><h1>' + e(reg.entreprise || NOM_APPLI) + ' · Relevé des trajets</h1></div>' +
      '<h2>' + e(u.nom || email) + '</h2>' +
      '<p class="sous">Période du ' + formatFr_(du) + ' au ' + formatFr_(au) + ' · Distances à vol d\'oiseau depuis : ' + e(reg.departNom || reg.departAdresse || '') +
      ' · Édité le ' + formatFr_(jour_(new Date())) + '</p>' +
      '<table><thead><tr><th style="width:17%">Jour</th><th style="width:13%">Présence</th><th>Chantier(s) / lieu</th><th style="width:9%">Km</th><th style="width:10%">Zone</th></tr></thead><tbody>' +
      (lignes.join('') || '<tr><td colspan="5">Aucune journée sur la période.</td></tr>') + '</tbody></table>' +
      '<h2>Récapitulatif</h2><table><tbody>' +
      zonesOrdre.map(function (z) { return '<tr><td>' + e(libelleZone_(z)) + '</td><td style="text-align:right;width:20%">' + (parZone[z] || 0) + ' jour(s)</td></tr>'; }).join('') +
      (sansLieu ? '<tr><td>Présent, lieu non localisé</td><td style="text-align:right">' + sansLieu + ' jour(s)</td></tr>' : '') +
      Object.keys(absences).map(function (m) { return '<tr><td>Absence : ' + e(m) + '</td><td style="text-align:right">' + absences[m] + ' jour(s)</td></tr>'; }).join('') +
      '<tr class="tot"><td>Jours de présence</td><td style="text-align:right">' + presents + ' jour(s)</td></tr></tbody></table>';
  });
  html += '<p class="sous" style="margin-top:18px">Document généré par l\'appli ' + e(reg.entreprise || NOM_APPLI) + '.</p></body></html>';
  const nom = 'Trajets ' + (emails.length === 1 ? nomUtilisateur_(emails[0]) : 'équipe') + ' ' + du + ' au ' + au + '.pdf';
  const pdf = Utilities.newBlob(html, 'text/html', 'trajets.html').getAs('application/pdf').setName(nom);
  // Copie rangée dans Google Drive (dossier « Trajets »)
  try {
    const root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
    const it = root.getFoldersByName('Trajets');
    (it.hasNext() ? it.next() : root.createFolder('Trajets')).createFile(pdf);
  } catch (er) { Logger.log('Copie Drive : ' + er); }
  return { nom: nom, base64: Utilities.base64Encode(pdf.getBytes()) };
}

/* ==================================================================
 * 8 quater. CONGÉS ET ABSENCES
 * ================================================================== */

const LIB_CRENEAU_CONGE = { journee: 'journée', matin: 'matin', apres_midi: 'après-midi' };

function libellePeriodeConge_(c) {
  const cd = c.creneauDebut && c.creneauDebut !== 'journee' ? ' (' + LIB_CRENEAU_CONGE[c.creneauDebut] + ')' : '';
  const cf = c.creneauFin && c.creneauFin !== 'journee' ? ' (' + LIB_CRENEAU_CONGE[c.creneauFin] + ')' : '';
  if (c.dateDebut === c.dateFin) return 'le ' + formatFr_(c.dateDebut) + cd;
  return 'du ' + formatFr_(c.dateDebut) + cd + ' au ' + formatFr_(c.dateFin) + cf;
}

/** Absent toute la journée (congé validé couvrant le jour entier) ? */
function estAbsentJour_(email, date) {
  return all_('Conges').some(function (c) {
    if (c.email !== email || c.statut !== 'accepte' || c.dateDebut > date || c.dateFin < date) return false;
    if (date === c.dateDebut && c.creneauDebut && c.creneauDebut !== 'journee') return false;
    if (date === c.dateFin && c.dateFin !== c.dateDebut && c.creneauFin && c.creneauFin !== 'journee') return false;
    return true;
  });
}

function varsConge_(c) {
  const reg = lireReglages_();
  return {
    entreprise: reg.entreprise || '', technicien: nomUtilisateur_(c.email), prenom: prenomDe_(c.email), motif: c.motif || '',
    periode: libellePeriodeConge_(c), commentaire: c.commentaire || '', reponse: c.reponse || '',
    decision: c.statut === 'accepte' ? 'acceptée' : c.statut === 'refuse' ? 'refusée' : 'en attente',
    phrase_conges: reg.phraseConges || '', lien: CONFIG.APP_URL + '/?depuis=mail#/conges', _id: ''
  };
}

/** Envoie un mail configuré à une adresse précise (sans tenir compte des destinataires du réglage) */
function envoyerA_(cle, to, vars, cleRelance) {
  const m = configMail_(cle);
  if (!m || m.active !== 'oui') return;
  const copie = JSON.parse(JSON.stringify(m));
  copie.destinataires = to;
  copie.copieTechniciens = 'non';
  envoyer_(copie, vars, cleRelance);
}

/**
 * Demande d'absence. Un administrateur peut aussi saisir directement une absence validée
 * pour un technicien (d.email + d.valider = true), par exemple le calendrier école d'un apprenti.
 */
function demanderConge_(d, user) {
  const admin = estAdmin_(user);
  const email = String(admin && d.email ? d.email : user.email).toLowerCase();
  if (!utilisateur_(email)) throw erreur_('Personne inconnue.');
  const motifs = String(lireReglages_().motifsAbsence || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (!d.motif || (motifs.length && motifs.indexOf(d.motif) < 0)) throw erreur_('Choisissez le motif.');
  const debut = String(d.dateDebut || '').slice(0, 10), fin = String(d.dateFin || d.dateDebut || '').slice(0, 10);
  if (!debut) throw erreur_('Indiquez la date de début.');
  if (fin < debut) throw erreur_('La date de fin est avant la date de début.');
  const c = {
    id: nouvelId_('A'), email: email, motif: d.motif, dateDebut: debut, creneauDebut: LIB_CRENEAU_CONGE[d.creneauDebut] ? d.creneauDebut : 'journee',
    dateFin: fin, creneauFin: LIB_CRENEAU_CONGE[d.creneauFin] ? d.creneauFin : 'journee', commentaire: String(d.commentaire || ''),
    statut: 'demande', dateDemande: jour_(new Date()), demo: 'non'
  };
  if (debut === fin) c.creneauFin = c.creneauDebut;
  if (admin && d.valider) {
    c.statut = 'accepte'; c.decidePar = user.nom || user.email; c.dateDecision = c.dateDemande;
    insert_('Conges', c);
    ecrireCongeAgenda_(c);
    if (email !== user.email) envoyerA_('conge_reponse', email, varsConge_(c));
  } else {
    insert_('Conges', c);
    envoyerMaintenant_('conge_demande', varsConge_(c), '');
  }
  return c.id;
}

/** L'administrateur accepte ou refuse */
function deciderConge_(d, user) {
  const c = trouver_('Conges', 'id', d.id);
  if (!c) throw erreur_('Demande introuvable.');
  if (['accepte', 'refuse'].indexOf(d.decision) < 0) throw erreur_('Choisissez : accepter ou refuser.');
  const patch = { statut: d.decision, decidePar: user.nom || user.email, dateDecision: jour_(new Date()), reponse: String(d.reponse || '') };
  if (c.eventId && d.decision === 'refuse') { effacerEvenement_(c.eventId); patch.eventId = ''; }
  update_('Conges', 'id', c.id, patch);
  const maj = trouver_('Conges', 'id', c.id);
  if (d.decision === 'accepte' && !maj.eventId) ecrireCongeAgenda_(maj);
  envoyerA_('conge_reponse', c.email, varsConge_(trouver_('Conges', 'id', c.id)));
}

/** Retire une demande (le technicien, tant qu'elle n'est pas traitée ; l'administrateur, toujours) */
function annulerConge_(d, user) {
  const c = trouver_('Conges', 'id', d.id);
  if (!c) throw erreur_('Demande introuvable.');
  if (!estAdmin_(user) && (c.email !== user.email || c.statut !== 'demande')) {
    throw erreur_('Cette demande a déjà été traitée : voyez avec l\'administrateur.');
  }
  if (c.eventId) effacerEvenement_(c.eventId);
  delete_('Conges', 'id', c.id);
}

/** Absence validée : un événement « journée entière » dans l'agenda de l'entreprise */
function ecrireCongeAgenda_(c) {
  if (lireReglages_().congesAgenda !== 'oui' || c.demo === 'oui') return;
  try {
    const p = function (s) { const x = String(s).split('-').map(Number); return new Date(x[0], x[1] - 1, x[2]); };
    const finExclue = p(c.dateFin); finExclue.setDate(finExclue.getDate() + 1);
    const ev = agenda_().createAllDayEvent('🌴 ' + nomUtilisateur_(c.email) + ' – ' + c.motif, p(c.dateDebut), finExclue,
      { description: libellePeriodeConge_(c) + (c.commentaire ? '\n' + c.commentaire : '') });
    try { ev.setTag('suiviAffaires', 'conge'); } catch (e) { /* facultatif */ }
    update_('Conges', 'id', c.id, { eventId: ev.getId() });
  } catch (e) { Logger.log('Congé dans l\'agenda : ' + e); }
}

/* ==================================================================
 * 8 quinquies. MAILS DE PRÉSENCE ET D'AVANCEMENT
 * ================================================================== */

/** 15 h (réglable) : chaque technicien qui travaille aujourd'hui et n'a pas encore déclaré sa journée */
function envoyerRappelsPresence_(m, today, etat) {
  techniciensActifs_().forEach(function (u) {
    if (estAbsentJour_(u.email, today)) return;
    if (all_('Pointages').some(function (p) { return p.email === u.email && p.date === today; })) return;
    const cle = 'presence|' + u.email;
    if (etat[cle] === today) return;
    const copie = JSON.parse(JSON.stringify(m));
    copie.destinataires = u.email;
    copie.copieTechniciens = 'non';
    envoyer_(copie, {
      entreprise: lireReglages_().entreprise || '', prenom: (u.nom || '').split(' ')[0] || '', date: formatFr_(today),
      lien: CONFIG.APP_URL + '/?depuis=mail#/journee', _id: ''
    }, cle);
  });
}

/** Mail d'avancement des chantiers (destinataires, jours et heure réglables) */
function envoyerAvancement_(m, today) {
  const reg = lireReglages_();
  const dossiers = all_('Dossiers').filter(function (d) { return ['planifie', 'en_cours'].indexOf(d.etape) >= 0 ||
    (d.etape === 'termine' && d.dateFinChantier && ecartJours_(d.dateFinChantier, today) <= 7); })
    .sort(function (a, b) { return (a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1; });
  const coms = all_('Commentaires');
  const cmds = all_('Commandes');
  const e = echapper_;
  const lignes = dossiers.map(function (d) {
    const derniers = coms.filter(function (c) { return c.dossierId === d.id && c.texte; }).slice(-1)[0];
    const attente = cmds.filter(function (c) { return c.dossierId === d.id && (c.statut === 'demandee' || (c.dateLivraison && c.receptionStatut !== 'conforme')); }).length;
    const pct = Number(d.avancement) || 0;
    return '<tr><td style="padding:8px 6px;border-bottom:1px solid #E1E3EE;vertical-align:top"><a href="' + CONFIG.APP_URL + '/?depuis=mail#/dossier/' + d.id + '" style="color:#222468;font-weight:bold">' + e(d.chantier || d.client) + '</a>' +
      '<br><span style="color:#7A7E94;font-size:13px">' + e(d.client || '') + (d.lieu ? ' · ' + e(d.lieu) : '') +
      (d.techniciens ? ' · ' + e(d.techniciens.split(',').filter(Boolean).map(prenomDe_).join(', ')) : '') + '</span>' +
      (derniers ? '<br><span style="font-size:13px">« ' + e(String(derniers.texte).slice(0, 160)) + ' » <span style="color:#7A7E94">– ' + e(derniers.auteur) + '</span></span>' : '') +
      (attente ? '<br><span style="font-size:13px;color:#B5530B">' + attente + ' commande(s) de matériel en attente</span>' : '') + '</td>' +
      '<td style="padding:8px 6px;border-bottom:1px solid #E1E3EE;vertical-align:top;width:120px">' +
      '<div style="background:#E8E9F4;border-radius:6px;height:8px;overflow:hidden"><div style="background:#FF741B;height:8px;width:' + pct + '%"></div></div>' +
      '<div style="font-size:13px;margin-top:4px">' + (d.etape === 'termine' ? 'Terminé' : pct + ' %') + '</div></td></tr>';
  });
  const corps = texteEnHtml_(remplir_(m.texte, { entreprise: reg.entreprise || '' })) +
    (lignes.length ? '<table style="width:100%;border-collapse:collapse;margin-top:12px">' + lignes.join('') + '</table>' : '<p>Aucun chantier en cours.</p>');
  const to = destinataires_(m);
  let sujet = remplir_(m.objet, { entreprise: reg.entreprise || '' });
  if (reg.modeTest === 'oui') sujet = '[TEST] ' + sujet;
  const qui = repartir_(m, to);
  let resultat = qui.mail ? 'envoyé' : 'notification seule';
  try {
    if (qui.mail) MailApp.sendEmail(avecReponse_({ to: qui.mail, subject: sujet, htmlBody: gabaritHtml_(corps, CONFIG.APP_URL + '/?depuis=mail#/planning', 'Voir le planning'), name: NOM_APPLI }));
    if (qui.push) pushPourAdresses_(qui.push, sujet, dossiers.length + ' chantier(s) en cours' + (m.push === 'seule' ? ' : le point est dans l\'appli.' : ' : le point est dans votre boîte mail.'), CONFIG.APP_URL + '/?depuis=mail#/planning');
  } catch (er) { resultat = 'erreur : ' + er; }
  insert_('Journal', { date: horodatage_(new Date()), relance: 'avancement', dossierId: '', destinataires: to, resultat: resultat });
  marquerRelance_('avancement', today);
}

/* ==================================================================
 * 8 sexies. SMS (facultatif, compte Brevo)
 * ================================================================== */

/** 06 12 34 56 78 → 33612345678 */
function numeroInternational_(tel) {
  let n = String(tel || '').replace(/[^\d+]/g, '');
  if (n.indexOf('+') === 0) n = n.slice(1);
  else if (n.indexOf('00') === 0) n = n.slice(2);
  else if (n.indexOf('0') === 0) n = '33' + n.slice(1);
  return n.length >= 10 ? n : '';
}

function envoyerSms_(tel, texte) {
  const reg = lireReglages_();
  const num = numeroInternational_(tel);
  if (!num) return 'numéro invalide';
  if (!reg.smsCle) return 'clé SMS manquante';
  const corps = JSON.stringify({
    sender: String(reg.smsExpediteur || 'ElecHabitat').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'ElecHabitat',
    recipient: num, content: String(texte).slice(0, 300), type: 'transactional'
  });
  const opts = { method: 'post', contentType: 'application/json', headers: { 'api-key': reg.smsCle, accept: 'application/json' }, payload: corps, muteHttpExceptions: true };
  let res = UrlFetchApp.fetch('https://api.brevo.com/v3/transactionalSMS/send', opts);
  if (res.getResponseCode() === 404) res = UrlFetchApp.fetch('https://api.brevo.com/v3/transactionalSMS/sms', opts);
  const code = res.getResponseCode();
  return code >= 200 && code < 300 ? 'ok' : 'erreur ' + code + ' ' + res.getContentText().slice(0, 120);
}

/** SMS aux personnes (adresses du mail) qui ont un téléphone et l'option SMS cochée */
function smsPourAdresses_(toCsv, sujet, lien) {
  const reg = lireReglages_();
  if (reg.smsActif !== 'oui' || !reg.smsCle || reg.modeTest === 'oui') return '';
  const users = all_('Utilisateurs');
  let n = 0, err = 0;
  String(toCsv || '').split(',').forEach(function (adr) {
    const u = users.filter(function (x) { return x.email === adr.trim().toLowerCase() && x.sms === 'oui' && x.telephone; })[0];
    if (!u) return;
    const r = envoyerSms_(u.telephone, (reg.entreprise || NOM_APPLI) + ' : ' + sujet + (lien ? ' ' + lien : ''));
    if (r === 'ok') n++; else err++;
  });
  return n || err ? ' · SMS : ' + n + ' envoyé(s)' + (err ? ', ' + err + ' en erreur' : '') : '';
}

function smsTest_(d, user) {
  const tel = d.telephone || (utilisateur_(user.email) || {}).telephone;
  if (!tel) throw erreur_('Indiquez un numéro de téléphone.');
  const r = envoyerSms_(tel, (lireReglages_().entreprise || NOM_APPLI) + ' : SMS d\'essai depuis l\'appli.');
  if (r !== 'ok') throw erreur_('Le SMS n\'est pas parti : ' + r);
  return r;
}

/* ==================================================================
 * 8 septies. AGENDA : CHANGEMENTS FAITS DANS GOOGLE AGENDA, RECHERCHE
 * ================================================================== */

/** Créneau d'un rendez-vous selon ses heures (matin, après-midi ou journée) */
function creneauEvenement_(ev) {
  if (ev.isAllDayEvent()) return 'journee';
  const reg = lireReglages_();
  const mn = function (k) { const p = String(reg[k] || REGLAGES_DEFAUT[k]).split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
  const deb = ev.getStartTime(), fin = ev.getEndTime();
  const md = deb.getHours() * 60 + deb.getMinutes(), mf = fin.getHours() * 60 + fin.getMinutes();
  const midi = (mn('matinFin') + mn('apremDebut')) / 2;
  if (mf <= midi) return 'matin';
  if (md >= midi) return 'apres_midi';
  return 'journee';
}

/**
 * Remonte dans l'appli les interventions déplacées, raccourcies ou supprimées directement dans l'agenda.
 * Les jours restants sont regroupés en périodes de jours qui se suivent. Renvoie le nombre de chantiers changés.
 */
function synchroAgenda_() {
  const limite = jour_(ajouterJours_(new Date(), -14));
  const cal = agenda_();
  const parDossier = {};
  all_('Interventions').forEach(function (it) {
    if (it.demo === 'oui' || !it.eventId) return;
    const fin = it.dateFin || it.date;
    if (fin < limite) return;
    (parDossier[it.dossierId] = parDossier[it.dossierId] || []).push(it);
  });
  let n = 0;
  Object.keys(parDossier).forEach(function (dossierId) {
    const dos = trouver_('Dossiers', 'id', dossierId);
    if (!dos) return;
    const changements = [];
    parDossier[dossierId].forEach(function (it) {
      const ids = String(it.eventId).split(',').filter(Boolean);
      const prevus = joursPeriode_(it);
      const reels = [];
      let change = false;
      ids.forEach(function (id, i) {
        let ev = null;
        try { ev = cal.getEventById(id); } catch (e) { ev = null; }
        const prevu = prevus[i];
        if (!ev) { change = true; if (prevu) changements.push(formatFr_(prevu.date) + ' supprimé de l\'agenda'); return; }
        const j = { date: jour_(ev.getStartTime()), creneau: creneauEvenement_(ev), id: id };
        if (!prevu || prevu.date !== j.date || prevu.creneau !== j.creneau) {
          change = true;
          changements.push((prevu ? formatFr_(prevu.date) + ' (' + LIB_CRENEAU[prevu.creneau] + ')' : 'Un jour') + ' → ' + formatFr_(j.date) + ' (' + LIB_CRENEAU[j.creneau] + ')');
        }
        reels.push(j);
      });
      if (!change) return;
      // Regroupe les jours qui se suivent en périodes
      reels.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.creneau === 'apres_midi' ? 1 : -1); });
      const groupes = [];
      reels.forEach(function (j) {
        const g = groupes[groupes.length - 1];
        if (g && ecartJours_(g[g.length - 1].date, j.date) === 1) g.push(j); else groupes.push([j]);
      });
      if (!groupes.length) { delete_('Interventions', 'id', it.id); return; }
      groupes.forEach(function (g, k) {
        const ligne = {
          date: g[0].date, creneau: g[0].creneau, dateFin: g[g.length - 1].date,
          creneauFin: g[g.length - 1].creneau, eventId: g.map(function (x) { return x.id; }).join(',')
        };
        if (k === 0) update_('Interventions', 'id', it.id, ligne);
        else {
          ligne.id = nouvelId_('I'); ligne.dossierId = dossierId; ligne.travaux = it.travaux; ligne.techniciens = it.techniciens || ''; ligne.demo = 'non'; ligne.creeLe = horodatage_(new Date());
          insert_('Interventions', ligne);
        }
      });
    });
    if (!changements.length) return;
    n++;
    const its = interventionsDe_(dossierId);
    const debuts = its.map(function (x) { return x.date; }).sort();
    const fins = its.map(function (x) { return x.dateFin || x.date; }).sort();
    majDossier_(dossierId, { dateDebut: debuts[0] || '', dateFin: fins[fins.length - 1] || '' });
    log_(dossierId, { nom: 'Agenda Google' }, 'Planning modifié dans l\'agenda', changements.join(' ; '));
    const vars = varsDossier_(trouver_('Dossiers', 'id', dossierId));
    vars.changement = changements.join('\n');
    envoyerMaintenant_('agenda_modifie', vars, dossierId);
  });
  return n;
}

/** Recherche dans l'agenda avec plusieurs mots (tous doivent être présents, dans n'importe quel ordre) */
function chercherAgenda_(d) {
  const mots = normaliser_(d.mots || '').split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!mots.length) throw erreur_('Tapez au moins un mot.');
  const du = d.du ? ajouterJours_(d.du, 0) : ajouterJours_(new Date(), -180);
  const au = d.au ? ajouterJours_(d.au, 1) : ajouterJours_(new Date(), 180);
  if (ecartJours_(du, au) > 800) throw erreur_('Période trop longue (2 ans au maximum).');
  const connus = {};
  all_('Dossiers').forEach(function (x) { if (x.eventKey) connus[x.eventKey] = x.id; });
  const out = [];
  agenda_().getEvents(du, au).forEach(function (ev) {
    if (out.length >= 150) return;
    const titre = ev.getTitle() || '';
    const texte = normaliser_(titre + ' ' + (ev.getDescription() || '') + ' ' + (ev.getLocation() || ''));
    if (!mots.every(function (m) { return texte.indexOf(m) >= 0; })) return;
    const key = ev.getId() + '|' + ev.getStartTime().toISOString();
    out.push({
      key: key, titre: titre, date: jour_(ev.getStartTime()),
      heure: ev.isAllDayEvent() ? '' : Utilities.formatDate(ev.getStartTime(), tz_(), 'HH:mm'),
      lieu: ev.getLocation() || '', description: String(ev.getDescription() || '').slice(0, 300),
      dossierId: connus[key] || ''
    });
  });
  return out;
}

/** Crée un dossier à partir d'un rendez-vous trouvé par la recherche */
function dossierDepuisAgenda_(d, user) {
  const parts = String(d.key || '').split('|');
  const start = new Date(parts[1]);
  if (!parts[0] || isNaN(start.getTime())) throw erreur_('Rendez-vous introuvable.');
  if (all_('Dossiers').some(function (x) { return x.eventKey === d.key; })) throw erreur_('Ce rendez-vous a déjà un dossier.');
  const ev = agenda_().getEvents(new Date(start.getTime() - 60000), new Date(start.getTime() + 24 * 3600000))
    .filter(function (e) { return e.getId() === parts[0]; })[0];
  if (!ev) throw erreur_('Rendez-vous introuvable dans l\'agenda.');
  const mots = String(lireReglages_().motsCles || 'devis').split(',').map(normaliser_).map(function (s) { return s.trim(); }).filter(Boolean);
  return creerDossierEvenement_(ev, d.key, mots, user);
}


/* ==================================================================
 * 8 octies. TEMPS DU CHANTIER : PRÉVU, PLANIFIÉ, PASSÉ
 * Le temps réel est lu dans l'agenda (rendez-vous 🔨 du chantier) et ne compte
 * que les heures de travail : créneaux matin et après-midi des réglages,
 * hors week-ends, jours fériés et jours non travaillés.
 * ================================================================== */

function minutes_(hhmm) {
  const p = String(hhmm || '').split(':').map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

/** Créneaux de travail d'une journée, en minutes depuis minuit */
function creneauxTravail_() {
  const reg = lireReglages_();
  const v = function (k) { return minutes_(reg[k] || REGLAGES_DEFAUT[k]); };
  return [[v('matinDebut'), v('matinFin')], [v('apremDebut'), v('apremFin')]];
}

/** Durée d'une journée de travail, en heures (8 h avec les horaires par défaut) */
function heuresJournee_() {
  return creneauxTravail_().reduce(function (t, c) { return t + Math.max(0, c[1] - c[0]); }, 0) / 60;
}

/** Heures d'un lieu dans une journée : journée, matin, après-midi, ou nombre saisi */
function heuresLieu_(temps, heures) {
  const c = creneauxTravail_();
  if (temps === 'heures') return Math.round(Number(String(heures || '').replace(',', '.')) * 100) / 100 || 0;
  if (temps === 'matin') return (c[0][1] - c[0][0]) / 60;
  if (temps === 'apres_midi') return (c[1][1] - c[1][0]) / 60;
  return heuresJournee_();
}

/**
 * Heures déclarées par les techniciens sur un chantier (« Ma journée »).
 * Pour les anciennes déclarations sans temps, la journée est partagée entre les lieux.
 */
function tempsDeclares_(dossierId) {
  const parTech = {};
  let total = 0;
  all_('Pointages').forEach(function (p) {
    if (p.statut !== 'present') return;
    let ls = [];
    try { ls = JSON.parse(p.lieux || '[]'); } catch (e) { ls = []; }
    ls.forEach(function (l) {
      if (l.dossierId !== dossierId) return;
      const h = Number(l.heures) > 0 ? Number(l.heures) : heuresJournee_() / Math.max(1, ls.length);
      const t = parTech[p.email] = parTech[p.email] || { email: p.email, heures: 0, jours: 0, dernier: '' };
      t.heures += h; t.jours++; if (p.date > t.dernier) t.dernier = p.date;
      total += h;
    });
  });
  const liste = Object.keys(parTech).map(function (k) { const t = parTech[k]; t.heures = Math.round(t.heures * 100) / 100; return t; })
    .sort(function (a, b) { return b.heures - a.heures; });
  return { total: Math.round(total * 100) / 100, liste: liste };
}

/** Temps prévu saisi (valeur + unité) → heures */
function tempsPrevuDe_(valeur, unite) {
  const v = Number(String(valeur || '').replace(',', '.'));
  if (!valeur || !(v > 0)) return { tempsValeur: '', tempsUnite: '', tempsPrevu: '' };
  const u = ['jour', 'demi', 'heure'].indexOf(unite) >= 0 ? unite : 'jour';
  const h = u === 'heure' ? v : u === 'demi' ? v * heuresJournee_() / 2 : v * heuresJournee_();
  return { tempsValeur: String(v), tempsUnite: u, tempsPrevu: String(Math.round(h * 100) / 100) };
}

/** « 20 h (2,5 j) » */
function libelleTemps_(h) {
  const j = Math.round(h / heuresJournee_() * 10) / 10;
  return String(Math.round(h * 10) / 10).replace('.', ',') + ' h (' + String(j).replace('.', ',') + ' j)';
}

/** Jours fériés en France pour une année : { 'AAAA-MM-JJ': true } */
function joursFeries_(annee) {
  // Dimanche de Pâques (algorithme de Meeus)
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(annee, mois - 1, jour, 12);
  const decale = function (n) { const x = new Date(paques.getTime()); x.setDate(x.getDate() + n); return jour_(x); };
  const out = {};
  ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].forEach(function (md) { out[annee + '-' + md] = true; });
  out[decale(1)] = true;   // lundi de Pâques
  out[decale(39)] = true;  // Ascension
  out[decale(50)] = true;  // lundi de Pentecôte
  return out;
}

/** Ce jour (AAAA-MM-JJ) est-il travaillé ? */
function jourTravaille_(iso, cache) {
  const dt = ajouterJours_(iso, 0);
  const js = dt.getDay();
  if (js === 0 || js === 6) return false;
  const an = Number(iso.slice(0, 4));
  if (!cache.feries[an]) cache.feries[an] = joursFeries_(an);
  if (cache.feries[an][iso]) return false;
  return !cache.fermetures.some(function (p) { return iso >= p[0] && iso <= p[1]; });
}

function cacheJours_() {
  const fermetures = String(lireReglages_().joursNonTravailles || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean)
    .map(function (x) { const p = x.split('/'); return [p[0].trim(), (p[1] || p[0]).trim()]; });
  return { feries: {}, fermetures: fermetures };
}

/** Heures de travail effectives entre deux instants */
function heuresEffectives_(debut, fin, cache) {
  if (!(fin > debut)) return 0;
  const creneaux = creneauxTravail_();
  let total = 0;
  for (let j = jour_(debut), n = 0; j <= jour_(fin) && n < 400; j = jour_(ajouterJours_(j, 1)), n++) {
    if (!jourTravaille_(j, cache)) continue;
    const p = j.split('-').map(Number);
    creneaux.forEach(function (c) {
      const cd = new Date(p[0], p[1] - 1, p[2], 0, c[0]), cf = new Date(p[0], p[1] - 1, p[2], 0, c[1]);
      const d = Math.max(cd.getTime(), debut.getTime()), f = Math.min(cf.getTime(), fin.getTime());
      if (f > d) total += (f - d) / 3600000;
    });
  }
  return total;
}

/**
 * Plages de travail du chantier : lues dans l'agenda quand les rendez-vous existent
 * (ils ont pu être déplacés ou allongés à la main), sinon d'après les interventions de l'appli.
 */
function plagesChantier_(dossierId) {
  const reg = lireReglages_();
  const heure = function (iso, hhmm) { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 0, minutes_(hhmm)); };
  const plages = [];
  let cal = null;
  interventionsDe_(dossierId).forEach(function (it) {
    const ids = String(it.eventId || '').split(',').filter(Boolean);
    let lus = 0;
    if (ids.length && it.demo !== 'oui') {
      if (!cal) cal = agenda_();
      ids.forEach(function (id) {
        let ev = null;
        try { ev = cal.getEventById(id); } catch (e) { ev = null; }
        if (!ev) return;
        lus++;
        plages.push([ev.getStartTime(), ev.getEndTime()]);
      });
    }
    if (lus) return;
    joursPeriode_(it).forEach(function (j) {
      const deb = j.creneau === 'apres_midi' ? reg.apremDebut || REGLAGES_DEFAUT.apremDebut : reg.matinDebut || REGLAGES_DEFAUT.matinDebut;
      const fin = j.creneau === 'matin' ? reg.matinFin || REGLAGES_DEFAUT.matinFin : reg.apremFin || REGLAGES_DEFAUT.apremFin;
      plages.push([heure(j.date, deb), heure(j.date, fin)]);
    });
  });
  return plages;
}

/** Calcule et enregistre le temps planifié et le temps passé (à cette heure) d'un chantier */
function majTemps_(dossierId) {
  const maintenant = new Date();
  const cache = cacheJours_();
  let planifie = 0, passe = 0;
  plagesChantier_(dossierId).forEach(function (p) {
    planifie += heuresEffectives_(p[0], p[1], cache);
    if (p[0] < maintenant) passe += heuresEffectives_(p[0], new Date(Math.min(p[1].getTime(), maintenant.getTime())), cache);
  });
  const r = function (x) { return String(Math.round(x * 100) / 100); };
  const decl = tempsDeclares_(dossierId);
  const patch = {
    tempsPlanifie: planifie ? r(planifie) : '', tempsPasse: passe ? r(passe) : '',
    tempsDeclare: decl.total ? r(decl.total) : '', techsDeclares: decl.liste.length ? JSON.stringify(decl.liste) : ''
  };
  const dos = trouver_('Dossiers', 'id', dossierId);
  if (dos && (dos.tempsPlanifie !== patch.tempsPlanifie || dos.tempsPasse !== patch.tempsPasse ||
    dos.tempsDeclare !== patch.tempsDeclare || dos.techsDeclares !== patch.techsDeclares)) {
    patch.tempsMaj = horodatage_(maintenant);
    update_('Dossiers', 'id', dossierId, patch);
  }
  return patch;
}

/** Toutes les heures : chantiers planifiés, en cours ou terminés depuis moins d'un mois */
function majTempsChantiers_() {
  const limite = jour_(ajouterJours_(new Date(), -31));
  all_('Dossiers').forEach(function (d) {
    if (['planifie', 'en_cours', 'termine', 'materiel', 'commande'].indexOf(d.etape) < 0 || !d.dateDebut) return;
    if (d.etape === 'termine' && (d.dateFinChantier || d.dateFin || '') < limite) return;
    majTemps_(d.id);
  });
}


/* ==================================================================
 * 8 nonies. MESSAGES NON LUS ET AVERTISSEMENT DE L'ÉQUIPE
 * ================================================================== */

/**
 * Note que cette personne a lu la discussion du chantier.
 * Renvoie la date de la lecture précédente (pour montrer les nouveaux messages).
 */
function marquerLu_(email, dossierId) {
  const l = all_('Lectures').filter(function (x) { return x.email === email && x.dossierId === dossierId; })[0];
  const maintenant = horodatageSec_(new Date());
  if (!l) {
    insert_('Lectures', { email: email, dossierId: dossierId, vuLe: maintenant });
    // Première ouverture : les messages des 7 derniers jours comptent comme nouveaux (comme la pastille)
    return horodatageSec_(ajouterJours_(new Date(), -7));
  }
  // On n'écrit que s'il y a eu un message depuis la dernière lecture (la discussion se relit toutes les 30 s)
  const recent = all_('Commentaires').some(function (c) { return c.dossierId === dossierId && c.date > l.vuLe; });
  if (recent) {
    const sh = sheet_('Lectures');
    const vals = sh.getDataRange().getDisplayValues();
    for (let r = 1; r < vals.length; r++) {
      if (vals[r][0] === email && vals[r][1] === dossierId) { sh.getRange(r + 1, 3).setValue(maintenant); break; }
    }
    CACHE_ = {};
  }
  return l.vuLe;
}

/** Nombre de messages non lus par chantier (messages des autres, depuis la dernière lecture ; 7 jours au plus si jamais ouvert) */
function nonLus_(user, ids) {
  const vus = {};
  all_('Lectures').forEach(function (l) { if (l.email === user.email) vus[l.dossierId] = l.vuLe; });
  const limite = horodatageSec_(ajouterJours_(new Date(), -7));
  const out = {};
  all_('Commentaires').forEach(function (c) {
    // Seuls les messages d'exemple créés par la démo sont écartés (pas ceux écrits pendant les essais)
    if (!ids[c.dossierId] || c.auteurEmail === user.email || String(c.id).indexOf('DEMO') === 0) return;
    if (c.date > (vus[c.dossierId] || limite)) out[c.dossierId] = (out[c.dossierId] || 0) + 1;
  });
  return out;
}

/** Dernier message non lu de chaque chantier (pour le tableau de bord) */
function derniersNonLus_(user, ids) {
  const vus = {};
  all_('Lectures').forEach(function (l) { if (l.email === user.email) vus[l.dossierId] = l.vuLe; });
  const limite = horodatageSec_(ajouterJours_(new Date(), -7));
  const out = {};
  all_('Commentaires').forEach(function (c) {
    // Seuls les messages d'exemple créés par la démo sont écartés (pas ceux écrits pendant les essais)
    if (!ids[c.dossierId] || c.auteurEmail === user.email || String(c.id).indexOf('DEMO') === 0) return;
    if (c.date <= (vus[c.dossierId] || limite)) return;
    if (!out[c.dossierId] || c.date >= out[c.dossierId].date) {
      out[c.dossierId] = { date: c.date, auteur: c.auteur, texte: String(c.texte || '').slice(0, 140), photo: c.photo ? 'oui' : '', fichier: c.nomFichier || '' };
    }
  });
  return out;
}

/**
 * Mail (et SMS si coché) à l'équipe du chantier quand un message est déposé :
 * administrateurs actifs, techniciens affectés et personnes ayant déjà écrit dans la discussion
 * (si « envoyer aussi aux techniciens » est coché), plus les adresses ajoutées dans le réglage.
 * L'auteur n'est pas prévenu. Pour ne pas inonder les boîtes, une personne reçoit au plus
 * un mail par chantier toutes les 15 minutes ; la pastille de l'appli montre le reste.
 */
function notifierMessage_(dos, user, message) {
  const m = configMail_('nouveau_message');
  if (!m || m.active !== 'oui') return;
  const liste = [];
  all_('Utilisateurs').forEach(function (u) { if (u.role === 'admin' && u.actif !== 'non') liste.push(u.email); });
  if (m.copieTechniciens === 'oui') {
    String(dos.techniciens || '').split(',').forEach(function (e) { liste.push(e); });
    all_('Commentaires').forEach(function (c) { if (c.dossierId === dos.id && c.auteurEmail) liste.push(c.auteurEmail); });
  }
  String(m.destinataires || '').split(',').forEach(function (e) { liste.push(e); });
  const actifs = {};
  all_('Utilisateurs').forEach(function (u) { actifs[u.email] = u.actif !== 'non'; });
  const cache = CacheService.getScriptCache();
  const vus = {};
  const to = liste.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(function (x) {
    if (!x || vus[x] || x === user.email || actifs[x] === false) return false;
    vus[x] = true;
    const cle = 'msg|' + dos.id + '|' + x;
    if (cache.get(cle)) return false;
    cache.put(cle, '1', 900);
    return true;
  });
  if (!to.length) return;
  const vars = varsDossier_(dos);
  vars.auteur = user.nom || user.email;
  vars.message = String(message || '').slice(0, 1500);
  const copie = JSON.parse(JSON.stringify(m));
  copie.destinataires = to.join(',');
  copie.copieTechniciens = 'non';
  envoyer_(copie, vars);
}


/* ==================================================================
 * 8 decies. NOTIFICATIONS SUR LES TÉLÉPHONES (Firebase Cloud Messaging)
 * Chaque mail envoyé par l'appli part aussi en notification sur les téléphones
 * (et ordinateurs) que le destinataire a activés. La clé du « compte de service »
 * Firebase est rangée dans les propriétés du programme, jamais dans le tableur.
 * ================================================================== */

/** Compte de service Firebase (JSON) ou null */
function compteFirebase_() {
  const brut = PropertiesService.getScriptProperties().getProperty('FCM_COMPTE');
  if (!brut) return null;
  try {
    const c = JSON.parse(brut);
    return c.client_email && c.private_key && c.project_id ? c : null;
  } catch (e) { return null; }
}

/** Réglages : coller le contenu du fichier JSON du compte de service (vide = retirer) */
function enregistrerCleFirebase_(d) {
  const props = PropertiesService.getScriptProperties();
  const texte = String(d.json || '').trim();
  if (!texte) { props.deleteProperty('FCM_COMPTE'); return 'retiré'; }
  let c;
  try { c = JSON.parse(texte); } catch (e) { throw erreur_('Ce n\'est pas le contenu du fichier JSON (il doit commencer par { et finir par }).'); }
  if (!c.client_email || !c.private_key || !c.project_id || c.type !== 'service_account') {
    throw erreur_('Ce fichier n\'est pas une clé de compte de service Firebase (Paramètres du projet > Comptes de service > Générer une nouvelle clé privée).');
  }
  props.setProperty('FCM_COMPTE', JSON.stringify({ client_email: c.client_email, private_key: c.private_key, project_id: c.project_id }));
  CacheService.getScriptCache().remove('fcm_jeton');
  // Vérification immédiate : on demande un jeton d'accès à Google
  jetonFcm_();
  return c.project_id;
}

/** Jeton d'accès à Firebase Cloud Messaging (gardé 50 minutes) */
function jetonFcm_() {
  const cache = CacheService.getScriptCache();
  const deja = cache.get('fcm_jeton');
  if (deja) return deja;
  const c = compteFirebase_();
  if (!c) throw erreur_('Notifications non réglées : la clé Firebase manque.');
  const b64 = function (o) { return Utilities.base64EncodeWebSafe(typeof o === 'string' ? o : JSON.stringify(o)).replace(/=+$/, ''); };
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64({ alg: 'RS256', typ: 'JWT' });
  const corps = b64({
    iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600
  });
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(entete + '.' + corps, c.private_key)).replace(/=+$/, '');
  const rep = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: entete + '.' + corps + '.' + signature }
  });
  const r = JSON.parse(rep.getContentText() || '{}');
  if (!r.access_token) throw erreur_('Google refuse la clé Firebase : ' + (r.error_description || r.error || rep.getResponseCode()));
  cache.put('fcm_jeton', r.access_token, 3000);
  return r.access_token;
}

/** Un téléphone (ou ordinateur) active les notifications : on garde son jeton */
function enregistrerAppareil_(d, user) {
  const jeton = String(d.jeton || '').trim();
  if (jeton.length < 20) throw erreur_('Jeton de notification invalide.');
  const appareil = String(d.appareil || 'Appareil').slice(0, 60);
  const existant = all_('Appareils').filter(function (a) { return a.jeton === jeton; })[0];
  if (existant) {
    update_('Appareils', 'id', existant.id, { email: user.email, appareil: appareil, vuLe: horodatage_(new Date()) });
    return existant.id;
  }
  const id = nouvelId_('N');
  insert_('Appareils', { id: id, email: user.email, jeton: jeton, appareil: appareil, creeLe: horodatage_(new Date()), vuLe: horodatage_(new Date()) });
  return id;
}

/** Arrêter les notifications sur un appareil (le sien ; l'administrateur peut retirer n'importe lequel) */
function supprimerAppareil_(d, user) {
  all_('Appareils').filter(function (a) {
    return (a.jeton === d.jeton || a.id === d.id) && (a.email === user.email || estAdmin_(user));
  }).forEach(function (a) { delete_('Appareils', 'id', a.id); });
}

/** Texte court de la notification : le mail sans la formule de politesse, sur une ou deux lignes */
function texteNotification_(corps) {
  return String(corps || '').split('\n').map(function (l) { return l.trim(); })
    .filter(function (l) { return l && !/^bonjour\b/i.test(l); }).join(' ').replace(/\s+/g, ' ').slice(0, 180);
}

/**
 * Envoie une notification à tous les appareils de ces adresses.
 * Renvoie un petit compte rendu pour le journal (« · notif : 2 »).
 */
function pushPourAdresses_(toCsv, titre, corps, lien) {
  if (!compteFirebase_()) return '';
  const emails = String(toCsv || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
  const appareils = all_('Appareils').filter(function (a) { return emails.indexOf(a.email) >= 0; });
  if (!appareils.length) return '';
  let jeton;
  try { jeton = jetonFcm_(); } catch (e) { Logger.log('Notifications : ' + e); return ' · notif : erreur de clé'; }
  const projet = compteFirebase_().project_id;
  const url = lien || CONFIG.APP_URL;
  let ok = 0, ko = 0;
  appareils.forEach(function (a) {
    const message = {
      message: {
        token: a.jeton,
        notification: { title: String(titre || NOM_APPLI).slice(0, 120), body: texteNotification_(corps) },
        data: { url: url },
        webpush: {
          headers: { Urgency: 'high', TTL: '86400' },
          notification: { icon: CONFIG.APP_URL + '/icon-192.png', badge: CONFIG.APP_URL + '/icon-192.png', tag: url, renotify: true },
          fcm_options: { link: url }
        }
      }
    };
    try {
      const rep = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + projet + '/messages:send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + jeton }, payload: JSON.stringify(message)
      });
      const code = rep.getResponseCode();
      if (code >= 200 && code < 300) { ok++; return; }
      ko++;
      // Appareil qui n'existe plus (appli désinstallée, notifications coupées) : on l'oublie
      if (code === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(rep.getContentText())) {
        delete_('Appareils', 'id', a.id);
      } else {
        Logger.log('Notification ' + code + ' : ' + rep.getContentText().slice(0, 200));
      }
    } catch (e) { ko++; Logger.log('Notification : ' + e); }
  });
  return ' · notif : ' + ok + (ko ? ' (' + ko + ' en échec)' : '');
}

/** Bouton « M'envoyer une notification d'essai » */
function pushTest_(user) {
  if (!compteFirebase_()) throw erreur_('Les notifications ne sont pas encore réglées par l\'administrateur (clé Firebase).');
  if (!all_('Appareils').some(function (a) { return a.email === user.email; })) throw erreur_('Activez d\'abord les notifications sur cet appareil.');
  const r = pushPourAdresses_(user.email, NOM_APPLI + ' : essai', 'Bonjour,\nLes notifications fonctionnent sur cet appareil. 👍', CONFIG.APP_URL);
  if (!/notif : [1-9]/.test(r)) throw erreur_('La notification n\'est pas partie' + r.replace(' · notif :', ' :') + '. Réactivez les notifications sur cet appareil.');
  return r;
}

/* ==================================================================
 * 9. DONNÉES DE DÉMONSTRATION
 * ================================================================== */

function chargerDemo_() {
  supprimerDemo_();
  const t = jour_(new Date());
  const j = function (n) { return jour_(ajouterJours_(t, n)); };
  const now = horodatage_(new Date());
  const techs = all_('Utilisateurs').filter(function (u) { return u.role === 'technicien' && u.actif !== 'non'; }).map(function (u) { return u.email; });
  const tech1 = techs[0] || '', tech2 = techs[1] || techs[0] || '';
  const base = function (o) {
    const d = { avancement: '0', demo: 'oui', creeLe: now, majLe: now, eventKey: '' };
    Object.keys(o).forEach(function (k) { d[k] = o[k]; });
    if (d.lat && d.lng) {
      const km = distanceDepart_(Number(d.lat), Number(d.lng));
      if (km !== null) { d.distanceKm = String(km); d.zone = zonePour_(km); }
    }
    return d;
  };
  const dossiers = [
    base({ id: 'DEMO1', dateRdv: j(-5), heureRdv: '10:00', titreRdv: 'Devis Martin – rénovation tableau', lieu: '12 rue des Écoles, Pouillon', lat: '43.6047', lng: '-1.0058', client: 'M. et Mme Martin', etape: 'devis_a_faire' }),
    base({ id: 'DEMO2', dateRdv: j(-1), heureRdv: '14:30', titreRdv: 'Devis Durand – climatisation', lieu: 'Narrosse', lat: '43.7033', lng: '-1.0011', client: 'Durand', etape: 'devis_a_faire' }),
    base({ id: 'DEMO3', dateRdv: j(-25), titreRdv: 'Devis Lefebvre – maison neuve', lieu: 'Saint-Paul-lès-Dax', lat: '43.7254', lng: '-1.0517', client: 'Lefebvre', etape: 'devis_envoye', numDevis: 'D-2026-101', dateDevis: j(-17), prochaineRelance: j(-2) }),
    base({ id: 'DEMO4', dateRdv: j(-12), titreRdv: 'Devis Garcia – bornes de recharge', lieu: 'Orist', lat: '43.6339', lng: '-1.1689', client: 'Garcia', etape: 'devis_envoye', numDevis: 'D-2026-108', dateDevis: j(-6), prochaineRelance: j(9) }),
    base({ id: 'DEMO5', dateRdv: j(-30), titreRdv: 'Devis Bernard – mise aux normes', lieu: 'Cagnotte', lat: '43.6081', lng: '-1.0731', client: 'Bernard', etape: 'commande', numDevis: 'D-2026-095', dateDevis: j(-24), numCommande: 'CMD-5521', dateValidation: j(-4) }),
    base({ id: 'DEMO6', tempsValeur: '3', tempsUnite: 'demi', tempsPrevu: '12', dateRdv: j(-40), titreRdv: 'Devis Petit – pompe à chaleur', lieu: 'Peyrehorade', lat: '43.5462', lng: '-1.1050', client: 'Petit', etape: 'planifie', numDevis: 'D-2026-088', dateDevis: j(-35), numCommande: 'CMD-5498', dateValidation: j(-15), chantier: 'PAC Petit', dateDebut: j(2), dateFin: j(3), techniciens: tech1 }),
    base({ id: 'DEMO7', tempsValeur: '5', tempsUnite: 'jour', tempsPrevu: '40', dateRdv: j(-50), titreRdv: 'Devis Roux – rénovation complète', lieu: '8 avenue Saint-Vincent-de-Paul, Dax', lat: '43.7102', lng: '-1.0536', client: 'Roux', etape: 'en_cours', numDevis: 'D-2026-070', dateDevis: j(-45), numCommande: 'CMD-5460', dateValidation: j(-30), chantier: 'Rénovation Roux', dateDebut: j(-2), dateFin: j(3), avancement: '40', techniciens: [tech1, tech2].filter(Boolean).join(',') }),
    base({ id: 'DEMO8', tempsValeur: '30', tempsUnite: 'heure', tempsPrevu: '30', dateRdv: j(-60), titreRdv: 'Devis Moreau – éclairage extérieur', lieu: 'Habas', lat: '43.5717', lng: '-0.9283', client: 'Moreau', etape: 'termine', numDevis: 'D-2026-061', dateDevis: j(-55), numCommande: 'CMD-5432', dateValidation: j(-40), chantier: 'Éclairage Moreau', dateDebut: j(-8), dateFin: j(-3), avancement: '100', dateFinChantier: j(-3), pvStatut: 'sans_reserves', pvDate: j(-3), techniciens: tech2 }),
    base({ id: 'DEMO9', dateRdv: j(-45), titreRdv: 'Devis Fournier – domotique', lieu: 'Saint-Geours-de-Maremne', lat: '43.6889', lng: '-1.2275', client: 'Fournier', etape: 'refuse', numDevis: 'D-2026-077', dateDevis: j(-40), motifRefus: 'Prix', dateCloture: j(-10) })
  ];
  dossiers.forEach(function (d) { insert_('Dossiers', d); });
  [
    { id: 'DEMOC1', dossierId: 'DEMO6', statut: 'commandee', fournisseur: 'Rexel Dax', dateCommande: j(-10), dateLivraison: j(1) },
    { id: 'DEMOC2', dossierId: 'DEMO7', statut: 'commandee', fournisseur: 'Sonepar', dateCommande: j(-25), dateLivraison: j(-5),
      receptionStatut: 'conforme', dateReception: j(-5), receptionPar: 'Technicien', numBL: 'BL-8812' },
    { id: 'DEMOC3', dossierId: 'DEMO7', statut: 'demandee', demande: '2 disjoncteurs 16 A\n1 interrupteur différentiel 40 A 30 mA\n25 m de câble R2V 3G2,5',
      demandePar: 'Technicien', dateDemande: j(-1) }
  ].forEach(function (c) {
    c.commentaire = ''; c.demo = 'oui'; c.creeLe = now;
    insert_('Commandes', c);
  });
  insert_('Factures', { id: 'DEMOF1', dossierId: 'DEMO8', type: 'finale', pourcentage: '100', commentaire: '', dateDemande: j(-3), demandePar: 'Technicien', faite: 'non', dateFaite: '', demo: 'oui' });
  insert_('Factures', { id: 'DEMOF2', dossierId: 'DEMO7', type: 'intermediaire', pourcentage: '30', commentaire: 'Saignées et passage des gaines terminés', dateDemande: j(-1), demandePar: 'Technicien', faite: 'non', dateFaite: '', demo: 'oui' });
  insert_('Commentaires', { id: 'DEMOM1', dossierId: 'DEMO7', date: j(-1) + ' 17:40', auteur: 'Technicien', auteurEmail: tech1, texte: 'Gaines passées au rez-de-chaussée. Demain : étage et tableau.', photo: '', demo: 'oui' });
  insert_('Commentaires', { id: 'DEMOM2', dossierId: 'DEMO7', date: j(-1) + ' 18:05', auteur: 'Administration', auteurEmail: '', texte: 'Merci. Le client passe demain vers 10 h pour valider l\'emplacement des prises de la cuisine.', photo: '', demo: 'oui' });
  // Présences et congés d'exemple pour le premier technicien
  if (tech1) {
    [-3, -2, -1].forEach(function (n) {
      const dos = n === -3 ? dossiers[7] : dossiers[6];
      insert_('Pointages', {
        id: 'DEMOP' + (-n), date: j(n), email: tech1, statut: 'present', motif: '',
        lieux: JSON.stringify([{ dossierId: dos.id, libelle: dos.chantier, lat: dos.lat, lng: dos.lng, km: dos.distanceKm, temps: 'journee', heures: '8' }]),
        distanceKm: dos.distanceKm, zone: dos.zone, commentaire: '', saisiPar: 'Démo', majLe: now, demo: 'oui'
      });
    });
    insert_('Conges', { id: 'DEMOCG1', email: tech1, motif: 'Congés payés', dateDebut: j(20), creneauDebut: 'journee', dateFin: j(24), creneauFin: 'journee',
      commentaire: 'Vacances de Noël', statut: 'demande', dateDemande: j(-1), demo: 'oui' });
  }
  if (tech2 && tech2 !== tech1) {
    const d7 = dossiers[6];
    insert_('Pointages', {
      id: 'DEMOP9', date: j(-1), email: tech2, statut: 'present', motif: '',
      lieux: JSON.stringify([{ dossierId: d7.id, libelle: d7.chantier, lat: d7.lat, lng: d7.lng, km: d7.distanceKm, temps: 'matin', heures: '4' }]),
      distanceKm: d7.distanceKm, zone: d7.zone, commentaire: '', saisiPar: 'Démo', majLe: now, demo: 'oui'
    });
  }
  if (tech2) {
    insert_('Conges', { id: 'DEMOCG2', email: tech2, motif: 'Absence école', dateDebut: j(7), creneauDebut: 'journee', dateFin: j(8), creneauFin: 'journee',
      commentaire: 'Semaine CFA', statut: 'accepte', dateDemande: j(-6), decidePar: 'Démo', dateDecision: j(-5), demo: 'oui' });
  }
  // Interventions d'exemple, pour voir le temps planifié et passé
  [['DEMO7', j(-2), j(0), tech1, 'Saignées et passage des gaines'], ['DEMO7', j(1), j(3), [tech1, tech2].filter(Boolean).join(','), 'Tableau et appareillage'],
    ['DEMO6', j(2), j(3), tech1, ''], ['DEMO8', j(-8), j(-3), tech2, '']].forEach(function (x, i) {
    insert_('Interventions', { id: 'DEMOI' + i, dossierId: x[0], date: x[1], creneau: 'journee', dateFin: x[2], creneauFin: 'journee',
      travaux: x[4], techniciens: x[3], eventId: '', demo: 'oui', creeLe: now });
  });
  dossiers.forEach(function (d) { try { majTemps_(d.id); } catch (e) { Logger.log(e); } });
  dossiers.forEach(function (d) { log_(d.id, { nom: 'Démo' }, 'Dossier de démonstration', ''); });
}

function supprimerDemo_() {
  ['Dossiers', 'Commandes', 'Factures', 'Commentaires', 'Documents', 'Interventions', 'Pointages', 'Conges'].forEach(function (name) {
    const sh = sheet_(name);
    const vals = sh.getDataRange().getDisplayValues();
    const col = SCHEMA[name].indexOf('demo');
    for (let r = vals.length - 1; r >= 1; r--) {
      if (vals[r][col] === 'oui') sh.deleteRow(r + 1);
    }
  });
  const sh = sheet_('Historique');
  const vals = sh.getDataRange().getDisplayValues();
  for (let r = vals.length - 1; r >= 1; r--) {
    if (String(vals[r][1]).indexOf('DEMO') === 0) sh.deleteRow(r + 1);
  }
  CACHE_ = {};
}

/* ==================================================================
 * 10. OUTILS : FEUILLES, DATES, IDENTIFIANTS
 * ================================================================== */

let CACHE_ = {};

function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw erreur_('Le programme n\'est pas installé : lancez la fonction « installer » dans l\'éditeur.');
  return SpreadsheetApp.openById(id).getSheetByName(name);
}

function lireTable_(name) {
  if (CACHE_[name]) return CACHE_[name];
  const sh = sheet_(name);
  const headers = SCHEMA[name];
  const last = sh.getLastRow();
  const rows = [];
  if (last > 1) {
    const vals = sh.getRange(2, 1, last - 1, headers.length).getDisplayValues();
    vals.forEach(function (v, i) {
      if (v.join('') === '') return;
      const o = { _row: i + 2 };
      headers.forEach(function (h, j) { o[h] = v[j]; });
      rows.push(o);
    });
  }
  CACHE_[name] = rows;
  return rows;
}

function all_(name) {
  return lireTable_(name).map(function (r) {
    const o = {};
    SCHEMA[name].forEach(function (h) { o[h] = r[h]; });
    return o;
  });
}

function trouver_(name, champ, valeur) {
  const r = lireTable_(name).filter(function (x) { return x[champ] === String(valeur); })[0];
  if (!r) return null;
  const o = {};
  SCHEMA[name].forEach(function (h) { o[h] = r[h]; });
  return o;
}

function insert_(name, obj) {
  const sh = sheet_(name);
  const row = SCHEMA[name].map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
  sh.appendRow(row);
  delete CACHE_[name];
}

function update_(name, champ, valeur, patch) {
  const r = lireTable_(name).filter(function (x) { return x[champ] === String(valeur); })[0];
  if (!r) throw erreur_('Ligne introuvable (' + name + ').');
  const headers = SCHEMA[name];
  const row = headers.map(function (h) { return patch[h] !== undefined ? String(patch[h]) : r[h]; });
  sheet_(name).getRange(r._row, 1, 1, headers.length).setValues([row]);
  delete CACHE_[name];
}

/** Supprime d'un coup toutes les lignes d'une feuille qui répondent au test (du bas vers le haut) */
function supprimerLignes_(name, test) {
  const lignes = lireTable_(name).filter(test).map(function (x) { return x._row; }).sort(function (a, b) { return b - a; });
  if (!lignes.length) return;
  const sh = sheet_(name);
  lignes.forEach(function (r) { sh.deleteRow(r); });
  delete CACHE_[name];
}

function delete_(name, champ, valeur) {
  const r = lireTable_(name).filter(function (x) { return x[champ] === String(valeur); })[0];
  if (!r) return;
  sheet_(name).deleteRow(r._row);
  delete CACHE_[name];
}

function log_(dossierId, user, action, note) {
  insert_('Historique', {
    date: horodatage_(new Date()), dossierId: dossierId, qui: (user && (user.nom || user.email)) || '',
    action: action, note: note || ''
  });
}

function tz_() {
  return Session.getScriptTimeZone() || 'Europe/Paris';
}

/** Date au format AAAA-MM-JJ */
function jour_(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

function horodatageSec_(d) {
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function horodatage_(d) {
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm');
}

/** Ajoute n jours à une date (objet Date ou texte AAAA-MM-JJ) ; renvoie un objet Date à midi */
function ajouterJours_(d, n) {
  const s = jour_(d);
  const p = s.split('-').map(Number);
  const out = new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
  out.setDate(out.getDate() + Number(n || 0));
  return out;
}

function ecartJours_(a, b) {
  return Math.round((ajouterJours_(b, 0).getTime() - ajouterJours_(a, 0).getTime()) / 86400000);
}

/** « aujourd'hui », « demain », « dans 3 jours » */
function quand_(today, date) {
  const n = ecartJours_(today, date);
  if (n <= 0) return 'aujourd\'hui';
  if (n === 1) return 'demain';
  return 'dans ' + n + ' jours';
}

function formatFr_(s) {
  if (!s) return '';
  const p = String(s).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s);
}

function nouvelId_(prefixe) {
  return prefixe + Utilities.formatDate(new Date(), tz_(), 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
}
