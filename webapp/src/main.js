/* Cockpit granulés · démarrage : connexion des membres, en-tête, paramètres, synchronisation, navigation. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store, CFG = window.HYM_CONFIG || {};
  var VERSION = '1.1.0';

  /* ------------------------------------------------------------------ état de synchronisation (puce de l'en-tête) */
  function puce() {
    var p = $('#puce'); if (!p) return;
    var sale = APP.vues.grille && APP.vues.grille.estSale && APP.vues.grille.estSale();
    var cls = 'puce', txt;
    if (S.mode === 'local') { cls += ' is-local'; txt = 'Mode local'; }
    else if (S.statut === 'enregistrement') { cls += ' is-dirty'; txt = 'Enregistrement…'; }
    else if (S.statut === 'erreur') { cls += ' is-err'; txt = 'Sauvegarde non confirmée'; }
    else if (S.statut === 'conflit') { cls += ' is-err'; txt = 'Conflit de version'; }
    else if (sale) { cls += ' is-dirty'; txt = 'Modifications non appliquées'; }
    else { txt = 'Synchronisé · v' + S.revision; }
    p.className = cls;
    p.innerHTML = '<i></i><span class="txt">' + esc(txt) + '</span>';
    var u = APP.session.utilisateur();
    p.title = S.mode === 'local' ? 'Les données sont conservées sur cet appareil uniquement. Exportez-les régulièrement.' : 'Base commune de l\'équipe' + (u ? ' · connecté : ' + u.email : '');
  }
  APP.tout.puce = puce;
  S.abonner(puce);

  /* ------------------------------------------------------------------ connexion des membres */
  APP.porte = (function () {
    var attente = null, termine = null, jetonRecuperation = null;
    var formulaires = ['f-conn', 'f-oubli', 'f-nouveau', 'f-charge'];
    function montrer(nom, info) {
      formulaires.forEach(function (id) { $('#' + id).hidden = id !== nom; });
      $$('.porte-erreur').forEach(function (e) { e.textContent = ''; });
      var i = $('#' + nom + '-info'); if (i) i.textContent = info || '';
      var champ = $('#' + nom + ' input'); if (champ && nom !== 'f-charge') setTimeout(function () { champ.focus(); }, 60);
    }
    function occupe(btn, texte) { btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.innerHTML = '<span class="chargement" aria-hidden="true"></span>' + texte; }
    function libere(btn) { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
    var messageErreur = function (e) { return e.code === 'auth' ? 'Identifiants incorrects.' : e.code === 'membre' ? 'Ce compte n\'est pas autorisé à utiliser le cockpit.' : e.code === 'reseau' ? 'Service injoignable : vérifiez la connexion.' : e.message; };

    function lier() {
      $('#f-conn').onsubmit = function (ev) {
        ev.preventDefault();
        var email = $('#c-email').value.trim(), mdp = $('#c-mdp').value, err = $('#f-conn .porte-erreur'), btn = $('#c-ok');
        $('#c-email').setAttribute('aria-invalid', String(!email)); $('#c-mdp').setAttribute('aria-invalid', String(!mdp));
        if (!email || !mdp) { err.textContent = 'Saisissez votre adresse e-mail et votre mot de passe.'; return; }
        err.textContent = ''; occupe(btn, 'Vérification…');
        APP.session.connexion(email, mdp).then(function () { $('#c-mdp').value = ''; libere(btn); if (termine) termine(); },
          function (e) { libere(btn); err.textContent = messageErreur(e); $('#c-mdp').setAttribute('aria-invalid', 'true'); $('#c-mdp').select(); });
      };
      $('#c-oubli').onclick = function () { $('#o-email').value = $('#c-email').value; montrer('f-oubli'); };
      $('#o-retour').onclick = function () { montrer('f-conn'); };
      $('#f-oubli').onsubmit = function (ev) {
        ev.preventDefault();
        var email = $('#o-email').value.trim(), btn = $('#o-ok'), err = $('#f-oubli .porte-erreur');
        if (!/.+@.+/.test(email)) { err.textContent = 'Saisissez votre adresse e-mail.'; return; }
        occupe(btn, 'Envoi…');
        APP.session.recuperer(email).then(function () { libere(btn); montrer('f-conn', 'Si cette adresse correspond à un compte membre, un e-mail de réinitialisation vient d\'être envoyé.'); }, function (e) { libere(btn); err.textContent = messageErreur(e); });
      };
      $('#f-nouveau').onsubmit = function (ev) {
        ev.preventDefault();
        var a = $('#n-mdp').value, b = $('#n-mdp2').value, err = $('#f-nouveau .porte-erreur'), btn = $('#n-ok');
        if (a.length < 10) { err.textContent = 'Le mot de passe doit contenir au moins 10 caractères.'; return; }
        if (a !== b) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
        occupe(btn, 'Enregistrement…');
        APP.appelerFonction('password', { password: a }, jetonRecuperation).then(function () { libere(btn); jetonRecuperation = null; $('#n-mdp').value = $('#n-mdp2').value = ''; montrer('f-conn', 'Mot de passe modifié. Connectez-vous avec le nouveau.'); },
          function (e) { libere(btn); err.textContent = e.code === 'auth' ? 'Le lien de réinitialisation a expiré : redemandez-en un.' : messageErreur(e); });
      };
    }
    var liees = false;
    return {
      /** Affiche la connexion ; résout quand un membre est connecté. */
      ouvrir: function (opts) {
        opts = opts || {};
        if (!liees) { lier(); liees = true; }
        if (opts.jeton) jetonRecuperation = opts.jeton;
        if (attente) return attente;
        var porte = $('#porte'); porte.hidden = false; porte.classList.remove('sort');
        montrer(jetonRecuperation ? 'f-nouveau' : 'f-conn');
        attente = new Promise(function (res) { termine = res; }).then(function () { attente = null; termine = null; });
        return attente;
      },
      /** Panneau « chargement des données » (avec nouvel essai si la base est injoignable). */
      charge: function (fn) {
        if (!liees) { lier(); liees = true; }
        var porte = $('#porte'); porte.hidden = false; porte.classList.remove('sort');
        var essai = function () {
          montrer('f-charge'); $('#ch-etat').hidden = false; $('#ch-err').textContent = ''; $('#ch-retour').hidden = true;
          return fn().then(function () { return true; }, function (e) {
            if (e.code === 'session') return APP.porte.ouvrir().then(essai);
            $('#ch-etat').hidden = true; $('#ch-err').textContent = 'Chargement impossible : ' + e.message; $('#ch-retour').hidden = false;
            return new Promise(function (r) { $('#ch-retour').onclick = function () { r(essai()); }; });
          });
        };
        return essai();
      },
      fermer: function () { var p = $('#porte'); p.classList.add('sort'); setTimeout(function () { p.hidden = true; }, 600); },
      recuperation: function () {
        var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
        if (h.get('type') === 'recovery' && h.get('access_token')) { var j = h.get('access_token'); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} return j; }
        return null;
      }
    };
  })();

  function connexion() {
    if (S.mode === 'local') { $('#porte').remove(); return Promise.resolve(); }
    var rec = APP.porte.recuperation();
    var identifie = rec ? APP.porte.ouvrir({ jeton: rec }) : (APP.session.active() ? APP.session.jeton().then(function () {}, function () { return APP.porte.ouvrir(); }) : APP.porte.ouvrir());
    return identifie.then(function () { return APP.porte.charge(function () { return S.recharger(); }); }).then(function () { APP.porte.fermer(); });
  }

  /* ------------------------------------------------------------------ paramètres */
  function nouveauMotDePasse() {
    var f = APP.fenetre('<form class="modale verre" novalidate><h2>Changer mon mot de passe</h2><p class="aide">Choisissez un mot de passe d\'au moins 10 caractères, que vous n\'utilisez nulle part ailleurs.</p>' +
      '<div class="champ"><label for="m-mdp">Nouveau mot de passe</label><input class="saisie" id="m-mdp" type="password" autocomplete="new-password"></div>' +
      '<div class="champ"><label for="m-mdp2">Confirmer</label><input class="saisie" id="m-mdp2" type="password" autocomplete="new-password"></div><div class="msgs" id="m-err"></div>' +
      '<div class="actions"><button class="btn btn--main" type="submit">Enregistrer</button><button class="btn btn--ghost" type="button" data-non>Annuler</button></div></form>');
    $('[data-non]', f.el).onclick = f.fermer;
    $('form', f.el).onsubmit = function (e) {
      e.preventDefault();
      var a = $('#m-mdp', f.el).value, b = $('#m-mdp2', f.el).value, z = $('#m-err', f.el);
      var msg = function (t) { z.innerHTML = '<div class="msg msg--err">' + icon('alert') + '<div>' + esc(t) + '</div></div>'; };
      if (a.length < 10) return msg('Au moins 10 caractères.');
      if (a !== b) return msg('Les deux mots de passe ne sont pas identiques.');
      APP.session.changerMotDePasse(a).then(function () { f.fermer(); APP.toast('Mot de passe modifié.'); }, function (err) { msg(err.message); });
    };
  }

  function parametres() {
    var u = APP.session.utilisateur();
    var maj = S.majBase ? new Date(S.majBase).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    var info = S.mode === 'cloud'
      ? '<div class="msg ' + (S.statut === 'ok' ? 'msg--ok' : S.statut === 'enregistrement' ? '' : 'msg--err') + '">' + icon(S.statut === 'ok' ? 'check' : 'alert') + '<div><b>Base commune connectée</b> · version ' + S.revision + (S.auteur ? '<br>Dernière sauvegarde : ' + esc(S.auteur) + (maj ? ' le ' + esc(maj) : '') : '') + (S.message ? '<br>' + esc(S.message) : '') + '</div></div>'
      : '<div class="msg msg--warn">' + icon('alert') + '<div><b>Mode local</b> : la base commune n\'est pas configurée. Les données restent sur cet appareil (navigateur). Exportez régulièrement le classeur Excel ou une sauvegarde.</div></div>';
    var compte = S.mode === 'cloud' && u ? '<section><h3 class="etiquette">Mon compte</h3><p style="margin-top:var(--s2)"><b>' + esc(u.nom || u.email) + '</b><br><span class="aide">' + esc(u.email) + '</span></p><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-mdp>' + icon('lock') + 'Changer mon mot de passe</button><button class="btn btn--ghost btn--s" type="button" data-deco>Se déconnecter</button></div><p class="aide" style="margin-top:var(--s2)">Les comptes et les mots de passe sont administrés dans Supabase par l\'administrateur de l\'équipe.</p></section>' : '';
    var f = APP.fenetre('<div class="tiroir verre" role="dialog" aria-label="Paramètres">' +
      '<div class="titre" style="margin:0"><div><h1 style="font-size:var(--h2)">Paramètres</h1></div><button class="icone-btn" type="button" data-fermer aria-label="Fermer">' + icon('croix') + '</button></div>' + compte +
      '<section><h3 class="etiquette">Départ des livraisons</h3><div class="champ" style="margin-top:var(--s3)"><label for="p-depart">Adresse de départ</label><input class="saisie" id="p-depart" value="' + esc(APP.pref('depart') || H.CONFIG.ADRESSE_DEPART) + '"></div><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--main btn--s" type="button" data-depart>Enregistrer l\'adresse</button><button class="btn btn--ghost btn--s" type="button" data-depart-defaut>Valeur d\'origine</button></div></section>' +
      '<section><h3 class="etiquette">Synchronisation</h3><div style="margin-top:var(--s3)">' + info + '</div><div class="actions" style="margin-top:var(--s3)">' +
        (S.mode === 'cloud' ? '<button class="btn btn--main btn--s" type="button" data-sauver>' + icon('cloud') + 'Enregistrer l\'état actuel</button><button class="btn btn--ghost btn--s" type="button" data-rech>' + icon('refresh') + 'Recharger depuis la base</button>' : '') + '</div></section>' +
      '<section><h3 class="etiquette">Sauvegarde sur cet appareil</h3><p class="aide" style="margin-top:var(--s2)">Un fichier .json contenant la grille et tout l\'historique, au même format que la base commune.</p><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-exp-json>' + icon('download') + 'Exporter (.json)</button><label class="btn btn--ghost btn--s" for="p-imp-json" style="cursor:pointer">' + icon('upload') + 'Importer (.json)</label><input type="file" id="p-imp-json" accept=".json,application/json" class="sr"></div></section>' +
      '<section><h3 class="etiquette">Réinitialisation</h3><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--danger btn--s" type="button" data-reset>' + icon('trash') + 'Revenir aux valeurs par défaut</button></div></section>' +
      '<p class="aide">Cockpit granulés ' + VERSION + ' · ' + esc(H.CONFIG.SOCIETE) + ' · ' + esc(H.CONFIG.TELEPHONE) + '</p></div>', { classe: 'dlg-tiroir' });
    var el = f.el;
    $('[data-fermer]', el).onclick = f.fermer;
    var m = $('[data-mdp]', el); if (m) m.onclick = function () { f.fermer(); nouveauMotDePasse(); };
    var d = $('[data-deco]', el); if (d) d.onclick = APP.verrouiller;
    $('[data-depart]', el).onclick = function () { var v = $('#p-depart', el).value.trim(); if (v.length < 8) { APP.toast('Saisissez une adresse complète.', 'err'); return; } APP.pref('depart', v); try { localStorage.removeItem('hym.depart'); } catch (e) {} APP.sim.recalculer(); APP.toast('Adresse de départ enregistrée.'); };
    $('[data-depart-defaut]', el).onclick = function () { APP.pref('depart', H.CONFIG.ADRESSE_DEPART); try { localStorage.removeItem('hym.depart'); } catch (e) {} $('#p-depart', el).value = H.CONFIG.ADRESSE_DEPART; APP.sim.recalculer(); APP.toast('Adresse d\'origine rétablie.'); };
    var sv = $('[data-sauver]', el); if (sv) sv.onclick = function () { S.enregistrer().then(function (ok) { if (ok) { APP.toast('État enregistré.'); f.fermer(); } }); };
    var rc = $('[data-rech]', el); if (rc) rc.onclick = function () { APP.confirmer({ titre: 'Recharger depuis la base ?', texte: 'Les changements non enregistrés de cette session seront abandonnés.', ok: 'Recharger', danger: true }).then(function (ok) { if (!ok) return; S.recharger().then(function () { APP.toast('Base rechargée.'); APP.tout.rendre(); f.fermer(); }, function (e) { APP.toast(e.message, 'err'); }); }); };
    $('[data-exp-json]', el).onclick = function () { APP.telecharger(new Blob([JSON.stringify(H.encoderEtat(S.etat), null, 1)], { type: 'application/json' }), 'HYM_sauvegarde_granules_' + APP.aujourdhui().replace(/-/g, '') + '.json'); };
    $('#p-imp-json', el).onchange = function (e) {
      var fi = e.target.files[0]; if (!fi) return;
      fi.text().then(function (t) { var etat = H.decoderEtat(JSON.parse(t)); etat.source_grille = fi.name + ' (sauvegarde)'; return APP.confirmer({ titre: 'Remplacer les données ?', texte: 'La grille et l\'historique actuels seront remplacés par ceux du fichier « ' + fi.name + ' ».', ok: 'Remplacer', danger: true }).then(function (ok) { if (!ok) return; return S.appliquer(etat).then(function () { APP.toast('Sauvegarde importée.'); APP.tout.rendre(); f.fermer(); }); }); }).catch(function (err) { APP.toast('Fichier non valide : ' + err.message, 'err'); });
    };
    $('[data-reset]', el).onclick = function () { APP.confirmer({ titre: 'Revenir aux valeurs par défaut ?', texte: 'La grille est remplacée par les valeurs du code. L\'historique de prix est conservé.', ok: 'Réinitialiser', danger: true }).then(function (ok) { if (!ok) return; var dd = H.etatParDefaut(); dd.historique = S.etat.historique; S.appliquer(dd).then(function () { APP.toast('Valeurs par défaut rétablies.'); APP.tout.rendre(); f.fermer(); }); }); };
  }

  /* ------------------------------------------------------------------ démarrage */
  function demarrer() {
    var navigation = function (e) { var t = e.target.closest('.tab'); if (t) APP.aller(t.dataset.onglet); };
    $$('.tabs, .basse').forEach(function (c) {
      c.addEventListener('click', navigation);
      c.addEventListener('keydown', function (e) {
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(e.key) < 0) return;
        var tabs = $$('.tab', c), i = tabs.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); var n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); APP.aller(tabs[n].dataset.onglet);
      });
    });
    $('#btn-param').onclick = parametres; $('#puce').onclick = parametres;
    var lock = $('#btn-lock'); if (S.mode === 'local') lock.hidden = true; else lock.onclick = APP.verrouiller;
    Object.keys(APP.vues).forEach(function (k) { if (APP.vues[k].rendre) APP.vues[k].rendre(); });
    puce();
    var depart = (location.hash || '').replace('#', '');
    APP.aller(['simulateur', 'grille', 'donnees', 'analyse'].indexOf(depart) >= 0 ? depart : 'simulateur', { sans: true });
    window.addEventListener('resize', APP.debounce(APP.placerPilules, 80));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { APP.placerPilules(); Object.keys(APP.vues).forEach(function (k) { if (APP.vues[k].ouvrir) { try { APP.vues[k].ouvrir(); } catch (e) {} } }); });
    window.addEventListener('beforeunload', function (e) { if (APP.vues.grille.estSale()) { e.preventDefault(); e.returnValue = ''; } });
    if (S.mode === 'cloud' && S.vide) APP.toast('La base est vide : appliquez la grille ou importez un classeur pour l\'initialiser.');
    document.body.classList.add('pret');
  }

  document.addEventListener('DOMContentLoaded', function () {
    S.init();
    connexion().then(demarrer);
  });
})();
