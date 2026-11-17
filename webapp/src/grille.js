/* Cockpit granulés · onglet Grille tarifaire : tableaux éditables (HT ou TTC), conversion en direct, validation figée, exports, chargement d'un classeur. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store;
  var dr = null, sale = false;

  function brouillon(e, base) {
    var cle = base.toLowerCase();
    return {
      date: e.date_grille, tvaM: +(e.tva_march * 100).toFixed(3), tvaL: +(e.tva_livr * 100).toFixed(3), base: base,
      tauxM0: e.tva_march, tauxL0: e.tva_livr,
      palettes: Object.keys(e.palettes).map(function (n) { return { nom: n, prix: e.palettes[n][cle], orig: e.palettes[n] }; }),
      vrac: Object.keys(e.vrac).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return { palier: t, prix: e.vrac[t][cle], orig: e.vrac[t] }; }),
      zones: e.zones.slice().sort(function (a, b) { return a["Jusqu'à (km)"] - b["Jusqu'à (km)"]; }).map(function (z) { return { zone: z.Zone, borne: z["Jusqu'à (km)"], h72: z['72 h ' + base], j15: z['15 j ' + base], o72: { ht: z['72 h HT'], ttc: z['72 h TTC'] }, o15: { ht: z['15 j HT'], ttc: z['15 j TTC'] } }; }),
      franchise: e.franchise_km, prixKm: base === 'TTC' ? e.prix_km_ttc : e.prix_km_ht, origKm: { ht: e.prix_km_ht, ttc: e.prix_km_ttc }
    };
  }
  function repartir() { dr = brouillon(S.etat, S.etat.base_saisie || 'TTC'); sale = false; }
  var autre = function () { return dr.base === 'TTC' ? 'HT' : 'TTC'; };
  var tauxM = function () { return (parseFloat(dr.tvaM) || 0) / 100; };
  var tauxL = function () { return (parseFloat(dr.tvaL) || 0) / 100; };
  var f2 = function (v) { return isNaN(v) || v === null ? '' : v; };

  function input(t, i, c, v, extra) { return '<input class="saisie" type="number" inputmode="decimal" step="' + (extra && extra.step || '0.01') + '" min="0" data-t="' + t + '" data-i="' + i + '" data-c="' + c + '" value="' + esc(f2(v)) + '" aria-label="' + esc(extra && extra.label || c) + '">'; }

  /* ------------------------------------------------------------------ rendu */
  function rendre() {
    if (!dr) repartir();
    var e = S.etat, p = $('#p-grille'), src = e.source_grille || 'Valeurs par défaut du code';
    p.innerHTML =
      '<div class="titre"><div><h1>Grille <em>tarifaire</em></h1><p>Les prix validés ici alimentent immédiatement le simulateur. Plus besoin de recoder lors d\'une hausse fournisseur.</p></div>' +
        '<div class="actions"><button class="btn btn--ghost" type="button" data-act="pdf">' + icon('fichier') + 'Exporter en PDF</button><button class="btn btn--ghost" type="button" data-act="excel">' + icon('download') + 'Exporter en Excel</button><button class="btn btn--ghost" type="button" data-act="archiver">' + icon('archive') + 'Archiver dans l\'historique</button></div></div>' +
      '<div class="pile">' +
      '<section class="carte verre" aria-labelledby="g-act"><h2 id="g-act">' + icon('check') + 'Grille en vigueur</h2>' +
        '<div class="kpi4"><div class="kpi"><small>Source</small><b>' + esc(src) + '</b></div><div class="kpi"><small>Date d\'effet</small><b>' + esc(H.dateFr(e.date_grille)) + '</b></div><div class="kpi"><small>TVA marchandise</small><b>' + esc(H.tauxFmt(e.tva_march)) + '</b></div><div class="kpi"><small>TVA livraison</small><b>' + esc(H.tauxFmt(e.tva_livr)) + '</b></div></div>' +
        '<hr class="sep"><div class="rang"><div class="champ"><span class="lbl">Charger un classeur exporté par cet outil (.xlsx)</span><label class="depot" for="g-fichier" id="g-depot" style="padding:var(--s5)">' + icon('upload') + '<b id="g-nomfichier">Choisir ou déposer un classeur</b><small>La grille et, si vous le souhaitez, l\'historique concurrentiel</small></label><input type="file" id="g-fichier" accept=".xlsx" class="sr"></div>' +
        '<div class="champ"><span class="lbl">À charger</span><label class="interrupteur"><input type="checkbox" id="g-c-grille" checked><i></i><span>La grille tarifaire<small>Remplacement intégral : prix, zones, taux de TVA, date d\'effet.</small></span></label><label class="interrupteur"><input type="checkbox" id="g-c-histo"><i></i><span>L\'historique de prix<small>Fusion dédoublonnée : rien n\'est écrasé.</small></span></label>' +
        '<button class="btn btn--main" type="button" id="g-charger" disabled>' + icon('upload') + 'Charger</button></div></div>' +
        '<div id="g-retour" class="msgs" style="margin-top:var(--s4)"></div>' +
      '</section>' +

      '<section class="carte verre" aria-labelledby="g-edit"><h2 id="g-edit">' + icon('grille') + 'Modifier la grille</h2>' +
        '<div class="rang3"><div class="champ"><label for="g-date">Date d\'effet</label><input class="saisie" type="date" id="g-date" value="' + esc(dr.date) + '"></div>' +
        '<div class="champ"><label for="g-tvam">TVA marchandise</label><div class="unite"><input class="saisie" type="number" step="0.1" min="0" max="30" id="g-tvam" inputmode="decimal" value="' + esc(dr.tvaM) + '"><span>%</span></div></div>' +
        '<div class="champ"><label for="g-tval">TVA livraison</label><div class="unite"><input class="saisie" type="number" step="0.1" min="0" max="30" id="g-tval" inputmode="decimal" value="' + esc(dr.tvaL) + '"><span>%</span></div></div></div>' +
        '<div class="msg msg--warn" style="margin-top:var(--s5)">' + icon('alert') + '<div>Les taux de TVA sont des paramètres de l\'outil, pas une recommandation fiscale. Faites-les valider par la comptabilité : le taux applicable dépend du produit, de l\'usage et du statut du client, et le régime des frais de port doit être confirmé.</div></div>' +
        '<div class="champ" style="margin-top:var(--s5)"><span class="lbl">Base de saisie des montants</span><div class="seg" id="g-base" role="group" aria-label="Base de saisie"><button type="button" data-base="TTC" aria-pressed="' + (dr.base === 'TTC') + '">TTC</button><button type="button" data-base="HT" aria-pressed="' + (dr.base === 'HT') + '">HT</button></div>' +
        '<p class="aide">Saisissez uniquement la colonne <b>' + dr.base + '</b>. La conversion vers ' + autre() + ' s\'affiche en direct et se fige à la validation : aucun aller-retour de conversion, donc aucune dérive d\'arrondi.</p></div>' +
        '<hr class="sep"><div class="rang" style="align-items:start">' +
          '<div><h3 class="etiquette" style="margin-bottom:var(--s3)">Palettes · € ' + dr.base + ' / palette</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produit</th><th class="n">Prix ' + dr.base + '</th><th class="n">Prix ' + autre() + '</th><th><span class="sr">Actions</span></th></tr></thead><tbody id="g-pal">' + lignesPal() + '</tbody></table></div><div style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-add="pal">' + icon('plus') + 'Ajouter un produit</button></div></div>' +
          '<div><h3 class="etiquette" style="margin-bottom:var(--s3)">Vrac · € ' + dr.base + ' / tonne par palier</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">Palier (T)</th><th class="n">Prix ' + dr.base + ' / T</th><th class="n">Prix ' + autre() + ' / T</th><th class="n">Total TTC</th><th><span class="sr">Actions</span></th></tr></thead><tbody id="g-vrac">' + lignesVrac() + '</tbody></table></div><div style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-add="vrac">' + icon('plus') + 'Ajouter un palier</button></div></div>' +
        '</div>' +
        '<hr class="sep"><h3 class="etiquette" style="margin-bottom:var(--s3)">Frais de livraison des palettes · € ' + dr.base + ', bornes continues en km</h3>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zone</th><th class="n">Jusqu\'à (km)</th><th>Distance</th><th class="n">72 h ' + dr.base + '</th><th class="n">72 h ' + autre() + '</th><th class="n">15 j ' + dr.base + '</th><th class="n">15 j ' + autre() + '</th><th><span class="sr">Actions</span></th></tr></thead><tbody id="g-zones">' + lignesZones() + '</tbody></table></div>' +
        '<div style="margin-top:var(--s3)"><button class="btn btn--ghost btn--s" type="button" data-add="zone">' + icon('plus') + 'Ajouter une zone</button></div><div id="g-ctrl-zones" class="msgs" style="margin-top:var(--s4)"></div>' +
        '<hr class="sep"><div class="rang"><div class="champ"><label for="g-fr">Vrac : franchise de livraison</label><div class="unite"><input class="saisie" type="number" step="1" min="0" max="200" id="g-fr" inputmode="decimal" value="' + esc(dr.franchise) + '"><span>KM</span></div></div>' +
        '<div class="champ"><label for="g-pkm">Vrac : prix par km au-delà (' + dr.base + ')</label><div class="unite"><input class="saisie" type="number" step="0.01" min="0" max="20" id="g-pkm" inputmode="decimal" value="' + esc(dr.prixKm) + '"><span>€ ' + dr.base + '</span></div></div></div>' +
        '<p class="aide" id="g-pkm-aide" style="margin-top:var(--s3)"></p>' +
      '</section>' +

      '<section class="carte verre" aria-labelledby="g-apercu"><h2 id="g-apercu">' + icon('fichier') + 'Aperçu de la grille validée</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Conditionnement</th><th>Produit</th><th class="n">Palier (T)</th><th>Unité</th><th class="n">Prix HT</th><th class="n">TVA</th><th class="n">Prix TTC</th></tr></thead><tbody>' +
        H.grilleTableau(e.palettes, e.vrac, e.tva_march).map(function (r) { return '<tr><td>' + esc(r.Conditionnement) + '</td><td>' + esc(r.Produit) + '</td><td class="n">' + esc(r['Palier (T)']) + '</td><td>' + esc(r['Unité']) + '</td><td class="n num">' + esc(H.eur(r['Prix HT'])) + '</td><td class="n">' + esc(r.TVA) + '</td><td class="n num">' + esc(H.eur(r['Prix TTC'])) + '</td></tr>'; }).join('') + '</tbody></table></div></section>' +
      '</div>' +
      '<div class="barre-modif verre" id="g-barre" role="region" aria-label="Modifications non appliquées"><span>' + icon('info').replace('<svg', '<svg style="width:calc(var(--k)*18);height:calc(var(--k)*18);vertical-align:middle;margin-right:var(--s2)"') + 'Modifications non appliquées</span><div class="actions"><button class="btn btn--main" type="button" data-act="appliquer">' + icon('check') + 'Appliquer les modifications</button><button class="btn btn--ghost" type="button" data-act="annuler">Annuler</button></div></div>';
    lier(p); APP.glisse($('#g-base')); majApercu(); majControle(); majBarre();
  }

  function lignesPal() {
    var t = tauxM();
    return dr.palettes.map(function (r, i) { var pp = H.pairePrix(r.prix, t, dr.base);
      return '<tr><td><input class="saisie" style="min-width:calc(var(--k)*180)" data-t="pal" data-i="' + i + '" data-c="nom" value="' + esc(r.nom) + '" aria-label="Nom du produit" placeholder="Nom du produit"></td><td class="n">' + input('pal', i, 'prix', r.prix, { label: 'Prix ' + dr.base }) + '</td><td class="n calc num" data-calc="pal-' + i + '">' + esc(H.eur(dr.base === 'TTC' ? pp.ht : pp.ttc)) + '</td><td><button class="icone-btn danger" type="button" data-sup="pal" data-i="' + i + '" aria-label="Supprimer ce produit">' + icon('trash') + '</button></td></tr>'; }).join('');
  }
  function lignesVrac() {
    var t = tauxM();
    return dr.vrac.map(function (r, i) { var pp = H.pairePrix(r.prix, t, dr.base);
      return '<tr><td class="n">' + input('vrac', i, 'palier', r.palier, { step: '1', label: 'Palier en tonnes' }) + '</td><td class="n">' + input('vrac', i, 'prix', r.prix, { label: 'Prix ' + dr.base + ' par tonne' }) + '</td><td class="n calc num" data-calc="vrac-' + i + '">' + esc(H.eur(dr.base === 'TTC' ? pp.ht : pp.ttc)) + '</td><td class="n calc num" data-tot="vrac-' + i + '">' + esc(H.eur(Number(r.palier) * pp.ttc)) + '</td><td><button class="icone-btn danger" type="button" data-sup="vrac" data-i="' + i + '" aria-label="Supprimer ce palier">' + icon('trash') + '</button></td></tr>'; }).join('');
  }
  function lignesZones() {
    var t = tauxL();
    var tri = dr.zones.map(function (z, i) { return { i: i, b: parseFloat(z.borne) }; }).sort(function (a, b) { return a.b - b.b; }), prec = {}, p = 0;
    tri.forEach(function (x) { prec[x.i] = p; p = isNaN(x.b) ? p : x.b; });
    return dr.zones.map(function (r, i) { var a = H.pairePrix(r.h72, t, dr.base), b = H.pairePrix(r.j15, t, dr.base);
      return '<tr><td><input class="saisie" style="min-width:calc(var(--k)*110)" data-t="zone" data-i="' + i + '" data-c="zone" value="' + esc(r.zone) + '" aria-label="Nom de la zone"></td><td class="n">' + input('zone', i, 'borne', r.borne, { step: '1', label: 'Borne en km' }) + '</td><td class="calc" data-lib="' + i + '">' + esc(isNaN(parseFloat(r.borne)) ? '—' : H.libelleZone(prec[i], parseFloat(r.borne))) + '</td><td class="n">' + input('zone', i, 'h72', r.h72, { label: '72 h ' + dr.base }) + '</td><td class="n calc num" data-calc="z72-' + i + '">' + esc(H.eur(dr.base === 'TTC' ? a.ht : a.ttc)) + '</td><td class="n">' + input('zone', i, 'j15', r.j15, { label: '15 j ' + dr.base }) + '</td><td class="n calc num" data-calc="z15-' + i + '">' + esc(H.eur(dr.base === 'TTC' ? b.ht : b.ttc)) + '</td><td><button class="icone-btn danger" type="button" data-sup="zone" data-i="' + i + '" aria-label="Supprimer cette zone">' + icon('trash') + '</button></td></tr>'; }).join('');
  }

  /* mise à jour ciblée (la saisie garde le focus) */
  function majCalculs() {
    var tm = tauxM(), tl = tauxL(), base = dr.base;
    dr.palettes.forEach(function (r, i) { var c = $('[data-calc="pal-' + i + '"]'); if (c) { var pp = H.pairePrix(r.prix, tm, base); c.textContent = H.eur(base === 'TTC' ? pp.ht : pp.ttc); } });
    dr.vrac.forEach(function (r, i) { var pp = H.pairePrix(r.prix, tm, base), c = $('[data-calc="vrac-' + i + '"]'), t = $('[data-tot="vrac-' + i + '"]'); if (c) c.textContent = H.eur(base === 'TTC' ? pp.ht : pp.ttc); if (t) t.textContent = H.eur(Number(r.palier) * pp.ttc); });
    var tri = dr.zones.map(function (z, i) { return { i: i, b: parseFloat(z.borne) }; }).sort(function (a, b) { return a.b - b.b; }), prec = {}, p = 0;
    tri.forEach(function (x) { prec[x.i] = p; p = isNaN(x.b) ? p : x.b; });
    dr.zones.forEach(function (r, i) {
      var a = H.pairePrix(r.h72, tl, base), b = H.pairePrix(r.j15, tl, base), x = $('[data-calc="z72-' + i + '"]'), y = $('[data-calc="z15-' + i + '"]'), l = $('[data-lib="' + i + '"]');
      if (x) x.textContent = H.eur(base === 'TTC' ? a.ht : a.ttc); if (y) y.textContent = H.eur(base === 'TTC' ? b.ht : b.ttc); if (l) l.textContent = isNaN(parseFloat(r.borne)) ? '—' : H.libelleZone(prec[i], parseFloat(r.borne));
    });
    majApercu(); majControle();
  }
  function majApercu() {
    var z = $('#g-pkm-aide'); if (!z) return;
    var pp = H.pairePrix(dr.prixKm, tauxL(), dr.base);
    z.innerHTML = '→ Au-delà de ' + esc(H.dec(parseFloat(dr.franchise) || 0, 0)) + ' km : <b>' + esc(H.eur(pp.ht)) + ' HT</b> / <b>' + esc(H.eur(pp.ttc)) + ' TTC</b> par km (TVA livraison ' + esc(H.tauxFmt(tauxL())) + ').';
  }
  function etatBrouillon() {
    var tm = tauxM(), tl = tauxL(), b = dr.base;
    return {
      palettes: H.extrairePalettes(dr.palettes, tm, b, dr.tauxM0), vrac: H.extraireVrac(dr.vrac, tm, b, dr.tauxM0), zones: H.extraireZones(dr.zones, tl, b, dr.tauxL0), pkm: H.pairOuOrig(dr.prixKm, tl, b, dr.origKm, dr.tauxL0)
    };
  }
  function majControle() {
    var z = $('#g-ctrl-zones'); if (!z) return;
    var m = H.controleZones(etatBrouillon().zones);
    z.innerHTML = m.map(function (t) { return '<div class="msg msg--warn">' + icon('alert') + '<div>' + esc(t) + '</div></div>'; }).join('');
  }
  function majBarre() { var b = $('#g-barre'); if (b) b.classList.toggle('is-on', sale); APP.tout.puce && APP.tout.puce(); }
  function modifie() { sale = true; majBarre(); }

  /* ------------------------------------------------------------------ événements */
  function lier(p) {
    p.oninput = function (e) {
      var t = e.target;
      if (t.id === 'g-date') { dr.date = t.value; modifie(); return; }
      if (t.id === 'g-tvam') { dr.tvaM = t.value; majCalculs(); modifie(); return; }
      if (t.id === 'g-tval') { dr.tvaL = t.value; majCalculs(); modifie(); return; }
      if (t.id === 'g-fr') { dr.franchise = t.value; majApercu(); modifie(); return; }
      if (t.id === 'g-pkm') { dr.prixKm = t.value; majApercu(); modifie(); return; }
      if (t.dataset && t.dataset.t) {
        var tab = { pal: dr.palettes, vrac: dr.vrac, zone: dr.zones }[t.dataset.t], ligne = tab[+t.dataset.i], c = t.dataset.c;
        ligne[c] = (c === 'nom' || c === 'zone') ? t.value : t.value;
        majCalculs(); modifie();
      }
    };
    p.onclick = function (e) {
      var b = e.target.closest('[data-base]');
      if (b && b.dataset.base !== dr.base) { changerBase(b.dataset.base); return; }
      var add = e.target.closest('[data-add]');
      if (add) { ajouter(add.dataset.add); return; }
      var sup = e.target.closest('[data-sup]');
      if (sup) { var l = { pal: dr.palettes, vrac: dr.vrac, zone: dr.zones }[sup.dataset.sup]; l.splice(+sup.dataset.i, 1); rafraichirTables(); modifie(); return; }
      var a = e.target.closest('[data-act]');
      if (a) agir(a.dataset.act);
    };
    var fi = $('#g-fichier'), dep = $('#g-depot'), ch = $('#g-charger');
    var choisir = function (f) { fi._f = f; $('#g-nomfichier').textContent = f ? f.name : 'Choisir ou déposer un classeur'; ch.disabled = !f; };
    fi.onchange = function () { choisir(fi.files[0]); };
    ['dragover', 'dragenter'].forEach(function (n) { dep.addEventListener(n, function (e) { e.preventDefault(); dep.classList.add('is-sur'); }); });
    ['dragleave', 'drop'].forEach(function (n) { dep.addEventListener(n, function (e) { e.preventDefault(); dep.classList.remove('is-sur'); if (n === 'drop' && e.dataTransfer.files[0]) choisir(e.dataTransfer.files[0]); }); });
    ch.onclick = charger;
  }

  function ajouter(quoi) {
    if (quoi === 'pal') dr.palettes.push({ nom: '', prix: '' });
    else if (quoi === 'vrac') dr.vrac.push({ palier: (dr.vrac.length ? Math.max.apply(null, dr.vrac.map(function (r) { return Number(r.palier) || 0; })) + 1 : 2), prix: '' });
    else { var bornes = dr.zones.map(function (z) { return parseFloat(z.borne); }).filter(function (v) { return v < 9999; }); dr.zones.splice(Math.max(0, dr.zones.length - 1), 0, { zone: 'Zone ' + (dr.zones.length + 1), borne: (bornes.length ? Math.max.apply(null, bornes) + 10 : 10), h72: '', j15: '' }); }
    rafraichirTables(); modifie();
    var inp = $$('#g-' + ({ pal: 'pal', vrac: 'vrac', zone: 'zones' }[quoi]) + ' tr:last-child input, #g-zones tr:nth-last-child(2) input').filter(Boolean)[0]; if (inp && quoi !== 'zone') inp.focus();
  }
  function rafraichirTables() {
    $('#g-pal').innerHTML = lignesPal(); $('#g-vrac').innerHTML = lignesVrac(); $('#g-zones').innerHTML = lignesZones(); majApercu(); majControle();
  }
  function changerBase(nb) {
    var tm = tauxM(), tl = tauxL(), vieux = dr.base, cle = nb.toLowerCase();
    var conv = function (v, orig, taux, taux0) { var p = H.pairOuOrig(v, taux, vieux, orig, taux0); return isNaN(p.ht) ? v : p[cle]; };   // ligne non modifiée : paire d'origine, aucune dérive d'arrondi
    dr.palettes = dr.palettes.map(function (r) { return Object.assign({}, r, { prix: conv(r.prix, r.orig, tm, dr.tauxM0) }); });
    dr.vrac = dr.vrac.map(function (r) { return Object.assign({}, r, { prix: conv(r.prix, r.orig, tm, dr.tauxM0) }); });
    dr.zones = dr.zones.map(function (r) { return Object.assign({}, r, { h72: conv(r.h72, r.o72, tl, dr.tauxL0), j15: conv(r.j15, r.o15, tl, dr.tauxL0) }); });
    dr.prixKm = conv(dr.prixKm, dr.origKm, tl, dr.tauxL0);
    dr.base = nb; var s = sale; rendre(); sale = s; majBarre();
  }

  function appliquer() {
    var e = etatBrouillon(), tm = tauxM(), tl = tauxL();
    if (!Object.keys(e.palettes).length || !Object.keys(e.vrac).length || !e.zones.length) { APP.toast('Chaque tableau doit contenir au moins une ligne valide.', 'err'); return; }
    if (dr.palettes.filter(function (r) { return String(r.nom).trim(); }).length !== Object.keys(e.palettes).length) { APP.toast('Deux produits ont le même nom : renommez-en un.', 'err'); return; }
    if (!dr.date) { APP.toast('Indiquez la date d\'effet de la grille.', 'err'); return; }
    var franchise = parseFloat(dr.franchise); if (isNaN(franchise)) franchise = 0;
    S.appliquer({ date_grille: dr.date, palettes: e.palettes, vrac: e.vrac, zones: e.zones, tva_march: tm, tva_livr: tl, base_saisie: dr.base, franchise_km: franchise, prix_km_ht: e.pkm.ht, prix_km_ttc: e.pkm.ttc, source_grille: 'Saisie manuelle dans l\'application' }).then(function (ok) {
      if (ok) APP.toast('Grille mise à jour (saisie en ' + dr.base + ', TVA ' + H.tauxFmt(tm) + ' / ' + H.tauxFmt(tl) + '). Le simulateur utilise ces valeurs.');
      repartir(); rendre(); if (APP.vues.simulateur.rendre) APP.vues.simulateur.rendre();
    });
  }

  function agir(a) {
    if (a === 'appliquer') appliquer();
    else if (a === 'annuler') { repartir(); rendre(); }
    else if (a === 'pdf') { if (APP.exporterPdfGrille) APP.exporterPdfGrille(); }
    else if (a === 'excel') { if (APP.exporterExcel) APP.exporterExcel(); }
    else if (a === 'archiver') {
      var e = S.etat, nouv = H.grilleVersLignes(e.date_grille, e.palettes, e.vrac, e.tva_march);
      S.appliquer({ historique: H.dedoublonner((e.historique || []).concat(nouv), e.tva_march) }).then(function () { APP.toast(nouv.length + ' lignes archivées au ' + H.dateFr(e.date_grille) + '.'); if (APP.vues.donnees.rendre) APP.vues.donnees.rendre(); });
    }
  }

  function charger() {
    var fi = $('#g-fichier'), f = fi._f, retour = $('#g-retour');
    var gr = $('#g-c-grille').checked, hi = $('#g-c-histo').checked;
    if (!f) return;
    if (!gr && !hi) { retour.innerHTML = '<div class="msg msg--err">' + icon('alert') + '<div>Cochez au moins l\'un des deux éléments à charger.</div></div>'; return; }
    retour.innerHTML = '<div class="msg"><span class="chargement" aria-hidden="true"></span><div>Lecture du classeur…</div></div>';
    APP.lireClasseur(f).then(function (feuilles) {
      var html = [], patch = {}, resume = [];
      if (gr) {
        var r = H.lireGrilleClasseur(feuilles, S.etat.tva_march, S.etat.tva_livr);
        if (!r.grille) r.messages.forEach(function (m) { html.push('<div class="msg msg--err">' + icon('alert') + '<div>' + esc(m) + '</div></div>'); });
        else { var g = r.grille; Object.assign(patch, g, { source_grille: f.name + ' (import manuel)' }); resume.push('grille du ' + H.dateFr(g.date_grille) + ' — ' + Object.keys(g.palettes).length + ' palette(s), ' + Object.keys(g.vrac).length + ' palier(s) vrac, ' + g.zones.length + ' zone(s), TVA ' + H.tauxFmt(g.tva_march) + ' / ' + H.tauxFmt(g.tva_livr)); r.messages.forEach(function (m) { html.push('<div class="msg">' + icon('info') + '<div>' + esc(m) + '</div></div>'); }); }
      }
      if (hi) {
        var h = H.lireHistoriqueClasseur(feuilles, S.etat.tva_march);
        if (!h.lignes.length) h.messages.forEach(function (m) { html.push('<div class="msg msg--warn">' + icon('alert') + '<div>' + esc(m) + '</div></div>'); });
        else { var avant = (S.etat.historique || []).length, fus = H.dedoublonner((S.etat.historique || []).concat(h.lignes), S.etat.tva_march); patch.historique = fus; resume.push('historique : ' + h.lignes.length + ' ligne(s) lue(s), ' + (fus.length - avant) + ' ajoutée(s) après dédoublonnage'); h.messages.forEach(function (m) { html.push('<div class="msg">' + icon('info') + '<div>' + esc(m) + '</div></div>'); }); }
      }
      if (resume.length) {
        return S.appliquer(patch).then(function (ok) { if (ok) APP.toast('Chargement effectué.'); repartir(); rendre(); $('#g-retour').innerHTML = '<div class="msg msg--ok">' + icon('check') + '<div>Chargement effectué — ' + esc(resume.join(' · ')) + '.</div></div>' + html.join(''); if (APP.vues.simulateur.rendre) APP.vues.simulateur.rendre(); if (APP.vues.donnees.rendre) APP.vues.donnees.rendre(); });
      }
      retour.innerHTML = html.join('');
    }).catch(function (e) { retour.innerHTML = '<div class="msg msg--err">' + icon('alert') + '<div>Fichier illisible : ' + esc(e.message) + '</div></div>'; });
  }

  APP.vues.grille = { rendre: function () { var s = sale; if (!dr || !s) repartir(); rendre(); sale = s; majBarre(); }, ouvrir: function () { APP.glisse($('#g-base')); }, estSale: function () { return sale; } };
})();
