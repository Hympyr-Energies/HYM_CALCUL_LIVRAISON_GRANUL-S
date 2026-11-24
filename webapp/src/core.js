/* Cockpit granulés · noyau : outils, icônes, notifications, fenêtres, stockage et synchronisation, accès, onglets, aimant des boutons. */
(function () {
  'use strict';
  var APP = window.APP = window.APP || {};
  var H = window.HYM;
  var CFG = window.HYM_CONFIG || {};
  APP.H = H;

  /* ------------------------------------------------------------------ outils */
  var $ = APP.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = APP.$$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  APP.esc = function (t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  APP.reduit = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; };
  APP.attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  APP.debounce = function (f, ms) { var h; return function () { var a = arguments, c = this; clearTimeout(h); h = setTimeout(function () { f.apply(c, a); }, ms); }; };
  APP.aujourdhui = function () { return H.dateIso(new Date()); };

  var TRACES = {
    calc: '<rect x="5" y="3" width="14" height="18" rx="2.6"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    grille: '<rect x="3.5" y="4" width="17" height="16" rx="2.6"/><path d="M3.5 9.5h17M9.5 9.5V20"/>',
    donnees: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    analyse: '<path d="M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    check: '<circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.4l2.8 2.8 5.6-6"/>',
    alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.01"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 3.5V16H13z"/><circle cx="7" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', croix: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 19.5h15"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9z"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
    fichier: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5"/>',
    archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1.5"/><path d="M5.5 8.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8.5M10 13h4"/>',
    loupe: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5M4.5 10.5h9M4.5 13.5h9"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  APP.icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (TRACES[n] || '') + '</svg>'; };

  /* ------------------------------------------------------------------ notifications */
  APP.toast = function (texte, type) {
    var zone = $('#toasts'); if (!zone) return;
    var t = document.createElement('div');
    t.className = 'toast verre'; t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    t.innerHTML = APP.icon(type === 'err' ? 'alert' : 'check') + '<span>' + APP.esc(texte) + '</span>';
    zone.appendChild(t);
    setTimeout(function () { t.classList.add('sort'); setTimeout(function () { t.remove(); }, 350); }, type === 'err' ? 6500 : 3600);
  };

  /* ------------------------------------------------------------------ fenêtres */
  APP.fenetre = function (html, opts) {
    opts = opts || {};
    var d = document.createElement('dialog');
    d.className = opts.classe || '';
    d.innerHTML = html;
    document.body.appendChild(d);
    var fin = function () { if (d.open) d.close(); };
    d.addEventListener('close', function () { setTimeout(function () { d.remove(); }, 20); if (opts.onClose) opts.onClose(); });
    d.addEventListener('click', function (e) { if (e.target === d) fin(); });
    d.showModal();
    return { el: d, fermer: fin };
  };

  /** Confirmation : résout true/false. */
  APP.confirmer = function (o) {
    return new Promise(function (resolve) {
      var rep = false;
      var f = APP.fenetre('<div class="modale verre"><h2>' + APP.esc(o.titre) + '</h2><div class="aide">' + (o.html || APP.esc(o.texte || '')) + '</div>' +
        '<div class="actions"><button class="btn ' + (o.danger ? 'btn--danger' : 'btn--main') + '" data-ok>' + APP.esc(o.ok || 'Confirmer') + '</button><button class="btn btn--ghost" data-non>' + APP.esc(o.non || 'Annuler') + '</button></div></div>',
        { onClose: function () { resolve(rep); } });
      $('[data-ok]', f.el).addEventListener('click', function () { rep = true; f.fermer(); });
      $('[data-non]', f.el).addEventListener('click', function () { f.fermer(); });
    });
  };

  /* ------------------------------------------------------------------ réseau (injectable pour les tests) */
  APP.reseau = {
    json: function (url, opts) {
      opts = opts || {};
      var ac = new AbortController(), id = setTimeout(function () { ac.abort(); }, opts.timeout || 8000);
      return fetch(url, { signal: ac.signal, method: opts.method || 'GET', headers: opts.headers, body: opts.body })
        .then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; e.corps = r; throw e; } return r.json(); })
        .finally(function () { clearTimeout(id); });
    }
  };

  /* ------------------------------------------------------------------ stockage local */
  var CLE = 'hym.granules.v1';
  function lireLocal() { try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; } }
  function ecrireLocal(o) { try { localStorage.setItem(CLE, JSON.stringify(o)); return true; } catch (e) { return false; } }
  APP.pref = function (k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem('hym.pref.' + k) || 'null'); localStorage.setItem('hym.pref.' + k, JSON.stringify(v)); } catch (e) { return null; }
  };

  var ecouteurs = [];
  var S = APP.store = {
    etat: null, revision: 0, mode: CFG.SYNC_URL ? 'cloud' : 'local',
    statut: 'ok',          // ok | modifie | enregistrement | erreur | conflit
    message: '', vide: false, derniere: null,
    abonner: function (f) { ecouteurs.push(f); },
    notifier: function () { ecouteurs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); },
    init: function () {
      var l = lireLocal();
      if (l && l.payload) {
        try { S.etat = H.decoderEtat(l.payload); S.revision = l.revision || 0; S.derniere = l.derniere || null; }
        catch (e) { S.etat = H.etatParDefaut(); }
      } else { S.etat = H.etatParDefaut(); S.vide = true; }
    },
    /** Applique un changement et l'enregistre (local toujours, base commune si configurée). */
    appliquer: function (patch, opts) {
      Object.assign(S.etat, patch);
      S.statut = 'modifie'; S.notifier();
      return S.enregistrer(opts);
    },
    persisterLocal: function () { return ecrireLocal({ payload: H.encoderEtat(S.etat), revision: S.revision, derniere: S.derniere }); },
    enregistrer: function (opts) {
      opts = opts || {};
      S.persisterLocal();
      if (S.mode !== 'cloud') { S.statut = 'ok'; S.derniere = Date.now(); S.persisterLocal(); S.notifier(); return Promise.resolve(true); }
      S.statut = 'enregistrement'; S.notifier();
      return nuage('save', { payload: H.encoderEtat(S.etat), expected_revision: S.revision }).then(function (r) {
        S.revision = r.revision; S.statut = 'ok'; S.vide = false; S.derniere = Date.now(); S.message = ''; S.auteur = (APP.session.utilisateur() || {}).email || ''; S.persisterLocal(); S.notifier(); return true;
      }, function (e) {
        S.message = e.message;
        if (e.code === 'conflit') { S.statut = 'conflit'; S.notifier(); APP.fenetreConflit(); }
        else if (e.code === 'session') { S.statut = 'erreur'; S.notifier(); APP.porte.ouvrir().then(function () { APP.porte.fermer(); return S.enregistrer(); }); }
        else { S.statut = 'erreur'; S.notifier(); if (!opts.silencieux) APP.toast('Sauvegarde non confirmée : ' + e.message + ' Vos données restent sur cet appareil.', 'err'); }
        return false;
      });
    },
    /** Recharge la base commune (abandonne l'état local). */
    recharger: function () {
      if (S.mode !== 'cloud') return Promise.resolve(false);
      S.statut = 'enregistrement'; S.notifier();
      return nuage('load').then(function (r) {
        if (r.payload) { S.etat = H.decoderEtat(r.payload); S.vide = false; } else { S.vide = true; }
        S.revision = r.revision; S.statut = 'ok'; S.message = ''; S.derniere = Date.now(); S.auteur = r.updated_by_email || ''; S.majBase = r.updated_at || null; S.persisterLocal(); S.notifier(); return true;
      }, function (e) { S.statut = 'erreur'; S.message = e.message; S.notifier(); throw e; });
    }
  };

  /* ------------------------------------------------------------------ fonction serveur (qui détient les clés Supabase : la page n'en contient aucune) */
  function erreurDe(e, corps) {
    var err = new Error(corps && corps.message ? corps.message : 'Service injoignable.');
    var st = e && e.status;
    if (st === 409) err.code = 'conflit';
    else if (st === 401) err.code = 'auth';
    else if (st === 403) err.code = 'membre';
    else if (st === 400) err.code = 'requete';
    else if (st) { err.code = 'base'; if (!corps || !corps.message) err.message = 'Échec du service (HTTP ' + st + ').'; }
    else err.code = 'reseau';
    return err;
  }
  function appeler(action, corps, jeton) {
    var headers = { 'Content-Type': 'application/json' };
    if (jeton) headers.Authorization = 'Bearer ' + jeton;
    return APP.reseau.json(CFG.SYNC_URL, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, corps || {})), timeout: 20000 }).catch(function (e) {
      if (e && e.corps && e.corps.json) return e.corps.json().catch(function () { return null; }).then(function (b) { throw erreurDe(e, b); });
      throw erreurDe(e, null);
    });
  }

  /* ------------------------------------------------------------------ session commune des outils Hympyr (connexion unique par le portail) */
  // Même client supabase-js, même origine (hympyr-energies.github.io) et même clé de stockage que le portail, la charte et le pilotage :
  // une connexion au portail ouvre ce cockpit, « Se déconnecter » ici ferme tous les outils. La clé « publishable » est publique par
  // conception ; les données restent derrière la fonction Edge, qui valide le jeton et vérifie l'appartenance à la table de membres.
  var PORTAIL = CFG.PORTAIL_URL || 'https://hympyr-energies.github.io/portail/', SB = null, courante = null;
  try {
    if (window.supabase && CFG.SB_URL && CFG.SB_KEY) SB = window.supabase.createClient(CFG.SB_URL, CFG.SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  } catch (e) { SB = null; }
  function sansSession(message) { var e = new Error(message || 'Connexion requise.'); e.code = 'session'; return e; }
  function retenir(s) { courante = s && s.access_token ? s : null; return courante; }
  function sessionDe(r) { return retenir(r && r.data ? r.data.session : null); }
  if (SB) SB.auth.onAuthStateChange(function (ev, s) {
    retenir(s);
    // Déconnexion depuis le portail, un autre outil ou un autre onglet : on masque aussitôt les données de l'écran.
    if (ev === 'SIGNED_OUT' && APP.porte && APP.porte.demarre) APP.porte.ouvrir().then(APP.porte.fermer);
  });

  APP.portail = {
    url: function (params) {
      var u = new URL(PORTAIL);
      Object.keys(params || {}).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); });
      return u.href;
    },
    /** Pas de session : direction la page de connexion unique, qui ramène ici ensuite (?retour=…).
        Garde-fou : si l'on revient du portail sans session depuis moins de 20 s, on s'arrête (évite une boucle de redirections). */
    seConnecter: function () {
      var dernier = 0, k = 'hym.redirection.' + (CFG.OUTIL || 'outil');
      try { dernier = +sessionStorage.getItem(k) || 0; sessionStorage.setItem(k, String(Date.now())); } catch (e) {}
      if (Date.now() - dernier < 20000) return false;
      location.replace(APP.portail.url({ retour: location.href, outil: CFG.OUTIL }));
      return true;
    },
    /** Compte connecté mais pas membre de ce cockpit : retour au portail, qui l'explique (sans fermer la session des autres outils). */
    refuser: function () { location.replace(APP.portail.url({ outil: CFG.OUTIL, refus: '1' })); },
    /** Ancien lien « mot de passe oublié » arrivé sur le cockpit : la saisie du nouveau mot de passe se fait au portail. */
    recuperation: function () {
      var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
      location.replace(PORTAIL + location.hash);
      return true;
    }
  };

  APP.session = {
    disponible: function () { return !!SB; },
    /** Lit la session commune (stockage partagé avec le portail) ; null si personne n'est connecté. */
    demarrer: function () {
      if (!SB) return Promise.reject(new Error('Service de connexion indisponible : vérifiez la connexion internet puis rechargez la page.'));
      return SB.auth.getSession().then(sessionDe);
    },
    lire: function () { return courante && courante.user ? { email: courante.user.email, nom: '' } : null; },
    utilisateur: function () { return APP.session.lire(); },
    active: function () { return !!courante; },
    /** Jeton valide : supabase-js le renouvelle automatiquement (un seul renouvellement à la fois entre onglets). */
    jeton: function () {
      if (!SB) return Promise.reject(sansSession());
      return SB.auth.getSession().then(function (r) { var s = sessionDe(r); if (!s) throw sansSession(); return s.access_token; });
    },
    rafraichir: function () {
      if (!SB) return Promise.reject(sansSession());
      return SB.auth.refreshSession().then(function (r) { var s = sessionDe(r); if ((r && r.error) || !s) throw sansSession('Session expirée : reconnectez-vous.'); return s; });
    },
    /** La session commune n'est jamais effacée sur une simple erreur : seul « Se déconnecter » la ferme (pour tous les outils). */
    effacer: function () {},
    fermer: function () { return SB ? SB.auth.signOut().then(function () {}, function () {}) : Promise.resolve(); },
    changerMotDePasse: function (mdp) { return nuage('password', { password: mdp }); }
  };

  /** Appel authentifié : une session refusée est renouvelée une fois avant d'abandonner. */
  function nuage(action, corps) {
    var essai = function (reprise) {
      return APP.session.jeton().then(function (j) { return appeler(action, corps, j); }).catch(function (e) {
        if (e.code === 'auth' && !reprise) return APP.session.rafraichir().then(function () { return essai(true); });
        if (e.code === 'auth') { e.code = 'session'; e.message = 'Session expirée : reconnectez-vous.'; }
        throw e;
      });
    };
    return essai(false);
  }
  APP.appelerFonction = appeler;

  APP.fenetreConflit = function () {
    var f = APP.fenetre('<div class="modale verre"><h2>Modifications concurrentes</h2><div class="aide">Un collègue a enregistré des changements pendant que vous travailliez. Pour ne rien écraser, exportez votre travail (Excel), rechargez la base, puis réappliquez vos modifications.</div>' +
      '<div class="actions"><button class="btn btn--main" data-rech>' + APP.icon('refresh') + 'Recharger la base</button><button class="btn btn--ghost" data-exp>' + APP.icon('download') + 'Exporter mon travail</button><button class="btn btn--ghost" data-non>Plus tard</button></div></div>');
    $('[data-non]', f.el).addEventListener('click', f.fermer);
    $('[data-exp]', f.el).addEventListener('click', function () { if (APP.exporterExcel) APP.exporterExcel(); });
    $('[data-rech]', f.el).addEventListener('click', function () { S.recharger().then(function () { f.fermer(); APP.toast('Base rechargée.'); APP.tout.rendre(); }, function (e) { APP.toast(e.message, 'err'); }); });
  };

  /* ------------------------------------------------------------------ déconnexion */
  /** Ferme la session commune (tous les outils Hympyr) et revient à la page de connexion unique. */
  APP.verrouiller = function () { APP.session.fermer().then(function () { location.replace(APP.portail.url()); }); };

  /* ------------------------------------------------------------------ onglets : pastille qui glisse, transition sans saccade */
  var ONGLETS = ['simulateur', 'grille', 'donnees', 'analyse'];
  var courant = null;
  function placerPilule(conteneur) {
    var pil = $('.pilule', conteneur), on = $('.tab[aria-selected="true"]', conteneur);
    if (!pil || !on || !on.offsetWidth) return;
    pil.style.width = on.offsetWidth + 'px';
    pil.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  APP.placerPilules = function () { $$('.tabs, .basse').forEach(placerPilule); };
  APP.aller = function (nom, opts) {
    opts = opts || {};
    if (ONGLETS.indexOf(nom) < 0) nom = 'simulateur';
    var vieux = courant && $('#p-' + courant), neuf = $('#p-' + nom);
    $$('.tab').forEach(function (t) { var on = t.dataset.onglet === nom; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    APP.placerPilules();
    if (courant === nom) return;
    var precedent = courant; courant = nom;
    try { history.replaceState(null, '', '#' + nom); } catch (e) {}
    var montrer = function () {
      $$('.panneau').forEach(function (p) { p.classList.remove('is-on', 'entre', 'sort'); });
      neuf.classList.add('is-on');
      if (APP.vues && APP.vues[nom] && APP.vues[nom].ouvrir) APP.vues[nom].ouvrir();
      if (!APP.reduit() && !opts.sans) { neuf.classList.add('entre'); setTimeout(function () { neuf.classList.remove('entre'); }, 520); }
      if (!opts.sans) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    };
    if (vieux && precedent && !APP.reduit() && !opts.sans) { vieux.classList.add('sort'); setTimeout(montrer, 150); } else montrer();
  };

  /* ------------------------------------------------------------------ aimant des boutons : même effet que le site (5 % / ±4 px, 12 % / ±3 px) */
  (function () {
    var calme = APP.reduit(), tactile = window.matchMedia && matchMedia('(hover:none)').matches;
    if (calme || tactile || !('WeakMap' in window)) return;
    var CIBLES = '.btn,.rond,.icone-btn,.tab,.pastille', EXCL = '[disabled],[aria-disabled="true"]';
    var etat = new WeakMap(), actifs = [], raf = 0, avant = 0;
    var borne = function (v, m) { return Math.max(-m, Math.min(m, v)); };
    function suivi(el) { var s = etat.get(el); if (!s) { s = { x: 0, y: 0, cx: 0, cy: 0 }; etat.set(el, s); } return s; }
    function boucle(t) {
      raf = 0; var dt = Math.min(64, t - (avant || t)); avant = t; var a = 1 - Math.exp(-dt / 55), vw = document.documentElement.clientWidth / 100 || 1;
      for (var i = actifs.length - 1; i >= 0; i--) {
        var el = actifs[i], s = etat.get(el);
        s.x += (s.cx - s.x) * a; s.y += (s.cy - s.y) * a;
        if (Math.abs(s.cx - s.x) < .02 && Math.abs(s.cy - s.y) < .02) { s.x = s.cx; s.y = s.cy; if (!s.cx && !s.cy) { el.style.removeProperty('translate'); s.on = false; actifs.splice(i, 1); continue; } }
        el.style.translate = (s.x / vw).toFixed(3) + 'vw ' + (s.y / vw).toFixed(3) + 'vw';
      }
      if (actifs.length) raf = requestAnimationFrame(boucle); else avant = 0;
    }
    function lance(el, s) { if (!s.on) { s.on = true; actifs.push(el); } if (!raf) raf = requestAnimationFrame(boucle); }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return; var el = e.target.closest && e.target.closest(CIBLES); if (!el || el.matches(EXCL)) return;
      var s = suivi(el), r = el.getBoundingClientRect();
      s.cx = borne((e.clientX - (r.left + r.width / 2)) * .05, 4); s.cy = borne((e.clientY - (r.top + r.height / 2)) * .12, 3); lance(el, s);
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest && e.target.closest(CIBLES), s = el && etat.get(el);
      if (!s || (e.relatedTarget && el.contains(e.relatedTarget))) return; s.cx = 0; s.cy = 0; lance(el, s);
    }, true);
  })();

  /* ------------------------------------------------------------------ animation d'un nombre */
  APP.compter = function (el, vers, fmt) {
    var de = parseFloat(el.dataset.v || '0') || 0; el.dataset.v = vers;
    var id = el._cpt = (el._cpt || 0) + 1;
    if (APP.reduit() || de === vers) { el.textContent = fmt(vers); return; }
    var t0 = null;
    (function pas(t) { if (el._cpt !== id) return; t0 = t0 || t; var p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(de + (vers - de) * e); if (p < 1) requestAnimationFrame(pas); else el.textContent = fmt(vers); })(performance.now());
  };

  /** Pastille qui glisse derrière le bouton actif d'un groupe (.seg). */
  APP.glisse = function (seg) {
    var p = $('.glisse', seg); if (!p) { p = document.createElement('span'); p.className = 'glisse'; p.setAttribute('aria-hidden', 'true'); seg.insertBefore(p, seg.firstChild); }
    var on = $('button[aria-pressed="true"]', seg); if (!on || !on.offsetWidth) { p.style.opacity = 0; return; }
    p.style.opacity = 1; p.style.width = on.offsetWidth + 'px'; p.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  };

  APP.vues = {};
  APP.tout = { rendre: function () { Object.keys(APP.vues).forEach(function (k) { if (APP.vues[k].rendre) APP.vues[k].rendre(); }); } };
})();
