/* Cockpit granulés · démarrage : connexion, en-tête, paramètres, synchronisation, navigation. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store, CFG = window.HYM_CONFIG || {};
  var VERSION = '1.0.0';

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
    p.title = S.mode === 'local' ? 'Les données sont conservées sur cet appareil uniquement. Exportez-les régulièrement.' : 'Base commune de l\'équipe';
  }
  APP.tout.puce = puce;
  S.abonner(puce);

  /* ------------------------------------------------------------------ paramètres */
  function parametres() {
    var info = S.mode === 'cloud'
      ? '<div class="msg ' + (S.statut === 'ok' ? 'msg--ok' : S.statut === 'enregistrement' ? '' : 'msg--err') + '">' + icon(S.statut === 'ok' ? 'check' : 'alert') + '<div><b>Base commune connectée</b> · version ' + S.revision + (S.derniere ? ' · dernière synchronisation ' + new Date(S.derniere).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '') + (S.message ? '<br>' + esc(S.message) : '') + '</div></div>'
      : '<div class="msg msg--warn">' + icon('alert') + '<div><b>Mode local</b> : la base commune n\'est pas configurée. Les données restent sur cet appareil (navigateur). Exportez régulièrement le classeur Excel ou une sauvegarde.</div></div>';
    var f = APP.fenetre('<div class="tiroir verre" role="dialog" aria-label="Paramètres">' +
      '<div class="titre" style="margin:0"><div><h1 style="font-size:var(--h2)">Paramètres</h1></div><button class="icone-btn" type="button" data-fermer aria-label="Fermer">' + icon('croix') + '</button></div>' +
      '<section><h3 class="etiquette">Départ des livraisons</h3><div class="champ" style="margin-top:var(--s3)"><label for="p-depart">Adresse de départ</label><input class="saisie" id="p-depart" value="' + esc(APP.pref('depart') || H.CONFIG.ADRESSE_DEPART) + '"></div><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--main btn--s" type="button" data-depart>Enregistrer l\'adresse</button><button class="btn btn--ghost btn--s" type="button" data-depart-defaut>Valeur d\'origine</button></div></section>' +
      '<section><h3 class="etiquette">Synchronisation</h3><div style="margin-top:var(--s3)">' + info + '</div><div class="actions" style="margin-top:var(--s3)">' +
        (S.mode === 'cloud' ? '<button class="btn btn--main btn--s" type="button" data-sauver>' + icon('cloud') + 'Enregistrer l\'état actuel</button><button class="btn btn--ghost btn--s" type="button" data-rech>' + icon('refresh') + 'Recharger depuis la base</button>' : '') + '</div></section>' +
      '<section><h3 class="etiquette">Sauvegarde sur cet appareil</h3><p class="aide" style="margin-top:var(--s2)">Un fichier .json contenant la grille et tout l\'historique, au même format que la base commune.</p><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-exp-json>' + icon('download') + 'Exporter (.json)</button><label class="btn btn--ghost btn--s" for="p-imp-json" style="cursor:pointer">' + icon('upload') + 'Importer (.json)</label><input type="file" id="p-imp-json" accept=".json,application/json" class="sr"></div></section>' +
      '<section><h3 class="etiquette">Réinitialisation</h3><div class="actions" style="margin-top:var(--s3)"><button class="btn btn--danger btn--s" type="button" data-reset>' + icon('trash') + 'Revenir aux valeurs par défaut</button></div></section>' +
      '<p class="aide">Cockpit granulés ' + VERSION + ' · ' + esc(H.CONFIG.SOCIETE) + ' · ' + esc(H.CONFIG.TELEPHONE) + '</p></div>', { classe: 'dlg-tiroir' });
    var el = f.el;
    $('[data-fermer]', el).onclick = f.fermer;
    $('[data-depart]', el).onclick = function () { var v = $('#p-depart', el).value.trim(); if (v.length < 8) { APP.toast('Saisissez une adresse complète.', 'err'); return; } APP.pref('depart', v); try { localStorage.removeItem('hym.depart'); } catch (e) {} APP.sim.recalculer(); APP.toast('Adresse de départ enregistrée.'); };
    $('[data-depart-defaut]', el).onclick = function () { APP.pref('depart', H.CONFIG.ADRESSE_DEPART); try { localStorage.removeItem('hym.depart'); } catch (e) {} $('#p-depart', el).value = H.CONFIG.ADRESSE_DEPART; APP.sim.recalculer(); APP.toast('Adresse d\'origine rétablie.'); };
    var sv = $('[data-sauver]', el); if (sv) sv.onclick = function () { S.enregistrer().then(function (ok) { if (ok) { APP.toast('État enregistré.'); f.fermer(); } }); };
    var rc = $('[data-rech]', el); if (rc) rc.onclick = function () { APP.confirmer({ titre: 'Recharger depuis la base ?', texte: 'Les changements non enregistrés de cette session seront abandonnés.', ok: 'Recharger', danger: true }).then(function (ok) { if (!ok) return; S.recharger().then(function () { APP.toast('Base rechargée.'); APP.tout.rendre(); f.fermer(); }, function (e) { APP.toast(e.message, 'err'); }); }); };
    $('[data-exp-json]', el).onclick = function () { APP.telecharger(new Blob([JSON.stringify(H.encoderEtat(S.etat), null, 1)], { type: 'application/json' }), 'HYM_sauvegarde_granules_' + APP.aujourdhui().replace(/-/g, '') + '.json'); };
    $('#p-imp-json', el).onchange = function (e) {
      var fi = e.target.files[0]; if (!fi) return;
      fi.text().then(function (t) { var etat = H.decoderEtat(JSON.parse(t)); etat.source_grille = fi.name + ' (sauvegarde)'; return APP.confirmer({ titre: 'Remplacer les données ?', texte: 'La grille et l\'historique actuels seront remplacés par ceux du fichier « ' + fi.name + ' ».', ok: 'Remplacer', danger: true }).then(function (ok) { if (!ok) return; return S.appliquer(etat).then(function () { APP.toast('Sauvegarde importée.'); APP.tout.rendre(); f.fermer(); }); }); }).catch(function (err) { APP.toast('Fichier non valide : ' + err.message, 'err'); });
    };
    $('[data-reset]', el).onclick = function () { APP.confirmer({ titre: 'Revenir aux valeurs par défaut ?', texte: 'La grille est remplacée par les valeurs du code. L\'historique de prix est conservé.', ok: 'Réinitialiser', danger: true }).then(function (ok) { if (!ok) return; var d = H.etatParDefaut(); d.historique = S.etat.historique; S.appliquer(d).then(function () { APP.toast('Valeurs par défaut rétablies.'); APP.tout.rendre(); f.fermer(); }); }); };
  }

  /* ------------------------------------------------------------------ connexion */
  function connexion() {
    return new Promise(function (resolve) {
      var porte = $('#porte');
      if (APP.accesOk() && (S.mode === 'local' || sessionStorage.getItem('hym.pw'))) { porte.remove(); resolve(); return; }
      porte.hidden = false;
      var form = $('#porte-form'), champ = $('#porte-pw'), err = $('#porte-err'), btn = $('#porte-ok');
      champ.focus();
      form.onsubmit = function (e) {
        e.preventDefault();
        var pw = champ.value; if (!pw) { err.textContent = 'Saisissez le mot de passe.'; champ.setAttribute('aria-invalid', 'true'); return; }
        btn.disabled = true; btn.innerHTML = '<span class="chargement" aria-hidden="true"></span>Vérification…'; err.textContent = ''; champ.setAttribute('aria-invalid', 'false');
        APP.motDePasseValide(pw).then(function (ok) {
          if (!ok) { btn.disabled = false; btn.innerHTML = 'Se connecter'; err.textContent = 'Mot de passe incorrect.'; champ.setAttribute('aria-invalid', 'true'); champ.select(); return; }
          try { sessionStorage.setItem('hym.acces', '37a0061896b698156997ea56804eb3cd3d8f64756816db28419bcdb51e28f70d'); sessionStorage.setItem('hym.pw', pw); } catch (e2) {}
          resolve();
        }, function (e2) { btn.disabled = false; btn.innerHTML = 'Se connecter'; err.textContent = e2.message; });
      };
    }).then(function () {
      if (S.mode !== 'cloud') return;
      // Base commune : le simulateur ne démarre jamais sur des tarifs par défaut si la base configurée est inaccessible.
      var btn = $('#porte-ok'), err = $('#porte-err');
      if (btn) { btn.innerHTML = '<span class="chargement" aria-hidden="true"></span>Chargement des données…'; btn.disabled = true; }
      var essai = function () {
        return S.recharger().then(function () { return true; }, function (e) {
          if (!$('#porte')) { APP.toast('Base injoignable : ' + e.message, 'err'); return true; }
          if (err) err.textContent = 'Chargement impossible : ' + e.message + ' ';
          if (btn) { btn.disabled = false; btn.innerHTML = 'Réessayer la connexion'; }
          return new Promise(function (r) { btn.onclick = function () { btn.onclick = null; btn.disabled = true; btn.innerHTML = '<span class="chargement" aria-hidden="true"></span>Chargement des données…'; r(essai()); }; $('#porte-form').onsubmit = function (ev) { ev.preventDefault(); btn.click(); }; });
        });
      };
      return essai();
    }).then(function () { var p = $('#porte'); if (p) { p.classList.add('sort'); setTimeout(function () { p.remove(); }, 600); } });
  }

  /* ------------------------------------------------------------------ démarrage */
  function demarrer() {
    var navigation = function (e) {
      var t = e.target.closest('.tab'); if (t) { if (APP.vues.grille.estSale() && t.dataset.onglet !== 'grille') { /* le brouillon est conservé */ } APP.aller(t.dataset.onglet); }
    };
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
    $('#btn-lock').onclick = APP.verrouiller;
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
