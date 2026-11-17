/* Cockpit granulés · onglet Simulateur : adresse → distance routière réelle → commande → devis HT / TTC. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store;

  /* ------------------------------------------------------------------ géocodage et itinéraire (API Adresse, OSRM, repli orthodromique) */
  var BAN = ['https://data.geopf.fr/geocodage/search/', 'https://api-adresse.data.gouv.fr/search/'];
  var cacheCommunes = {}, cacheRoute = {};

  function banRecherche(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var essai = function (i) {
      return APP.reseau.json(BAN[i] + '?' + q, { timeout: 7000 }).catch(function (e) { if (i + 1 < BAN.length) return essai(i + 1); throw e; });
    };
    return essai(0);
  }
  function chercherCommunes(cp, ville) {
    var cle = cp + '|' + (ville || '').trim().toLowerCase();
    if (cacheCommunes[cle]) return Promise.resolve(cacheCommunes[cle]);
    var p = { limit: 15, type: 'municipality', q: ville && ville.trim() ? ville.trim() : cp, postcode: cp };
    return banRecherche(p).then(function (j) {
      var l = (j.features || []).map(function (f) { var pr = f.properties || {}; return { label: pr.label || '', ville: pr.city || pr.name || '', cp: pr.postcode || '', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }; });
      cacheCommunes[cle] = l; return l;
    });
  }
  function geocoderAdresse(adresse) {
    try { var c = JSON.parse(localStorage.getItem('hym.depart') || 'null'); if (c && c.adresse === adresse && Date.now() - c.t < 30 * 864e5) return Promise.resolve(c.val); } catch (e) {}
    return banRecherche({ q: adresse, limit: 1 }).then(function (j) {
      var f = (j.features || [])[0]; if (!f) return null;
      var val = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: (f.properties || {}).label || adresse };
      try { localStorage.setItem('hym.depart', JSON.stringify({ adresse: adresse, val: val, t: Date.now() })); } catch (e) {}
      return val;
    }).catch(function () { return null; });
  }
  function distanceRoutiere(a, b, c, d) {
    var cle = [a, b, c, d].map(function (x) { return Number(x).toFixed(4); }).join(',');
    if (cacheRoute[cle]) return Promise.resolve(cacheRoute[cle]);
    var url = 'https://router.project-osrm.org/route/v1/driving/' + b + ',' + a + ';' + d + ',' + c + '?overview=false&alternatives=false';
    return APP.reseau.json(url, { timeout: 10000 }).then(function (j) {
      if (j.code === 'Ok' && j.routes && j.routes.length) { var r = { km: j.routes[0].distance / 1000, minutes: j.routes[0].duration / 60, source: 'osrm' }; cacheRoute[cle] = r; return r; }
      throw new Error('route');
    }).catch(function () { var km = H.haversine(a, b, c, d) * H.CONFIG.COEF_VOL_OISEAU; return { km: km, minutes: km / 55 * 60, source: 'estimation' }; });
  }
  APP.geo = { chercherCommunes: chercherCommunes, geocoderAdresse: geocoderAdresse, distanceRoutiere: distanceRoutiere };

  /* ------------------------------------------------------------------ état de l'écran */
  var ui = { cp: '', ville: '', communes: null, charge: false, erreurCommunes: '', choix: 0, route: { etat: 'idle' }, allerRetour: false, forcer: false, kmManuel: 0, mode: 'Palettes', q: {}, delai: '72h', tonnage: null };
  var jeton = 0, jetonCommunes = 0;
  APP.sim = ui;

  var depart = function () { return APP.pref('depart') || H.CONFIG.ADRESSE_DEPART; };

  /* ------------------------------------------------------------------ squelette */
  function rendre() {
    var p = $('#p-simulateur');
    p.innerHTML =
      '<div class="titre"><div><h1>Simulateur <em>prix et livraison</em></h1><p>Saisissez l\'adresse de livraison : la distance routière réelle depuis le dépôt détermine les frais. Prix présentés en TTC, avec le détail HT.</p></div></div>' +
      '<div class="grille2">' +
        '<div class="pile">' +
          '<section class="carte verre" aria-labelledby="t-adr"><h2 id="t-adr">' + icon('pin') + 'Adresse de livraison</h2>' +
            '<div class="rang"><div class="champ"><label for="s-cp">Code postal</label><input class="saisie cp-saisie" id="s-cp" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="81100" aria-describedby="s-aide"></div>' +
            '<div class="champ"><label for="s-ville">Ville <span class="opt">(recommandé)</span></label><input class="saisie" id="s-ville" autocomplete="address-level2" placeholder="Castres"></div></div>' +
            '<p class="aide" id="s-aide">Départ : <b id="s-depart"></b></p>' +
            '<div id="s-communes" class="msgs" aria-live="polite"></div>' +
            '<div id="s-trajet" aria-live="polite"></div>' +
            '<details class="options"><summary>' + icon('route') + '<span>Options de trajet</span></summary><div class="options-corps">' +
              '<label class="interrupteur"><input type="checkbox" id="s-ar"><i></i><span>Compter l\'aller-retour<small>Décoché : seul le trajet dépôt → client est facturé.</small></span></label>' +
              '<label class="interrupteur"><input type="checkbox" id="s-forcer"><i></i><span>Forcer le kilométrage<small>Remplace la distance calculée (devis téléphonique, route privée…).</small></span></label>' +
              '<div class="champ" id="s-km-champ" hidden><label for="s-km">Distance retenue</label><div class="unite"><input class="saisie" id="s-km" type="number" min="0" max="500" step="1" inputmode="decimal" placeholder="0"><span>KM</span></div></div>' +
            '</div></details>' +
          '</section>' +
          '<section class="carte verre" aria-labelledby="t-cmd"><h2 id="t-cmd">' + icon('box') + 'Commande</h2>' +
            '<div class="seg seg--plein" id="s-mode" role="group" aria-label="Conditionnement"><button type="button" data-mode="Palettes" aria-pressed="true">Palettes</button><button type="button" data-mode="Vrac" aria-pressed="false">Vrac</button></div>' +
            '<div id="s-palettes"></div>' +
            '<div id="s-vrac" hidden></div>' +
          '</section>' +
        '</div>' +
        '<aside class="devis verre" id="s-devis" aria-labelledby="t-devis" aria-live="polite"></aside>' +
      '</div>';
    $('#s-depart').textContent = depart();
    lier();
    majCommande();
    majDevis();
    majTrajet();
    majCommunes();
  }

  function lier() {
    var cp = $('#s-cp'), ville = $('#s-ville');
    cp.addEventListener('input', function () {
      var v = cp.value.replace(/\D/g, '').slice(0, 5); if (v !== cp.value) cp.value = v;
      ui.cp = v; chercher();
    });
    ville.addEventListener('input', APP.debounce(function () { ui.ville = ville.value; if (/^\d{5}$/.test(ui.cp)) chercher(); }, 350));
    $('#s-ar').addEventListener('change', function (e) { ui.allerRetour = e.target.checked; majTrajet(); majDevis(); });
    $('#s-forcer').addEventListener('change', function (e) { ui.forcer = e.target.checked; $('#s-km-champ').hidden = !ui.forcer; if (ui.forcer) $('#s-km').focus(); majTrajet(); majDevis(); });
    $('#s-km').addEventListener('input', function (e) { ui.kmManuel = parseFloat(e.target.value) || 0; majTrajet(); majDevis(); });
    $('#s-mode').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (!b) return; ui.mode = b.dataset.mode; majCommande(); majDevis(); });
    $('#p-simulateur').addEventListener('click', function (e) {
      var c = e.target.closest('[data-commune]'); if (c) { ui.choix = +c.dataset.commune; majCommunes(); calculerRoute(); return; }
      var pas = e.target.closest('[data-pas]'); if (pas) { var nom = pas.dataset.nom, d = +pas.dataset.pas; ui.q[nom] = Math.max(0, Math.min(20, (ui.q[nom] || 0) + d)); majCommande(); majDevis(); return; }
      var t = e.target.closest('[data-tonnage]'); if (t) { ui.tonnage = +t.dataset.tonnage; majCommande(); majDevis(); return; }
      var dl = e.target.closest('[data-delai]'); if (dl) { ui.delai = dl.dataset.delai; majCommande(); majDevis(); return; }
      var cop = e.target.closest('[data-copier]'); if (cop) copier();
    });
  }

  /* ------------------------------------------------------------------ communes */
  function chercher() {
    var id = ++jetonCommunes;
    ui.communes = null; ui.erreurCommunes = ''; ui.choix = 0; ui.route = { etat: 'idle' };
    if (!/^\d{5}$/.test(ui.cp)) { ui.charge = false; majCommunes(); majTrajet(); majDevis(); return; }
    ui.charge = true; majCommunes(); majTrajet(); majDevis();
    chercherCommunes(ui.cp, ui.ville).then(function (l) { if (id !== jetonCommunes) return; ui.communes = l; ui.charge = false; majCommunes(); calculerRoute(); },
      function () { if (id !== jetonCommunes) return; ui.communes = []; ui.erreurCommunes = 'reseau'; ui.charge = false; majCommunes(); majTrajet(); majDevis(); });
  }
  function destination() { return ui.communes && ui.communes.length ? ui.communes[Math.min(ui.choix, ui.communes.length - 1)] : null; }

  function majCommunes() {
    var z = $('#s-communes'); if (!z) return;
    if (ui.charge) { z.innerHTML = '<div class="msg"><span class="chargement" aria-hidden="true"></span><div>Recherche des communes du ' + esc(ui.cp) + '…</div></div>'; return; }
    if (!/^\d{5}$/.test(ui.cp)) { z.innerHTML = ui.cp ? '<div class="msg">' + icon('info') + '<div>Saisissez les 5 chiffres du code postal.</div></div>' : ''; return; }
    if (ui.communes === null) { z.innerHTML = ''; return; }
    if (!ui.communes.length) {
      z.innerHTML = '<div class="msg msg--err">' + icon('alert') + '<div><b>' + (ui.erreurCommunes ? 'Recherche impossible' : 'Adresse introuvable') + '</b><br>' +
        (ui.erreurCommunes ? 'Le service d\'adresses ne répond pas. Vérifiez la connexion ou forcez le kilométrage dans « Options de trajet ».' : 'Aucune commune ne correspond au code postal ' + esc(ui.cp) + '. Vérifiez la saisie ou forcez le kilométrage dans « Options de trajet ».') + '</div></div>';
      return;
    }
    if (ui.communes.length === 1) { z.innerHTML = '<div class="msg msg--ok">' + icon('check') + '<div>Destination : <b>' + esc(ui.communes[0].label) + '</b></div></div>'; return; }
    z.innerHTML = '<div class="champ"><span class="lbl">Plusieurs communes correspondent</span><div class="pastilles" role="radiogroup" aria-label="Commune de livraison">' +
      ui.communes.map(function (c, i) { return '<button type="button" class="pastille" role="radio" aria-checked="' + (i === ui.choix) + '" data-commune="' + i + '">' + esc(c.label) + '</button>'; }).join('') + '</div></div>';
  }

  /* ------------------------------------------------------------------ itinéraire */
  function calculerRoute() {
    var d = destination(); var id = ++jeton;
    if (!d) { ui.route = { etat: 'idle' }; majTrajet(); majDevis(); return; }
    ui.route = { etat: 'loading' }; majTrajet(); majDevis();
    geocoderAdresse(depart()).then(function (dep) {
      if (id !== jeton) return null;
      if (!dep) { ui.route = { etat: 'erreur', msg: 'Impossible de géocoder l\'adresse de départ. Forcez le kilométrage manuellement (Options de trajet).' }; majTrajet(); majDevis(); return null; }
      return distanceRoutiere(dep.lat, dep.lon, d.lat, d.lon);
    }).then(function (r) { if (!r || id !== jeton) return; ui.route = { etat: 'ok', km: r.km, minutes: r.minutes, source: r.source }; majTrajet(); majDevis(); });
  }
  APP.sim.recalculer = function () { $('#s-depart').textContent = depart(); if (destination()) calculerRoute(); };

  function distance() {
    var r = ui.route;
    return H.distanceRetenue({ kmReel: r.etat === 'ok' ? r.km : null, forcer: ui.forcer, kmManuel: ui.kmManuel, allerRetour: ui.allerRetour, source: r.etat === 'ok' ? r.source : null });
  }

  function majTrajet() {
    var z = $('#s-trajet'); if (!z) return;
    var r = ui.route;
    if (r.etat === 'loading' && !(ui.forcer && ui.kmManuel > 0)) { z.innerHTML = '<div class="trajet"><span class="chargement" aria-hidden="true"></span><span>Calcul de l\'itinéraire routier…</span></div>'; return; }
    if (r.etat === 'erreur' && !(ui.forcer && ui.kmManuel > 0)) { z.innerHTML = '<div class="msg msg--err">' + icon('alert') + '<div>' + esc(r.msg) + '</div></div>'; return; }
    var d = distance();
    if (!d) { z.innerHTML = ''; return; }
    var lib = { osrm: 'Itinéraire routier réel', estimation: 'Estimation (routeur indisponible) — à vérifier', manuel: 'Kilométrage saisi manuellement' }[d.source] || '';
    var duree = r.etat === 'ok' && d.source === 'osrm' && r.minutes ? ' · environ ' + Math.round(r.minutes) + ' min' : '';
    var html = '<div class="trajet"><span class="badge">' + esc(H.kmFmt(d.km)) + ' — ' + esc(d.trajet) + '</span><small>' + esc(lib + duree) + '</small></div>';
    if (d.source === 'estimation') html += '<div class="msg msg--warn" style="margin-top:var(--s3)">' + icon('alert') + '<div>Le calcul d\'itinéraire n\'a pas répondu : la distance est une estimation orthodromique majorée de 30 %. Vérifiez-la avant d\'engager un prix.</div></div>';
    if (d.km > H.CONFIG.SEUIL_ALERTE_KM) html += '<div class="msg msg--warn" style="margin-top:var(--s3)">' + icon('alert') + '<div>Distance supérieure à ' + H.CONFIG.SEUIL_ALERTE_KM + ' km : la grille de la dernière zone s\'applique, mais faites valider faisabilité et marge par l\'exploitation avant engagement.</div></div>';
    z.innerHTML = html;
  }

  /* ------------------------------------------------------------------ commande */
  function majCommande() {
    var e = S.etat;
    $$('#s-mode button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)); });
    APP.glisse($('#s-mode'));
    var pal = $('#s-palettes'), vr = $('#s-vrac');
    pal.hidden = ui.mode !== 'Palettes'; vr.hidden = ui.mode !== 'Vrac';
    if (ui.mode === 'Palettes') {
      var noms = Object.keys(e.palettes);
      pal.innerHTML = '<div style="margin-top:var(--s5)">' + noms.map(function (n) {
        var q = ui.q[n] || 0;
        return '<div class="produit-ligne"><div><b>' + esc(n) + '</b><small>' + esc(H.eur(e.palettes[n].ttc)) + ' TTC · ' + esc(H.eur(e.palettes[n].ht)) + ' HT la palette</small></div>' +
          '<div class="pas" role="group" aria-label="Palettes ' + esc(n) + '"><button type="button" data-pas="-1" data-nom="' + esc(n) + '" aria-label="Retirer une palette" ' + (q <= 0 ? 'disabled' : '') + '>' + icon('minus') + '</button><output aria-live="polite">' + q + '</output><button type="button" data-pas="1" data-nom="' + esc(n) + '" aria-label="Ajouter une palette" ' + (q >= 20 ? 'disabled' : '') + '>' + icon('plus') + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="champ" style="margin-top:var(--s5)"><span class="lbl">Délai de livraison</span><div class="seg seg--plein" id="s-delai" role="group" aria-label="Délai de livraison"><button type="button" data-delai="72h" aria-pressed="' + (ui.delai === '72h') + '">Sous 72 h<br><small>prioritaire</small></button><button type="button" data-delai="15j" aria-pressed="' + (ui.delai === '15j') + '">Sous 15 jours<br><small>tournée optimisée</small></button></div></div>';
      APP.glisse($('#s-delai'));
    } else {
      var paliers = Object.keys(e.vrac).map(Number).sort(function (a, b) { return a - b; });
      if (ui.tonnage === null || paliers.indexOf(ui.tonnage) < 0) ui.tonnage = paliers[Math.min(2, paliers.length - 1)];
      var p = e.vrac[ui.tonnage];
      vr.innerHTML = '<div class="champ" style="margin-top:var(--s5)"><span class="lbl">Tonnage commandé</span><div class="pastilles" role="radiogroup" aria-label="Tonnage">' + paliers.map(function (t) { return '<button type="button" class="pastille" role="radio" aria-checked="' + (t === ui.tonnage) + '" data-tonnage="' + t + '">' + t + ' T</button>'; }).join('') + '</div></div>' +
        (p ? '<div class="produit-ligne" style="margin-top:var(--s4)"><div><b>' + ui.tonnage + ' T de granulés en vrac</b><small>' + esc(H.eur(p.ttc)) + ' TTC / T · ' + esc(H.eur(p.ht)) + ' HT / T</small></div><div class="num" style="font-weight:600">' + esc(H.eur(ui.tonnage * p.ttc)) + '</div></div>' : '');
    }
  }

  /* ------------------------------------------------------------------ devis */
  function devis() {
    var d = distance();
    return H.calculerDevis({ mode: ui.mode, quantites: ui.q, delai: ui.delai, tonnage: ui.tonnage, kmRetenu: d ? d.km : null, etat: S.etat });
  }

  function majDevis() {
    var z = $('#s-devis'); if (!z) return;
    var dv = devis(), d = distance(), cmd = dv.produitTtc > 0;
    var etapes = [['Adresse de livraison', !!d], ['Produits à livrer', cmd], ['Frais et total', dv.complet]];
    if (!cmd || dv.fraisTtc === null) {
      z.innerHTML = '<div class="vide"><h2 id="t-devis" class="etiquette">Devis</h2>' +
        (cmd ? '<div class="lignes" style="width:100%">' + dv.lignes.map(ligneHtml).join('') + '</div>' : '') +
        '<ul class="etapes">' + etapes.map(function (s, i) { return '<li class="' + (s[1] ? 'fait' : '') + '"><i>' + (s[1] ? '✓' : (i + 1)) + '</i>' + esc(s[0]) + '</li>'; }).join('') + '</ul>' +
        '<p class="aide">' + (!d ? 'Saisissez le code postal pour obtenir les frais et le total.' : 'Ajoutez au moins une palette (ou choisissez un tonnage) pour afficher le total.') + '</p></div>';
      return;
    }
    var dest = destination(), dest_txt = dest ? dest.label : (ui.cp + ' ' + ui.ville).trim() || 'Distance saisie';
    var fraisLig = '<div class="ligne"><div class="k">Frais de livraison<small>' + esc(dv.detailFrais) + '</small></div><div class="v num">' + esc(H.eur(dv.fraisTtc)) + '<small>' + esc(H.eur(dv.fraisHt)) + ' HT</small></div></div>';
    var neuf = !$('#s-total');
    z.innerHTML = '<h2 id="t-devis" class="etiquette">Devis</h2>' +
      '<div class="lignes">' + dv.lignes.map(ligneHtml).join('') + fraisLig + '</div>' +
      '<div class="total"><div class="lbl">Total TTC</div><div class="val num" id="s-total" data-v="' + (z._tot || 0) + '">' + esc(H.eur(z._tot || 0)) + '</div><div class="sub">' + esc(H.eur(dv.totalHt)) + ' HT + ' + esc(H.eur(dv.tva)) + ' de TVA<br>Coût rendu : ' + esc(H.eur(dv.coutRendu)) + ' TTC / tonne</div></div>' +
      '<div class="kpi3"><div class="kpi"><small>Total HT</small><b class="num">' + esc(H.eur(dv.totalHt)) + '</b></div><div class="kpi"><small>TVA</small><b class="num">' + esc(H.eur(dv.tva)) + '</b></div><div class="kpi"><small>Total TTC</small><b class="num">' + esc(H.eur(dv.totalTtc)) + '</b></div></div>' +
      '<div class="actions"><button class="btn btn--main" type="button" data-copier>' + icon('copy') + 'Copier le récapitulatif</button></div>' +
      '<details class="options"><summary>' + icon('fichier') + '<span>Voir le récapitulatif</span></summary><div class="options-corps"><pre class="recap" id="s-recap"></pre></div></details>';
    var recap = H.recapitulatif(dv, { dateFr: H.dateFr(APP.aujourdhui()), destination: dest_txt, km: d.km, trajet: d.trajet });
    $('#s-recap').textContent = recap; z._recap = recap;
    var tot = $('#s-total'); APP.compter(tot, dv.totalTtc, H.eur); z._tot = dv.totalTtc;
  }
  function ligneHtml(l) { return '<div class="ligne"><div class="k">' + esc(l.libelle) + '</div><div class="v num">' + esc(H.eur(l.ttc)) + '<small>' + esc(H.eur(l.ht)) + ' HT</small></div></div>'; }

  function copier() {
    var z = $('#s-devis'), t = z._recap || '';
    var ok = function () { APP.toast('Récapitulatif copié.'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, function () { APP.toast('Copie impossible : sélectionnez le texte du récapitulatif.', 'err'); });
    else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { APP.toast('Copie impossible.', 'err'); } ta.remove(); }
  }

  APP.vues.simulateur = { rendre: function () { var cp = ui.cp, vi = ui.ville; rendre(); $('#s-cp').value = cp; $('#s-ville').value = vi; $('#s-ar').checked = ui.allerRetour; $('#s-forcer').checked = ui.forcer; $('#s-km-champ').hidden = !ui.forcer; if (ui.kmManuel) $('#s-km').value = ui.kmManuel; majCommunes(); majTrajet(); majDevis(); },
    ouvrir: function () { APP.glisse($('#s-mode')); var d = $('#s-delai'); if (d) APP.glisse(d); } };
})();
