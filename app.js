/* Elec Habitat – Suivi des chantiers — écrans (issus de « Suivi affaires »)
 * Application sans outil de construction : du HTML, du CSS et ce fichier.
 * Toutes les données passent par le programme Google (voir config.js).
 */
(function () {
  'use strict';

  const CFG = window.SUIVI_CONFIG || {};
  const $ = (s, el) => (el || document).querySelector(s);
  const S = { token: null, data: null, dossier: null };

  /* ================================================================
   * OUTILS
   * ================================================================ */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => (S.data && S.data.aujourdhui) || isoLocal(new Date());
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    d.setDate(d.getDate() + Number(n || 0));
    return isoLocal(d);
  }
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((new Date(pb[0], pb[1] - 1, pb[2], 12) - new Date(pa[0], pa[1] - 1, pa[2], 12)) / 864e5);
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function fr(iso, avecJour) {
    if (!iso) return '';
    const s = String(iso);
    const p = s.slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0]) return esc(s);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    const base = p[2] + ' ' + MOIS[p[1] - 1] + (p[0] !== new Date().getFullYear() ? ' ' + p[0] : '');
    const heure = s.length > 10 ? ' à ' + s.slice(11, 16).replace(':', 'h') : '';
    return (avecJour ? JOURS[d.getDay()] + ' ' : '') + base + heure;
  }
  function relatif(iso) {
    if (!iso) return '';
    const n = daysBetween(today(), iso.slice(0, 10));
    if (n === 0) return "aujourd'hui";
    if (n === 1) return 'demain';
    if (n === -1) return 'hier';
    return n > 0 ? 'dans ' + n + ' jours' : 'il y a ' + (-n) + ' jours';
  }
  const ETAPES = () => (S.data && S.data.etapes) || {};
  const mailCfg = (cle) => (S.data.mails || []).find((m) => m.cle === cle) || {};
  const delai = (cle) => Number(mailCfg(cle).delaiJours || 0);
  const nomClient = (d) => d.client || d.titreRdv || 'Sans nom';
  const nomChantier = (d) => d.chantier || nomClient(d);
  const parId = (id) => S.data.dossiers.find((d) => d.id === id);
  const estAdmin = () => S.data && S.data.user.role === 'admin';
  const ouvert = (d) => d && ['facture', 'refuse', 'ignore'].indexOf(d.etape) < 0;
  const nomUser = (email) => {
    const u = (S.data.users || []).find((x) => x.email === email);
    return u ? (u.nom || u.email) : email;
  };
  const prenom = (email) => String(nomUser(email) || '').split(' ')[0];
  // À changer en même temps que VERSION_PROGRAMME dans Code.gs
  const VERSION_ECRANS = '2026-11-11 n°11';
  const moi = () => S.data.user.email;
  /** Commande réellement passée (pas une simple demande de matériel d'un technicien) */
  const passee = (c) => c.statut !== 'demandee';
  const demandeOuverte = (c) => c.statut === 'demandee' && ouvert(parId(c.dossierId));
  /** Recherche à plusieurs mots : tous les mots doivent être trouvés, dans n'importe quel ordre */
  const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const motsDe = (q) => sansAccent(q).split(/[\s,;]+/).filter(Boolean);
  const trouveTous = (texte, mots) => { const t = sansAccent(texte); return mots.every((m) => t.indexOf(m) >= 0); };
  const typesDocs = () => S.data.typesDocs || [];
  /** Dossiers de documents visibles par au moins un technicien (pour l'administrateur) ou par moi (technicien) */
  const typesTech = () => estAdmin()
    ? Array.from(new Set((S.data.users || []).filter((u) => u.role !== 'admin' && u.actif !== 'non').flatMap((u) => u.docsEffectifs || [])))
    : (S.data.mesDocs || []);
  const typesPermis = () => estAdmin() ? typesDocs() : typesDocs().filter((t) => typesTech().indexOf(t.cle) >= 0);
  /** Durée d'une journée de travail en heures, d'après les horaires des réglages */
  function heuresJour() {
    const r = S.data.reglages;
    const m = (x, def) => { const p = String(x || def).split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
    return ((m(r.matinFin, '12:00') - m(r.matinDebut, '08:00')) + (m(r.apremFin, '17:30') - m(r.apremDebut, '13:30'))) / 60 || 8;
  }
  const nb = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  /** « 20 h (2,5 j) » */
  const temps = (h) => (h === '' || h === undefined || h === null) ? '' : nb(Number(h)) + ' h (' + nb(Number(h) / heuresJour()) + ' j)';
  const LIB_UNITE = { jour: 'jour(s)', demi: 'demi-journée(s)', heure: 'heure(s)' };
  const champTemps = (valeur, unite) => '<div class="row2">' +
    champ('Temps prévu pour le chantier', input('tempsValeur', valeur || '', 'number', 'min="0" step="0.5" inputmode="decimal" placeholder="Ex. : 3"')) +
    champ('Unité', '<select name="tempsUnite">' + Object.keys(LIB_UNITE).map((u) => '<option value="' + u + '"' + ((unite || 'jour') === u ? ' selected' : '') + '>' + LIB_UNITE[u] + '</option>').join('') + '</select>') + '</div>';
  /** Bloc « Temps » de la fiche : prévu, planifié dans l'agenda, passé à ce jour */
  function blocTemps(d) {
    const prevu = Number(d.tempsPrevu) || 0, planifie = Number(d.tempsPlanifie) || 0, passe = Number(d.tempsPasse) || 0;
    const declare = Number(d.tempsDeclare) || 0;
    let techs = [];
    try { techs = JSON.parse(d.techsDeclares || '[]'); } catch (e) { techs = []; }
    if (!prevu && !planifie && !declare) return '';
    // Qui est sur le chantier aujourd'hui (d'après « Ma journée »)
    const ajd = (S.data.pointages || []).filter((p) => p.date === today() && p.statut === 'present' && lieuxDe(p).some((l) => l.dossierId === d.id));
    const base = Math.max(prevu, planifie, passe, declare) || 1;
    const barre = (v, couleur, lib) => '<div class="temps-ligne"><span>' + lib + '</span><div class="temps-barre"><span style="width:' + Math.min(100, v / base * 100) + '%;background:' + couleur + '"></span></div><strong>' + (v ? temps(v) : '—') + '</strong></div>';
    const reel = Math.max(passe, declare);
    const ecart = prevu && reel ? reel - prevu : null;
    const nbTech = (d.techniciens || '').split(',').filter(Boolean).length;
    return '<div class="temps">' +
      barre(prevu, '#9AA0C8', 'Prévu' + (d.tempsValeur ? ' <span class="muted small">(' + nb(Number(d.tempsValeur)) + ' ' + LIB_UNITE[d.tempsUnite || 'jour'] + ')</span>' : '')) +
      barre(planifie, 'var(--navy)', 'Planifié') +
      barre(passe, 'var(--orange)', 'Passé (agenda)') +
      barre(declare, 'var(--green)', 'Déclaré par l\'équipe') +
      (ecart !== null && ecart > 0 ? '<p class="small" style="margin:6px 0 0;color:var(--red)">Dépassement : ' + temps(ecart) + ' de plus que prévu.</p>'
        : prevu && planifie > prevu ? '<p class="small" style="margin:6px 0 0;color:var(--orange-dark)">Le planning dépasse le temps prévu de ' + temps(planifie - prevu) + '.</p>'
        : prevu && reel ? '<p class="small muted" style="margin:6px 0 0">Reste ' + temps(Math.max(0, prevu - reel)) + ' sur le temps prévu.</p>' : '') +
      (nbTech > 1 && passe ? '<p class="small muted" style="margin:4px 0 0">Avec ' + nbTech + ' techniciens prévus : ' + nb(passe * nbTech) + ' h de main-d\'œuvre d\'après l\'agenda.</p>' : '') +
      (techs.length ? '<div class="temps-equipe"><div class="small" style="font-weight:600;margin:10px 0 4px">' + techs.length + ' personne' + (techs.length > 1 ? 's' : '') +
        ' sur le chantier, ' + nb(declare) + ' h au total' + (prevu ? ' (' + Math.round(declare / prevu * 100) + ' % du temps prévu)' : '') + '</div><ul class="mini-list">' +
        techs.map((t) => '<li><span>' + esc(nomUser(t.email)) + ' <span class="muted small">· ' + t.jours + ' jour' + (t.jours > 1 ? 's' : '') + ', dernier le ' + fr(t.dernier) + '</span></span><strong>' + nb(t.heures) + ' h</strong></li>').join('') + '</ul></div>' : '') +
      (ajd.length ? '<p class="small" style="margin:6px 0 0"><strong>Aujourd\'hui :</strong> ' + ajd.length + ' personne' + (ajd.length > 1 ? 's' : '') + ' (' + ajd.map((p) => esc(prenom(p.email))).join(', ') + ')</p>' : '') +
      '<p class="small muted" style="margin:6px 0 0">Planifié et passé : d\'après l\'agenda, heures de travail seulement (hors week-ends, jours fériés et jours non travaillés). Déclaré : d\'après « Ma journée » de chaque technicien.</p></div>';
  }
  /** Zone de trajet : '1', '2'… ou 'GD' */
  function pillZone(z, km) {
    if (!z) return '';
    return '<span class="zone' + (z === 'GD' ? ' gd' : '') + '">' + (z === 'GD' ? 'Grand déplacement' : 'Zone ' + esc(z)) + '</span>' +
      (km !== undefined && km !== '' ? ' <span class="muted small">' + String(km).replace('.', ',') + ' km</span>' : '');
  }
  /** Zones du réglage « 1A:5,1B:10,2:20… » → [{ nom, min, max }] (même lecture que le programme Google) */
  function zonesTrajet() {
    const out = [];
    String(S.data.reglages.zones || '1A:5,1B:10,2:20,3:30,4:40,5:50').split(',').forEach((x, i) => {
      const p = String(x).trim().split(':');
      if (!p[0]) return;
      out.push({ nom: p.length > 1 ? p[0].trim().toUpperCase() : String(i + 1), min: out.length ? out[out.length - 1].max : 0, max: Number(String(p.length > 1 ? p[1] : p[0]).trim().replace(',', '.')) });
    });
    return out;
  }
  function libZone(z) {
    const zs = zonesTrajet();
    if (z === 'GD') return 'Grand déplacement (plus de ' + (zs.length ? zs[zs.length - 1].max : 0) + ' km)';
    const t = zs.find((x) => x.nom === z);
    return t ? 'Zone ' + t.nom + ' (' + nb(t.min) + ' à ' + nb(t.max) + ' km)' : 'Zone ' + z;
  }
  /** Lien WhatsApp avec un message déjà écrit (envoi par la personne, gratuit) */
  function lienWhatsApp(tel, texte) {
    let n = String(tel || '').replace(/[^\d+]/g, '');
    if (!n) return '';
    if (n.indexOf('+') === 0) n = n.slice(1); else if (n.indexOf('00') === 0) n = n.slice(2); else if (n.indexOf('0') === 0) n = '33' + n.slice(1);
    return 'https://wa.me/' + n + (texte ? '?text=' + encodeURIComponent(texte) : '');
  }
  const btnWhatsApp = (email, texte) => {
    const u = (S.data.users || []).find((x) => x.email === email);
    const l = u && lienWhatsApp(u.telephone, texte);
    return l ? '<a class="btn ghost small wa" href="' + l + '" target="_blank" rel="noopener" title="Écrire à ' + esc(u.nom || u.email) + ' sur WhatsApp">WhatsApp</a>' : '';
  };

  /** Étape précédente (mêmes règles que le programme Google) */
  function etapePrec(d) {
    const aDesCommandes = S.data.commandes.some((c) => c.dossierId === d.id);
    return {
      devis_envoye: 'devis_a_faire', commande: 'devis_envoye', materiel: 'commande',
      planifie: aDesCommandes ? 'materiel' : 'commande', en_cours: 'planifie', termine: 'en_cours',
      facture: 'termine', refuse: 'devis_envoye', ignore: 'devis_a_faire'
    }[d.etape] || null;
  }
  const btnRetour = (d) => etapePrec(d)
    ? '<button class="btn ghost" data-act="retour" data-id="' + d.id + '" title="Revenir à « ' + esc(ETAPES()[etapePrec(d)]) + ' »">↩ Étape précédente</button>' : '';

  /* Interventions planifiées */
  const LIB_CRENEAU = { journee: 'Journée', matin: 'Matin', apres_midi: 'Après-midi' };
  const interventionsDe = (id) => (S.data.interventions || []).filter((x) => x.dossierId === id)
    .sort((a, b) => (a.date + (a.creneau === 'apres_midi' ? 2 : 1) < b.date + (b.creneau === 'apres_midi' ? 2 : 1) ? -1 : 1));
  /** Jours d'une période : premier et dernier jour avec leur créneau, journées entières entre les deux */
  function joursPeriode(x) {
    const fin = x.dateFin && x.dateFin >= x.date ? x.dateFin : x.date;
    const out = [];
    for (let j = x.date, n = 0; j <= fin && n < 90; j = addDays(j, 1), n++) {
      out.push({ date: j, creneau: j === x.date ? (x.creneau || 'journee') : j === fin ? (x.creneauFin || 'journee') : 'journee' });
    }
    return out;
  }
  const minus = (c) => LIB_CRENEAU[c].toLowerCase();
  function libellePeriode(x) {
    const j = joursPeriode(x);
    if (j.length === 1) return fr(x.date, true) + ' (' + minus(j[0].creneau) + ')';
    return 'du ' + fr(x.date, true) + ' (' + minus(j[0].creneau) + ') au ' + fr(j[j.length - 1].date, true) + ' (' + minus(j[j.length - 1].creneau) + ')';
  }
  /** Résumé des périodes ; à défaut, les dates de début et de fin */
  function datesChantier(d) {
    const its = interventionsDe(d.id);
    if (its.length) return its.map(libellePeriode).join(' · ');
    return d.dateDebut ? fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : '') : '';
  }
  /** Jours fériés en France (même calcul que le programme Google) */
  const FERIES = {};
  function feries(an) {
    if (FERIES[an]) return FERIES[an];
    const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = an + '-' + String(mois).padStart(2, '0') + '-' + String(jour).padStart(2, '0');
    const out = {};
    ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].forEach((md) => { out[an + '-' + md] = true; });
    [1, 39, 50].forEach((n) => { out[addDays(paques, n)] = true; });
    return (FERIES[an] = out);
  }
  /** Jour travaillé : ni week-end, ni férié, ni dans les jours non travaillés des réglages */
  function jourTravaille(iso) {
    const js = new Date(iso + 'T12:00:00').getDay();
    if (js === 0 || js === 6 || feries(Number(iso.slice(0, 4)))[iso]) return false;
    return !String(S.data.reglages.joursNonTravailles || '').split(',').map((x) => x.trim()).filter(Boolean)
      .some((x) => { const p = x.split('/'); return iso >= p[0].trim() && iso <= (p[1] || p[0]).trim(); });
  }
  /** Périodes du chantier ; pour un ancien planning (dates seulement), une période déduite des dates */
  function blocPeriodes(d) {
    const its = interventionsDe(d.id);
    if (its.length) return listeInterventions(its);
    if (!d.dateDebut) return '<p class="muted" style="margin:0">Pas encore planifié.</p>';
    return listeInterventions([{ date: d.dateDebut, dateFin: d.dateFin || d.dateDebut, creneau: 'journee', creneauFin: 'journee', techniciens: d.techniciens || '', travaux: '' }]) +
      (estAdmin() && ouvert(d) ? '<p class="small muted" style="margin:6px 0 0">Planning sans détail des périodes. <button class="link" data-act="planifier" data-id="' + d.id + '">Détailler les périodes et les techniciens</button></p>' : '');
  }
  function listeInterventions(its) {
    return '<ul class="mini-list interv">' + its.map((x) => {
      const j = joursPeriode(x);
      const fin = j[j.length - 1].date;
      const travailles = j.filter((y) => jourTravaille(y.date)).length;
      return '<li style="display:block"><div><strong>' + libellePeriode(x).replace(/^du /, 'Du ') + '</strong>' +
        (j.length > 1 ? ' <span class="pill grey">' + travailles + ' jour' + (travailles > 1 ? 's' : '') + ' travaillé' + (travailles > 1 ? 's' : '') + '</span>' : '') +
        (fin < today() ? ' <span class="muted small">passée</span>' : x.date <= today() ? ' <span class="pill orange">en cours</span>' : '') + '</div>' +
        (x.techniciens ? '<div class="small" style="margin-top:4px">👷 ' + x.techniciens.split(',').filter(Boolean).map((e) => esc(nomUser(e))).join(', ') + '</div>'
          : '<div class="small muted" style="margin-top:4px">👷 Technicien(s) à préciser</div>') +
        (x.travaux ? '<div class="small" style="margin-top:4px;white-space:pre-line">' + esc(x.travaux) + '</div>' : '<div class="small muted">Travaux non précisés</div>') +
        '</li>';
    }).join('') + '</ul>';
  }
  /** Ce qui n'est pas encore validé avant de planifier */
  function etapesManquantes(d) {
    const manque = [];
    if (['devis_a_faire', 'devis_envoye', 'refuse', 'ignore'].indexOf(d.etape) >= 0) manque.push('Le devis n\'est pas validé par le client.');
    const cmds = S.data.commandes.filter((c) => c.dossierId === d.id && passee(c));
    if (!cmds.length) manque.push('Le matériel n\'est pas commandé.');
    S.data.commandes.filter((c) => c.dossierId === d.id && !passee(c)).forEach(() => manque.push('Une demande de matériel d\'un technicien n\'est pas encore commandée.'));
    cmds.filter((c) => c.receptionStatut !== 'conforme').forEach((c) => manque.push('Réception non validée conforme : ' + c.fournisseur + '.'));
    return manque;
  }

  function pillEtape(d) {
    const cls = { devis_a_faire: 'amber', termine: 'amber', facture: 'green', refuse: 'red', ignore: 'grey' }[d.etape] || '';
    return '<span class="pill ' + cls + '">' + esc(ETAPES()[d.etape] || d.etape) + '</span>';
  }

  /* Retards (mêmes règles que les mails) */
  /* Réception du matériel (une par commande fournisseur) */
  const LIB_RECEP = { '': 'À réceptionner', conforme: 'Reçu conforme', non_conforme: 'Non conforme', partielle: 'Reçu en partie' };
  const recepOuverte = (c) => c.receptionStatut !== 'conforme';
  function pillRecep(c) {
    const st = c.receptionStatut || '';
    const cls = { conforme: 'green', non_conforme: 'red', partielle: 'amber' }[st] || (c.dateLivraison && c.dateLivraison <= today() ? 'amber' : 'grey');
    return '<span class="pill ' + cls + '">' + LIB_RECEP[st] + '</span>';
  }
  const btnRecep = (c, cls) => '<button class="btn ' + (cls || 'primary') + '" data-act="reception" data-id="' + c.id + '">' +
    (c.receptionStatut === 'non_conforme' || c.receptionStatut === 'partielle' ? 'Nouvelle réception' : 'Valider la réception') + '</button>';

  const enRetard = {
    devis: (d) => d.etape === 'devis_a_faire' && d.dateRdv && addDays(d.dateRdv, delai('devis_a_faire')) <= today(),
    relance: (d) => d.etape === 'devis_envoye' && d.prochaineRelance && d.prochaineRelance <= today(),
    materiel: (d) => d.etape === 'commande' && d.dateValidation && addDays(d.dateValidation, delai('commande_materiel')) <= today(),
    demande: (c) => c.statut === 'demandee' && c.dateDemande && addDays(c.dateDemande, delai('materiel_demande')) <= today(),
    reception: (c) => passee(c) && recepOuverte(c) && c.dateLivraison && addDays(c.dateLivraison, delai('reception')) <= today()
  };

  /* ================================================================
   * DIALOGUE AVEC LE PROGRAMME GOOGLE
   * ================================================================ */
  let enCours = 0;
  function chargement(on) {
    enCours += on ? 1 : -1;
    $('#loader').hidden = enCours <= 0;
  }

  async function api(action, data) {
    chargement(true);
    try {
      const res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: S.token, action: action, data: data || {} }),
        redirect: 'follow'
      });
      const out = await res.json();
      if (!out.ok) {
        if (out.code === 'NON_CONNECTE' || out.code === 'ACCES_REFUSE') {
          deconnecter(out.error);
        }
        const e = new Error(out.error || 'Erreur inconnue');
        e.code = out.code;
        e.serveur = true;
        throw e;
      }
      return out.data;
    } catch (e) {
      if (!e.code && !e.serveur) e.message = "Le programme Google ne répond pas. Vérifiez votre connexion internet. (" + e.message + ')';
      throw e;
    } finally {
      chargement(false);
    }
  }

  /** Action qui modifie les données : renvoie l'état à jour */
  async function agir(action, data, message) {
    const d = await api(action, data);
    if (d && d.dossiers) S.data = d;
    if (message) toast(message);
    return d;
  }

  /* ================================================================
   * CONNEXION GOOGLE
   * ================================================================ */
  function lireJeton(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
  }
  function jetonValide(t) {
    const p = t && lireJeton(t);
    return p && p.exp * 1000 > Date.now() + 60000;
  }
  function stocker(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } }
  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGoogle, 200); return; }
    google.accounts.id.initialize({
      client_id: CFG.CLIENT_ID,
      callback: (r) => { S.token = r.credential; stocker('sa_token', r.credential); demarrer(); },
      auto_select: true,
      cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr' });
    google.accounts.id.prompt();
  }

  function montrerConnexion(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-msg').textContent = msg || '';
    initGoogle();
  }

  function deconnecter(msg) {
    S.token = null;
    stocker('sa_token', null);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    montrerConnexion(msg);
  }

  async function demarrer() {
    $('#login').hidden = true;
    try {
      S.data = await api('boot');
      $('#app').hidden = false;
      // À chaque ouverture : le tableau de bord. Seuls les boutons des mails ouvrent directement la bonne page.
      const depuisMail = /[?&]depuis=mail/.test(location.search);
      if (depuisMail) history.replaceState(null, '', location.pathname + location.hash);
      if (!depuisMail && location.hash !== '#/' ) {
        location.hash = '#/';
      } else {
        afficher();
      }
      preparerTelephone();
    } catch (e) {
      if (e.code !== 'NON_CONNECTE' && e.code !== 'ACCES_REFUSE') montrerConnexion(e.message);
    }
  }

  /* ================================================================
   * NAVIGATION
   * ================================================================ */
  function compteurs() {
    const ds = S.data.dossiers, cs = S.data.commandes, fs = S.data.factures;
    const dOuverts = ds.filter(ouvert);
    const demandes = cs.filter(demandeOuverte);
    return {
      devis: ds.filter((d) => d.etape === 'devis_a_faire').length,
      devisRetard: ds.filter(enRetard.devis).length,
      relances: ds.filter((d) => d.etape === 'devis_envoye').length,
      relancesDues: ds.filter(enRetard.relance).length,
      materiel: ds.filter((d) => d.etape === 'commande').length,
      materielRetard: ds.filter(enRetard.materiel).length,
      demandes: demandes.length,
      demandesRetard: demandes.filter(enRetard.demande).length,
      conges: (S.data.conges || []).filter((x) => x.statut === 'demande').length,
      receptions: S.data.commandes.filter((c2) => passee(c2) && ouvert(parId(c2.dossierId)) && recepOuverte(c2) && c2.dateLivraison && c2.dateLivraison <= today()).length,
      receptionsRetard: S.data.commandes.filter((c2) => ouvert(parId(c2.dossierId)) && (enRetard.reception(c2) || c2.receptionStatut === 'non_conforme')).length,
      aPlanifier: dOuverts.filter((d) => ['commande', 'materiel'].indexOf(d.etape) >= 0 && !d.dateDebut).length,
      enCours: ds.filter((d) => d.etape === 'en_cours').length,
      planifies: dOuverts.filter((d) => ['planifie', 'en_cours'].indexOf(d.etape) >= 0 || (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0)).length,
      factures: fs.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).length,
      jourNonDeclare: !(S.data.pointages || []).some((p) => p.email === moi() && p.date === today()) ? 1 : 0
    };
  }

  function dessinerMenu(route) {
    const c = compteurs();
    const lien = (href, label, n, late) =>
      '<a href="' + href + '" class="' + (route === href ? 'active' : '') + '">' + label +
      (n ? '<span class="badge' + (late ? ' late' : '') + '">' + n + '</span>' : '') + '</a>';
    const u = S.data.user;
    const vp = S.data.versionProgramme || 'ancienne';
    const pied = '<div class="nav-user">' + esc(u.nom || u.email) + '<br><button type="button" data-act="logout">Se déconnecter</button>' +
      '<div style="margin-top:10px;font-size:11px;opacity:.6">par So Conseiller</div>' +
      '<div style="margin-top:4px;font-size:11px;opacity:.6' + (vp !== VERSION_ECRANS ? ';color:#FFB27A;opacity:1' : '') + '">Écrans ' + VERSION_ECRANS + '<br>Programme ' + esc(vp) +
      (vp !== VERSION_ECRANS ? '<br>⚠ versions différentes' : '') + '</div></div>';
    const marque = '<div class="nav-brand"><img src="logo.png" alt="Elec Habitat – Julien Larroudé"></div>';
    if (!estAdmin()) {
      $('#nav').innerHTML = marque + '<div class="nav-role">Technicien</div>' +
        lien('#/', 'Tableau de bord', totalNonLus(), true) +
        lien('#/journee', 'Ma journée', c.jourNonDeclare ? '!' : '', true) +
        lien('#/conges', 'Mes absences') +
        lien('#/notifications', '🔔 Notifications', etatNotif() === 'inactif' || etatNotif() === 'ios_installer' ? '!' : '', true) + pied;
      return;
    }
    $('#nav').innerHTML = marque +
      lien('#/', 'Tableau de bord') +
      lien('#/devis', 'Devis à faire', c.devis, c.devisRetard) +
      lien('#/relances', 'Relances clients', c.relancesDues || '', c.relancesDues) +
      lien('#/commandes', 'Devis validé', c.materiel + c.demandes + c.receptions, c.materielRetard + c.demandesRetard + c.receptionsRetard) +
      lien('#/planning', 'Planning', c.aPlanifier, false) +
      lien('#/facturer', 'À facturer', c.factures, c.factures) +
      lien('#/archives', 'Archives') +
      '<div class="nav-sep"></div>' +
      lien('#/terrain', 'Chantiers (vue terrain)', totalNonLus(), true) +
      lien('#/equipe', 'Équipe et présences') +
      lien('#/conges', 'Congés et absences', c.conges, c.conges) +
      lien('#/trajets', 'Trajets (PDF)') +
      lien('#/agenda', 'Chercher dans l\'agenda') +
      lien('#/reglages', 'Réglages') +
      lien('#/notifications', '🔔 Notifications', etatNotif() === 'inactif' || etatNotif() === 'ios_installer' ? '!' : '', true) + pied;
  }

  function fermerMenu() {
    $('#nav').classList.remove('open');
    $('#nav-scrim').classList.remove('open');
    $('#menu-btn').setAttribute('aria-expanded', 'false');
  }

  async function afficher() {
    if (!S.data) return;
    fermerMenu();
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    const route = '#/' + (parts[0] || '');
    dessinerMenu(route);
    const main = $('#main');
    try {
      let html;
      switch (parts[0] || '') {
        case '': html = estAdmin() ? vueAccueil() : vueTableauTech(); break;
        case 'devis': case 'relances': case 'commandes': case 'planning': case 'facturer': case 'archives':
          if (!estAdmin()) { html = '<div class="empty">Réservé à l\'administrateur. <a href="#/terrain">Voir les chantiers</a></div>'; break; }
          html = { devis: vueDevis, relances: vueRelances, commandes: vueCommandes, planning: vuePlanning, facturer: vueFacturer, archives: vueArchives }[parts[0]]();
          break;
        case 'reglages': html = estAdmin() ? vueReglages() : '<div class="empty">Réservé à l\'administrateur.</div>'; break;
        case 'journee': html = vueJournee(parts[1], parts[2] ? decodeURIComponent(parts[2]) : ''); break;
        case 'conges': html = vueConges(); break;
        case 'trajets': html = estAdmin() ? vueTrajets() : '<div class="empty">Réservé à l\'administrateur.</div>'; break;
        case 'equipe': html = estAdmin() ? vueEquipe(parts[1]) : '<div class="empty">Réservé à l\'administrateur.</div>'; break;
        case 'agenda': html = estAdmin() ? vueAgenda() : '<div class="empty">Réservé à l\'administrateur.</div>'; break;
        case 'notifications': html = vueNotifications(); break;
        case 'terrain':
          if (parts[1]) { await chargerDossier(parts[1]); html = vueTerrainChantier(); } else html = vueTerrain();
          break;
        case 'dossier':
          await chargerDossier(parts[1]); html = estAdmin() ? vueDossier() : vueTerrainChantier(); break;
        default: html = '<div class="empty">Page introuvable. <a href="#/">Retour au tableau de bord</a></div>';
      }
      const banniere = S.data.reglages.modeTest === 'oui' && estAdmin()
        ? '<div class="test-banner"><strong>Mode test.</strong> Tous les mails partent vers ' + esc(S.data.reglages.emailTest || 'l\'adresse de test') +
          ' et l\'agenda n\'est pas lu automatiquement. ' + (estAdmin() ? '<a href="#/reglages">Changer dans les réglages</a>' : '') + '</div>'
        : '';
      main.innerHTML = banniere + html;
      apresAffichage(parts[0] || '');
    } catch (e) {
      main.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }

  async function chargerDossier(id) {
    S.dossier = await api('dossier', { id: id });
    // Ouvrir le chantier = messages lus
    if (S.data.nonLus && S.data.nonLus[id]) { delete S.data.nonLus[id]; dessinerMenu(routeActuelle()); }
    if (S.data.derniersMessages) delete S.data.derniersMessages[id];
  }
  const routeActuelle = () => '#/' + ((location.hash.replace(/^#\/?/, '').split('/')[0]) || '');
  const totalNonLus = () => Object.keys(S.data.nonLus || {}).reduce((t, k) => t + S.data.nonLus[k], 0);
  /** Pastille « nouveaux messages » d'un chantier */
  const pillMessages = (id) => {
    const n = (S.data.nonLus || {})[id];
    return n ? '<span class="pill msg">💬 ' + n + ' nouveau' + (n > 1 ? 'x' : '') + ' message' + (n > 1 ? 's' : '') + '</span>' : '';
  };

  // Pastilles de messages à jour (sans recharger la page affichée) : toutes les 2 minutes,
  // à l'arrivée d'une notification, et quand on revient sur l'appli
  async function rafraichirPastilles() {
    if (!S.data || document.hidden || $('#modal').open) return;
    try {
      const b = await api('boot');
      const avant = totalNonLus();
      S.data.nonLus = b.nonLus;
      S.data.derniersMessages = b.derniersMessages;
      const id = (location.hash.match(/^#\/(?:dossier|terrain)\/([^/]+)/) || [])[1];
      if (id) { delete S.data.nonLus[id]; delete (S.data.derniersMessages || {})[id]; }
      dessinerMenu(routeActuelle());
      // Nouveau message reçu pendant qu'on regarde le tableau de bord : on le met à jour et on prévient
      if (totalNonLus() > avant) {
        toast('💬 Nouveau message sur un chantier');
        if (routeActuelle() === '#/' && !document.activeElement.matches('input, textarea, select')) await afficher();
      }
    } catch (e) { /* on réessaiera */ }
  }
  setInterval(rafraichirPastilles, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirPastilles(); });

  async function rafraichir(msg) {
    S.data = await api('boot');
    await afficher();
    if (msg) toast(msg);
  }

  /* ================================================================
   * TABLEAU DE BORD
   * ================================================================ */
  function vueAccueil() {
    const c = compteurs();
    const ds = S.data.dossiers;
    const t = today();
    const u = S.data.user;
    const stat = (href, n, label, late, lateLabel) =>
      '<a class="stat" href="' + href + '"><div class="n">' + n + '</div><div class="l">' + label + '</div>' +
      (late ? '<div class="late">' + late + ' ' + lateLabel + '</div>' : '<div class="ok">à jour</div>') + '</a>';

    // Ce qui est en retard
    const retards = [];
    ds.filter(enRetard.devis).forEach((d) => retards.push({ d, txt: 'Devis à faire', date: d.dateRdv, quand: 'rdv ' + fr(d.dateRdv) }));
    ds.filter(enRetard.relance).forEach((d) => retards.push({ d, txt: 'Client à relancer', date: d.prochaineRelance, quand: 'prévu ' + fr(d.prochaineRelance) }));
    ds.filter(enRetard.materiel).forEach((d) => retards.push({ d, txt: 'Matériel à commander', date: d.dateValidation, quand: 'validé ' + fr(d.dateValidation) }));
    S.data.commandes.filter((c2) => enRetard.demande(c2) && ouvert(parId(c2.dossierId))).forEach((c2) =>
      retards.push({ d: parId(c2.dossierId), txt: 'Matériel demandé par ' + (c2.demandePar || 'un technicien'), date: c2.dateDemande, quand: 'demandé ' + fr(c2.dateDemande) }));
    S.data.commandes.filter((c2) => ouvert(parId(c2.dossierId)) && (enRetard.reception(c2) || c2.receptionStatut === 'non_conforme')).forEach((c2) =>
      retards.push({ d: parId(c2.dossierId), txt: (c2.receptionStatut === 'non_conforme' ? 'Réception non conforme (' : 'Réception à valider (') + c2.fournisseur + ')', date: c2.dateLivraison, quand: 'attendu ' + fr(c2.dateLivraison) }));
    S.data.factures.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).forEach((f) =>
      retards.push({ d: parId(f.dossierId), txt: f.type === 'finale' ? 'Facture finale à faire' : 'Facture intermédiaire ' + f.pourcentage + ' %', date: f.dateDemande, quand: 'demandée ' + fr(f.dateDemande) }));
    retards.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Cette semaine
    const fin = addDays(t, 7);
    const semaine = [];
    S.data.commandes.forEach((c2) => {
      const d = parId(c2.dossierId);
      if (ouvert(d) && passee(c2) && recepOuverte(c2) && c2.dateLivraison >= t && c2.dateLivraison <= fin) semaine.push({ date: c2.dateLivraison, d, txt: 'Livraison ' + c2.fournisseur });
    });
    ds.filter(ouvert).forEach((d) => {
      const its = interventionsDe(d.id);
      if (its.length) its.forEach((x) => joursPeriode(x).filter((j) => j.date >= t && j.date <= fin)
        .forEach((j) => semaine.push({ date: j.date, d, txt: 'Intervention (' + minus(j.creneau) + ')' })));
      else if (d.dateDebut && d.dateDebut >= t && d.dateDebut <= fin) semaine.push({ date: d.dateDebut, d, txt: 'Début de chantier' });
    });
    semaine.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Taux de signature
    const taux = (debut) => {
      const envoyes = ds.filter((d) => d.dateDevis && d.dateDevis >= debut && d.etape !== 'ignore');
      const valides = envoyes.filter((d) => ['devis_a_faire', 'devis_envoye', 'refuse', 'ignore'].indexOf(d.etape) < 0);
      return { n: envoyes.length, v: valides.length, pct: envoyes.length ? Math.round((100 * valides.length) / envoyes.length) : null };
    };
    const tm = taux(t.slice(0, 8) + '01'), ta = taux(t.slice(0, 4) + '-01-01');

    // Motifs de refus
    const motifs = {};
    ds.filter((d) => d.etape === 'refuse').forEach((d) => { const m = d.motifRefus || 'Non précisé'; motifs[m] = (motifs[m] || 0) + 1; });
    const maxM = Math.max(1, ...Object.values(motifs));
    const motifsHtml = Object.keys(motifs).length
      ? '<div class="bars">' + Object.keys(motifs).sort((a, b) => motifs[b] - motifs[a]).map((m) =>
        '<div class="bar-row"><span>' + esc(m) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round((100 * motifs[m]) / maxM) + '%"></div></div><span class="v">' + motifs[m] + '</span></div>').join('') + '</div>'
      : '<p class="muted small">Aucun devis refusé pour l\'instant.</p>';

    const chantiers = ds.filter((d) => d.etape === 'en_cours' || d.etape === 'planifie').sort((a, b) => ((a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1));

    const h = new Date().getHours();
    return '<div class="page-head"><div><h1>' + (h < 18 ? 'Bonjour' : 'Bonsoir') + ' ' + esc((u.nom || '').split(' ')[0]) + '</h1>' +
      '<p>' + fr(t, true) + ' · ' + ds.filter(ouvert).length + ' dossiers ouverts</p></div>' +
      '<div class="actions"><button class="btn" data-act="nouveau">+ Nouveau dossier</button><button class="btn" data-act="scan">Lire l\'agenda maintenant</button><a class="btn" href="#/agenda">Chercher dans l\'agenda</a></div></div>' +
      '<div class="loupe"><svg class="loupe-ico" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input type="search" id="loupe" placeholder="Rechercher : plusieurs mots possibles (ex. : dupont dax tableau)" autocomplete="off" aria-label="Rechercher un dossier">' +
      '<div id="loupe-res" class="loupe-res" hidden></div></div>' +
      '<div class="stats">' +
      stat('#/devis', c.devis, 'Devis à faire', c.devisRetard, 'en retard') +
      stat('#/relances', c.relances, 'Devis en attente', c.relancesDues, 'à relancer') +
      stat('#/commandes', c.materiel, 'Matériel à commander', c.materielRetard, 'en retard') +
      stat('#/commandes', c.demandes, 'Matériel demandé', c.demandesRetard, 'en attente') +
      '<a class="stat' + (totalNonLus() ? ' alert' : '') + '" href="#/terrain"><div class="n">' + totalNonLus() + '</div><div class="l">Messages non lus</div>' +
      (totalNonLus() ? '<div class="late">' + Object.keys(S.data.nonLus || {}).length + ' chantier(s)</div>' : '<div class="ok">à jour</div>') + '</a>' +
      stat('#/planning', c.enCours, 'Chantiers en cours', c.aPlanifier, 'à planifier') +
      stat('#/facturer', c.factures, 'Factures à faire', c.factures, 'en attente') +
      '</div>' +
      '<div class="grid two">' +
      '<div class="card"><h2>À traiter <span class="pill ' + (retards.length ? 'red' : 'green') + '">' + retards.length + '</span></h2>' +
      (retards.length ? '<ul class="mini-list">' + retards.slice(0, 12).map((r) =>
        '<li><span><a href="#/dossier/' + r.d.id + '">' + esc(nomClient(r.d)) + '</a> · ' + esc(r.txt) + '</span><span class="muted">' + esc(r.quand) + '</span></li>').join('') + '</ul>' +
        (retards.length > 12 ? '<p class="muted small">… et ' + (retards.length - 12) + ' autres.</p>' : '')
        : '<p class="muted">Rien en retard. Tout est à jour.</p>') + '</div>' +
      '<div class="card"><h2>Les 7 prochains jours</h2>' +
      (semaine.length ? '<ul class="mini-list">' + semaine.map((s) =>
        '<li><span><a href="#/dossier/' + s.d.id + '">' + esc(nomChantier(s.d)) + '</a> · ' + esc(s.txt) + '</span><span class="muted">' + fr(s.date, true) + '</span></li>').join('') + '</ul>'
        : '<p class="muted">Aucune livraison ni début de chantier prévu.</p>') + '</div>' +
      '</div>' +
      '<div style="margin-top:16px">' + carteNotifs() + '</div>' + carteMessages() +
      '<div style="margin-top:16px">' + carteEquipeJour() + '</div>' +
      '<div class="grid three" style="margin-top:16px">' +
      '<div class="card"><h2>Taux de signature</h2><div class="big-rate">' +
      '<div><div class="n">' + (tm.pct === null ? '–' : tm.pct + ' %') + '</div><div class="l">ce mois-ci<br>' + tm.v + ' sur ' + tm.n + ' devis</div></div>' +
      '<div><div class="n">' + (ta.pct === null ? '–' : ta.pct + ' %') + '</div><div class="l">depuis janvier<br>' + ta.v + ' sur ' + ta.n + ' devis</div></div>' +
      '</div></div>' +
      '<div class="card"><h2>Motifs de refus</h2>' + motifsHtml + '</div>' +
      '<div class="card"><h2>Chantiers</h2>' +
      (chantiers.length ? '<ul class="mini-list">' + chantiers.map((d) =>
        '<li style="display:block"><a href="#/dossier/' + d.id + '">' + esc(nomChantier(d)) + '</a>' +
        '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div>' + (Number(d.avancement) || 0) + ' %</div></li>').join('') + '</ul>'
        : '<p class="muted small">Aucun chantier planifié.</p>') + '</div>' +
      '</div>';
  }

  /* ================================================================
   * LISTES PAR ÉTAPE
   * ================================================================ */
  function ligne(d, opts) {
    return '<div class="item' + (opts.late ? ' late' : '') + '"><div class="item-main">' +
      '<a class="item-title" href="#/dossier/' + d.id + '">' + esc(opts.titre || nomClient(d)) + '</a>' +
      (opts.late ? ' <span class="pill red">' + esc(opts.lateLabel || 'en retard') + '</span>' : '') +
      '<div class="item-meta">' + (opts.meta || []).filter(Boolean).map((m) => '<span>' + m + '</span>').join('') + '</div>' +
      (opts.note ? '<div class="item-note">' + esc(opts.note) + '</div>' : '') +
      (opts.extra || '') +
      '</div>' + (opts.actions || opts.retour ? '<div class="actions">' + (opts.actions || '') + (opts.retour ? btnRetour(d) : '') + '</div>' : '') + '</div>';
  }
  const vide = (txt) => '<div class="empty">' + txt + '</div>';

  function vueDevis() {
    const ds = S.data.dossiers.filter((d) => d.etape === 'devis_a_faire').sort((a, b) => (a.dateRdv < b.dateRdv ? -1 : 1));
    return '<div class="page-head"><div><h1>Devis à faire</h1><p>Rendez-vous repérés dans l\'agenda avec le mot « ' + esc(S.data.reglages.motsCles) + ' ».</p></div>' +
      '<div class="actions"><button class="btn" data-act="nouveau">+ Nouveau dossier</button><button class="btn primary" data-act="scan">Lire l\'agenda maintenant</button></div></div>' +
      (ds.length ? '<div class="list">' + ds.map((d) => ligne(d, {
        late: enRetard.devis(d),
        meta: ['Rdv ' + fr(d.dateRdv, true) + (d.heureRdv ? ' à ' + d.heureRdv.replace(':', 'h') : ''), d.lieu && esc(d.lieu), d.client && d.titreRdv !== d.client && esc(d.titreRdv)],
        note: d.descriptionRdv ? d.descriptionRdv.slice(0, 200) : '',
        actions: '<button class="btn primary" data-act="devisFait" data-id="' + d.id + '">Devis fait</button>' +
          '<button class="btn" data-act="ignorer" data-id="' + d.id + '">Ignorer</button>'
      })).join('') + '</div>' : vide('Aucun devis à faire. Les nouveaux rendez-vous apparaîtront ici.'));
  }

  function vueRelances() {
    const ds = S.data.dossiers.filter((d) => d.etape === 'devis_envoye').sort((a, b) => ((a.prochaineRelance || 'z') < (b.prochaineRelance || 'z') ? -1 : 1));
    return '<div class="page-head"><div><h1>Relances clients</h1><p>Devis envoyés en attente de réponse. Délai par défaut : ' + delai('relance_client') + ' jours.</p></div></div>' +
      (ds.length ? '<div class="list">' + ds.map((d) => {
        const late = enRetard.relance(d);
        return ligne(d, {
          late: late, lateLabel: 'à relancer',
          meta: ['Devis <strong>' + esc(d.numDevis) + '</strong> du ' + fr(d.dateDevis), 'Relance ' + fr(d.prochaineRelance, true) + ' (' + relatif(d.prochaineRelance) + ')'],
          note: d.notesRelance,
          actions: '<button class="btn primary" data-act="reponse" data-id="' + d.id + '">Réponse du client</button>', retour: true
        });
      }).join('') + '</div>' : vide('Aucun devis en attente de réponse.'));
  }

  function vueCommandes() {
    const ds = S.data.dossiers;
    const aCommander = ds.filter((d) => d.etape === 'commande').sort((a, b) => (a.dateValidation < b.dateValidation ? -1 : 1));
    const demandes = S.data.commandes.filter(demandeOuverte).sort((a, b) => (a.dateDemande < b.dateDemande ? -1 : 1));
    const cmds = S.data.commandes.filter((c) => passee(c) && ouvert(parId(c.dossierId))).sort((a, b) => (a.dateLivraison < b.dateLivraison ? -1 : 1));
    const receptions = cmds.filter((c) => c.receptionStatut === 'non_conforme' || (recepOuverte(c) && c.dateLivraison <= today()));
    const livraisons = cmds.filter((c) => recepOuverte(c) && c.receptionStatut !== 'non_conforme' && c.dateLivraison > today());
    const cmdLigne = (c, mode) => {
      const d = parId(c.dossierId);
      const nc = c.receptionStatut === 'non_conforme';
      return ligne(d, {
        titre: nomChantier(d) + ' · ' + c.fournisseur,
        late: mode === 'recep' ? (nc || enRetard.reception(c)) : false,
        lateLabel: nc ? 'à traiter' : 'réception en retard',
        meta: ['Commandé le ' + fr(c.dateCommande), 'Livraison ' + fr(c.dateLivraison, true) + ' (' + relatif(c.dateLivraison) + ')', pillRecep(c)],
        note: (c.demande ? 'Demandé : ' + c.demande + '\n' : '') + (c.receptionCommentaire && c.receptionStatut ? 'Réception : ' + c.receptionCommentaire + '\n' : '') + (c.commentaire || ''),
        actions: btnRecep(c, mode === 'recep' ? 'primary' : '') + '<button class="btn ghost" data-act="modifCommande" data-id="' + c.id + '">Modifier</button>'
      });
    };
    return '<div class="page-head"><div><h1>Devis validé</h1><p>Matériel à commander, demandes des techniciens, réceptions et livraisons à venir.</p></div></div>' +
      '<h2 class="section-title">Demandes des techniciens (' + demandes.length + ')</h2>' +
      (demandes.length ? '<div class="list">' + demandes.map((c) => {
        const d = parId(c.dossierId);
        return ligne(d, {
          titre: nomChantier(d) + ' · matériel demandé',
          late: enRetard.demande(c), lateLabel: 'en attente',
          meta: ['Par ' + esc(c.demandePar || '?'), 'le ' + fr(c.dateDemande)],
          note: c.demande + (c.commentaire ? '\n' + c.commentaire : ''),
          actions: '<button class="btn primary" data-act="commande" data-id="' + d.id + '" data-cmd="' + c.id + '">Commande passée</button>' +
            '<button class="btn ghost danger" data-act="supprCommande" data-id="' + c.id + '">Retirer</button>'
        });
      }).join('') + '</div>' : vide('Aucune demande de matériel en attente.')) +
      '<h2 class="section-title">Devis validés : matériel à commander (' + aCommander.length + ')</h2>' +
      (aCommander.length ? '<div class="list">' + aCommander.map((d) => ligne(d, {
        late: enRetard.materiel(d),
        meta: ['Devis ' + esc(d.numDevis), 'Validé le ' + fr(d.dateValidation), d.numCommande ? 'Commande ' + esc(d.numCommande) : '<span class="pill amber">N° de commande à saisir</span>'],
        actions: '<button class="btn primary" data-act="commande" data-id="' + d.id + '">Commande passée</button>', retour: true
      })).join('') + '</div>' : vide('Rien à commander.')) +
      '<h2 class="section-title">Réceptions à valider (' + receptions.length + ')</h2>' +
      (receptions.length ? '<div class="list">' + receptions.map((c) => cmdLigne(c, 'recep')).join('') + '</div>' : vide('Aucune réception en attente.')) +
      '<h2 class="section-title">Livraisons à venir (' + livraisons.length + ')</h2>' +
      (livraisons.length ? '<div class="list">' + livraisons.map((c) => cmdLigne(c, 'avenir')).join('') + '</div>' : vide('Aucune livraison prévue.'));
  }

  function vuePlanning() {
    const ds = S.data.dossiers.filter(ouvert);
    const aPlanifier = ds.filter((d) => ['commande', 'materiel'].indexOf(d.etape) >= 0 && !d.dateDebut);
    const planifies = ds.filter((d) => d.dateDebut && ['commande', 'materiel', 'planifie', 'en_cours'].indexOf(d.etape) >= 0)
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));
    const livraisonsDe = (d) => S.data.commandes.filter((c) => c.dossierId === d.id && passee(c));
    return '<div class="page-head"><div><h1>Planning des chantiers</h1><p>Du plus proche au plus lointain.</p></div></div>' +
      '<h2 class="section-title">À planifier (' + aPlanifier.length + ')</h2>' +
      (aPlanifier.length ? '<div class="list">' + aPlanifier.map((d) => ligne(d, {
        titre: nomChantier(d),
        meta: [esc(nomClient(d)), livraisonsDe(d).length ? livraisonsDe(d).map((c) => esc(c.fournisseur) + ' ' + fr(c.dateLivraison) + ' ' + pillRecep(c)).join(' · ') : 'matériel pas encore commandé'],
        actions: '<button class="btn primary" data-act="planifier" data-id="' + d.id + '">Planifier</button>', retour: true
      })).join('') + '</div>' : vide('Aucun chantier à planifier.')) +
      '<h2 class="section-title">Chantiers planifiés (' + planifies.length + ')</h2>' +
      (planifies.length ? '<div class="list">' + planifies.map((d) => ligne(d, {
        titre: nomChantier(d),
        meta: [datesChantier(d), esc(nomClient(d)), pillZone(d.zone, d.distanceKm),
          d.tempsPrevu || d.tempsPlanifie ? 'Temps : ' + (d.tempsPasse ? nb(Number(d.tempsPasse)) + ' h passées / ' : '') + (d.tempsPrevu ? nb(Number(d.tempsPrevu)) + ' h prévues' : nb(Number(d.tempsPlanifie)) + ' h planifiées') : '',
          d.tempsDeclare ? 'Équipe : ' + nb(Number(d.tempsDeclare)) + ' h déclarées' : '',
          d.techniciens ? esc(d.techniciens.split(',').map(nomUser).join(', ')) : 'technicien à choisir', pillEtape(d),
          livraisonsDe(d).length ? (livraisonsDe(d).every((c) => !recepOuverte(c)) ? '<span class="pill green">Matériel reçu</span>'
            : '<span class="pill amber">' + livraisonsDe(d).filter(recepOuverte).length + ' réception(s) en attente</span>') : ''],
        extra: '<div class="progress-line" style="margin-top:8px;max-width:320px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div>' + (Number(d.avancement) || 0) + ' %</div>',
        actions: '<a class="btn" href="#/terrain/' + d.id + '">Infos chantier</a><button class="btn" data-act="planifier" data-id="' + d.id + '">Modifier</button>', retour: true
      })).join('') + '</div>' : vide('Aucun chantier planifié.'));
  }

  function vueFacturer() {
    const fs = S.data.factures.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).sort((a, b) => (a.dateDemande < b.dateDemande ? -1 : 1));
    return '<div class="page-head"><div><h1>À facturer</h1><p>Factures intermédiaires demandées et chantiers terminés.</p></div></div>' +
      (fs.length ? '<div class="list">' + fs.map((f) => {
        const d = parId(f.dossierId);
        return ligne(d, {
          titre: nomChantier(d),
          meta: [f.type === 'finale' ? '<span class="pill amber">Facture finale</span>' : '<span class="pill">Intermédiaire ' + esc(f.pourcentage) + ' %</span>',
            esc(nomClient(d)), 'Demandée le ' + fr(f.dateDemande) + ' par ' + esc(f.demandePar), d.numCommande ? 'Commande ' + esc(d.numCommande) : '',
            f.type === 'finale' ? pillPV(d) : '',
            f.type === 'finale' ? (S.data.documents || []).filter((x) => x.dossierId === d.id && x.type === 'pv')
              .map((x, i) => '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">Voir le PV' + (i ? ' (' + (i + 1) + ')' : '') + '</a>').join(' · ') : ''],
          note: f.type === 'finale' && d.pvStatut === 'avec_reserves' && d.pvReserves ? 'Réserves : ' + d.pvReserves : f.commentaire,
          actions: '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>' +
            (f.type === 'finale' ? btnRetour(d) : '<button class="btn ghost" data-act="modifFacture" data-id="' + f.id + '">Modifier</button>')
        });
      }).join('') + '</div>' : vide('Aucune facture à faire.'));
  }

  function vueArchives() {
    return '<div class="page-head"><div><h1>Archives</h1><p>Dossiers facturés, devis refusés et rendez-vous ignorés.</p></div></div>' +
      '<div class="card" style="margin-bottom:16px"><label class="field" style="margin:0"><span>Rechercher</span>' +
      '<input type="text" id="search" placeholder="Plusieurs mots possibles : client, commune, n° de devis, chantier, document…" autocomplete="off"></label></div>' +
      '<div id="search-results"></div>';
  }
  function resultatsRecherche(q) {
    const mots = motsDe(q);
    const qq = mots.join(' ');
    let ds = S.data.dossiers.slice();
    const docsDe = (d) => (S.data.documents || []).filter((x) => x.dossierId === d.id);
    if (qq) ds = ds.filter((d) => trouveTous([d.client, d.titreRdv, d.numDevis, d.numCommande, d.chantier, d.lieu, d.descriptionRdv].concat(docsDe(d).map((x) => x.nom)).join(' '), mots));
    else ds = ds.filter((d) => !ouvert(d));
    ds.sort((a, b) => ((b.dateCloture || b.majLe || '') > (a.dateCloture || a.majLe || '') ? 1 : -1));
    $('#search-results').innerHTML = ds.length
      ? '<div class="list">' + ds.slice(0, 100).map((d) => ligne(d, {
        meta: [pillEtape(d), d.numDevis && 'Devis ' + esc(d.numDevis), d.numCommande && 'Commande ' + esc(d.numCommande), d.chantier && esc(d.chantier),
          d.motifRefus && 'Motif : ' + esc(d.motifRefus), d.dateCloture && 'Clos le ' + fr(d.dateCloture),
          qq ? docsDe(d).filter((x) => mots.some((m) => sansAccent(x.nom).indexOf(m) >= 0)).map((x) => '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">📄 ' + esc(x.nom) + '</a>').join(' · ') : ''],
        retour: !ouvert(d)
      })).join('') + '</div>'
      : vide(qq ? 'Aucun dossier ne correspond.' : 'Aucun dossier archivé.');
  }

  /* ================================================================
   * FICHE DOSSIER
   * ================================================================ */
  const PARCOURS = ['devis_a_faire', 'devis_envoye', 'commande', 'materiel', 'planifie', 'en_cours', 'termine', 'facture'];

  function vueDossier() {
    const { dossier: d, commandes, factures, commentaires, historique } = S.dossier;
    const idx = PARCOURS.indexOf(d.etape);
    // L'étape « matériel » est détaillée en 2 : commandé, réception conforme
    const cmds = commandes.filter(passee);
    const sousEtapes = [
      { lib: 'Matériel commandé', ok: cmds.length > 0 },
      { lib: 'Réception conforme', ok: cmds.length > 0 && cmds.every((c) => c.receptionStatut === 'conforme') }
    ];
    const iMat = PARCOURS.indexOf('materiel');
    let courantVu = false;
    const etapes = [];
    PARCOURS.forEach((e, i) => {
      if (e === 'commande') {
        // Commande client : validée dès que le devis est accepté (le matériel se suit dans les 3 étapes suivantes)
        etapes.push({ lib: 'Devis validé', cls: idx >= i ? 'done' : '' });
        return;
      }
      if (e !== 'materiel') {
        etapes.push({ lib: ETAPES()[e], cls: idx < 0 ? '' : i < idx ? 'done' : i === idx ? (e === 'facture' ? 'done' : 'current') : '' });
        return;
      }
      sousEtapes.forEach((se) => {
        let cls = '';
        if (se.ok) cls = 'done';
        else if ((idx === iMat || idx === iMat - 1) && !courantVu) { cls = 'current'; courantVu = true; }
        else if (idx > iMat) cls = 'manque';
        etapes.push({ lib: se.lib, cls, titre: cls === 'manque' ? 'Étape non validée' : '' });
      });
    });
    const steps = '<div class="steps" aria-label="Avancement du dossier">' + etapes.map((x) =>
      '<div class="step ' + x.cls + '"' + (x.titre ? ' title="' + x.titre + '"' : '') + '><div class="dot">' + (x.cls === 'done' ? '✓' : x.cls === 'manque' ? '!' : '') + '</div>' + esc(x.lib) + '</div>').join('') + '</div>';

    const kv = (pairs) => '<dl class="kv">' + pairs.filter((p) => p[1]).map((p) => '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>').join('') + '</dl>';

    let actions = '';
    switch (d.etape) {
      case 'devis_a_faire': actions = '<button class="btn primary" data-act="devisFait" data-id="' + d.id + '">Devis fait</button><button class="btn" data-act="ignorer" data-id="' + d.id + '">Ignorer</button>'; break;
      case 'devis_envoye': actions = '<button class="btn primary" data-act="reponse" data-id="' + d.id + '">Réponse du client</button>'; break;
      case 'commande': actions = '<button class="btn primary" data-act="commande" data-id="' + d.id + '">Commande matériel passée</button><button class="btn" data-act="planifier" data-id="' + d.id + '">Planifier</button>'; break;
      case 'materiel': actions = '<button class="btn primary" data-act="planifier" data-id="' + d.id + '">Planifier le chantier</button><button class="btn" data-act="commande" data-id="' + d.id + '">Autre commande</button>'; break;
      case 'planifie': case 'en_cours': actions = '<a class="btn primary" href="#/terrain/' + d.id + '">Infos chantier</a><button class="btn" data-act="commande" data-id="' + d.id + '">Autre commande</button>'; break;
      case 'termine': {
        const ff = factures.find((f) => f.type === 'finale' && f.faite !== 'oui');
        if (ff) actions = '<button class="btn green" data-act="factureFaite" data-id="' + ff.id + '">Facture finale faite</button>';
        break;
      }
      default: break;
    }

    const delaiTxt = d.delaiRelance ? d.delaiRelance + ' jours (propre à ce devis)' : delai('relance_client') + ' jours (par défaut)';

    const retour = { devis_a_faire: ['#/devis', 'Devis à faire'], devis_envoye: ['#/relances', 'Relances clients'], commande: ['#/commandes', 'Devis validé'], materiel: ['#/planning', 'Planning'], planifie: ['#/planning', 'Planning'], en_cours: ['#/planning', 'Planning'], termine: ['#/facturer', 'À facturer'] }[d.etape] || ['#/archives', 'Archives'];
    return '<a class="back" href="' + retour[0] + '">← ' + retour[1] + '</a>' +
      '<div class="page-head"><div><h1>' + esc(nomClient(d)) + '</h1><p>' + pillEtape(d) + (d.chantier ? ' · ' + esc(d.chantier) : '') + (d.demo === 'oui' ? ' · <span class="pill grey">démo</span>' : '') + '</p></div>' +
      '<div class="actions">' + actions + '<button class="btn" data-act="modifier" data-id="' + d.id + '">Modifier</button>' + btnRetour(d) + '</div></div>' +
      steps +
      '<div class="grid two">' +
      '<div>' +
      '<div class="card"><h2>Rendez-vous</h2>' + kv([
        ['Date', fr(d.dateRdv, true) + (d.heureRdv ? ' à ' + d.heureRdv.replace(':', 'h') : '')],
        ['Titre', esc(d.titreRdv)], ['Lieu', esc(d.lieu)], ['Notes', esc(d.descriptionRdv)]
      ]) + '</div>' +
      '<div class="card"><h2>Devis</h2>' + (d.numDevis ? kv([
        ['Numéro', '<strong>' + esc(d.numDevis) + '</strong>'], ['Envoyé le', fr(d.dateDevis)], ['Commentaire', esc(d.commentaireDevis)],
        ['Délai de relance', delaiTxt],
        ['Prochaine relance', d.etape === 'devis_envoye' ? fr(d.prochaineRelance, true) + ' (' + relatif(d.prochaineRelance) + ')' : ''],
        ['Notes de relance', esc(d.notesRelance)],
        ['Refus', d.motifRefus ? esc(d.motifRefus) + (d.commentaireRefus ? ' – ' + esc(d.commentaireRefus) : '') : '']
      ]) : '<p class="muted">Pas encore fait.</p>') +
      blocDocsDevis(d, (S.dossier.documents || []).filter((x) => x.type === 'devis')) + '</div>' +
      '<div class="card"><h2>Devis validé</h2>' + (d.dateValidation ? kv([
        ['Validé le', fr(d.dateValidation)],
        ['N° de commande', d.numCommande ? esc(d.numCommande) : '<span class="pill amber">à saisir</span>'],
        ['Temps prévu', d.tempsPrevu ? nb(Number(d.tempsValeur)) + ' ' + LIB_UNITE[d.tempsUnite || 'jour'] + ' <span class="muted small">= ' + temps(d.tempsPrevu) + '</span>'
          : '<button class="link" data-act="modifier" data-id="' + d.id + '">à indiquer</button>'],
        ['Chantier', esc(d.chantier)]
      ]) : '<p class="muted">Devis pas encore validé.</p>') + '</div>' +
      '<div class="card"><h2>Matériel</h2>' +
      blocMateriel(d, commandes, true) + '</div>' +
      '</div>' +
      '<div>' +
      '<div class="card"><h2>Localisation</h2>' + blocLocalisation(d) + '</div>' +
      '<div class="card"><h2>Chantier' + (d.dateValidation && ouvert(d) ? ' <button class="btn ghost" data-act="planifier" data-id="' + d.id + '">' + (d.dateDebut ? 'Modifier' : 'Planifier') + '</button>' : '') + '</h2>' +
      (d.dateDebut ? '<div class="small muted" style="margin:0 0 4px;font-weight:600">Périodes planifiées</div>' +
        blocPeriodes(d) +
        kv([
          ['Technicien(s)', (d.techniciens || '').split(',').filter(Boolean).map((e) => esc(nomUser(e)) + ' ' + btnWhatsApp(e, 'Chantier ' + nomChantier(d) + ' : ')).join('<br>')],
          ['Terminé le', fr(d.dateFinChantier)]
        ]) + blocTemps(d) + '<div class="progress-line" style="margin:12px 0 4px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div>'
        : '<p class="muted">Pas encore planifié.</p>' + (d.tempsPrevu ? '<p class="small">Temps prévu : <strong>' + temps(d.tempsPrevu) + '</strong></p>' : '')) + '</div>' +
      (['en_cours', 'termine', 'facture'].indexOf(d.etape) >= 0 || d.pvStatut || (S.dossier.documents || []).some((x) => x.type !== 'devis')
        ? '<div class="card"><h2>PV de réception</h2>' + blocPV(d, S.dossier.documents || []) + '</div>' : '') +
      '<div class="card"><h2>Factures</h2>' + (factures.length ? '<ul class="mini-list">' + factures.map((f) =>
        '<li><span>' + (f.type === 'finale' ? 'Facture finale' : 'Intermédiaire ' + esc(f.pourcentage) + ' %') + '<br><span class="muted small">demandée le ' + fr(f.dateDemande) + (f.commentaire ? ' · ' + esc(f.commentaire) : '') + '</span></span>' +
        '<span class="actions" style="justify-content:flex-end">' +
        (f.faite === 'oui'
          ? '<span class="pill green">faite le ' + fr(f.dateFaite) + '</span><button class="btn ghost" data-act="annulerFacture" data-id="' + f.id + '">Annuler</button>'
          : '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>' +
            (f.type === 'intermediaire' ? '<button class="btn ghost" data-act="modifFacture" data-id="' + f.id + '">Modifier</button><button class="btn ghost danger" data-act="supprFacture" data-id="' + f.id + '">Supprimer</button>' : '')) +
        '</span></li>').join('') + '</ul>'
        : '<p class="muted">Aucune facture demandée.</p>') + '</div>' +
      '<div class="card"><h2>Documents</h2>' + blocDocuments(d, S.dossier.documents || []) + '</div>' +
      '<div class="card"><h2>Discussion du chantier</h2>' + blocDiscussion(d, commentaires) + '</div>' +
      '<div class="card"><h2>Historique</h2><ul class="history">' + historique.map((h) =>
        '<li><span class="when">' + fr(h.date) + '</span><span><strong>' + esc(h.action) + '</strong>' + (h.note ? ' – ' + esc(h.note) : '') + ' <span class="muted">· ' + esc(h.qui) + '</span></span></li>').join('') + '</ul></div>' +
      '<div class="card"><h2>Statut du dossier</h2><p class="muted small" style="margin-top:0">En cas d\'erreur, revenez à l\'étape précédente ou supprimez le dossier. Chaque changement est noté dans l\'historique avec son motif.</p>' +
      '<div class="actions">' + (btnRetour(d) ? btnRetour(d).replace('btn ghost', 'btn') : '<span class="muted small">Première étape : pas de retour possible.</span>') +
      '<button class="btn danger" data-act="supprDossier" data-id="' + d.id + '">Supprimer le dossier</button></div></div>' +
      '</div></div>';
  }

  /* PV de réception du chantier */
  const LIB_PV = { sans_reserves: 'Sans réserves', avec_reserves: 'Avec réserves' };
  function pillPV(d) {
    if (!d.pvStatut) return '<span class="pill grey">Pas encore de PV</span>';
    return '<span class="pill ' + (d.pvStatut === 'avec_reserves' ? 'amber' : 'green') + '">PV ' + LIB_PV[d.pvStatut].toLowerCase() + '</span>';
  }
  const lienDrive = (id) => 'https://drive.google.com/file/d/' + esc(id) + '/view';
  const estImage = (doc) => /^image\//.test(doc.mime || '') || /\.(jpe?g|png|heic|webp)$/i.test(doc.nom || '');

  /** Libellé court du type de fichier : PDF, DOC, XLS… */
  function typeDoc(x) {
    const m = (x.nom || '').match(/\.([a-z0-9]{2,4})$/i);
    if (m) return m[1].toUpperCase();
    const mime = x.mime || '';
    if (/pdf/.test(mime)) return 'PDF';
    if (/word|document/.test(mime)) return 'DOC';
    if (/sheet|excel/.test(mime)) return 'XLS';
    if (/^image\//.test(mime)) return 'Photo';
    return 'Fichier';
  }
  const vignette = (x) => '<div class="doc" data-nom="' + esc(sansAccent(x.nom)) + '">' +
      '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">' +
      (estImage(x) ? '<img src="https://drive.google.com/thumbnail?id=' + esc(x.fichier) + '&sz=w320" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=doc-ico>Photo</span>\'">' : '<span class="doc-ico">' + esc(typeDoc(x)) + '</span>') +
      '<span class="doc-nom">' + esc(x.nom || 'Document') + '</span></a>' +
      (estAdmin() ? '<span class="doc-liens"><button class="link" data-act="renommerDoc" data-id="' + x.id + '">renommer</button>' +
        '<button class="link" data-act="classerDoc" data-id="' + x.id + '">classer</button>' +
        '<button class="link danger" data-act="supprDoc" data-id="' + x.id + '">retirer</button></span>' : '') + '</div>';

  /** Tous les documents du dossier, rangés par type (plans, devis, photos…), avec recherche par nom */
  function blocDocuments(d, docs) {
    const ordre = typesDocs().map((t) => t.cle);
    const groupes = typesDocs().map((t) => ({ t, docs: docs.filter((x) => x.type === t.cle) })).filter((g) => g.docs.length);
    const autres = docs.filter((x) => ordre.indexOf(x.type) < 0);
    if (autres.length) groupes.push({ t: { cle: 'autre', lib: 'Autres' }, docs: autres });
    const peutDeposer = estAdmin() || typesPermis().length;
    return (docs.length > 3 ? '<input type="text" class="doc-search" data-docsearch placeholder="Rechercher un document par son nom…" autocomplete="off" style="margin-bottom:12px">' : '') +
      (groupes.length ? groupes.map((g) => '<div class="doc-groupe"><h3>' + esc(g.t.lib) + ' <span class="pill grey">' + g.docs.length + '</span></h3>' +
        '<div class="docs">' + g.docs.map(vignette).join('') + '</div></div>').join('') : '<p class="muted small" style="margin-top:0">Aucun document déposé.</p>') +
      '<p class="muted small doc-vide" hidden>Aucun document ne correspond.</p>' +
      (peutDeposer ? '<div class="actions" style="margin-top:12px"><button class="btn" data-act="deposer" data-id="' + d.id + '">+ Déposer des documents ou photos</button></div>' : '');
  }

  /** Matériel : demandes des techniciens, commandes passées et réceptions */
  function blocMateriel(d, commandes, fiche) {
    const demandes = commandes.filter((c) => !passee(c));
    const faites = commandes.filter(passee);
    const admin = estAdmin();
    const ouvertD = ouvert(d);
    return (demandes.length ? '<div class="stack" style="margin-bottom:10px">' + demandes.map((c) =>
        '<div style="border:1px solid #F3C9A6;background:var(--orange-soft);border-radius:8px;padding:12px">' +
        '<div class="actions" style="justify-content:space-between;align-items:center"><span><span class="pill orange">À commander</span> ' +
        '<span class="muted small">demandé par ' + esc(c.demandePar || '?') + ' le ' + fr(c.dateDemande) + '</span></span>' +
        (admin ? '<span class="actions"><button class="btn primary small" data-act="commande" data-id="' + d.id + '" data-cmd="' + c.id + '">Commande passée</button>' +
          '<button class="btn ghost small danger" data-act="supprCommande" data-id="' + c.id + '">Retirer</button></span>' : '') + '</div>' +
        '<div style="white-space:pre-line;margin-top:8px">' + esc(c.demande) + '</div>' +
        (c.commentaire ? '<div class="small muted" style="margin-top:6px">' + esc(c.commentaire) + '</div>' : '') + '</div>').join('') + '</div>' : '') +
      (faites.length ? '<div class="stack">' + faites.map((c) =>
        '<div style="border:1px solid var(--line);border-radius:8px;padding:12px">' +
        '<strong>' + esc(c.fournisseur) + '</strong> <span class="muted small">commandé le ' + fr(c.dateCommande) + '</span>' +
        '<div class="small" style="margin:4px 0 8px">Livraison ' + fr(c.dateLivraison, true) + '</div>' +
        (c.demande ? '<div class="small" style="white-space:pre-line;margin-bottom:8px">' + esc(c.demande) + '</div>' : '') +
        (c.commentaire ? '<div class="small muted" style="margin-bottom:8px">' + esc(c.commentaire) + '</div>' : '') +
        blocReception(c) +
        (admin && fiche ? '<div class="actions"><button class="btn ghost" data-act="modifCommande" data-id="' + c.id + '">Modifier</button>' +
          '<button class="btn ghost danger" data-act="supprCommande" data-id="' + c.id + '">Supprimer</button></div>' : '') + '</div>').join('') + '</div>'
        : (demandes.length ? '' : '<p class="muted" style="margin-top:0">Aucune commande de matériel.</p>')) +
      (ouvertD ? '<div class="actions" style="margin-top:12px"><button class="btn orange" data-act="demandeMateriel" data-id="' + d.id + '">Matériel à commander</button>' +
        (admin && d.dateValidation ? '<button class="btn ghost" data-act="commande" data-id="' + d.id + '">+ Commande passée</button>' : '') + '</div>' : '');
  }

  /** Adresse, distance depuis le point de départ, zone, liens carte et GPS */
  function blocLocalisation(d) {
    const pos = d.lat && d.lng ? d.lat + ',' + d.lng : '';
    const carte = pos ? 'https://www.google.com/maps/search/?api=1&query=' + pos : (d.lieu ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.lieu) : '');
    const waze = pos ? 'https://waze.com/ul?ll=' + pos + '&navigate=yes' : '';
    return '<div class="loc"><div><div class="adr">' + (d.lieu ? esc(d.lieu) : '<span class="muted">Adresse non renseignée</span>') + '</div>' +
      (d.zone ? '<div style="margin-top:6px">' + pillZone(d.zone, d.distanceKm) + ' <span class="muted small">depuis ' + esc(S.data.reglages.departNom || 'le point de départ') + '</span></div>'
        : '<div class="muted small" style="margin-top:4px">' + (d.lieu ? 'Pas encore placé sur la carte.' : '') + '</div>') + '</div></div>' +
      '<div class="loc-actions">' +
      (carte ? '<a class="btn small" href="' + carte + '" target="_blank" rel="noopener">Google Maps</a>' : '') +
      (waze ? '<a class="btn small" href="' + waze + '" target="_blank" rel="noopener">Waze</a>' : '') +
      '<button class="btn small" data-act="adresse" data-id="' + d.id + '">' + (d.lieu ? 'Modifier l\'adresse' : 'Saisir l\'adresse') + '</button>' +
      '<button class="btn small" data-act="position" data-id="' + d.id + '">Je suis sur place : enregistrer la position</button></div>';
  }

  /** Documents joints au devis (devis signé, annexes, plans…) */
  function blocDocsDevis(d, docs) {
    return (docs.length ? '<div class="small muted" style="margin:14px 0 6px">Documents du devis</div><div class="docs">' + docs.map(vignette).join('') + '</div>' : '') +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="docDevis" data-id="' + d.id + '">' + (docs.length ? '+ Ajouter un document' : 'Joindre le devis') + '</button></div>';
  }

  function blocPV(d, docs) {
    const pv = docs.filter((x) => x.type === 'pv');
    const res = docs.filter((x) => x.type === 'reserve');
    return '<div class="actions" style="align-items:center;margin-bottom:10px">' + pillPV(d) +
      (d.pvDate ? '<span class="muted small">le ' + fr(d.pvDate) + '</span>' : '') + '</div>' +
      (d.pvStatut === 'avec_reserves' && d.pvReserves ? '<div class="help" style="white-space:pre-line"><strong>Réserves :</strong> ' + esc(d.pvReserves) + '</div>' : '') +
      (pv.length ? '<div class="docs">' + pv.map(vignette).join('') + '</div>' : '') +
      (res.length ? '<div class="small muted" style="margin:10px 0 6px">Photos des réserves</div><div class="docs">' + res.map(vignette).join('') + '</div>' : '') +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="pv" data-id="' + d.id + '">' + (d.pvStatut || pv.length || res.length ? 'Compléter le PV' : 'Joindre le PV') + '</button></div>';
  }

  /** Réception d'une commande, dans la fiche et sur l'écran chantier */
  function blocReception(c) {
    const st = c.receptionStatut || '';
    const details = st ? [
      c.dateReception ? 'le ' + fr(c.dateReception) : '', c.receptionPar ? 'par ' + esc(c.receptionPar) : '',
      c.numBL ? 'BL ' + esc(c.numBL) : ''
    ].filter(Boolean).join(' · ') : '';
    return '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin:0 0 10px">' +
      '<div class="actions" style="align-items:center;justify-content:space-between"><span><strong class="small">Réception</strong> ' + pillRecep(c) +
      (details ? ' <span class="muted small">' + details + '</span>' : '') + '</span>' +
      '<span class="actions">' + (st !== 'conforme' ? btnRecep(c, st ? 'primary' : '') : '') +
      (st && estAdmin() ? '<button class="btn ghost" data-act="annulerReception" data-id="' + c.id + '">Annuler</button>' : '') + '</span></div>' +
      (c.receptionCommentaire && st ? '<div class="small" style="margin-top:6px;white-space:pre-line">' + esc(c.receptionCommentaire) + '</div>' : '') +
      (c.receptionPhoto ? '<a class="small" href="https://drive.google.com/file/d/' + esc(c.receptionPhoto) + '/view" target="_blank" rel="noopener">Voir la photo de réception</a>' : '') +
      '</div>';
  }

  /** Discussion du chantier : messages, photos et documents, visibles par toute l'équipe */
  function bulles(list, vuAvant) {
    if (!list.length) return '<p class="muted" style="margin:0">Pas encore de message. Écrivez le premier !</p>';
    let repere = false;
    return list.map((c) => {
      const nouveau = vuAvant && !repere && c.date > vuAvant && c.auteurEmail !== moi();
      if (nouveau) repere = true;
      const sep = nouveau ? '<div class="chat-nouveaux" id="chat-nouveaux"><span>Nouveaux messages</span></div>' : '';
      const mien = c.auteurEmail && c.auteurEmail === moi();
      const peut = mien || estAdmin();
      const type = c.photo ? 'photo' : c.fichier ? 'document' : 'message';
      return sep + '<div class="bulle' + (mien ? ' moi' : '') + '" data-type="' + type + '" data-auteur="' + esc(c.auteur) + '" data-date="' + esc(String(c.date).slice(0, 10)) +
        '" data-texte="' + esc(sansAccent([c.texte, c.nomFichier, c.auteur].join(' '))) + '"><div class="qui"><span><strong>' + esc(c.auteur) + '</strong> · ' + fr(c.date, true) + '</span>' +
        (peut ? '<span>' + (c.texte ? '<button class="link" data-act="modifCom" data-id="' + c.id + '">modifier</button> · ' : '') +
          '<button class="link danger" data-act="supprCom" data-id="' + c.id + '">supprimer</button></span>' : '') + '</div>' +
        (c.texte ? '<p>' + esc(c.texte) + '</p>' : '') +
        (c.photo ? '<a class="photo" href="https://drive.google.com/file/d/' + esc(c.photo) + '/view" target="_blank" rel="noopener">' +
          '<img src="https://drive.google.com/thumbnail?id=' + esc(c.photo) + '&sz=w480" alt="Photo du chantier" loading="lazy" onerror="this.outerHTML=\'<span class=alt>Voir la photo</span>\'"></a>' : '') +
        (c.fichier ? '<a class="fichier" href="https://drive.google.com/file/d/' + esc(c.fichier) + '/view" target="_blank" rel="noopener">📄 ' + esc(c.nomFichier || 'Document') + '</a>' : '') +
        '</div>';
    }).join('');
  }
  /** Applique la recherche de la discussion (mots, type, auteur, dates) */
  function filtrerChat() {
    const chat = $('#chat');
    if (!chat) return;
    const f = {};
    document.querySelectorAll('[data-chatfiltre]').forEach((x) => { f[x.dataset.chatfiltre] = x.value; });
    const mots = motsDe(f.q || '');
    const actif = mots.length || f.type || f.auteur || f.du || f.au;
    let n = 0, total = 0;
    chat.querySelectorAll('.bulle').forEach((b) => {
      total++;
      const ok = (!mots.length || mots.every((m) => b.dataset.texte.indexOf(m) >= 0)) &&
        (!f.type || b.dataset.type === f.type) && (!f.auteur || b.dataset.auteur === f.auteur) &&
        (!f.du || b.dataset.date >= f.du) && (!f.au || b.dataset.date <= f.au);
      b.hidden = !ok;
      if (ok) n++;
    });
    const compte = $('#chat-compte');
    if (compte) compte.textContent = actif ? n + ' sur ' + total + ' trouvé' + (n > 1 ? 's' : '') : '';
    // Garde la recherche en mémoire tant qu'on reste sur l'appli
    S.chatFiltre = Object.assign({ ouvert: !!(document.querySelector('.chat-filtres') || {}).open }, f);
  }

  function blocDiscussion(d, list) {
    const auteurs = Array.from(new Set(list.map((c) => c.auteur).filter(Boolean))).sort();
    const recherche = list.length > 2 ? '<details class="chat-filtres"' + (S.chatFiltre && S.chatFiltre.ouvert ? ' open' : '') + '><summary>🔍 Rechercher dans la discussion</summary>' +
      '<div class="chat-filtres-corps">' +
      '<input type="search" data-chatfiltre="q" placeholder="Un ou plusieurs mots…" aria-label="Mots à chercher" autocomplete="off">' +
      '<div class="row2"><select data-chatfiltre="type" aria-label="Type"><option value="">Tout</option><option value="message">Messages</option><option value="photo">Photos</option><option value="document">Documents</option></select>' +
      '<select data-chatfiltre="auteur" aria-label="Auteur"><option value="">Toutes les personnes</option>' + auteurs.map((a) => '<option>' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div class="row2"><label class="field" style="margin:0"><span class="small muted" style="font-weight:400">Du</span><input type="date" data-chatfiltre="du"></label>' +
      '<label class="field" style="margin:0"><span class="small muted" style="font-weight:400">Au</span><input type="date" data-chatfiltre="au"></label></div>' +
      '<div class="actions" style="align-items:center"><span class="muted small" id="chat-compte"></span><button type="button" class="link" data-chatreset>Effacer la recherche</button></div>' +
      '</div></details>' : '';
    const vu = S.dossier && S.dossier.dossier.id === d.id ? S.dossier.vuAvant || '' : '';
    return recherche + '<div class="chat" id="chat" data-id="' + d.id + '" data-vu="' + esc(vu) + '" data-der="' + esc(list.length ? list[list.length - 1].id : '') + '">' + bulles(list, vu) + '</div>' +
      (list.length > 3 ? '<div class="chat-nav"><button type="button" class="link" data-chatscroll="haut">↑ Premiers messages</button>' +
        '<button type="button" class="link" data-chatscroll="bas">↓ Derniers messages</button></div>' : '') +
      '<div class="chat-saisie"><textarea id="com-txt" rows="2" placeholder="Votre message… (pour dicter, touchez le micro du clavier)" aria-label="Message"></textarea>' +
      '<button class="btn primary" data-act="ajoutCom" data-id="' + d.id + '">Envoyer</button></div>' +
      '<div class="chat-outils"><label class="btn small">📷 Photo<input type="file" accept="image/*" capture="environment" hidden data-upload="chat" data-dossier="' + d.id + '"></label>' +
      '<label class="btn small">📎 Document<input type="file" hidden data-upload="chat" data-dossier="' + d.id + '"></label>' +
      '<span class="muted small" style="align-self:center">Visible par toute l\'équipe.</span></div>';
  }

  /* ================================================================
   * ÉCRAN CHANTIER (TECHNICIEN, TÉLÉPHONE)
   * ================================================================ */
  function vueTerrain() {
    const ds = S.data.dossiers.filter((d) => ouvert(d) && (['planifie', 'en_cours'].indexOf(d.etape) >= 0 || (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0)))
      .sort((a, b) => ((a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1));
    const miens = ds.filter((d) => (d.techniciens || '').split(',').indexOf(moi()) >= 0);
    const autres = ds.filter((d) => miens.indexOf(d) < 0);
    const carte = (d) => {
      const dem = S.data.commandes.filter((c) => c.dossierId === d.id && !passee(c)).length;
      return '<a class="terrain-card" href="#/terrain/' + d.id + '"><div class="t">' + esc(nomChantier(d)) + '</div>' +
        '<div class="when">' + (datesChantier(d) || 'date à définir') + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</div>' +
        (d.zone || dem || (S.data.nonLus || {})[d.id] ? '<div style="margin:-4px 0 10px">' + pillMessages(d.id) + ' ' + pillZone(d.zone, d.distanceKm) + (dem ? ' <span class="pill orange">' + dem + ' demande(s) de matériel</span>' : '') + '</div>' : '') +
        '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div></a>';
    };
    return '<div class="page-head"><div><h1>Chantiers</h1><p>Touchez un chantier pour l\'avancement, la discussion, le matériel et les documents.</p></div></div>' +
      (miens.length ? '<h2 class="section-title" style="margin-top:0">Mes chantiers</h2>' + miens.map(carte).join('') : (autres.length ? '' : vide('Aucun chantier planifié pour l\'instant.'))) +
      (autres.length ? '<h2 class="section-title">' + (miens.length ? 'Autres chantiers' : 'Chantiers planifiés') + '</h2>' + autres.map(carte).join('') : '');
  }

  /** Tableau de bord du technicien : recherche, chiffres, chantiers du jour, tous les chantiers en cours */
  function vueTableauTech() {
    const t = today();
    const enCours = S.data.dossiers.filter((d) => ouvert(d) && (['planifie', 'en_cours'].indexOf(d.etape) >= 0 || (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0)));
    const termines = S.data.dossiers.filter((d) => d.etape === 'termine');
    const aLui = (d) => (d.techniciens || '').split(',').indexOf(moi()) >= 0;
    const auJour = (d) => interventionsDe(d.id).some((x) => joursPeriode(x).some((j) => j.date === t));
    const tri = (a, b) => (auJour(b) - auJour(a)) || (aLui(b) - aLui(a)) || ((a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1);
    const ajd = enCours.filter((d) => auJour(d) && aLui(d));
    const nonLus = totalNonLus();
    const demandes = S.data.commandes.filter((c) => !passee(c) && c.demandePar === (S.data.user.nom || S.data.user.email)).length;
    const p = pointageDe(moi(), t);
    const carte = (d) => {
      const techs = (d.techniciens || '').split(',').filter(Boolean);
      const texte = sansAccent([nomChantier(d), nomClient(d), d.lieu, d.numCommande, d.numDevis, techs.map(nomUser).join(' ')].join(' '));
      const filtres = [aLui(d) ? 'miens' : '', auJour(d) ? 'jour' : '', (S.data.nonLus || {})[d.id] ? 'messages' : '', d.etape === 'termine' ? 'termines' : 'encours'].join(' ');
      return '<a class="terrain-card" href="#/terrain/' + d.id + '" data-texte="' + esc(texte) + '" data-filtres="' + filtres + '">' +
        '<div class="t">' + esc(nomChantier(d)) + (auJour(d) ? ' <span class="pill orange">Aujourd\'hui</span>' : '') + '</div>' +
        '<div class="when">' + esc(nomClient(d)) + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</div>' +
        '<div class="when">' + (d.etape === 'termine' ? 'Terminé ' + fr(d.dateFinChantier) : (datesChantier(d) || 'date à définir')) +
        (techs.length ? ' · ' + techs.map((e) => esc(prenom(e))).join(', ') : '') + '</div>' +
        '<div style="margin:-4px 0 10px">' + pillMessages(d.id) + ' ' + pillZone(d.zone, d.distanceKm) + '</div>' +
        '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div></a>';
    };
    const tuile = (n, lib, filtre, alerte) => (filtre ? '<button type="button" data-techfiltre="' + filtre + '"' : '<div') + ' class="stat' + (alerte && n ? ' alert' : '') + '">' +
      '<div class="n">' + n + '</div><div class="l">' + lib + '</div>' + (filtre ? '</button>' : '</div>');
    return '<div class="page-head"><div><h1>Bonjour ' + esc(prenom(moi())) + '</h1><p>' + fr(t, true) + '</p></div></div>' +
      (!p && jourTravaille(t) && !congeDuJour(moi(), t) ? '<a class="note-orange" href="#/journee" style="display:block;text-decoration:none">📋 Ta journée n\'est pas encore déclarée. <strong>La remplir</strong></a>' : '') +
      carteNotifs() + carteMessages() + '<div style="height:16px"></div>' +
      '<div class="loupe" style="margin-bottom:16px"><input type="search" id="tech-q" placeholder="Rechercher un chantier : client, commune, n° de commande…" aria-label="Rechercher un chantier" autocomplete="off" value="' + esc(S.techQ || '') + '"></div>' +
      '<div class="stats tech" id="tech-tuiles" style="margin-bottom:16px">' +
      tuile(ajd.length, 'chantier(s) pour moi aujourd\'hui', 'jour', false) +
      tuile(enCours.filter(aLui).length, 'mes chantiers en cours', 'miens', false) +
      tuile(nonLus, 'message(s) non lu(s)', 'messages', true) +
      tuile(demandes, 'demande(s) de matériel en attente', '', false) + '</div>' +
      '<div class="actions" role="group" aria-label="Filtrer les chantiers" style="margin-bottom:12px" id="tech-filtres">' +
      [['encours', 'En cours (' + enCours.length + ')'], ['miens', 'Les miens'], ['jour', 'Aujourd\'hui'], ['messages', 'Messages non lus'], ['termines', 'Terminés (' + termines.length + ')']]
        .map((f) => '<button type="button" class="btn small' + ((S.techFiltre || 'encours') === f[0] ? ' primary' : '') + '" data-techfiltre="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
      '<div id="tech-liste">' + enCours.slice().sort(tri).map(carte).join('') + termines.map(carte).join('') + '</div>' +
      '<p class="muted small" id="tech-vide" hidden>Aucun chantier ne correspond.</p>';
  }
  function filtrerTech() {
    const mots = motsDe(S.techQ || '');
    const f = S.techFiltre || 'encours';
    let n = 0;
    document.querySelectorAll('#tech-liste .terrain-card').forEach((c) => {
      const tags = c.dataset.filtres.split(' ');
      // La recherche porte sur tous les chantiers, terminés compris
      const okFiltre = mots.length ? true : f === 'termines' ? tags.indexOf('termines') >= 0
        : f === 'messages' ? tags.indexOf('messages') >= 0 : tags.indexOf('encours') >= 0 && (f === 'encours' || tags.indexOf(f) >= 0);
      const ok = okFiltre && mots.every((m) => c.dataset.texte.indexOf(m) >= 0);
      c.hidden = !ok;
      if (ok) n++;
    });
    const v = $('#tech-vide');
    if (v) v.hidden = n > 0;
  }

  function vueTerrainChantier() {
    const { dossier: d, commentaires, factures, commandes } = S.dossier;
    const pct = Number(d.avancement) || 0;
    const fini = d.etape === 'termine' || d.etape === 'facture';
    const inter = factures.filter((f) => f.type === 'intermediaire');
    const techs = (d.techniciens || '').split(',').filter(Boolean);
    return '<a class="back" href="' + (estAdmin() ? '#/terrain">← Chantiers' : '#/">← Tableau de bord') + '</a>' +
      '<div class="page-head"><div><h1>' + esc(nomChantier(d)) + '</h1><p>' + esc(nomClient(d)) +
      (techs.length ? ' · ' + techs.map((e) => esc(prenom(e))).join(', ') : '') + '</p></div>' +
      (estAdmin() ? '<div class="actions"><a class="btn" href="#/dossier/' + d.id + '">Fiche complète</a></div>' : '') + '</div>' +
      '<div class="card"><h2>Périodes planifiées</h2>' + blocPeriodes(d) + '</div>' +
      '<div class="card"><h2>Localisation</h2>' + blocLocalisation(d) + '</div>' +
      '<div class="card"><h2>Avancement</h2><div class="slider-box"><div class="pct" id="pct-val">' + pct + ' %</div>' +
      '<input type="range" min="0" max="100" step="5" value="' + pct + '" id="pct" aria-label="Avancement du chantier en pourcentage"' + (fini ? ' disabled' : '') + '></div>' +
      '<p class="muted small" style="text-align:center;margin:4px 0 0">Glissez puis relâchez : c\'est enregistré tout seul.</p></div>' +
      '<div class="card"><h2>Discussion</h2>' + blocDiscussion(d, commentaires) + '</div>' +
      '<div class="card"><h2>Matériel</h2>' + blocMateriel(d, commandes || [], false) + '</div>' +
      (!fini ? '<div class="card"><h2>Fin de chantier et facturation</h2><div class="stack">' +
        '<button class="btn big" data-act="factInter" data-id="' + d.id + '">Demander une facture intermédiaire</button>' +
        '<button class="btn green big" data-act="termine" data-id="' + d.id + '">Chantier terminé</button></div>' +
        (inter.length ? '<p class="muted small" style="margin-bottom:0">Déjà demandé : ' + inter.map((f) => esc(f.pourcentage) + ' %' + (f.faite === 'oui' ? ' (facturé)' : '')).join(', ') + '</p>' : '') + '</div>'
        : '<div class="card"><p style="margin:0"><span class="pill green">Chantier terminé</span> ' + (d.dateFinChantier ? 'le ' + fr(d.dateFinChantier) : '') + '</p></div>') +
      '<div class="card"><h2>PV de réception</h2>' + blocPV(d, S.dossier.documents || []) + '</div>' +
      '<div class="card"><h2>Documents</h2>' + blocDocuments(d, S.dossier.documents || []) + '</div>';
  }

  /* ================================================================
   * ÉQUIPE : PRÉSENCES, TRAJETS, CONGÉS
   * ================================================================ */
  const techniciens = () => (S.data.users || []).filter((u) => u.role === 'technicien' && u.actif !== 'non');
  const motifsAbsence = () => String(S.data.reglages.motifsAbsence || '').split(',').map((x) => x.trim()).filter(Boolean);
  const LIB_STATUT_CONGE = { demande: ['En attente', 'amber'], accepte: ['Validée', 'green'], refuse: ['Refusée', 'red'] };
  const pillConge = (c) => '<span class="pill ' + LIB_STATUT_CONGE[c.statut][1] + '">' + LIB_STATUT_CONGE[c.statut][0] + '</span>';
  function periodeConge(c) {
    const cr = (x) => (x && x !== 'journee' ? ' (' + LIB_CRENEAU[x].toLowerCase() + ')' : '');
    if (c.dateDebut === c.dateFin) return 'le ' + fr(c.dateDebut, true) + cr(c.creneauDebut);
    return 'du ' + fr(c.dateDebut, true) + cr(c.creneauDebut) + ' au ' + fr(c.dateFin, true) + cr(c.creneauFin);
  }
  /** Congé validé ce jour-là (journée entière ou demi-journée) */
  const congeDuJour = (email, date) => (S.data.conges || []).find((c) => c.email === email && c.statut === 'accepte' && c.dateDebut <= date && c.dateFin >= date);
  const pointageDe = (email, date) => (S.data.pointages || []).find((p) => p.email === email && p.date === date);
  const lieuxDe = (p) => { try { return JSON.parse(p.lieux || '[]'); } catch (e) { return []; } };
  function resumePointage(p) {
    if (!p) return '';
    if (p.statut === 'absent') return '<span class="pill grey">Absent</span> ' + esc(p.motif || '');
    return '<span class="ok-dot">✓</span> ' + lieuxDe(p).map((l) => esc(l.libelle || '') + (l.heures ? ' <span class="muted small">' + nb(Number(l.heures)) + ' h</span>' : '')).join(', ') + ' ' + pillZone(p.zone);
  }
  /** Chantiers prévus ce jour-là pour cette personne (planning) */
  function chantiersPrevus(email, date) {
    return S.data.dossiers.filter((d) => interventionsDe(d.id).some((x) =>
      String(x.techniciens || d.techniciens || '').split(',').indexOf(email) >= 0 && joursPeriode(x).some((j) => j.date === date)));
  }
  function lundiDe(iso) {
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    const n = (d.getDay() + 6) % 7;
    return addDays(iso, -n);
  }

  /** Tableau de bord : chantiers avec des messages non lus */
  function carteMessages() {
    const der = S.data.derniersMessages || {};
    const ids = Object.keys(S.data.nonLus || {}).filter((id) => parId(id))
      .sort((a, b) => ((der[b] || {}).date || '') < ((der[a] || {}).date || '') ? -1 : 1);
    if (!ids.length) return '<div class="card carte-messages vide" style="margin-top:16px"><h2>💬 Nouveaux messages</h2><p class="muted small" style="margin:0">Aucun nouveau message dans les chantiers.</p></div>';
    const lien = (id) => estAdmin() ? '#/dossier/' + id : '#/terrain/' + id;
    return '<div class="card carte-messages" style="margin-top:16px"><h2>💬 Nouveaux messages <span class="pill msg">' + totalNonLus() + '</span></h2><div class="list">' +
      ids.map((id) => {
        const m = der[id] || {};
        const apercu = m.texte ? esc(m.texte) + (m.texte.length >= 140 ? '…' : '') : m.photo ? '📷 Photo' : m.fichier ? '📎 ' + esc(m.fichier) : '';
        return '<a class="msg-ligne" href="' + lien(id) + '"><div class="msg-tete"><strong>' + esc(nomChantier(parId(id))) + '</strong>' + pillMessages(id) + '</div>' +
          (m.auteur ? '<div class="msg-apercu"><span class="muted">' + esc(m.auteur) + ' · ' + fr(m.date, true) + ' :</span> ' + apercu + '</div>' : '') + '</a>';
      }).join('') + '</div></div>';
  }

  function carteEquipeJour() {
    const t = today();
    const techs = techniciens();
    if (!techs.length) return '<div class="card"><h2>Équipe aujourd\'hui</h2><p class="muted small">Ajoutez les techniciens dans les réglages.</p></div>';
    const conges = (S.data.conges || []).filter((c) => c.statut === 'demande').length;
    return '<div class="card"><h2>Équipe aujourd\'hui <span><a class="btn ghost" href="#/equipe">Voir la semaine</a></span></h2><ul class="mini-list">' +
      techs.map((u) => {
        const p = pointageDe(u.email, t);
        const cg = congeDuJour(u.email, t);
        const prevus = chantiersPrevus(u.email, t);
        const etat = p ? resumePointage(p) : cg ? '<span class="pill grey">' + esc(cg.motif) + '</span>'
          : '<span class="muted">Pas encore déclaré</span>' + (prevus.length ? ' <span class="muted small">· prévu : ' + prevus.map((d) => esc(nomChantier(d))).join(', ') + '</span>' : '');
        return '<li><span><strong>' + esc(u.nom || u.email) + '</strong></span><span style="text-align:right">' + etat + '</span></li>';
      }).join('') + '</ul>' +
      (conges ? '<p style="margin:10px 0 0"><a href="#/conges">' + conges + ' demande(s) d\'absence à valider</a></p>' : '') + '</div>';
  }

  /** Ma journée : présence et lieux d'intervention (un administrateur peut saisir pour un technicien) */
  function vueJournee(dateParam, emailParam) {
    const t = today();
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= t ? dateParam : t;
    const email = estAdmin() && emailParam ? emailParam : moi();
    const pourAutre = email !== moi();
    const p = pointageDe(email, date);
    const cg = congeDuJour(email, date);
    const prevus = chantiersPrevus(email, date);
    const chantiers = S.data.dossiers.filter((d) => ouvert(d) && (['planifie', 'en_cours', 'termine'].indexOf(d.etape) >= 0 || d.dateDebut))
      .sort((a, b) => (nomChantier(a) < nomChantier(b) ? -1 : 1));
    // En tête : les chantiers inscrits dans l'agenda ce jour-là (les siens d'abord), puis ses autres chantiers, puis le reste
    const auJour = (d) => interventionsDe(d.id).some((x) => joursPeriode(x).some((j) => j.date === date));
    const aLui = (d) => (d.techniciens || '').split(',').indexOf(email) >= 0;
    const groupeAgenda = chantiers.filter(auJour).sort((a, b) => aLui(b) - aLui(a));
    const groupeMiens = chantiers.filter((d) => !auJour(d) && aLui(d));
    const groupeAutres = chantiers.filter((d) => !auJour(d) && !aLui(d));
    let lieux = p && p.statut === 'present' ? lieuxDe(p) : prevus.map((d) => ({ dossierId: d.id }));
    if (!lieux.length) lieux = [{ dossierId: '' }];
    const opt = (d, sel) => '<option value="' + d.id + '"' + (sel === d.id ? ' selected' : '') + '>' + esc(nomChantier(d)) + (d.lieu ? ' – ' + esc(d.lieu) : '') + '</option>';
    const groupe = (lib, liste, sel) => liste.length ? '<optgroup label="' + esc(lib) + '">' + liste.map((d) => opt(d, sel)).join('') + '</optgroup>' : '';
    const optionsChantier = (sel) => '<option value="">Choisir un chantier…</option>' +
      groupe('Dans l\'agenda le ' + fr(date), groupeAgenda, sel) +
      groupe(estAdmin() && email !== moi() ? 'Ses autres chantiers' : 'Mes autres chantiers', groupeMiens, sel) +
      groupe('Autres chantiers', groupeAutres, sel) +
      '<option value="__autre">Autre lieu (dépôt, fournisseur…)</option>';
    const ligneLieu = (l) => '<div class="lieu-ligne" data-lieu' + (l.lat && !l.dossierId ? ' data-lat="' + esc(l.lat) + '" data-lng="' + esc(l.lng) + '"' : '') + '>' +
      '<div><select name="lieu_chantier" aria-label="Chantier">' + optionsChantier(l.dossierId || (l.libelle ? '__autre' : '')) + '</select>' +
      '<input type="text" name="lieu_adresse" placeholder="Adresse ou commune du lieu" value="' + esc(!l.dossierId ? (l.libelle || '') : '') + '" style="margin-top:6px"' + (l.dossierId || !l.libelle ? ' hidden' : '') + '>' +
      '<div class="lieu-temps"><select name="lieu_temps" aria-label="Temps passé">' +
      [['journee', 'Toute la journée'], ['matin', 'Le matin'], ['apres_midi', 'L\'après-midi'], ['heures', 'Nombre d\'heures…']]
        .map((o) => '<option value="' + o[0] + '"' + ((l.temps || 'journee') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<input type="number" name="lieu_heures" min="0.5" max="14" step="0.5" inputmode="decimal" placeholder="Heures" value="' + esc(l.temps === 'heures' ? l.heures : '') + '"' + (l.temps === 'heures' ? '' : ' hidden') + ' aria-label="Nombre d\'heures"></div></div>' +
      '<button type="button" class="btn ghost danger" data-retirer-lieu aria-label="Retirer ce lieu">✕</button></div>';
    const hist = [];
    for (let i = 0; i < 14; i++) {
      const j = addDays(t, -i);
      const pj = pointageDe(email, j);
      const cj = congeDuJour(email, j);
      const js = new Date(j + 'T12:00:00').getDay();
      if (!pj && !cj && (js === 0 || js === 6)) continue;
      hist.push('<li><span>' + fr(j, true) + '</span><span style="text-align:right">' +
        (pj ? resumePointage(pj) : cj ? '<span class="pill grey">' + esc(cj.motif) + '</span>' : '<span class="ko-dot">Non déclaré</span>') +
        (j !== date ? ' <a class="btn ghost small" href="#/journee/' + j + (pourAutre ? '/' + encodeURIComponent(email) : '') + '">' + (pj ? 'Modifier' : 'Remplir') + '</a>' : '') + '</span></li>');
    }
    return (pourAutre ? '<a class="back" href="#/equipe">← Équipe</a>' : '') +
      '<div class="page-head"><div><h1>' + (pourAutre ? 'Journée de ' + esc(nomUser(email)) : 'Ma journée') + '</h1><p>' + fr(date, true) + (date === t ? ' · aujourd\'hui' : '') + '</p></div>' +
      '<div class="actions"><input type="date" id="j-date" value="' + date + '" max="' + t + '" aria-label="Choisir le jour"></div></div>' +
      (cg ? '<div class="note-orange">Absence validée ' + periodeConge(cg) + ' : ' + esc(cg.motif) + '.</div>' : '') +
      (p ? '<div class="card" style="margin-bottom:16px"><div class="recap-jour"><strong>Déjà enregistré :</strong> ' + resumePointage(p) +
        (p.distanceKm ? ' <span class="muted small">(' + String(p.distanceKm).replace('.', ',') + ' km à vol d\'oiseau)</span>' : '') + '</div></div>' : '') +
      '<form class="card" id="f-journee" data-date="' + date + '" data-email="' + esc(email) + '">' +
      '<div class="choix-jour" role="radiogroup" aria-label="Présence">' +
      '<label><input type="radio" name="statut" value="present"' + (!p || p.statut === 'present' ? ' checked' : '') + '><span>J\'étais présent</span></label>' +
      '<label><input type="radio" name="statut" value="absent"' + (p && p.statut === 'absent' ? ' checked' : '') + '><span>J\'étais absent</span></label></div>' +
      '<div data-pane="present"><div class="field"><span>Où es-tu intervenu ?</span>' +
      (prevus.length && !p ? '<small style="margin:-2px 0 8px">D\'après le planning : ' + prevus.map((d) => esc(nomChantier(d))).join(', ') + '.</small>' : '') +
      '<div class="lieux" data-lieux>' + lieux.map(ligneLieu).join('') + '</div>' +
      '<div class="actions"><button type="button" class="btn small" data-ajout-lieu>+ Un autre chantier</button>' +
      '<button type="button" class="btn small" data-ma-position>📍 Utiliser ma position actuelle</button></div>' +
      '<small style="margin-top:8px">Pour chaque lieu, indique le temps passé : ça sert à compter les heures de l\'équipe sur chaque chantier.</small></div></div>' +
      '<div data-pane="absent" hidden>' + champ('Motif', '<select name="motif">' + motifsAbsence().map((m) => '<option' + (p && p.motif === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>',
        'Pour des congés à venir, faites plutôt une <a href="#/conges">demande d\'absence</a>.') + '</div>' +
      champ('Commentaire (facultatif)', '<textarea name="commentaire" rows="2" placeholder="Une précision sur la journée…">' + esc(p ? p.commentaire : '') + '</textarea>') +
      '<template id="tpl-lieu">' + ligneLieu({ dossierId: '' }) + '</template>' +
      '<button class="btn primary big" type="submit">Enregistrer ma journée</button>' +
      '<p class="muted small" style="margin:10px 0 0">La distance est calculée à vol d\'oiseau depuis ' + esc(S.data.reglages.departNom || 'le point de départ') + '. Si tu passes sur plusieurs chantiers, la zone retenue est celle du plus éloigné.</p></form>' +
      '<div class="card"><h2>Mes 2 dernières semaines</h2><ul class="mini-list jours-liste">' + hist.join('') + '</ul></div>';
  }

  function brancherJournee() {
    const f = $('#f-journee');
    if (!f) return;
    $('#j-date').onchange = (ev) => {
      const v = ev.target.value;
      if (v) location.hash = '#/journee/' + v + (f.dataset.email !== moi() ? '/' + encodeURIComponent(f.dataset.email) : '');
    };
    const maj = () => {
      const st = f.querySelector('input[name=statut]:checked').value;
      f.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== st; });
    };
    f.querySelectorAll('input[name=statut]').forEach((r) => { r.onchange = maj; });
    maj();
    const zone = f.querySelector('[data-lieux]');
    zone.onchange = (ev) => {
      if (ev.target.name === 'lieu_temps') {
        const h = ev.target.closest('[data-lieu]').querySelector('[name=lieu_heures]');
        h.hidden = ev.target.value !== 'heures';
        if (!h.hidden) h.focus();
        return;
      }
      if (ev.target.name !== 'lieu_chantier') return;
      const l = ev.target.closest('[data-lieu]');
      const adr = l.querySelector('[name=lieu_adresse]');
      adr.hidden = ev.target.value !== '__autre';
      if (!adr.hidden) adr.focus();
      delete l.dataset.lat; delete l.dataset.lng;
    };
    zone.onclick = (ev) => {
      const b = ev.target.closest('[data-retirer-lieu]');
      if (b) { b.closest('[data-lieu]').remove(); if (!zone.children.length) zone.insertAdjacentHTML('beforeend', $('#tpl-lieu').innerHTML); }
    };
    // Deuxième lieu : on propose matin pour le premier et après-midi pour le second (modifiable)
    const ajouterLieu = () => {
      const avant = zone.querySelectorAll('[data-lieu]');
      zone.insertAdjacentHTML('beforeend', $('#tpl-lieu').innerHTML);
      if (avant.length === 1 && avant[0].querySelector('[name=lieu_temps]').value === 'journee') {
        avant[0].querySelector('[name=lieu_temps]').value = 'matin';
        zone.lastElementChild.querySelector('[name=lieu_temps]').value = 'apres_midi';
      }
      return zone.lastElementChild;
    };
    f.querySelector('[data-ajout-lieu]').onclick = () => ajouterLieu();
    f.querySelector('[data-ma-position]').onclick = () => essayer(async () => {
      const pos = await maPosition();
      const l = ajouterLieu();
      l.dataset.lat = pos.lat; l.dataset.lng = pos.lng;
      l.querySelector('[name=lieu_chantier]').value = '__autre';
      const adr = l.querySelector('[name=lieu_adresse]');
      adr.hidden = false; adr.value = 'Position du téléphone (' + new Date().toTimeString().slice(0, 5) + ')';
      toast('Position ajoutée');
    });
    f.onsubmit = (ev) => {
      ev.preventDefault();
      essayer(async () => {
        const st = f.querySelector('input[name=statut]:checked').value;
        const lieux = Array.from(zone.querySelectorAll('[data-lieu]')).map((l) => {
          const v = l.querySelector('[name=lieu_chantier]').value;
          const adr = l.querySelector('[name=lieu_adresse]').value.trim();
          const t = { temps: l.querySelector('[name=lieu_temps]').value, heures: l.querySelector('[name=lieu_heures]').value };
          if (t.temps === 'heures' && !(Number(String(t.heures).replace(',', '.')) > 0)) throw new Error('Indique le nombre d\'heures passées.');
          if (v && v !== '__autre') return Object.assign({ dossierId: v }, t);
          if (l.dataset.lat) return Object.assign({ libelle: adr || 'Position du téléphone', lat: l.dataset.lat, lng: l.dataset.lng }, t);
          if (adr) return Object.assign({ libelle: adr, adresse: adr }, t);
          return null;
        }).filter(Boolean);
        if (st === 'present' && !lieux.length) throw new Error('Choisis au moins un chantier ou indique un lieu.');
        const r = await agir('enregistrerPointage', {
          date: f.dataset.date, email: f.dataset.email, statut: st, lieux,
          motif: f.querySelector('[name=motif]').value, commentaire: f.querySelector('[name=commentaire]').value.trim()
        });
        const z = r && r.resultat;
        toast('Journée enregistrée' + (z && z.zone ? ' · ' + (z.zone === 'GD' ? 'grand déplacement' : 'zone ' + z.zone) : ''));
        await afficher();
      });
    };
  }

  /** Position du téléphone */
  function maPosition() {
    return new Promise((ok, ko) => {
      if (!navigator.geolocation) { ko(new Error('Ce téléphone ne donne pas sa position.')); return; }
      toast('Recherche de la position…');
      navigator.geolocation.getCurrentPosition(
        (p) => ok({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, precision: Math.round(p.coords.accuracy) }),
        (e) => ko(new Error(e.code === 1 ? 'Autorisez la localisation pour ce site dans les réglages du téléphone.' : 'Position introuvable. Réessayez dehors ou saisissez l\'adresse.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });
  }

  /** Congés et absences */
  function vueConges() {
    const admin = estAdmin();
    const tous = (S.data.conges || []).slice().sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1));
    const attente = tous.filter((c) => c.statut === 'demande').sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));
    const aVenir = tous.filter((c) => c.statut === 'accepte' && c.dateFin >= today()).sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));
    const ligneC = (c, actions) => '<div class="item"><div class="item-main"><span class="item-title">' + (admin ? esc(nomUser(c.email)) + ' · ' : '') + esc(c.motif) + '</span> ' + pillConge(c) +
      '<div class="item-meta"><span>' + periodeConge(c) + '</span><span>demandé le ' + fr(c.dateDemande) + '</span>' + (c.decidePar ? '<span>par ' + esc(c.decidePar) + '</span>' : '') + '</div>' +
      (c.commentaire ? '<div class="item-note">' + esc(c.commentaire) + '</div>' : '') +
      (c.reponse ? '<div class="item-note"><strong>Réponse :</strong> ' + esc(c.reponse) + '</div>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
    const phrase = S.data.reglages.phraseConges ? '<div class="note-orange">' + esc(S.data.reglages.phraseConges) + '</div>' : '';
    if (!admin) {
      return '<div class="page-head"><div><h1>Mes absences</h1><p>Congés, école, récupération… La demande part à l\'administrateur.</p></div>' +
        '<div class="actions"><button class="btn primary" data-act="demandeConge">+ Demander une absence</button></div></div>' + phrase +
        (tous.length ? '<div class="list">' + tous.map((c) => ligneC(c, c.statut === 'demande' ? '<button class="btn ghost danger" data-act="annulerConge" data-id="' + c.id + '">Retirer</button>' : '')).join('') + '</div>'
          : vide('Aucune demande pour l\'instant.'));
    }
    return '<div class="page-head"><div><h1>Congés et absences</h1><p>Demandes des techniciens et absences prévues.</p></div>' +
      '<div class="actions"><button class="btn" data-act="demandeConge" data-direct="1">+ Saisir une absence validée</button></div></div>' +
      '<h2 class="section-title" style="margin-top:0">À valider (' + attente.length + ')</h2>' +
      (attente.length ? '<div class="list">' + attente.map((c) => ligneC(c, '<button class="btn green" data-act="deciderConge" data-id="' + c.id + '" data-v="accepte">Accepter</button>' +
        '<button class="btn" data-act="deciderConge" data-id="' + c.id + '" data-v="refuse">Refuser</button>' + btnWhatsApp(c.email, 'Au sujet de ta demande d\'absence ' + periodeConge(c) + ' : '))).join('') + '</div>' : vide('Aucune demande en attente.')) +
      '<h2 class="section-title">Absences à venir (' + aVenir.length + ')</h2>' +
      (aVenir.length ? '<div class="list">' + aVenir.map((c) => ligneC(c, '<button class="btn ghost danger" data-act="annulerConge" data-id="' + c.id + '">Supprimer</button>')).join('') + '</div>' : vide('Aucune absence prévue.')) +
      '<h2 class="section-title">Historique</h2>' +
      (tous.filter((c) => aVenir.indexOf(c) < 0 && attente.indexOf(c) < 0).slice(0, 40).map((c) => ligneC(c, '')).join('') || vide('Rien pour l\'instant.'));
  }

  /** Trajets : relevé PDF par technicien et par période */
  function vueTrajets() {
    const t = today();
    const debutMois = t.slice(0, 8) + '01';
    const finMoisDernier = addDays(debutMois, -1);
    const debutMoisDernier = finMoisDernier.slice(0, 8) + '01';
    const admin = estAdmin();
    const moisCourant = (S.data.pointages || []).filter((p) => p.date >= debutMois && (admin || p.email === moi()));
    const parZone = {};
    moisCourant.forEach((p) => { if (p.statut === 'present' && p.zone) parZone[p.zone] = (parZone[p.zone] || 0) + 1; });
    const ordre = zonesTrajet().map((z) => z.nom).concat(['GD']);
    const zones = Object.keys(parZone).sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
    return '<div class="page-head"><div><h1>' + (admin ? 'Trajets' : 'Mes trajets') + '</h1><p>Relevé jour par jour, avec la distance à vol d\'oiseau depuis ' + esc(S.data.reglages.departNom || 'le point de départ') + ' et la zone.</p></div></div>' +
      '<form class="card" id="f-trajets">' +
      (admin ? champ('Technicien', '<select name="email"><option value="">Toute l\'équipe (un PDF, une page par personne)</option>' +
        techniciens().map((u) => '<option value="' + esc(u.email) + '">' + esc(u.nom || u.email) + '</option>').join('') + '</select>') : '') +
      '<div class="row2">' + champ('Du', input('du', debutMoisDernier, 'date')) + champ('Au', input('au', finMoisDernier, 'date', 'max="' + t + '"')) + '</div>' +
      '<div class="actions" style="margin-bottom:14px"><button type="button" class="btn small" data-periode="' + debutMoisDernier + '|' + finMoisDernier + '">Mois dernier</button>' +
      '<button type="button" class="btn small" data-periode="' + debutMois + '|' + t + '">Ce mois-ci</button>' +
      '<button type="button" class="btn small" data-periode="' + addDays(lundiDe(t), -7) + '|' + addDays(lundiDe(t), -1) + '">Semaine dernière</button></div>' +
      '<button class="btn primary" type="submit">Télécharger le PDF</button>' +
      '<p class="muted small" style="margin:10px 0 0">Le PDF peut être fait à tout moment. ' + (admin ? 'Une copie est rangée dans Google Drive, dossier « Trajets ».' : '') + '</p></form>' +
      '<div class="card"><h2>Ce mois-ci' + (admin ? ' (toute l\'équipe)' : '') + '</h2>' +
      (zones.length ? '<ul class="mini-list">' + zones.map((z) => '<li><span>' + esc(libZone(z)) + '</span><strong>' + parZone[z] + ' jour(s)</strong></li>').join('') + '</ul>'
        : '<p class="muted small" style="margin:0">Aucune journée déclarée ce mois-ci.</p>') + '</div>';
  }

  /** Équipe : présences de la semaine, technicien par technicien */
  function vueEquipe(semaine) {
    const t = today();
    const lundi = lundiDe(semaine && /^\d{4}-\d{2}-\d{2}$/.test(semaine) ? semaine : t);
    const jours = [0, 1, 2, 3, 4].map((i) => addDays(lundi, i));
    const techs = techniciens();
    const cell = (u, j) => {
      const p = pointageDe(u.email, j);
      const cg = congeDuJour(u.email, j);
      const lien = j <= t ? '<a class="small" href="#/journee/' + j + '/' + encodeURIComponent(u.email) + '">' + (p ? 'modifier' : 'remplir') + '</a>' : '';
      let html;
      if (p) html = resumePointage(p);
      else if (cg) html = '<span class="pill grey">' + esc(cg.motif) + '</span>';
      else if (j > t) html = chantiersPrevus(u.email, j).map((d) => '<span class="muted">' + esc(nomChantier(d)) + '</span>').join('<br>') || '';
      else html = '<span class="ko-dot">Non déclaré</span>';
      return '<td class="jour">' + html + (lien ? '<br>' + lien : '') + '</td>';
    };
    return '<div class="page-head"><div><h1>Équipe et présences</h1><p>Semaine du ' + fr(lundi, true) + '</p></div>' +
      '<div class="actions"><a class="btn" href="#/equipe/' + addDays(lundi, -7) + '">← Semaine précédente</a>' +
      (lundi < lundiDe(t) ? '<a class="btn" href="#/equipe/' + addDays(lundi, 7) + '">Semaine suivante →</a>' : '') +
      '<a class="btn" href="#/trajets">Trajets (PDF)</a></div></div>' +
      (techs.length ? '<div class="card" style="overflow-x:auto"><table class="equipe"><thead><tr><th>Technicien</th>' +
        jours.map((j) => '<th>' + fr(j, true) + '</th>').join('') + '</tr></thead><tbody>' +
        techs.map((u) => '<tr><td><strong>' + esc(u.nom || u.email) + '</strong><br>' + btnWhatsApp(u.email, 'Bonjour ' + prenom(u.email) + ', ') +
          (u.telephone ? '<a class="btn ghost small" href="tel:' + esc(u.telephone) + '">Appeler</a>' : '') + '</td>' + jours.map((j) => cell(u, j)).join('') + '</tr>').join('') +
        '</tbody></table></div>' : vide('Aucun technicien. Ajoutez-les dans les réglages, avec le rôle « Technicien ».')) +
      '<p class="muted small">Le rappel « présence » part chaque jour ouvré à ' + esc((mailCfg('presence').heure || '15')) + ' h aux techniciens qui n\'ont pas encore rempli leur journée (sauf s\'ils sont en congé).</p>';
  }

  /** Recherche dans l'agenda Google avec plusieurs mots */
  function vueAgenda() {
    return '<div class="page-head"><div><h1>Chercher dans l\'agenda</h1><p>Plusieurs mots possibles : tous doivent se trouver dans le titre, les notes ou le lieu du rendez-vous.</p></div></div>' +
      '<form class="card" id="f-agenda">' + champ('Mots à chercher', input('mots', S.agendaMots || '', 'search', 'placeholder="ex. : devis dupont narrosse" autocomplete="off"')) +
      '<div class="row2">' + champ('Du', input('du', addDays(today(), -180), 'date')) + champ('Au', input('au', addDays(today(), 180), 'date')) + '</div>' +
      '<button class="btn primary" type="submit">Chercher</button></form>' +
      '<div id="agenda-res" class="agenda-res" style="margin-top:16px"></div>';
  }
  function afficherResultatsAgenda(res) {
    const box = $('#agenda-res');
    if (!box) return;
    box.innerHTML = res.length ? '<h2 class="section-title" style="margin-top:0">' + res.length + ' rendez-vous trouvé' + (res.length > 1 ? 's' : '') + '</h2><div class="list">' +
      res.map((r) => '<div class="item"><div class="item-main"><span class="item-title">' + esc(r.titre || '(sans titre)') + '</span>' +
        '<div class="item-meta"><span>' + fr(r.date, true) + (r.heure ? ' à ' + r.heure.replace(':', 'h') : '') + '</span>' + (r.lieu ? '<span>' + esc(r.lieu) + '</span>' : '') + '</div>' +
        (r.description ? '<div class="item-note">' + esc(r.description) + '</div>' : '') + '</div>' +
        '<div class="actions">' + (r.dossierId ? '<a class="btn" href="#/dossier/' + r.dossierId + '">Ouvrir le dossier</a>'
          : '<button class="btn primary" data-act="dossierAgenda" data-key="' + esc(r.key) + '">Créer un dossier</button>') + '</div></div>').join('') + '</div>'
      : vide('Aucun rendez-vous ne contient tous ces mots.');
  }

  /* ================================================================
   * APPLI SUR LE TÉLÉPHONE : INSTALLATION ET NOTIFICATIONS
   * ================================================================ */
  // CFG (réglages de config.js) est déjà défini en haut du fichier
  const fbConfigOk = () => !!(CFG.FIREBASE && CFG.FIREBASE.apiKey && String(CFG.FIREBASE.apiKey).indexOf('A_REMPLIR') < 0 && CFG.VAPID_KEY && CFG.VAPID_KEY.indexOf('A_REMPLIR') < 0);
  const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const estInstalle = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const pushPossible = () => 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  let installDiffere = null; // Android : proposition d'installation gardée pour le bouton « Installer »
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installDiffere = e; });

  function nomAppareil() {
    const ua = navigator.userAgent;
    const os = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) || (estIOS() && !/iphone/i.test(ua)) ? 'iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'PC Windows' : /mac/i.test(ua) ? 'Mac' : 'Appareil';
    const nav = /edg\//i.test(ua) ? 'Edge' : /crios|chrome/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : '';
    return os + (nav ? ' · ' + nav : '') + (estInstalle() ? ' (appli)' : '');
  }

  /** État des notifications sur CET appareil */
  function etatNotif() {
    if (!fbConfigOk() || S.data.reglages.firebaseOk !== 'oui') return 'non_regle';
    if (estIOS() && !estInstalle()) return 'ios_installer';
    if (!pushPossible()) return 'impossible';
    if (Notification.permission === 'denied') return 'refuse';
    const jeton = lire('eh_push_jeton');
    if (Notification.permission === 'granted' && jeton && (S.data.mesAppareils || []).some((a) => jeton.slice(-12) === a.fin)) return 'actif';
    return 'inactif';
  }

  async function enregistrerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('/sw.js'); } catch (e) { return null; }
  }

  function messaging() {
    if (!window.firebase || !fbConfigOk()) throw new Error('Les notifications ne sont pas encore réglées (fichier config.js).');
    if (!window.firebase.apps.length) window.firebase.initializeApp(CFG.FIREBASE);
    return window.firebase.messaging();
  }

  /** Bouton « Activer les notifications » (doit venir d'un appui : exigé par l'iPhone) */
  async function activerNotifs() {
    const etat = etatNotif();
    if (etat === 'ios_installer') throw new Error('Sur iPhone, installez d\'abord l\'appli sur l\'écran d\'accueil (voir les étapes), puis ouvrez-la depuis son icône.');
    if (etat === 'non_regle') throw new Error('Les notifications ne sont pas encore réglées par l\'administrateur.');
    if (etat === 'impossible') throw new Error('Ce navigateur ne sait pas recevoir de notifications. Sur Android, utilisez Chrome.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications refusées. Pour les autoriser, allez dans les réglages du téléphone (ou du navigateur) pour ce site.');
    const reg = (await enregistrerSW()) || (await navigator.serviceWorker.ready);
    const jeton = await messaging().getToken({ vapidKey: CFG.VAPID_KEY, serviceWorkerRegistration: reg });
    if (!jeton) throw new Error('Le téléphone n\'a pas donné de jeton de notification. Réessayez.');
    await agir('enregistrerAppareil', { jeton, appareil: nomAppareil() }, 'Notifications activées sur cet appareil');
    stocker('eh_push_jeton', jeton);
    await afficher();
  }

  async function desactiverNotifs() {
    const jeton = lire('eh_push_jeton');
    try { await messaging().deleteToken(); } catch (e) { /* déjà retiré */ }
    if (jeton) await agir('supprimerAppareil', { jeton }, 'Notifications arrêtées sur cet appareil');
    stocker('eh_push_jeton', null);
    await afficher();
  }

  /** Au démarrage : programme d'arrière-plan, jeton à jour, messages reçus appli ouverte */
  async function preparerTelephone() {
    const reg = await enregistrerSW();
    if (!reg || !fbConfigOk() || !window.firebase || Notification.permission !== 'granted' || S.data.reglages.firebaseOk !== 'oui') return;
    try {
      const m = messaging();
      const jeton = await m.getToken({ vapidKey: CFG.VAPID_KEY, serviceWorkerRegistration: reg });
      const connu = (S.data.mesAppareils || []).some((a) => jeton && jeton.slice(-12) === a.fin);
      if (jeton && (!connu || jeton !== lire('eh_push_jeton'))) {
        await api('enregistrerAppareil', { jeton, appareil: nomAppareil() });
        stocker('eh_push_jeton', jeton);
      }
      // Appli ouverte : pas de notification système, un message dans l'appli et les pastilles à jour
      m.onMessage((p) => {
        const n = p.notification || {};
        toast('🔔 ' + (n.title || 'Nouvelle notification'));
        rafraichirPastilles();
      });
    } catch (e) { /* on réessaiera au prochain démarrage */ }
  }
  // Toucher une notification alors que l'appli est déjà ouverte
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'ouvrir') location.href = ev.data.url;
    });
  }

  /** Carte du tableau de bord tant que les notifications ne sont pas actives sur cet appareil */
  function carteNotifs() {
    const e = etatNotif();
    if (e === 'actif' || e === 'non_regle' || lire('eh_notif_plus_tard') === today()) return '';
    const txt = {
      inactif: 'Recevez une notification sur ce téléphone pour chaque nouveau message, demande ou rappel.',
      ios_installer: 'Pour recevoir les notifications sur iPhone, installez d\'abord l\'appli sur l\'écran d\'accueil.',
      refuse: 'Les notifications sont bloquées pour ce site sur cet appareil.',
      impossible: 'Ce navigateur ne reçoit pas les notifications. Sur Android, ouvrez l\'appli avec Chrome.'
    }[e];
    return '<div class="card carte-notif" style="margin-bottom:16px"><div class="carte-notif-corps"><span class="carte-notif-icone">🔔</span><div><strong>Notifications</strong><p class="small" style="margin:2px 0 0">' + txt + '</p></div></div>' +
      '<div class="actions">' + (e === 'inactif' ? '<button class="btn orange" data-act="activerNotifs">Activer</button>' : '<a class="btn" href="#/notifications">Voir comment faire</a>') +
      '<button class="btn ghost" data-act="notifPlusTard">Plus tard</button></div></div>';
  }

  /** Page « Notifications » : état sur cet appareil, appareils activés, installation pas à pas */
  function vueNotifications() {
    const e = etatNotif();
    const mes = S.data.mesAppareils || [];
    const fin = (lire('eh_push_jeton') || '').slice(-12);
    const etat = {
      actif: ['green', 'Activées sur cet appareil'], inactif: ['grey', 'Pas encore activées sur cet appareil'],
      ios_installer: ['amber', 'Installez d\'abord l\'appli sur l\'écran d\'accueil'], refuse: ['red', 'Bloquées dans les réglages de l\'appareil'],
      impossible: ['red', 'Ce navigateur ne les reçoit pas'], non_regle: ['amber', 'Pas encore réglées par l\'administrateur']
    }[e];
    const etape = (n, t) => '<li><span class="num">' + n + '</span><span>' + t + '</span></li>';
    return '<div class="page-head"><div><h1>Notifications</h1><p>Recevoir sur le téléphone les nouveaux messages, demandes et rappels, même appli fermée.</p></div></div>' +
      '<div class="card"><h2>Sur cet appareil</h2><p><span class="pill ' + etat[0] + '">' + etat[1] + '</span> <span class="muted small">' + esc(nomAppareil()) + '</span></p>' +
      '<div class="actions">' +
      (e === 'inactif' ? '<button class="btn orange" data-act="activerNotifs">Activer les notifications</button>' : '') +
      (e === 'actif' ? '<button class="btn" data-act="pushTest">M\'envoyer une notification d\'essai</button><button class="btn ghost danger" data-act="desactiverNotifs">Arrêter sur cet appareil</button>' : '') +
      (installDiffere && !estInstalle() ? '<button class="btn" data-act="installerAppli">📲 Installer l\'appli</button>' : '') + '</div>' +
      (e === 'refuse' ? '<p class="small" style="margin-bottom:0">Pour débloquer : réglages du téléphone → Notifications (iPhone : Réglages → Notifications → Elec Habitat ; Android : Chrome → ⋮ → Paramètres → Notifications), puis revenez ici.</p>' : '') +
      '</div>' +
      '<div class="card"><h2>Installer l\'appli sur le téléphone</h2>' +
      '<h3 class="h3-etapes">iPhone (Safari)</h3><ol class="etapes">' +
      etape(1, 'Ouvrez <strong>' + esc(location.host) + '</strong> dans <strong>Safari</strong>.') +
      etape(2, 'Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).') +
      etape(3, 'Choisissez <strong>« Sur l\'écran d\'accueil »</strong>, puis <strong>Ajouter</strong>.') +
      etape(4, 'Ouvrez l\'appli <strong>depuis la nouvelle icône</strong> Elec Habitat, connectez-vous, puis touchez <strong>Activer les notifications</strong>.') + '</ol>' +
      '<p class="small muted">Il faut iOS 16.4 ou plus récent. Sur iPhone, les notifications ne marchent que dans l\'appli installée, pas dans Safari.</p>' +
      '<h3 class="h3-etapes">Android (Chrome)</h3><ol class="etapes">' +
      etape(1, 'Ouvrez <strong>' + esc(location.host) + '</strong> dans <strong>Chrome</strong>.') +
      etape(2, 'Menu <strong>⋮</strong> en haut à droite, puis <strong>« Installer l\'application »</strong> (ou « Ajouter à l\'écran d\'accueil »).') +
      etape(3, 'Ouvrez l\'appli depuis son icône, puis touchez <strong>Activer les notifications</strong> et acceptez.') + '</ol></div>' +
      '<div class="card"><h2>Mes appareils qui reçoivent les notifications</h2>' +
      (mes.length ? '<ul class="mini-list">' + mes.map((a) => '<li><span>' + esc(a.appareil) + (a.fin === fin ? ' <span class="pill green">cet appareil</span>' : '') +
        '<br><span class="muted small">depuis le ' + fr(String(a.creeLe).slice(0, 10)) + '</span></span><button class="btn ghost small danger" data-act="retirerAppareil" data-id="' + esc(a.id) + '">Retirer</button></li>').join('') + '</ul>'
        : '<p class="muted small" style="margin:0">Aucun appareil pour l\'instant.</p>') + '</div>';
  }

  /* ================================================================
   * RÉGLAGES
   * ================================================================ */
  const LIB_DELAI = {
    livraison: 'Prévenir combien de jours avant la livraison (0 = le jour même)',
    reception: 'Premier rappel, en jours après la date de livraison prévue (0 = le jour même)',
    devis_a_faire: 'Premier rappel, en jours après le rendez-vous',
    relance_client: 'Délai par défaut, en jours après l\'envoi du devis',
    commande_materiel: 'Premier rappel, en jours après la validation du devis',
    materiel_demande: 'Relance, en jours après la demande, tant que ce n\'est pas commandé',
    facture_inter: 'Premier rappel, en jours après la demande (0 = le jour même)',
    a_facturer: 'Premier rappel, en jours après la fin du chantier (0 = le jour même)'
  };
  const AIDE_MAIL = {
    reception: 'Envoyé quand la réception n\'est pas validée à la date de livraison prévue, puis selon le rythme, tant qu\'elle n\'est pas « conforme ».',
    reception_nc: 'Envoyé tout de suite quand une livraison est déclarée non conforme.',
    pv_reserves: 'Envoyé tout de suite quand un PV avec réserves est enregistré. Le PV et les photos sont joints.',
    a_facturer: 'Envoyé tout de suite quand le chantier est terminé, puis relancé selon le rythme. Les documents du PV sont joints.',
    nouvelle_commande: 'Envoyé tout de suite quand un devis est validé.',
    livraison: 'Envoyé une seule fois par livraison, le nombre de jours choisi avant la date prévue.',
    recap: 'Un seul mail qui liste tout ce qui reste à faire.',
    facture_inter: 'Envoyé tout de suite à la demande du technicien, puis relancé selon le rythme.',
    materiel_demande: 'Envoyé tout de suite quand un technicien appuie sur « Matériel à commander », puis relancé tant que la commande n\'est pas indiquée.',
    avancement: 'Un mail qui montre où en est chaque chantier en cours : pourcentage, techniciens, dernier message, matériel en attente.',
    presence: 'Envoyé à chaque technicien qui n\'a pas encore rempli sa journée. Pas d\'envoi s\'il est en congé ou en absence validée ce jour-là.',
    conge_demande: 'Envoyé tout de suite quand un technicien demande une absence.',
    conge_reponse: 'Envoyé au technicien quand sa demande est acceptée ou refusée. La phrase sur le solde CI BTP peut être ajoutée avec {phrase_conges}.',
    nouveau_message: 'Envoyé quand quelqu\'un écrit, envoie une photo ou un document dans la discussion d\'un chantier. Les administrateurs sont toujours prévenus ; cochez la case du bas pour prévenir aussi les techniciens du chantier et ceux qui ont déjà participé à la discussion. L\'auteur du message ne reçoit rien, et chacun reçoit au plus un mail par chantier toutes les 15 minutes (la pastille de l\'appli compte tous les messages).',
    agenda_modifie: 'Envoyé quand une intervention a été déplacée ou supprimée directement dans Google Agenda (l\'appli se met à jour toute seule).'
  };
  const MAILS_IMMEDIATS = ['nouvelle_commande', 'reception_nc', 'pv_reserves', 'conge_demande', 'conge_reponse', 'agenda_modifie', 'nouveau_message'];
  const MAILS_VERS_TECHNICIEN = ['presence', 'conge_reponse'];
  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function vueReglages() {
    const r = S.data.reglages;
    const opt = (v, cur, label) => '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>';
    const heures = (cur) => Array.from({ length: 24 }, (_, h) => opt(h, cur, h + ' h')).join('');
    const smsOk = r.smsActif === 'oui';

    const mails = S.data.mails.map((m) => {
      const jours = String(m.jours || '').split(',');
      const k = m.cle;
      const immediat = MAILS_IMMEDIATS.indexOf(k) >= 0;
      const avecDelai = !!LIB_DELAI[k];
      const avecRythme = !immediat && ['livraison', 'recap', 'avancement', 'presence'].indexOf(k) < 0;
      const avecHoraire = !immediat;
      const avecCopie = ['pv_reserves', 'reception_nc', 'a_facturer', 'facture_inter', 'nouveau_message'].indexOf(k) >= 0;
      const versTech = MAILS_VERS_TECHNICIEN.indexOf(k) >= 0;
      const resume = m.active === 'oui'
        ? (avecHoraire ? jours.filter(Boolean).map((j) => LETTRES[Number(j) - 1]).join(' ') + ' à ' + m.heure + ' h' : 'immédiat') + (m.sms === 'oui' && smsOk ? ' + SMS' : '')
        : 'désactivé';
      return '<details class="mail" data-mail="' + k + '"><summary>' + esc(m.nom) + '<span class="sum-info">' + esc(resume) + '</span></summary><div class="mail-body">' +
        (AIDE_MAIL[k] ? '<p class="muted small">' + AIDE_MAIL[k] + '</p>' : '') +
        '<label class="check" style="margin:8px 0 14px"><input type="checkbox" name="active"' + (m.active === 'oui' ? ' checked' : '') + '> Mail actif</label>' +
        (versTech ? '<input type="hidden" name="destinataires" value=""><p class="small muted">Envoyé directement au technicien concerné.</p>'
          : '<label class="field"><span>Envoyer à</span><input type="text" name="destinataires" value="' + esc(m.destinataires) + '" placeholder="' + esc(r.emailContact || '') + '">' +
            '<small>' + (k === 'nouveau_message' ? 'Adresses à prévenir en plus des administrateurs (facultatif).' : 'Une ou plusieurs adresses séparées par une virgule. Vide = adresse contact.') + '</small></label>') +
        (avecDelai || avecRythme ? '<div class="row2">' +
          (avecDelai ? '<label class="field"><span>' + LIB_DELAI[k] + '</span><input type="number" min="0" name="delaiJours" value="' + esc(m.delaiJours) + '"></label>' : '<div></div>') +
          (avecRythme ? '<label class="field"><span>Puis tous les … jours, tant que rien n\'est fait</span><input type="number" min="1" name="rythmeJours" value="' + esc(m.rythmeJours) + '"></label>' : '') +
          '</div>' : '') +
        (avecHoraire ? '<div class="row2"><div class="field"><span>Jours d\'envoi</span><div class="days">' + LETTRES.map((l, i) =>
          '<label><input type="checkbox" name="jour" value="' + (i + 1) + '"' + (jours.indexOf(String(i + 1)) >= 0 ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>' +
          '<label class="field"><span>Heure d\'envoi</span><select name="heure">' + heures(m.heure) + '</select><small>Le mail part dans l\'heure choisie.</small></label></div>' : '') +
        '<label class="field"><span>Objet du mail</span><input type="text" name="objet" value="' + esc(m.objet) + '"></label>' +
        '<label class="field"><span>Texte du mail</span><textarea name="texte" rows="5">' + esc(m.texte) + '</textarea></label>' +
        (avecCopie ? '<label class="check" style="margin:-4px 0 10px"><input type="checkbox" name="copieTechniciens"' + (m.copieTechniciens === 'oui' ? ' checked' : '') + '> Envoyer aussi aux techniciens du chantier</label>' : '') +
        '<label class="check" style="margin:0 0 6px"><input type="checkbox" name="push"' + (m.push !== 'non' ? ' checked' : '') + '> Envoyer aussi une notification sur le téléphone' +
        (S.data.reglages.firebaseOk === 'oui' ? '' : ' <span class="muted small">(notifications pas encore réglées)</span>') + '</label>' +
        '<label class="check" style="margin:0 0 14px"><input type="checkbox" name="sms"' + (m.sms === 'oui' ? ' checked' : '') + '> Envoyer aussi un SMS' +
        (smsOk ? ' <span class="muted small">(aux personnes qui ont un téléphone et « SMS » coché)</span>' : ' <span class="muted small">(SMS non activés, voir plus bas)</span>') + '</label>' +
        '<button type="button" class="btn" data-act="mailTest" data-cle="' + k + '">M\'envoyer un essai</button>' +
        '</div></details>';
    }).join('');

    const users = S.data.users.map((u, i) => ligneUser(u, i)).join('');
    return '<div class="page-head"><div><h1>Réglages</h1><p>Tout ce que l\'entreprise peut adapter sans toucher au code.</p></div></div>' +
      '<form class="card" id="f-reglages"><h2>Entreprise et agenda</h2>' +
      '<div class="row2"><label class="field"><span>Nom de l\'entreprise</span><input type="text" name="entreprise" value="' + esc(r.entreprise) + '"></label>' +
      '<label class="field"><span>Adresse contact</span><input type="email" name="emailContact" value="' + esc(r.emailContact) + '"><small>Reçoit les mails quand aucune adresse n\'est précisée.</small></label></div>' +
      '<label class="field"><span>Mots-clés à repérer dans l\'agenda</span><input type="text" name="motsCles" value="' + esc(r.motsCles) + '">' +
      '<small>Séparés par une virgule : un rendez-vous qui contient l\'un d\'eux devient un dossier. Cherchés dans le titre et les notes, sans tenir compte des majuscules ni des accents.</small></label>' +
      '<label class="field"><span>Motifs de refus proposés</span><input type="text" name="motifsRefus" value="' + esc(r.motifsRefus) + '"><small>Séparés par une virgule.</small></label>' +
      '<div class="row3"><label class="field"><span>Lecture automatique de l\'agenda</span><select name="agendaActif">' + opt('oui', r.agendaActif, 'Oui, toutes les heures') + opt('non', r.agendaActif, 'Non') + '</select></label>' +
      '<label class="field"><span>Regarder en arrière (jours)</span><input type="number" min="1" name="joursAgendaPasse" value="' + esc(r.joursAgendaPasse) + '"></label>' +
      '<label class="field"><span>Regarder en avant (jours)</span><input type="number" min="1" name="joursAgendaFutur" value="' + esc(r.joursAgendaFutur) + '"></label></div>' +
      '<div class="field"><span>Horaires des interventions (écrites dans l\'agenda)</span><div class="row2">' +
      '<label class="field"><span class="small muted" style="font-weight:400">Matin</span><div class="actions"><input type="time" name="matinDebut" value="' + esc(r.matinDebut || '08:00') + '"> à <input type="time" name="matinFin" value="' + esc(r.matinFin || '12:00') + '"></div></label>' +
      '<label class="field"><span class="small muted" style="font-weight:400">Après-midi</span><div class="actions"><input type="time" name="apremDebut" value="' + esc(r.apremDebut || '13:30') + '"> à <input type="time" name="apremFin" value="' + esc(r.apremFin || '17:30') + '"></div></label>' +
      '</div><small>Une journée va du début du matin à la fin de l\'après-midi. Si une intervention est déplacée dans Google Agenda, l\'appli se met à jour dans l\'heure.</small></div>' +
      '<label class="field"><span>Jours non travaillés</span><input type="text" name="joursNonTravailles" value="' + esc(r.joursNonTravailles || '') + '" placeholder="Ex. : 2026-12-24/2027-01-02, 2027-05-07">' +
      '<small>En plus des week-ends et des jours fériés (comptés automatiquement). Dates au format AAAA-MM-JJ, ou périodes AAAA-MM-JJ/AAAA-MM-JJ, séparées par une virgule. Ils ne sont pas comptés dans le temps passé sur les chantiers.</small></label>' +
      '<label class="field"><span>Identifiant de l\'agenda</span><input type="text" name="agendaId" value="' + esc(r.agendaId) + '" placeholder="Vide = agenda principal du compte de l\'entreprise"></label>' +

      '<h2 style="margin-top:14px">Trajets</h2>' +
      '<div class="row2"><label class="field"><span>Nom du point de départ</span><input type="text" name="departNom" value="' + esc(r.departNom) + '"><small>Affiché dans l\'appli et sur les PDF.</small></label>' +
      '<label class="field"><span>Adresse du point de départ</span><input type="text" name="departAdresse" value="' + esc(r.departAdresse) + '">' +
      '<small>Position actuelle : ' + esc(r.departLat) + ', ' + esc(r.departLng) + ' (retrouvée à partir de l\'adresse).</small></label></div>' +
      '<label class="field"><span>Zones de trajet</span><input type="text" name="zones" value="' + esc(r.zones) + '">' +
      '<small>Sous la forme <code>nom:km maximum</code>, séparés par des virgules. Actuellement : ' + zonesTrajet().map((z) => esc(libZone(z.nom))).join(' · ') + ' · au-delà : grand déplacement.</small>' +
      '<small>Distances à vol d\'oiseau depuis le point de départ. Exemple : 1A:5,1B:10,2:20 donne la zone 1A jusqu\'à 5 km, 1B de 5 à 10 km, 2 de 10 à 20 km.</small></label>' +

      '<h2 style="margin-top:14px">Documents</h2>' +
      '<label class="field"><span>Types de documents</span><input type="text" name="typesDocs" value="' + esc(r.typesDocs) + '">' +
      '<small>Sous la forme <code>clé:Libellé</code>, séparés par une virgule. Ne changez pas une clé déjà utilisée.</small></label>' +
      '<p class="muted small" style="margin-top:-6px">Qui voit quoi : réglez-le technicien par technicien dans « Accès aux dossiers de documents », plus bas.</p>' +

      '<h2 style="margin-top:14px">Congés et absences</h2>' +
      '<label class="field"><span>Motifs d\'absence</span><input type="text" name="motifsAbsence" value="' + esc(r.motifsAbsence) + '"><small>Séparés par une virgule.</small></label>' +
      '<label class="field"><span>Phrase de rappel</span><input type="text" name="phraseConges" value="' + esc(r.phraseConges) + '"><small>Affichée aux techniciens quand ils font une demande, et ajoutée au mail de réponse.</small></label>' +
      '<label class="field"><span>Absences validées dans l\'agenda</span><select name="congesAgenda">' + opt('oui', r.congesAgenda, 'Oui, en événement « journée entière »') + opt('non', r.congesAgenda, 'Non') + '</select></label>' +

      '<h2 style="margin-top:14px">SMS (facultatif)</h2>' +
      '<p class="muted small" style="margin-top:0">Pour prévenir aussi par SMS, en plus du mail. Il faut un compte Brevo (quelques centimes par SMS). Sans compte, les boutons WhatsApp de l\'appli restent disponibles : ils ouvrent WhatsApp avec le message prêt, l\'envoi se fait à la main.</p>' +
      '<div class="row3"><label class="field"><span>SMS</span><select name="smsActif">' + opt('non', r.smsActif, 'Désactivés') + opt('oui', r.smsActif, 'Activés') + '</select></label>' +
      '<label class="field"><span>Clé API Brevo</span><input type="password" name="smsCle" value="" placeholder="' + (r.smsCleOk === 'oui' ? 'Clé enregistrée (laisser vide pour la garder)' : 'xkeysib-…') + '" autocomplete="off"></label>' +
      '<label class="field"><span>Nom d\'expéditeur</span><input type="text" name="smsExpediteur" value="' + esc(r.smsExpediteur) + '" maxlength="11"><small>11 caractères, sans espace.</small></label></div>' +
      '<div class="actions" style="margin-bottom:14px"><button type="button" class="btn" data-act="smsTest">M\'envoyer un SMS d\'essai</button></div>' +

      '<h2 style="margin-top:14px">Mode test</h2>' +
      '<div class="row2"><label class="field"><span>Mode test</span><select name="modeTest">' + opt('oui', r.modeTest, 'Activé') + opt('non', r.modeTest, 'Désactivé (utilisation réelle)') + '</select>' +
      '<small>En mode test, tous les mails vont à l\'adresse de test, aucun SMS ne part et l\'agenda n\'est pas lu automatiquement.</small></label>' +
      '<label class="field"><span>Adresse de test</span><input type="email" name="emailTest" value="' + esc(r.emailTest) + '"></label></div>' +
      '<button class="btn primary" type="submit">Enregistrer</button></form>' +

      '<div class="card"><h2>Notifications sur les téléphones</h2>' +
      '<p class="muted small" style="margin-top:0">Chaque mail envoyé par l\'appli part aussi en notification sur les téléphones où la personne a activé les notifications (page « 🔔 Notifications »). ' +
      'Il faut un projet Firebase (gratuit) : suivez le guide fourni, puis collez ici le contenu du fichier de clé (compte de service).</p>' +
      '<p>' + (S.data.reglages.firebaseOk === 'oui' ? '<span class="pill green">Réglées</span> projet <strong>' + esc(S.data.reglages.firebaseProjet) + '</strong>'
        : '<span class="pill amber">Pas encore réglées</span>') +
      ((window.SUIVI_CONFIG || {}).FIREBASE && String(((window.SUIVI_CONFIG || {}).FIREBASE || {}).apiKey || '').indexOf('A_REMPLIR') < 0 ? '' : ' <span class="pill red">config.js : partie FIREBASE à remplir</span>') + '</p>' +
      '<label class="field"><span>Clé du compte de service Firebase (contenu du fichier .json)</span>' +
      '<textarea id="fcm-json" rows="4" placeholder="{ &quot;type&quot;: &quot;service_account&quot;, &quot;project_id&quot;: … }" autocomplete="off" spellcheck="false"></textarea>' +
      '<small>La clé est gardée dans le programme Google, jamais dans le tableur ni dans les écrans. Laissez vide pour garder la clé actuelle.</small></label>' +
      '<div class="actions"><button class="btn primary" data-act="saveFirebase">Enregistrer la clé</button>' +
      (S.data.reglages.firebaseOk === 'oui' ? '<button class="btn ghost danger" data-act="retirerFirebase">Retirer la clé</button><a class="btn" href="#/notifications">Tester sur cet appareil</a>' : '') + '</div></div>' +
      '<div class="card"><h2>Mails, notifications et SMS</h2>' +
      '<div class="help">Dans l\'objet et le texte, ces mots entre accolades sont remplacés automatiquement : ' +
      ['client', 'numero_devis', 'date_rdv', 'numero_commande', 'date_validation', 'chantier', 'lieu', 'zone', 'fournisseur', 'date_livraison', 'quand', 'reception', 'receptionne_par', 'numero_bl',
        'pv', 'reserves', 'avancement', 'pourcentage', 'commentaire', 'prochaine_relance', 'demande_par', 'liste_materiel', 'prenom', 'date', 'technicien', 'motif', 'periode',
        'decision', 'reponse', 'phrase_conges', 'changement', 'auteur', 'message', 'entreprise']
        .map((x) => '<code>{' + x + '}</code>').join(' ') + '. Un bouton vers l\'appli est ajouté en bas de chaque mail.</div>' +
      mails + '<button class="btn primary" data-act="saveMails" style="margin-top:6px">Enregistrer les mails</button></div>' +

      blocAccesDocs() +
      '<div class="card"><h2>Utilisateurs</h2><p class="muted small" style="margin-top:0">Seules ces adresses Google peuvent se connecter. ' +
      '<strong>Administrateur</strong> : accès à tout. <strong>Technicien</strong> : les chantiers (sans pouvoir en créer), la discussion, le matériel, et ses propres présences, trajets et absences.</p>' +
      '<div style="overflow-x:auto"><table class="users"><thead><tr><th>Adresse Gmail</th><th>Nom</th><th>Rôle</th><th>Téléphone</th><th>SMS</th><th title="Appareils qui reçoivent les notifications">🔔</th><th>Actif</th><th></th></tr></thead><tbody id="users-body">' + users + '</tbody></table></div>' +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="addUser">+ Ajouter une personne</button><button class="btn primary" data-act="saveUsers">Enregistrer les utilisateurs</button></div></div>' +

      '<div class="card"><h2>Données de démonstration</h2><p class="muted small" style="margin-top:0">Neuf dossiers fictifs à toutes les étapes, avec quelques présences et absences pour les deux premiers techniciens. Ils sont marqués « démo » et se suppriment d\'un clic sans toucher aux vraies données.</p>' +
      '<div class="actions"><button class="btn" data-act="demoCharger">Charger la démo</button><button class="btn danger" data-act="demoSupprimer">Supprimer la démo</button></div></div>' +

      blocKraaft();
  }

  /** Reprise Kraaft : reprend dans un dossier la discussion et les documents d'une conversation Kraaft */
  function blocKraaft() {
    const ds = S.data.dossiers.filter((d) => d.demo !== 'oui').slice()
      .sort((a, b) => sansAccent(nomClient(a)).localeCompare(sansAccent(nomClient(b))));
    return '<div class="card"><h2>Reprise Kraaft</h2><p class="muted small" style="margin-top:0">Reprend dans un dossier tout le contenu d\'une conversation Kraaft : ' +
      'les messages, photos et fichiers de la discussion (avec leur auteur et leur date d\'origine, marqués « (Kraaft) ») et les documents classés (Plans, DICT, Arrêtés…). ' +
      'Les fichiers sont téléchargés depuis Kraaft et rangés dans le dossier Google Drive du chantier. Relancer la reprise ne crée pas de doublon.</p>' +
      '<label class="field"><span>Fichier de reprise Kraaft (.json)</span><input type="file" id="kraaft-fichier" accept=".json,application/json"></label>' +
      '<label class="field"><span>Dossier de l\'appli à compléter</span><select id="kraaft-dossier"><option value="">Choisir un dossier…</option>' +
      ds.map((d) => '<option value="' + esc(d.id) + '">' + esc(nomClient(d)) + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</option>').join('') + '</select></label>' +
      '<p class="small muted" id="kraaft-etat"></p>' +
      '<div class="actions"><button class="btn primary" data-act="kraaftImport">Lancer la reprise</button></div></div>';
  }

  /** Lit le fichier de reprise Kraaft choisi et présélectionne le dossier du même nom */
  async function lireFichierKraaft() {
    const inp = $('#kraaft-fichier');
    const file = inp && inp.files && inp.files[0];
    if (!file) return null;
    const k = JSON.parse(await file.text());
    if (!k || !Array.isArray(k.messages)) throw new Error('Ce fichier n\'est pas un fichier de reprise Kraaft.');
    return k;
  }

  /** Montre l'avancement de la reprise (message en bas d'écran et sous le bouton) */
  function etatKraaft(texte, erreur) {
    toast(texte, erreur);
    const el = $('#kraaft-etat');
    if (el) el.textContent = texte;
  }

  async function lancerKraaft(k, id) {
    const messages = k.messages || [];
    const documents = k.documents || [];
    const lot = 8;
    let ajoutes = 0, deja = 0;
    const erreurs = [];
    const envoyer = async (data, libelle) => {
      etatKraaft(libelle);
      const d = await api('importKraaft', Object.assign({ dossierId: id, kraaftId: k.kraaftId || '' }, data));
      if (d && d.dossiers) S.data = d;
      const r = (d && d.resultat) || {};
      ajoutes += r.ajoutes || 0;
      deja += r.deja || 0;
      (r.erreurs || []).forEach((e) => erreurs.push(e));
      return r;
    };
    for (let i = 0; i < messages.length; ) {
      const part = messages.slice(i, i + lot);
      const r = await envoyer({ messages: part }, 'Reprise Kraaft : ' + Math.min(i + lot, messages.length) + ' sur ' + messages.length + ' messages…');
      i += r.stop >= 0 ? Math.max(1, r.stop) : part.length;
    }
    for (let j = 0; j < documents.length; ) {
      const part = documents.slice(j, j + lot);
      const r = await envoyer({ documents: part }, 'Reprise Kraaft : ' + Math.min(j + lot, documents.length) + ' sur ' + documents.length + ' documents…');
      j += r.stop >= 0 ? Math.max(1, r.stop) : part.length;
    }
    if (k.terminer && !erreurs.length) await envoyer({ terminer: k.terminer }, 'Reprise Kraaft : classement dans les archives…');
    await afficher();
    etatKraaft('Reprise terminée : ' + ajoutes + ' élément(s) ajouté(s)' + (deja ? ', ' + deja + ' déjà présent(s)' : '') +
      (erreurs.length ? '. À reprendre (relancez la reprise) : ' + erreurs.join(' ; ') : '.') +
      (k.terminer && erreurs.length ? ' Le dossier sera classé dans les archives quand tout sera repris.' : ''), !!erreurs.length);
  }


  /** Accès aux dossiers de documents, technicien par technicien */
  function blocAccesDocs() {
    const tps = typesDocs();
    const techs = (S.data.users || []).filter((u) => u.role !== 'admin' && u.actif !== 'non');
    const defaut = String(S.data.reglages.docsTech || '').split(',').map((x) => x.trim());
    const ligne = (cle, nom, liste, sous) => '<tr data-acces="' + esc(cle) + '"><td><strong>' + esc(nom) + '</strong>' + (sous ? '<br><span class="muted small">' + sous + '</span>' : '') +
      '<br><button type="button" class="link" data-tout="1">tout</button> · <button type="button" class="link" data-tout="0">rien</button></td>' +
      tps.map((t) => '<td style="text-align:center"><input type="checkbox" value="' + esc(t.cle) + '"' + (liste.indexOf(t.cle) >= 0 ? ' checked' : '') +
        ' aria-label="' + esc(nom) + ' : ' + esc(t.lib) + '"></td>').join('') + '</tr>';
    return '<div class="card" id="acces-docs"><h2>Accès aux dossiers de documents</h2>' +
      '<p class="muted small" style="margin-top:0">Cochez, pour chaque technicien, les dossiers qu\'il peut ouvrir dans les chantiers (et où il peut déposer des fichiers). ' +
      'Un technicien sans aucune case cochée ne voit aucun document. L\'administrateur voit toujours tout. La discussion du chantier reste visible par toute l\'équipe.</p>' +
      '<div style="overflow-x:auto"><table class="equipe"><thead><tr><th></th>' + tps.map((t) => '<th style="text-align:center">' + esc(t.lib) + '</th>').join('') + '</tr></thead><tbody>' +
      (techs.length ? techs.map((u) => ligne(u.email, u.nom || u.email, u.docsEffectifs || [], u.docs ? '' : 'réglage par défaut')).join('')
        : '<tr><td colspan="' + (tps.length + 1) + '" class="muted">Aucun technicien actif : ajoutez-les dans « Utilisateurs ».</td></tr>') +
      ligne('__defaut', 'Par défaut', defaut, 'pour les nouveaux techniciens') +
      '</tbody></table></div>' +
      '<div class="actions" style="margin-top:12px"><button class="btn primary" data-act="saveAcces">Enregistrer les accès</button></div></div>';
  }

  function ligneUser(u, i) {
    return '<tr data-user="' + i + '"><td><input type="email" name="email" value="' + esc(u.email) + '" placeholder="prenom@gmail.com"></td>' +
      '<td><input type="text" name="nom" value="' + esc(u.nom) + '" placeholder="Prénom Nom"></td>' +
      '<td><select name="role"><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Administrateur</option><option value="technicien"' + (u.role !== 'admin' ? ' selected' : '') + '>Technicien</option></select></td>' +
      '<td><input type="tel" name="telephone" value="' + esc(u.telephone || '') + '" placeholder="06 …" style="min-width:120px"></td>' +
      '<td><input type="checkbox" name="sms"' + (u.sms === 'oui' ? ' checked' : '') + ' aria-label="Recevoir les SMS"></td>' +
      '<td class="small" title="Appareils qui reçoivent les notifications">' + (u.nbAppareils ? '<span class="pill green">' + u.nbAppareils + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td><input type="checkbox" name="actif"' + (u.actif !== 'non' ? ' checked' : '') + ' aria-label="Actif"></td>' +
      '<td><button class="btn ghost" data-act="delUser" aria-label="Retirer">✕</button></td></tr>';
  }

  /* ================================================================
   * FENÊTRES (FORMULAIRES)
   * ================================================================ */
  function fenetre(opts) {
    const dlg = $('#modal');
    dlg.innerHTML = '<form method="dialog" novalidate><header><h2>' + esc(opts.titre) + '</h2>' + (opts.sousTitre ? '<p>' + opts.sousTitre + '</p>' : '') + '</header>' +
      '<div class="body"><p class="err" hidden></p>' + opts.corps + '</div>' +
      '<footer><button type="button" class="btn" data-close>' + esc(opts.annuler || 'Annuler') + '</button><button type="submit" class="btn ' + (opts.classe || 'primary') + '">' + esc(opts.bouton || 'Enregistrer') + '</button></footer></form>';
    const form = $('form', dlg);
    $('[data-close]', dlg).onclick = () => dlg.close();
    if (opts.apres) opts.apres(form);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const v = {};
      fd.forEach((val, key) => { v[key] = typeof val === 'string' ? val.trim() : val; });
      const btn = $('button[type=submit]', form);
      const err = $('.err', form);
      err.hidden = true;
      btn.disabled = true;
      try {
        await opts.valider(v, form);
        dlg.close();
        await afficher();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };
    dlg.showModal();
    const first = $('.body input:not([type=hidden]):not([type=radio]), .body textarea, .body select', dlg);
    if (first && window.innerWidth > 860) first.focus();
  }

  const champ = (label, html, aide) => '<label class="field"><span>' + label + '</span>' + html + (aide ? '<small>' + aide + '</small>' : '') + '</label>';
  const input = (name, value, type, attrs) => '<input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '" ' + (attrs || '') + '>';

  /* Champs communs du PV : choix sans / avec réserves, fichiers, détail des réserves */
  function champsPV(avecAucun, d) {
    const st = (d && d.pvStatut) || '';
    const radio = (val, label) => '<label><input type="radio" name="pvStatut" value="' + val + '"' + (st === val || (!st && !val) ? ' checked' : '') + '><span>' + label + '</span></label>';
    return '<div class="choices" role="radiogroup" aria-label="PV de réception">' +
      (avecAucun ? radio('', 'Pas de PV') : '') + radio('sans_reserves', 'Sans réserves') + radio('avec_reserves', 'Avec réserves') + '</div>' +
      '<div data-pv="fichiers"' + (avecAucun ? ' hidden' : '') + '>' +
      champ('PV signé (photos ou fichiers)', '<input type="file" name="pvFichiers" accept="image/*,application/pdf" multiple>', 'Vous pouvez en choisir plusieurs : par exemple le recto et le verso.') + '</div>' +
      '<div data-pv="reserves"' + (st === 'avec_reserves' ? '' : ' hidden') + '>' +
      champ('Détail des réserves', '<textarea name="reserves" rows="3" placeholder="Ce que le client a noté…">' + esc((d && d.pvReserves) || '') + '</textarea>') +
      champ('Photos des réserves', '<input type="file" name="reserveFichiers" accept="image/*" multiple>') +
      '<p class="muted small">Un mail part tout de suite, avec le PV et les photos.</p></div>';
  }
  function brancherPV(form) {
    const maj = () => {
      const r = form.querySelector('input[name=pvStatut]:checked');
      const t = r ? r.value : '';
      form.querySelector('[data-pv=fichiers]').hidden = !t;
      form.querySelector('[data-pv=reserves]').hidden = t !== 'avec_reserves';
    };
    form.querySelectorAll('input[name=pvStatut]').forEach((r) => { r.onchange = maj; });
    maj();
  }
  function lirePV(v, form, facultatif) {
    const statut = v.pvStatut || '';
    if (!facultatif && !statut) throw new Error('Indiquez si le PV est sans réserves ou avec réserves.');
    const pv = Array.from(form.querySelector('input[name=pvFichiers]').files || []);
    const res = statut === 'avec_reserves' ? Array.from(form.querySelector('input[name=reserveFichiers]').files || []) : [];
    return { statut, reserves: statut === 'avec_reserves' ? (v.reserves || '') : '', pv: statut ? pv : [], res };
  }
  async function envoyerDocs(dossierId, type, fichiers) {
    for (let i = 0; i < fichiers.length; i++) {
      toast('Envoi du document ' + (i + 1) + ' sur ' + fichiers.length + '…');
      await televerser(fichiers[i], type, dossierId);
    }
  }
  async function envoyerFichiersPV(dossierId, pv) {
    const tous = pv.pv.map((f) => ['pv', f]).concat(pv.res.map((f) => ['reserve', f]));
    for (let i = 0; i < tous.length; i++) {
      toast('Envoi du document ' + (i + 1) + ' sur ' + tous.length + '…');
      await televerser(tous[i][1], tous[i][0], dossierId);
    }
  }

  const FORMS = {
    devisFait(id) {
      const d = parId(id);
      fenetre({
        titre: 'Devis fait', sousTitre: esc(d.titreRdv) + ' · rdv du ' + fr(d.dateRdv),
        corps: champ('Numéro de devis *', input('numDevis', '', 'text', 'required')) +
          champ('Nom du client *', input('client', d.client, 'text', 'required')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3"></textarea>') +
          champ('Document(s) du devis', '<input type="file" name="devisFichiers" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple>', 'Facultatif. Vous pouvez en choisir plusieurs.') +
          '<p class="muted small">Une coche verte ✅ sera ajoutée au rendez-vous dans l\'agenda.</p>',
        valider: async (v, form) => {
          if (!v.numDevis) throw new Error('Le numéro de devis est obligatoire.');
          if (!v.client) throw new Error('Le nom du client est obligatoire.');
          const fichiers = Array.from(form.querySelector('input[name=devisFichiers]').files || []);
          await agir('devisFait', { id, numDevis: v.numDevis, client: v.client, commentaire: v.commentaire }, 'Devis enregistré');
          await envoyerDocs(id, 'devis', fichiers);
        }
      });
    },
    deposer(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Déposer des documents ou photos', sousTitre: esc(nomChantier(d)),
        corps: champ('Type de document *', '<select name="type">' + typesPermis().map((t) => '<option value="' + esc(t.cle) + '"' + (t.cle === 'photo' ? ' selected' : '') + '>' + esc(t.lib) + '</option>').join('') + '</select>') +
          champ('Fichiers *', '<input type="file" name="fichiers" multiple>', 'Photos, PDF, Word, Excel… Vous pouvez en choisir plusieurs.') +
          '<div data-noms></div>',
        bouton: 'Déposer',
        apres: (form) => {
          const inp = form.querySelector('input[name=fichiers]');
          inp.onchange = () => {
            form.querySelector('[data-noms]').innerHTML = Array.from(inp.files).map((f, i) =>
              champ('Nom du document ' + (Array.from(inp.files).length > 1 ? (i + 1) + ' ' : '') + '<span class="muted small" style="font-weight:400">(' + esc(f.name) + ')</span>',
                '<input type="text" name="nom_' + i + '" value="' + esc(f.name.replace(/\.[a-z0-9]{2,5}$/i, '')) + '">')).join('');
            const premier = form.querySelector('[data-noms] input');
            if (premier) { premier.focus(); premier.select(); }
          };
        },
        valider: async (v, form) => {
          const fichiers = Array.from(form.querySelector('input[name=fichiers]').files || []);
          if (!fichiers.length) throw new Error('Choisissez au moins un fichier.');
          for (let i = 0; i < fichiers.length; i++) {
            if (!v['nom_' + i]) throw new Error('Donnez un nom au document ' + (i + 1) + '.');
          }
          for (let i = 0; i < fichiers.length; i++) {
            toast('Envoi du document ' + (i + 1) + ' sur ' + fichiers.length + '…');
            await televerser(fichiers[i], v.type || 'divers', d.id, '', v['nom_' + i]);
          }
        }
      });
    },
    renommerDoc(id) {
      const doc = ((S.dossier && S.dossier.documents) || S.data.documents || []).find((x) => x.id === id);
      fenetre({
        titre: 'Renommer le document',
        corps: champ('Nouveau nom', input('nom', (doc.nom || '').replace(/\.[a-z0-9]{2,5}$/i, ''))),
        bouton: 'Renommer',
        valider: (v) => {
          if (!v.nom) throw new Error('Indiquez un nom.');
          return agir('renommerDocument', { id, nom: v.nom }, 'Document renommé');
        }
      });
    },
    docDevis(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Documents du devis', sousTitre: esc(nomClient(d)) + (d.numDevis ? ' · devis ' + esc(d.numDevis) : ''),
        corps: champ('Document(s) à joindre *', '<input type="file" name="devisFichiers" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple>', 'Vous pouvez en choisir plusieurs.'),
        bouton: 'Joindre',
        valider: async (v, form) => {
          const fichiers = Array.from(form.querySelector('input[name=devisFichiers]').files || []);
          if (!fichiers.length) throw new Error('Choisissez au moins un document.');
          await envoyerDocs(d.id, 'devis', fichiers);
        }
      });
    },
    reponse(id) {
      const d = parId(id);
      const motifs = String(S.data.reglages.motifsRefus || '').split(',').map((s) => s.trim()).filter(Boolean);
      const proposition = addDays(today(), 7);
      fenetre({
        titre: 'Réponse du client', sousTitre: esc(nomClient(d)) + ' · devis ' + esc(d.numDevis),
        corps: '<div class="choices" role="radiogroup" aria-label="Réponse">' +
          '<label><input type="radio" name="type" value="report" checked><span>Report</span></label>' +
          '<label><input type="radio" name="type" value="refuse"><span>Refusé</span></label>' +
          '<label><input type="radio" name="type" value="valide"><span>Validé</span></label></div>' +
          '<div data-pane="report">' + champ('Relancer de nouveau le', input('date', proposition, 'date')) +
          champ('Notes', '<textarea name="notes" rows="3" placeholder="Ce que le client a dit…"></textarea>') + '</div>' +
          '<div data-pane="refuse" hidden>' + champ('Motif du refus', '<select name="motif">' + motifs.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select>') +
          champ('Commentaire', '<textarea name="commentaire" rows="3"></textarea>') + '</div>' +
          '<div data-pane="valide" hidden>' + champ('Numéro de commande', input('numCommande', ''), 'Celui de votre logiciel de devis. Vous pourrez le saisir plus tard.') +
          champTemps('', 'jour') +
          '<p class="muted small">Un mail « Nouvelle commande » sera envoyé.</p></div>',
        apres: (form) => {
          const maj = () => {
            const t = form.querySelector('input[name=type]:checked').value;
            form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
            $('button[type=submit]', form).textContent = { report: 'Reporter', refuse: 'Classer en refus', valide: 'Valider le devis' }[t];
          };
          form.querySelectorAll('input[name=type]').forEach((r) => { r.onchange = maj; });
          maj();
        },
        valider: (v) => {
          if (v.type === 'report' && !v.date) throw new Error('Choisissez la date de la prochaine relance.');
          const msg = { report: 'Relance reportée au ' + fr(v.date), refuse: 'Devis classé en refus', valide: 'Devis validé, commande créée' }[v.type];
          return agir('reponseClient', Object.assign({ id }, v), msg);
        }
      });
    },
    commande(id, cmdId) {
      const d = parId(id);
      const dem = cmdId ? S.data.commandes.find((x) => x.id === cmdId) : null;
      fenetre({
        titre: 'Commande de matériel passée', sousTitre: esc(nomClient(d)) + (d.numCommande ? ' · commande ' + esc(d.numCommande) : ''),
        corps: (dem ? '<div class="note-orange"><strong>Demandé par ' + esc(dem.demandePar || '?') + ' le ' + fr(dem.dateDemande) + ' :</strong><br><span style="white-space:pre-line">' + esc(dem.demande) + '</span></div>' : '') +
          champ('Nom du chantier *', input('chantier', d.chantier || nomClient(d), 'text', d.chantier ? 'readonly' : ''), d.chantier ? 'Déjà défini pour ce dossier (modifiable depuis la fiche).' : '') +
          champ('Fournisseur *', input('fournisseur', '')) +
          '<div class="row2">' + champ('Commandé le', input('dateCommande', today(), 'date')) + champ('Livraison prévue le *', input('dateLivraison', '', 'date')) + '</div>' +
          champ('Commentaire', '<textarea name="commentaire" rows="2"></textarea>'),
        valider: (v) => {
          if (!v.chantier || !v.fournisseur || !v.dateLivraison) throw new Error('Chantier, fournisseur et date de livraison sont obligatoires.');
          return agir('ajouterCommande', Object.assign({ dossierId: id, commandeId: cmdId || '' }, v), 'Commande enregistrée');
        }
      });
    },
    /** Bouton « Matériel à commander » : la liste part à l'administrateur et reste dans le chantier */
    demandeMateriel(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Matériel à commander', sousTitre: esc(nomChantier(d)),
        corps: champ('Liste du matériel *', '<textarea name="demande" rows="6" placeholder="Une ligne par article, avec la quantité.\nEx. : 2 disjoncteurs 16 A\n25 m de câble R2V 3G2,5"></textarea>', 'Pour dicter, touchez le micro du clavier.') +
          champ('Précision (facultatif)', input('commentaire', '', 'text', 'placeholder="Ex. : besoin pour jeudi, à livrer sur le chantier"')) +
          '<p class="muted small">Un mail part tout de suite à l\'administrateur. La demande reste visible dans le chantier jusqu\'à la commande puis la réception.</p>',
        bouton: 'Envoyer la demande', classe: 'orange',
        valider: async (v) => {
          if (!v.demande) throw new Error('Écrivez la liste du matériel.');
          await agir('demanderMateriel', { dossierId: d.id, demande: v.demande, commentaire: v.commentaire }, 'Demande envoyée à l\'administrateur');
          if (S.dossier && S.dossier.dossier.id === d.id) await chargerDossier(d.id);
        }
      });
    },
    adresse(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Adresse du chantier', sousTitre: esc(nomChantier(d)),
        corps: champ('Adresse *', input('adresse', d.lieu || '', 'text', 'placeholder="N°, rue, code postal, commune"'), 'L\'appli la place sur la carte et calcule la distance et la zone.'),
        valider: async (v) => {
          if (!v.adresse) throw new Error('Indiquez l\'adresse.');
          const r = await agir('localiserChantier', { id: d.id, mode: 'adresse', adresse: v.adresse });
          const z = r && r.resultat;
          toast('Adresse enregistrée' + (z && z.zone ? ' · ' + (z.zone === 'GD' ? 'grand déplacement' : 'zone ' + z.zone) + ' (' + String(z.distanceKm).replace('.', ',') + ' km)' : ''));
        }
      });
    },
    classerDoc(id) {
      const doc = ((S.dossier && S.dossier.documents) || S.data.documents || []).find((x) => x.id === id);
      fenetre({
        titre: 'Classer le document', sousTitre: esc(doc.nom || ''),
        corps: champ('Type', '<select name="type">' + typesDocs().map((t) => '<option value="' + esc(t.cle) + '"' + (t.cle === doc.type ? ' selected' : '') + '>' + esc(t.lib) + (typesTech().indexOf(t.cle) >= 0 ? '' : ' (aucun technicien)') + '</option>').join('') + '</select>'),
        bouton: 'Classer',
        valider: (v) => agir('classerDocument', { id, type: v.type }, 'Document classé')
      });
    },
    demandeConge(direct) {
      const admin = estAdmin();
      const motifs = motifsAbsence();
      const cren = (name) => '<select name="' + name + '" aria-label="Créneau"><option value="journee">Journée</option><option value="matin">Matin</option><option value="apres_midi">Après-midi</option></select>';
      fenetre({
        titre: direct ? 'Saisir une absence validée' : 'Demande d\'absence',
        sousTitre: direct ? 'Elle est validée tout de suite (par exemple le calendrier école d\'un apprenti).' : esc(S.data.reglages.phraseConges || ''),
        corps: (direct ? champ('Technicien *', '<select name="email">' + techniciens().map((u) => '<option value="' + esc(u.email) + '">' + esc(u.nom || u.email) + '</option>').join('') + '</select>') : '') +
          champ('Motif *', '<select name="motif">' + motifs.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select>') +
          '<div class="row2">' + champ('Du *', input('dateDebut', '', 'date')) + champ('Créneau', cren('creneauDebut')) + '</div>' +
          '<div class="row2">' + champ('Au', input('dateFin', '', 'date'), 'Vide = un seul jour.') + champ('Créneau', cren('creneauFin')) + '</div>' +
          champ('Commentaire', '<textarea name="commentaire" rows="2"></textarea>'),
        bouton: direct ? 'Enregistrer' : 'Envoyer la demande',
        valider: async (v) => {
          if (!v.dateDebut) throw new Error('Indiquez la date de début.');
          if (v.dateFin && v.dateFin < v.dateDebut) throw new Error('La date de fin est avant la date de début.');
          await agir('demanderConge', Object.assign({}, v, { dateFin: v.dateFin || v.dateDebut, valider: !!(direct && admin) }),
            direct ? 'Absence enregistrée' : 'Demande envoyée');
        }
      });
    },
    deciderConge(id, decision) {
      const c = (S.data.conges || []).find((x) => x.id === id);
      fenetre({
        titre: decision === 'accepte' ? 'Accepter la demande' : 'Refuser la demande',
        sousTitre: esc(nomUser(c.email)) + ' · ' + esc(c.motif) + ' ' + periodeConge(c),
        corps: champ('Message pour ' + esc(prenom(c.email)) + ' (facultatif)', '<textarea name="reponse" rows="3"></textarea>', 'Il part par mail avec la réponse.'),
        bouton: decision === 'accepte' ? 'Accepter' : 'Refuser', classe: decision === 'accepte' ? 'green' : 'danger',
        valider: (v) => agir('deciderConge', { id, decision, reponse: v.reponse }, decision === 'accepte' ? 'Absence acceptée' : 'Absence refusée')
      });
    },
    modifCommande(id) {
      const c = S.data.commandes.find((x) => x.id === id);
      fenetre({
        titre: 'Modifier la commande',
        corps: champ('Fournisseur', input('fournisseur', c.fournisseur)) +
          '<div class="row2">' + champ('Commandé le', input('dateCommande', c.dateCommande, 'date')) + champ('Livraison prévue le', input('dateLivraison', c.dateLivraison, 'date')) + '</div>' +
          champ('Commentaire', '<textarea name="commentaire" rows="2">' + esc(c.commentaire) + '</textarea>'),
        valider: async (v) => { await agir('modifierCommande', Object.assign({ id }, v), 'Commande modifiée'); }
      });
    },
    /** Avant de planifier : alerte si des étapes précédentes ne sont pas validées */
    planifier(id) {
      const d = parId(id);
      const manque = interventionsDe(id).length || d.dateDebut ? [] : etapesManquantes(d);
      if (!manque.length) { FORMS.planning(id); return; }
      fenetre({
        titre: 'Des étapes ne sont pas validées', sousTitre: esc(nomClient(d)),
        corps: '<ul class="manques">' + manque.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>',
        bouton: 'Planifier quand même', annuler: 'Ne pas planifier',
        valider: () => { setTimeout(() => FORMS.planning(id), 60); }
      });
    },
    planning(id) {
      const d = parId(id);
      const techs = S.data.users.filter((u) => u.actif !== 'non');
      const choisis = (d.techniciens || '').split(',');
      let its = interventionsDe(id).map((x) => ({ id: x.id, date: x.date, creneau: x.creneau, dateFin: x.dateFin || x.date, creneauFin: x.creneauFin || x.creneau, travaux: x.travaux,
        techniciens: x.techniciens || d.techniciens || '' }));
      // ancien planning (dates de début et de fin) : une seule période
      if (!its.length && d.dateDebut) its.push({ date: d.dateDebut, creneau: 'journee', dateFin: d.dateFin || d.dateDebut, creneauFin: 'journee', travaux: '', techniciens: d.techniciens || '' });
      if (!its.length) its = [{ date: '', creneau: 'journee', dateFin: '', creneauFin: 'journee', travaux: '', techniciens: choisis.filter(Boolean).join(',') }];
      // Techniciens à cocher pour chaque période
      const casesTech = (liste) => '<div class="interv-techs" role="group" aria-label="Techniciens prévus sur cette période"><span class="interv-lib">Qui ?</span>' +
        techs.map((u) => '<label class="check"><input type="checkbox" name="it_tech" value="' + esc(u.email) + '"' +
          (String(liste || '').split(',').indexOf(u.email) >= 0 ? ' checked' : '') + '> ' + esc(u.nom || u.email) +
          (u.role === 'admin' ? ' <span class="muted small">(admin.)</span>' : '') + '</label>').join('') + '</div>';
      const choixCreneau = (name, val) => '<select name="' + name + '" aria-label="Créneau">' + Object.keys(LIB_CRENEAU).map((k) =>
        '<option value="' + k + '"' + (val === k ? ' selected' : '') + '>' + LIB_CRENEAU[k] + '</option>').join('') + '</select>';
      const ligneIt = (x) => '<div class="interv-ligne" data-it="' + esc(x.id || '') + '">' +
        '<div class="interv-haut"><span class="interv-lib">Du</span>' + input('it_date', x.date, 'date', 'aria-label="Date de début"') + choixCreneau('it_creneau', x.creneau) +
        '<button type="button" class="btn ghost danger" data-retirer-it aria-label="Retirer cette période">✕</button></div>' +
        '<div class="interv-haut"><span class="interv-lib">Au</span>' + input('it_fin', x.dateFin && x.dateFin !== x.date ? x.dateFin : '', 'date', 'aria-label="Date de fin"') +
        '<span data-fin-creneau' + (x.dateFin && x.dateFin !== x.date ? '' : ' hidden') + '>' + choixCreneau('it_creneau_fin', x.creneauFin || 'journee') + '</span><span></span></div>' +
        '<div class="small muted interv-aide" data-aide></div>' + casesTech(x.techniciens) +
        '<textarea name="it_travaux" rows="2" placeholder="Travaux à faire sur cette période…">' + esc(x.travaux || '') + '</textarea></div>';
      const majLigne = (el) => {
        const deb = el.querySelector('[name=it_date]').value;
        const fin = el.querySelector('[name=it_fin]').value;
        const plusieurs = deb && fin && fin > deb;
        el.querySelector('[data-fin-creneau]').hidden = !plusieurs;
        const aide = el.querySelector('[data-aide]');
        if (fin && deb && fin < deb) aide.textContent = 'La date de fin est avant la date de début.';
        else if (plusieurs) {
          const j = joursPeriode({ date: deb, dateFin: fin, creneau: 'journee', creneauFin: 'journee' }).length;
          aide.textContent = j + ' jours, un rendez-vous par jour.' + (j > 2 ? ' Les jours entre le premier et le dernier sont des journées entières.' : '');
        } else aide.textContent = 'Laissez « Au » vide pour une seule journée.';
      };
      const r = S.data.reglages;
      fenetre({
        titre: d.dateDebut ? 'Modifier le planning' : 'Planifier le chantier', sousTitre: esc(nomClient(d)),
        corps: champ('Nom du chantier', input('chantier', d.chantier || nomClient(d))) +
          '<div class="field"><span>Périodes d\'intervention *</span><div data-its>' + its.map(ligneIt).join('') + '</div>' +
          '<button type="button" class="btn" data-ajout-it>+ Ajouter une période</button>' +
          '<small>Journée : ' + esc(r.matinDebut || '08:00') + '–' + esc(r.apremFin || '17:30') + ' · Matin : ' + esc(r.matinDebut || '08:00') + '–' + esc(r.matinFin || '12:00') +
          ' · Après-midi : ' + esc(r.apremDebut || '13:30') + '–' + esc(r.apremFin || '17:30') + '. Un rendez-vous par jour dans l\'agenda, avec les travaux dans les notes.</small></div>' +
          '',
        apres: (form) => {
          const zone = form.querySelector('[data-its]');
          zone.querySelectorAll('.interv-ligne').forEach(majLigne);
          zone.oninput = (ev) => { const l = ev.target.closest('.interv-ligne'); if (l) majLigne(l); };
          form.querySelector('[data-ajout-it]').onclick = () => {
            const lignes = zone.querySelectorAll('.interv-ligne');
            const derL = lignes[lignes.length - 1];
            const der = derL ? (derL.querySelector('[name=it_fin]').value || derL.querySelector('[name=it_date]').value) : '';
            // La nouvelle période reprend les techniciens de la précédente (modifiable)
            const techsAvant = derL ? Array.from(derL.querySelectorAll('[name=it_tech]:checked')).map((x) => x.value).join(',') : '';
            zone.insertAdjacentHTML('beforeend', ligneIt({ date: der ? addDays(der, 1) : '', creneau: 'journee', dateFin: '', creneauFin: 'journee', travaux: '', techniciens: techsAvant }));
            majLigne(zone.lastElementChild);
          };
          zone.onclick = (ev) => {
            const b = ev.target.closest('[data-retirer-it]');
            if (b) b.closest('.interv-ligne').remove();
          };
        },
        valider: (v, form) => {
          const lignes = Array.from(form.querySelectorAll('.interv-ligne')).map((el) => ({
            id: el.dataset.it || '',
            date: el.querySelector('[name=it_date]').value,
            creneau: el.querySelector('[name=it_creneau]').value,
            dateFin: el.querySelector('[name=it_fin]').value || el.querySelector('[name=it_date]').value,
            creneauFin: el.querySelector('[name=it_creneau_fin]').value,
            travaux: el.querySelector('[name=it_travaux]').value.trim(),
            techniciens: Array.from(el.querySelectorAll('[name=it_tech]:checked')).map((x) => x.value).join(',')
          }));
          if (!lignes.length) throw new Error('Ajoutez au moins une période d\'intervention.');
          if (lignes.some((x) => !x.date)) throw new Error('Indiquez la date de début de chaque période (ou retirez la ligne vide).');
          if (lignes.some((x) => x.dateFin < x.date)) throw new Error('Une période se termine avant de commencer.');
          lignes.forEach((x) => { if (x.dateFin === x.date) x.creneauFin = x.creneau; });
          const t = Array.from(new Set(lignes.flatMap((x) => x.techniciens.split(',').filter(Boolean))));
          return agir('planifier', { id, chantier: v.chantier, interventions: lignes, techniciens: t.join(',') }, 'Chantier planifié et inscrit dans l\'agenda');
        }
      });
    },
    modifier(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Modifier le dossier', sousTitre: esc(nomClient(d)),
        corps: champ('Nom du client', input('client', d.client)) + champ('Lieu', input('lieu', d.lieu)) +
          '<div class="row2">' + champ('Numéro de devis', input('numDevis', d.numDevis)) + champ('N° de commande', input('numCommande', d.numCommande)) + '</div>' +
          champ('Commentaire sur le devis', '<textarea name="commentaireDevis" rows="2">' + esc(d.commentaireDevis) + '</textarea>') +
          '<div class="row2">' + champ('Délai de relance de ce devis (jours)', input('delaiRelance', d.delaiRelance, 'number', 'min="1" placeholder="' + delai('relance_client') + ' par défaut"'), 'Vide = délai général') +
          champ('Prochaine relance', input('prochaineRelance', d.prochaineRelance, 'date')) + '</div>' +
          champ('Nom du chantier', input('chantier', d.chantier)) +
          (d.dateValidation ? champTemps(d.tempsValeur, d.tempsUnite) : ''),
        valider: async (v) => {
          await agir('modifierDossier', { id, champs: v }, 'Dossier modifié');
        }
      });
    },
    factInter(id) {
      const d = S.dossier ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Facture intermédiaire', sousTitre: esc(nomChantier(d)),
        corps: champ('Pourcentage à facturer *', input('pct', d.avancement && Number(d.avancement) < 100 ? d.avancement : '', 'number', 'min="1" max="99" inputmode="numeric"'), 'Par exemple 30 pour 30 %.') +
          champ('Commentaire', '<textarea name="commentaire" rows="3" placeholder="Ce qui justifie cette facture…"></textarea>') +
          '<p class="muted small">Un mail part tout de suite à l\'administration.</p>',
        bouton: 'Envoyer la demande',
        valider: async (v) => {
          const p = Number(v.pct);
          if (!(p > 0 && p < 100)) throw new Error('Indiquez un pourcentage entre 1 et 99.');
          await agir('demandeFactureInter', { id, pct: p, commentaire: v.commentaire }, 'Demande envoyée');
        }
      });
    },
    termine(id) {
      const d = S.dossier ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Chantier terminé ?', sousTitre: esc(nomChantier(d)),
        corps: '<p>L\'avancement passera à 100 % et un mail préviendra qu\'il faut facturer.</p>' +
          champ('Commentaire de fin (facultatif)', '<textarea name="commentaire" rows="3"></textarea>') +
          '<h3 style="font-size:15px;margin:18px 0 10px;color:var(--navy)">PV de réception (facultatif)</h3>' + champsPV(true),
        bouton: 'Oui, chantier terminé', classe: 'green',
        apres: brancherPV,
        valider: async (v, form) => {
          const pv = lirePV(v, form, true);
          await envoyerFichiersPV(d.id, pv);
          await agir('chantierTermine', { id, commentaire: v.commentaire, pvStatut: pv.statut, reserves: pv.reserves },
            pv.statut === 'avec_reserves' ? 'Chantier terminé, réserves signalées par mail' : 'Chantier terminé, facturation prévenue');
        }
      });
    },
    pv(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'PV de réception', sousTitre: esc(nomChantier(d)) + ' · vous pouvez ajouter des documents à ceux déjà joints',
        corps: champsPV(false, d),
        bouton: 'Enregistrer le PV',
        apres: brancherPV,
        valider: async (v, form) => {
          const pv = lirePV(v, form, false);
          await envoyerFichiersPV(d.id, pv);
          await agir('enregistrerPV', { id, pvStatut: pv.statut, reserves: pv.reserves },
            pv.statut === 'avec_reserves' ? 'PV enregistré, réserves signalées par mail' : 'PV enregistré');
        }
      });
    },
    confirmer(titre, texte, bouton, fn, classe) {
      fenetre({ titre, corps: '<p>' + texte + '</p>', bouton, classe: classe || 'primary', valider: fn });
    },
    /** Confirmation avec motif obligatoire, gardé dans l'historique */
    avecMotif(titre, texte, bouton, fn, classe) {
      fenetre({
        titre, corps: '<p>' + texte + '</p>' + champ('Motif *', '<textarea name="motif" rows="2" placeholder="Pourquoi ce changement ?"></textarea>', 'Il sera noté dans l\'historique du dossier.'),
        bouton, classe: classe || 'primary',
        valider: (v) => { if (!v.motif) throw new Error('Indiquez le motif.'); return fn(v.motif); }
      });
    },
    retour(id) {
      const d = parId(id);
      const cible = etapePrec(d);
      const notes = {
        devis_envoye: 'La relance client repartira d\'aujourd\'hui.',
        commande: 'Le rappel « commander le matériel » repartira d\'aujourd\'hui. Les dates de chantier seront effacées si le chantier était planifié.',
        materiel: 'Les dates de chantier seront effacées.',
        planifie: 'L\'avancement repassera à 0 %.',
        en_cours: 'La facture finale pas encore faite sera retirée.',
        termine: 'La facture finale redevient « à faire » et le rappel « À facturer » repartira d\'aujourd\'hui.',
        devis_a_faire: 'Le rappel « Devis à faire » repartira d\'aujourd\'hui.'
      };
      FORMS.avecMotif('Revenir à l\'étape précédente',
        '<strong>' + esc(nomClient(d)) + '</strong> passe de « ' + esc(ETAPES()[d.etape]) + ' » à « ' + esc(ETAPES()[cible]) + ' ». ' + (notes[cible] || ''),
        'Revenir en arrière', (motif) => agir('etapePrecedente', { id, motif }, 'Dossier revenu à « ' + ETAPES()[cible] + ' »'));
    },
    nouveau() {
      fenetre({
        titre: 'Nouveau dossier', sousTitre: 'Pour un client qui n\'a pas de rendez-vous dans l\'agenda.',
        corps: champ('Nom du client *', input('client', '')) +
          '<div class="row2">' + champ('Date du contact', input('dateRdv', today(), 'date')) + champ('Lieu', input('lieu', '')) + '</div>' +
          champ('Notes', '<textarea name="notes" rows="3" placeholder="Ce que veut le client…"></textarea>') +
          champ('Numéro de devis', input('numDevis', ''), 'Seulement si le devis est déjà envoyé. Le dossier passera alors directement en « Devis envoyé ».'),
        bouton: 'Créer le dossier',
        valider: async (v) => {
          if (!v.client) throw new Error('Le nom du client est obligatoire.');
          const r = await agir('creerDossier', v, 'Dossier créé');
          if (r && r.resultat) location.hash = '#/dossier/' + r.resultat;
        }
      });
    },
    reception(id) {
      const c = S.data.commandes.find((x) => x.id === id);
      const d = parId(c.dossierId);
      fenetre({
        titre: 'Réception du matériel', sousTitre: esc(nomChantier(d)) + ' · ' + esc(c.fournisseur) + ' · attendu le ' + fr(c.dateLivraison),
        corps: '<div class="choices" role="radiogroup" aria-label="État de la livraison">' +
          '<label><input type="radio" name="statut" value="conforme"><span>Conforme</span></label>' +
          '<label><input type="radio" name="statut" value="non_conforme"><span>Non conforme</span></label>' +
          '<label><input type="radio" name="statut" value="partielle"><span>Partielle</span></label></div>' +
          '<div data-pane="partielle" hidden>' + champ('Le reste arrive le *', input('nouvelleDate', '', 'date')) + '</div>' +
          '<div data-pane="non_conforme" hidden><p class="help">La commande reste ouverte, en attente de traitement, et un mail prévient l\'administration.</p></div>' +
          '<div class="row2">' + champ('Reçu le', input('dateReception', today(), 'date')) + champ('Réceptionné par', input('receptionPar', S.data.user.nom || '')) + '</div>' +
          champ('N° du bon de livraison', input('numBL', '')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3" placeholder="Manquant, abîmé, erreur de référence…"></textarea>') +
          champ('Photo (bon de livraison ou matériel)', '<input type="file" name="photo" accept="image/*,application/pdf">'),
        bouton: 'Enregistrer la réception',
        apres: (form) => {
          form.querySelectorAll('input[name=statut]').forEach((r) => {
            r.onchange = () => {
              const t = form.querySelector('input[name=statut]:checked').value;
              form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
            };
          });
        },
        valider: async (v) => {
          if (!v.statut) throw new Error('Indiquez si la livraison est conforme, non conforme ou partielle.');
          if (v.statut === 'partielle' && !v.nouvelleDate) throw new Error('Indiquez quand arrive le reste.');
          const photo = v.photo && v.photo.size ? v.photo : null;
          await agir('receptionCommande', {
            id, statut: v.statut, nouvelleDate: v.nouvelleDate, dateReception: v.dateReception,
            receptionPar: v.receptionPar, numBL: v.numBL, commentaire: v.commentaire
          }, { conforme: 'Réception conforme enregistrée', non_conforme: 'Non conformité enregistrée, mail envoyé', partielle: 'Livraison partielle enregistrée' }[v.statut]);
          if (photo) await televerser(photo, 'reception', c.dossierId, c.id);
        }
      });
    },
    modifFacture(id) {
      const f = S.data.factures.find((x) => x.id === id);
      fenetre({
        titre: 'Modifier la facture intermédiaire',
        corps: champ('Pourcentage', input('pourcentage', f.pourcentage, 'number', 'min="1" max="99" inputmode="numeric"')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3">' + esc(f.commentaire) + '</textarea>'),
        valider: (v) => agir('modifierFacture', { id, pourcentage: v.pourcentage, commentaire: v.commentaire }, 'Facture modifiée')
      });
    },
    modifCom(id) {
      const c = (S.dossier.commentaires || []).find((x) => x.id === id);
      fenetre({
        titre: 'Modifier le commentaire',
        corps: champ('Commentaire', '<textarea name="texte" rows="5">' + esc(c.texte) + '</textarea>'),
        valider: (v) => agir('modifierCommentaire', { id, texte: v.texte }, 'Commentaire modifié')
      });
    }
  };

  /* ================================================================
   * FICHIERS (PDF, PHOTOS)
   * ================================================================ */
  function lireBase64(file) {
    return new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = ko;
      r.readAsDataURL(file);
    });
  }
  function reduirePhoto(file, max) {
    return new Promise((ok) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }
  /** Envoie un fichier (PDF ou photo) au programme Google */
  async function televerser(file, type, dossierId, commandeId, nomChoisi) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop lourd (20 Mo maximum).');
    let b64, mime = file.type, nom = file.name;
    const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    if (file.type.indexOf('image/') === 0) {
      b64 = await reduirePhoto(file, 1600);
      mime = 'image/jpeg';
      if (!b64) mime = file.type;
      nom = ({ reception: 'Réception ', pv: 'PV ', reserve: 'Réserve ', devis: 'Devis ', plan: 'Plan ', schema: 'Schéma ' }[type] || 'Photo ') + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h') + '.jpg';
    }
    if (!b64) b64 = await lireBase64(file);
    let nomFichier = nom;
    if (nomChoisi) {
      nom = nomChoisi;
      nomFichier = nomChoisi + (mime === 'image/jpeg' && file.type !== 'image/jpeg' ? '.jpg' : ext);
    }
    toast('Envoi en cours…');
    await agir('envoyerFichier', { dossierId, commandeId: commandeId || '', type, base64: b64, mime, nom, nomFichier },
      { reception: 'Photo de réception enregistrée', pv: 'Document du PV enregistré', reserve: 'Photo de réserve enregistrée', chat: 'Envoyé dans la discussion' }[type] || 'Document enregistré');
  }

  async function envoyerFichier(inp) {
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      await televerser(file, inp.dataset.upload, inp.dataset.dossier, inp.dataset.cmd);
      await afficher();
    } catch (e) {
      toast(e.message, true);
    } finally {
      inp.value = '';
    }
  }

  /* ================================================================
   * ACTIONS DES BOUTONS
   * ================================================================ */
  async function essayer(fn) {
    try { await fn(); } catch (e) { toast(e.message, true); }
  }

  const ACTIONS = {
    logout: () => deconnecter(),
    refresh: () => essayer(() => rafraichir('Données à jour')),
    scan: () => essayer(async () => {
      const avant = S.data.dossiers.length;
      await agir('scannerAgenda');
      const n = S.data.dossiers.length - avant;
      toast(n ? n + ' nouveau' + (n > 1 ? 'x' : '') + ' rendez-vous repéré' + (n > 1 ? 's' : '') : 'Aucun nouveau rendez-vous');
      await afficher();
    }),
    devisFait: (el) => FORMS.devisFait(el.dataset.id),
    ignorer: (el) => FORMS.confirmer('Ignorer ce rendez-vous ?', 'Il ne sera plus proposé dans les devis à faire. Vous le retrouverez dans les archives.', 'Ignorer',
      () => agir('ignorer', { id: el.dataset.id }, 'Rendez-vous ignoré')),
    reponse: (el) => FORMS.reponse(el.dataset.id),
    commande: (el) => FORMS.commande(el.dataset.id, el.dataset.cmd),
    demandeMateriel: (el) => FORMS.demandeMateriel(el.dataset.id),
    adresse: (el) => FORMS.adresse(el.dataset.id),
    position: (el) => essayer(async () => {
      const pos = await maPosition();
      if (pos.precision > 200 && !confirm('La position est imprécise (environ ' + pos.precision + ' m). L\'enregistrer quand même comme adresse du chantier ?')) return;
      const r = await agir('localiserChantier', { id: el.dataset.id, mode: 'gps', lat: pos.lat, lng: pos.lng });
      const z = r && r.resultat;
      toast('Position enregistrée' + (z && z.lieu ? ' : ' + z.lieu : '') + (z && z.zone ? ' · ' + (z.zone === 'GD' ? 'grand déplacement' : 'zone ' + z.zone) : ''));
      await afficher();
    }),
    classerDoc: (el) => FORMS.classerDoc(el.dataset.id),
    demandeConge: (el) => FORMS.demandeConge(!!el.dataset.direct),
    deciderConge: (el) => FORMS.deciderConge(el.dataset.id, el.dataset.v),
    annulerConge: (el) => FORMS.confirmer('Retirer cette absence ?', 'Elle sera supprimée' + (estAdmin() ? ' (et retirée de l\'agenda si elle y était).' : '.'), 'Retirer',
      () => agir('annulerConge', { id: el.dataset.id }, 'Absence retirée'), 'danger'),
    dossierAgenda: (el) => essayer(async () => {
      const r = await agir('dossierDepuisAgenda', { key: el.dataset.key }, 'Dossier créé');
      if (r && r.resultat) location.hash = '#/dossier/' + r.resultat;
    }),
    activerNotifs: () => essayer(activerNotifs),
    desactiverNotifs: () => essayer(desactiverNotifs),
    pushTest: () => essayer(async () => { await api('pushTest', {}); toast('Notification d\'essai envoyée : elle arrive dans quelques secondes'); }),
    notifPlusTard: () => { stocker('eh_notif_plus_tard', today()); afficher(); },
    installerAppli: () => essayer(async () => {
      if (!installDiffere) throw new Error('Utilisez le menu du navigateur : « Installer l\'application ».');
      installDiffere.prompt();
      await installDiffere.userChoice;
      installDiffere = null;
      afficher();
    }),
    retirerAppareil: (el) => FORMS.confirmer('Retirer cet appareil ?', 'Il ne recevra plus les notifications.', 'Retirer',
      () => agir('supprimerAppareil', { id: el.dataset.id }, 'Appareil retiré'), 'danger'),
    saveFirebase: () => essayer(async () => {
      const t = $('#fcm-json').value.trim();
      if (!t) throw new Error('Collez le contenu du fichier JSON, ou utilisez « Retirer la clé ».');
      await agir('enregistrerCleFirebase', { json: t }, 'Clé Firebase enregistrée et vérifiée');
    }),
    retirerFirebase: () => FORMS.confirmer('Retirer la clé Firebase ?', 'Plus aucune notification ne partira vers les téléphones.', 'Retirer',
      () => agir('enregistrerCleFirebase', { json: '' }, 'Clé retirée'), 'danger'),
    smsTest: () => FORMS.confirmer('SMS d\'essai', 'Enregistrez d\'abord la clé Brevo. Le SMS part vers le numéro indiqué pour vous dans « Utilisateurs ».', 'Envoyer',
      () => api('smsTest', {}).then(() => toast('SMS d\'essai envoyé'))),
    modifCommande: (el) => FORMS.modifCommande(el.dataset.id),
    planifier: (el) => FORMS.planifier(el.dataset.id),
    modifier: (el) => FORMS.modifier(el.dataset.id),
    factureFaite: (el) => FORMS.confirmer('Facture faite ?', 'Confirmez que la facture a bien été faite.', 'Oui, facture faite',
      async () => {
        await agir('factureFaite', { factureId: el.dataset.id }, 'Facture enregistrée');
      }, 'green'),
    ajoutCom: (el) => essayer(async () => {
      const t = $('#com-txt').value.trim();
      if (!t) { toast('Écrivez ou dictez un message.', true); return; }
      await agir('commentaire', { id: el.dataset.id, texte: t }, 'Message envoyé');
      await afficher();
    }),
    factInter: (el) => FORMS.factInter(el.dataset.id),
    retour: (el) => FORMS.retour(el.dataset.id),
    nouveau: () => FORMS.nouveau(),
    supprDossier: (el) => {
      const d = parId(el.dataset.id);
      FORMS.avecMotif('Supprimer ce dossier ?', 'Le dossier <strong>' + esc(nomClient(d)) + '</strong> sera supprimé avec ses commandes, factures et commentaires. Les fichiers déjà rangés dans Google Drive sont conservés. <strong>Cette action est définitive.</strong>',
        'Supprimer définitivement', async (motif) => { await agir('supprimerDossier', { id: d.id, motif }, 'Dossier supprimé'); location.hash = '#/'; }, 'danger');
    },
    supprCommande: (el) => {
      const c = S.data.commandes.find((x) => x.id === el.dataset.id);
      FORMS.avecMotif('Supprimer cette commande ?', 'Commande <strong>' + esc(c.fournisseur) + '</strong>, livraison le ' + fr(c.dateLivraison) + '.', 'Supprimer',
        (motif) => agir('supprimerCommande', { id: c.id, motif }, 'Commande supprimée'), 'danger');
    },
    modifFacture: (el) => FORMS.modifFacture(el.dataset.id),
    reception: (el) => FORMS.reception(el.dataset.id),
    annulerReception: (el) => FORMS.avecMotif('Annuler cette réception ?', 'La commande redevient « à réceptionner ».', 'Annuler la réception',
      (motif) => agir('annulerReception', { id: el.dataset.id, motif }, 'Réception annulée')),
    supprFacture: (el) => FORMS.avecMotif('Supprimer cette demande de facture ?', 'La demande de facture intermédiaire sera retirée.', 'Supprimer',
      (motif) => agir('supprimerFacture', { id: el.dataset.id, motif }, 'Demande supprimée'), 'danger'),
    annulerFacture: (el) => FORMS.avecMotif('Annuler « facture faite » ?', 'La facture redevient « à faire » et le rappel repartira d\'aujourd\'hui. Si c\'est la facture finale, le dossier revient en « À facturer ».', 'Annuler la facture',
      (motif) => agir('annulerFacture', { id: el.dataset.id, motif }, 'Facture remise à faire')),
    modifCom: (el) => FORMS.modifCom(el.dataset.id),
    supprCom: (el) => FORMS.confirmer('Supprimer ce commentaire ?', 'Le commentaire (et la photo, s\'il y en a une) ne sera plus affiché. La photo reste dans Google Drive.', 'Supprimer',
      () => agir('supprimerCommentaire', { id: el.dataset.id }, 'Commentaire supprimé'), 'danger'),
    termine: (el) => FORMS.termine(el.dataset.id),
    pv: (el) => FORMS.pv(el.dataset.id),
    docDevis: (el) => FORMS.docDevis(el.dataset.id),
    deposer: (el) => FORMS.deposer(el.dataset.id),
    renommerDoc: (el) => FORMS.renommerDoc(el.dataset.id),
    supprDoc: (el) => FORMS.confirmer('Retirer ce document ?', 'Il ne sera plus affiché dans le dossier. Le fichier part dans la corbeille Google Drive, où il reste récupérable pendant 30 jours.', 'Retirer',
      () => agir('supprimerDocument', { id: el.dataset.id }, 'Document retiré'), 'danger'),
    saveAcces: () => essayer(async () => {
      const acces = {};
      let defaut = null;
      document.querySelectorAll('#acces-docs tr[data-acces]').forEach((tr) => {
        const l = Array.from(tr.querySelectorAll('input[type=checkbox]:checked')).map((x) => x.value);
        if (tr.dataset.acces === '__defaut') defaut = l; else acces[tr.dataset.acces] = l;
      });
      await agir('enregistrerAccesDocs', { acces, defaut }, 'Accès enregistrés');
      await afficher();
    }),
    saveMails: () => essayer(async () => {
      const mails = Array.from(document.querySelectorAll('details.mail')).map((box) => {
        const g = (n) => box.querySelector('[name=' + n + ']');
        const m = { cle: box.dataset.mail, active: g('active').checked ? 'oui' : 'non', destinataires: g('destinataires').value.trim(), objet: g('objet').value, texte: g('texte').value };
        if (g('copieTechniciens')) m.copieTechniciens = g('copieTechniciens').checked ? 'oui' : 'non';
        if (g('sms')) m.sms = g('sms').checked ? 'oui' : 'non';
        if (g('push')) m.push = g('push').checked ? 'oui' : 'non';
        if (g('delaiJours')) m.delaiJours = g('delaiJours').value || '0';
        if (g('rythmeJours')) m.rythmeJours = g('rythmeJours').value || '1';
        if (g('heure')) {
          m.heure = g('heure').value;
          m.jours = Array.from(box.querySelectorAll('[name=jour]:checked')).map((x) => x.value).join(',');
        }
        return m;
      });
      await agir('enregistrerMails', { mails }, 'Mails enregistrés');
      await afficher();
    }),
    mailTest: (el) => essayer(async () => {
      await api('mailTest', { cle: el.dataset.cle });
      toast('Mail d\'essai envoyé');
    }),
    addUser: () => {
      const tb = $('#users-body');
      tb.insertAdjacentHTML('beforeend', ligneUser({ email: '', nom: '', role: 'technicien', actif: 'oui' }, tb.children.length));
      tb.lastElementChild.querySelector('input').focus();
    },
    delUser: (el) => el.closest('tr').remove(),
    saveUsers: () => essayer(async () => {
      const users = Array.from(document.querySelectorAll('#users-body tr')).map((tr) => ({
        email: tr.querySelector('[name=email]').value.trim().toLowerCase(),
        nom: tr.querySelector('[name=nom]').value.trim(),
        role: tr.querySelector('[name=role]').value,
        telephone: tr.querySelector('[name=telephone]').value.trim(),
        sms: tr.querySelector('[name=sms]').checked ? 'oui' : 'non',
        actif: tr.querySelector('[name=actif]').checked ? 'oui' : 'non'
      })).filter((u) => u.email);
      await agir('enregistrerUtilisateurs', { users }, 'Utilisateurs enregistrés');
      await afficher();
    }),
    demoCharger: () => FORMS.confirmer('Charger la démonstration ?', 'Neuf dossiers fictifs vont être ajoutés, avec quelques présences et absences. Les vraies données ne sont pas touchées.', 'Charger',
      () => agir('demoCharger', {}, 'Démonstration chargée')),
    demoSupprimer: () => FORMS.confirmer('Supprimer la démonstration ?', 'Les dossiers marqués « démo » seront supprimés. Les vrais dossiers ne sont pas touchés.', 'Supprimer',
      () => agir('demoSupprimer', {}, 'Démonstration supprimée'), 'danger'),
    kraaftImport: () => essayer(async () => {
      const k = await lireFichierKraaft();
      if (!k) throw new Error('Choisissez d\'abord le fichier de reprise Kraaft.');
      const sel = $('#kraaft-dossier');
      const d = parId(sel.value);
      if (!d) throw new Error('Choisissez le dossier de l\'appli à compléter.');
      const n = (k.messages || []).length, nd = (k.documents || []).length;
      FORMS.confirmer('Lancer la reprise Kraaft ?',
        'La conversation Kraaft <strong>' + esc(k.nom || '') + '</strong> (' + n + ' message(s), ' + nd + ' document(s) classé(s)) va être reprise dans le dossier <strong>' + esc(nomClient(d)) + '</strong>.' +
        (k.terminer ? ' Le chantier étant terminé dans Kraaft, le dossier sera ensuite classé dans les archives.' : '') +
        ' Aucun mail n\'est envoyé. Gardez cette page ouverte pendant la reprise.',
        'Lancer', () => { setTimeout(() => essayer(() => lancerKraaft(k, d.id)), 0); });
    })
  };

  function apresAffichage(page) {
    if (page === '' && $('#loupe')) {
      const inp = $('#loupe');
      const box = $('#loupe-res');
      const chercher = () => {
        const mots = motsDe(inp.value);
        if (!mots.length) { box.hidden = true; box.innerHTML = ''; return; }
        const docsDe = (d) => (S.data.documents || []).filter((x) => x.dossierId === d.id);
        const res = S.data.dossiers.filter((d) => trouveTous([d.client, d.titreRdv, d.chantier, d.numDevis, d.numCommande, d.lieu, d.descriptionRdv]
          .concat(docsDe(d).map((x) => x.nom)).join(' '), mots))
          .sort((a, b) => (ouvert(b) - ouvert(a)) || ((b.majLe || '') > (a.majLe || '') ? 1 : -1)).slice(0, 12);
        box.innerHTML = res.length ? res.map((d) => {
          const doc = docsDe(d).find((x) => mots.some((m) => sansAccent(x.nom).indexOf(m) >= 0));
          return '<a class="loupe-item" href="#/dossier/' + d.id + '"><span><strong>' + esc(nomClient(d)) + '</strong>' +
            (d.chantier && d.chantier !== nomClient(d) ? ' · ' + esc(d.chantier) : '') +
            '<span class="muted small">' + [d.numDevis && 'Devis ' + esc(d.numDevis), d.numCommande && 'Commande ' + esc(d.numCommande), d.lieu && esc(d.lieu),
              doc ? 'document « ' + esc(doc.nom) + ' »' : ''].filter(Boolean).map((x) => ' · ' + x).join('') + '</span></span>' + pillEtape(d) + '</a>';
        }).join('') : '<div class="loupe-vide">Aucun dossier ne correspond.</div>';
        box.hidden = false;
      };
      inp.oninput = chercher;
      inp.onkeydown = (ev) => {
        if (ev.key === 'Enter') { const a = box.querySelector('a'); if (a) location.hash = a.getAttribute('href'); }
        if (ev.key === 'Escape') { inp.value = ''; chercher(); }
      };
    }
    if (page === 'archives' && $('#search')) {
      const s = $('#search');
      resultatsRecherche('');
      s.oninput = () => resultatsRecherche(s.value);
    }
    if (page === 'journee' || (page === '' && $('#f-journee'))) brancherJournee();
    if (page === '' && $('#tech-q')) {
      const q = $('#tech-q');
      q.oninput = () => { S.techQ = q.value; filtrerTech(); };
      const choisir = (ev) => {
        const b = ev.target.closest('[data-techfiltre]');
        if (!b) return;
        S.techFiltre = b.dataset.techfiltre;
        document.querySelectorAll('#tech-filtres [data-techfiltre]').forEach((x) => x.classList.toggle('primary', x.dataset.techfiltre === S.techFiltre));
        filtrerTech();
        if (b.closest('#tech-tuiles')) $('#tech-filtres').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      $('#tech-filtres').onclick = choisir;
      $('#tech-tuiles').onclick = choisir;
      filtrerTech();
    }
    if (page === 'agenda' && $('#f-agenda')) {
      const f = $('#f-agenda');
      f.onsubmit = (ev) => {
        ev.preventDefault();
        essayer(async () => {
          const v = Object.fromEntries(new FormData(f));
          S.agendaMots = v.mots;
          afficherResultatsAgenda(await api('chercherAgenda', v));
        });
      };
      if (S.agendaMots) f.requestSubmit();
    }
    if (page === 'trajets' && $('#f-trajets')) {
      const f = $('#f-trajets');
      f.onclick = (ev) => {
        const b = ev.target.closest('[data-periode]');
        if (!b) return;
        const p = b.dataset.periode.split('|');
        f.du.value = p[0]; f.au.value = p[1];
      };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        essayer(async () => {
          const v = Object.fromEntries(new FormData(f));
          if (!v.du || !v.au || v.au < v.du) throw new Error('Choisissez une période valide.');
          toast('Préparation du PDF…');
          const r = await api('trajetsPdf', v);
          const bin = atob(r.base64);
          const octets = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
          const a = document.createElement('a');
          a.href = url; a.download = r.nom; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          toast('PDF téléchargé');
        });
      };
    }
    const chat = $('#chat');
    clearInterval(S.chatTimer);
    if (chat) {
      const repere = $('#chat-nouveaux');
      chat.scrollTop = repere ? repere.offsetTop - chat.offsetTop - 8 : chat.scrollHeight;
      if (S.chatFiltre && S.chatFiltre.dossier === chat.dataset.id) {
        document.querySelectorAll('[data-chatfiltre]').forEach((x) => { x.value = S.chatFiltre[x.dataset.chatfiltre] || ''; });
      } else S.chatFiltre = null;
      filtrerChat();
      if (S.chatFiltre) S.chatFiltre.dossier = chat.dataset.id;
      // Nouveaux messages de l'équipe : vérification toutes les 30 secondes tant que la page est ouverte
      S.chatTimer = setInterval(async () => {
        const c = $('#chat');
        if (!c || document.hidden || $('#modal').open) return;
        try {
          const det = await api('dossier', { id: c.dataset.id });
          const list = det.commentaires || [];
          const der = list.length ? list[list.length - 1].id : '';
          if (der === c.dataset.der) return;
          S.dossier = Object.assign(det, { vuAvant: c.dataset.vu });
          c.innerHTML = bulles(list, c.dataset.vu);
          filtrerChat();
          c.dataset.der = der;
          c.scrollTop = c.scrollHeight;
        } catch (e) { /* on réessaiera au prochain passage */ }
      }, 30000);
    }
    if (page === 'terrain' || page === 'dossier') {
      const r = $('#pct');
      if (r) {
        r.oninput = () => { $('#pct-val').textContent = r.value + ' %'; };
        r.onchange = () => essayer(async () => {
          await agir('avancement', { id: S.dossier.dossier.id, pct: Number(r.value) }, 'Avancement : ' + r.value + ' %');
          S.dossier.dossier.avancement = r.value;
        });
      }
    }
    if (page === 'reglages' && $('#f-reglages')) {
      $('#f-reglages').onsubmit = (ev) => {
        ev.preventDefault();
        const v = {};
        const fd = new FormData(ev.target);
        fd.forEach((val, k) => { v[k] = String(val).trim(); });

        essayer(async () => { await agir('enregistrerReglages', v, 'Réglages enregistrés'); await afficher(); });
      };
    }
    window.scrollTo(0, 0);
  }

  /* ================================================================
   * MESSAGES
   * ================================================================ */
  let toastTimer;
  function toast(msg, erreur) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (erreur ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, erreur ? 6000 : 2800);
  }

  /* ================================================================
   * DÉMARRAGE
   * ================================================================ */
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !ACTIONS[el.dataset.act]) return;
    ev.preventDefault();
    ACTIONS[el.dataset.act](el);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('input[type=file][data-upload]')) envoyerFichier(t);
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tout]');
    if (!b) return;
    b.closest('tr').querySelectorAll('input[type=checkbox]').forEach((x) => { x.checked = b.dataset.tout === '1'; });
  });
  document.addEventListener('input', (ev) => { if (ev.target.matches('[data-chatfiltre]')) filtrerChat(); });
  document.addEventListener('change', (ev) => { if (ev.target.matches('[data-chatfiltre]')) filtrerChat(); });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-chatscroll]');
    const c = $('#chat');
    if (b && c) c.scrollTo({ top: b.dataset.chatscroll === 'haut' ? 0 : c.scrollHeight, behavior: 'smooth' });
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-chatreset]')) return;
    document.querySelectorAll('[data-chatfiltre]').forEach((x) => { x.value = ''; });
    filtrerChat();
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.matches('[data-docsearch]')) return;
    const q = sansAccent(t.value).trim();
    const carte = t.closest('.card');
    let n = 0;
    carte.querySelectorAll('.doc').forEach((el) => {
      const ok = !q || (el.dataset.nom || '').indexOf(q) >= 0;
      el.hidden = !ok;
      if (ok) n++;
    });
    carte.querySelectorAll('.docs').forEach((g) => {
      const titre = g.previousElementSibling;
      const visible = Array.from(g.children).some((x) => !x.hidden);
      g.hidden = !visible;
      if (titre && titre.classList.contains('muted') && titre.tagName === 'DIV') titre.hidden = !visible;
    });
    carte.querySelector('.doc-vide').hidden = n > 0;
  });
  window.addEventListener('hashchange', afficher);
  $('#menu-btn').onclick = () => {
    const open = !$('#nav').classList.contains('open');
    $('#nav').classList.toggle('open', open);
    $('#nav-scrim').classList.toggle('open', open);
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  };
  $('#nav-scrim').onclick = fermerMenu;

  if (!CFG.API_URL || CFG.API_URL.indexOf('A_REMPLIR') >= 0) {
    montrerConnexion('L\'appli n\'est pas encore reliée au programme Google : remplissez le fichier config.js.');
    return;
  }
  const t = lire('sa_token');
  if (jetonValide(t)) { S.token = t; demarrer(); } else montrerConnexion();
})();
