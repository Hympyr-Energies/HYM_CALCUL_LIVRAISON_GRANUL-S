/* Cockpit granulés · onglet Analyse : matrice des prix, positionnement, évolution, dégressivité, volatilité. Graphiques SVG dessinés à la largeur réelle (aucun débord). */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store;
  var baseAn = 'TTC', refFocus = null;

  /* ------------------------------------------------------------------ graphiques */
  var THEMES = {
    ecran: { texte: '#EEE2D0', doux: 'rgba(238,226,208,.62)', grille: 'rgba(245,244,240,.13)', axe: 'rgba(245,244,240,.35)', fort: '#F0A04B', moyenne: '#DDD2BE', bande: 'rgba(240,160,75,.16)', autres: ['#8FD0B8', '#A9B9EE', '#F0A8A0', '#E2D690', '#C4A8E6', '#8FCBDD'], pos: '#F0A090', neg: '#7FD0A6', zero: 'rgba(245,244,240,.5)' },
    papier: { texte: '#3D2408', doux: '#7A6A58', grille: '#E5DED2', axe: '#B9AD9B', fort: '#98612A', moyenne: '#7A6A58', bande: 'rgba(152,97,42,.14)', autres: ['#2F7F68', '#4C62A8', '#B5514A', '#8A7A1F', '#7C5BA5', '#2F7E92'], pos: '#B5514A', neg: '#2F7F68', zero: '#7A6A58' }
  };
  APP.themeGraph = THEMES;
  var fmtAxe = function (v) { return H.dec(v, Math.abs(v) >= 100 || v % 1 === 0 ? 0 : 1); };

  function ticksBeaux(mn, mx, n) {
    if (mn === mx) { mn -= 1; mx += 1; }
    var brut = (mx - mn) / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(brut))), r = brut / mag, pas = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    var debut = Math.floor(mn / pas) * pas, fin = Math.ceil(mx / pas) * pas, t = [];
    for (var v = debut; v <= fin + pas / 1e6; v += pas) t.push(Number(v.toFixed(6)));
    return t;
  }
  function couleur(th, nom, i, interne) { return interne ? th.fort : th.autres[i % th.autres.length]; }
  var estInterne = function (a) { return String(a).toLowerCase().indexOf('hympyr') === 0; };

  /** Courbes : series [{nom, pts:[[x,y]], fort}], bande optionnelle [[x,min,max]], x = date ISO ou nombre. */
  function courbes(o) {
    var th = THEMES[o.theme || 'ecran'], w = o.w, h = o.h || Math.max(230, Math.min(360, Math.round(w * .5)));
    var tousX = [], ys = [];
    o.series.forEach(function (s) { s.pts.forEach(function (p) { tousX.push(p[0]); ys.push(p[1]); }); });
    (o.bande || []).forEach(function (b) { tousX.push(b[0]); ys.push(b[1], b[2]); });
    if (!ys.length) return vide('Aucune donnée', w);
    var dates = typeof tousX[0] === 'string', xv = function (x) { return dates ? Date.parse(x) : x; };
    var xsU = tousX.filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(function (a, b) { return xv(a) - xv(b); });
    var yt = ticksBeaux(Math.min.apply(null, ys), Math.max.apply(null, ys), 5), ymin = yt[0], ymax = yt[yt.length - 1];
    var g = 52, m = { l: g, r: 18, t: o.yLib ? 30 : 16, b: dates ? 44 : 38 };
    var iw = w - m.l - m.r, ih = h - m.t - m.b, x0 = xv(xsU[0]), x1 = xv(xsU[xsU.length - 1]);
    var X = function (x) { return xsU.length === 1 ? m.l + iw / 2 : m.l + (xv(x) - x0) / (x1 - x0) * iw; };
    var Y = function (y) { return m.t + ih - (y - ymin) / (ymax - ymin) * ih; };
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(o.titre || 'Graphique') + '" xmlns="http://www.w3.org/2000/svg" font-family="Poppins,sans-serif">';
    yt.forEach(function (t) { s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="' + th.grille + '" stroke-dasharray="3 4"/><text x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end" font-size="11" fill="' + th.doux + '">' + fmtAxe(t) + '</text>'; });
    s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '" stroke="' + th.axe + '"/>';
    var maxEtiq = Math.max(2, Math.floor(iw / (dates ? 74 : 46))), pas = Math.ceil(xsU.length / maxEtiq);
    xsU.forEach(function (x, i) { if (i % pas && i !== xsU.length - 1) return; var anchor = i === 0 && xsU.length > 1 ? 'start' : (i === xsU.length - 1 && xsU.length > 1 ? 'end' : 'middle'); s += '<text x="' + X(x) + '" y="' + (h - m.b + 18) + '" text-anchor="' + anchor + '" font-size="11" fill="' + th.doux + '">' + esc(dates ? H.dateFr(x).slice(0, 6) + H.dateFr(x).slice(8) : H.dec(x, 0) + ' T') + '</text>'; });
    if (o.yLib) s += '<text x="' + m.l + '" y="12" font-size="11" fill="' + th.doux + '">' + esc(o.yLib) + '</text>';
    if (o.bande && o.bande.length) {
      var hautes = o.bande.map(function (b) { return X(b[0]) + ',' + Y(b[2]); }), basses = o.bande.slice().reverse().map(function (b) { return X(b[0]) + ',' + Y(b[1]); });
      if (o.bande.length === 1) { var b0 = o.bande[0]; s += '<rect x="' + (X(b0[0]) - 14) + '" y="' + Y(b0[2]) + '" width="28" height="' + Math.max(2, Y(b0[1]) - Y(b0[2])) + '" fill="' + th.bande + '" rx="4"/>'; }
      else s += '<polygon points="' + hautes.concat(basses).join(' ') + '" fill="' + th.bande + '"/>';
    }
    var idx = 0;
    o.series.forEach(function (se) {
      var c = se.couleur || couleur(th, se.nom, se.fort ? 0 : idx++, se.fort);
      se._c = c;
      var pts = se.pts.slice().sort(function (a, b) { return xv(a[0]) - xv(b[0]); });
      s += '<polyline fill="none" stroke="' + c + '" stroke-width="' + (se.fort ? 3 : 1.8) + '" stroke-linejoin="round" stroke-linecap="round"' + (se.tirets ? ' stroke-dasharray="6 5"' : '') + ' points="' + pts.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '"/>';
      if (!se.tirets) pts.forEach(function (p) { s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="' + (se.fort ? 4.5 : 3.2) + '" fill="' + c + '" stroke="' + (o.theme === 'papier' ? '#fff' : '#1b120a') + '" stroke-width="1.2"><title>' + esc(se.nom + ' · ' + (dates ? H.dateFr(p[0]) : H.dec(p[0], 0) + ' T') + ' · ' + H.eur(p[1])) + '</title></circle>'; });
    });
    return { svg: s + '</svg>', legende: o.series.map(function (se) { return { nom: se.nom, c: se._c, tirets: se.tirets }; }).concat(o.bande && o.bande.length ? [{ nom: 'Fourchette marché', c: th.bande.replace(/[\d.]+\)$/, '.6)'), bande: true }] : []) };
  }

  /** Barres horizontales divergentes (écart % vs moyenne du marché). */
  function barres(o) {
    var th = THEMES[o.theme || 'ecran'], w = o.w, rows = o.rows;
    if (!rows.length) return vide('Aucun concurrent renseigné', w);
    var lab = Math.min(Math.round(w * .34), Math.max.apply(null, rows.map(function (r) { return r.nom.length; })) * 6.6 + 12), rh = 34, h = rows.length * rh + 66;
    var vals = rows.map(function (r) { return r.v; }), etendue = Math.max(Math.abs(Math.min.apply(null, vals)), Math.abs(Math.max.apply(null, vals)), .1);
    var mn = Math.min(Math.min.apply(null, vals) - etendue * .6, -etendue * .15), mx = Math.max(Math.max.apply(null, vals) + etendue * .6, etendue * .15);
    var m = { l: lab + 8, r: 14, t: 8, b: 50 }, iw = w - m.l - m.r, X = function (v) { return m.l + (v - mn) / (mx - mn) * iw; };
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Écart vs moyenne du marché" xmlns="http://www.w3.org/2000/svg" font-family="Poppins,sans-serif">';
    ticksBeaux(mn, mx, 5).forEach(function (t) { if (t < mn || t > mx) return; s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" stroke="' + th.grille + '" stroke-dasharray="3 4"/><text x="' + X(t) + '" y="' + (h - m.b + 18) + '" text-anchor="middle" font-size="11" fill="' + th.doux + '">' + fmtAxe(t) + ' %</text>'; });
    rows.forEach(function (r, i) {
      var y = m.t + i * rh + 6, x = X(Math.min(0, r.v)), bw = Math.max(2, Math.abs(X(r.v) - X(0)));
      s += '<text x="' + (m.l - 10) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11.5" fill="' + th.texte + '">' + esc(r.nom.length > 30 ? r.nom.slice(0, 29) + '…' : r.nom) + '</text>';
      s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="20" rx="5" fill="' + (r.v > 0 ? th.pos : th.neg) + '" opacity=".9"><title>' + esc(r.nom + ' · ' + H.pct(r.v)) + '</title></rect>';
      var droite = r.v >= 0, tx = droite ? X(r.v) + 6 : X(r.v) - 6;
      s += '<text x="' + tx + '" y="' + (y + 14) + '" text-anchor="' + (droite ? 'start' : 'end') + '" font-size="11" font-weight="600" fill="' + th.texte + '">' + esc(H.pct(r.v)) + '</text>';
    });
    s += '<line x1="' + X(0) + '" x2="' + X(0) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" stroke="' + th.zero + '"/>';
    return { svg: s + '<text x="' + (m.l + iw / 2) + '" y="' + (h - 4) + '" text-anchor="middle" font-size="10.5" fill="' + th.doux + '">Négatif = Hympyr moins cher</text></svg>', legende: [] };
  }
  function vide(t, w) { return { svg: '<div class="graph-vide" style="width:100%">' + esc(t) + '</div>', legende: [], vide: true }; }
  APP.graphiques = { courbes: courbes, barres: barres };

  /** Insère un graphique et le redessine à la largeur réelle du conteneur. */
  function monter(el, fabrique) {
    var rendre = function () {
      var w = Math.floor(el.clientWidth); if (w < 120) return;
      var g = fabrique(w);
      el.innerHTML = g.svg + (g.legende && g.legende.length ? '<div class="legende">' + g.legende.map(function (l) { return '<span><i style="background:' + l.c + (l.tirets ? ';opacity:.7' : '') + '"></i>' + esc(l.nom) + '</span>'; }).join('') + '</div>' : '');
    };
    rendre();
    if ('ResizeObserver' in window) { var ro = new ResizeObserver(APP.debounce(function () { if (el.isConnected) rendre(); else ro.disconnect(); }, 120)); ro.observe(el); }
  }

  /* ------------------------------------------------------------------ calculs communs (écran et rapports) */
  APP.analyseDonnees = function (base) {
    var h = S.etat.historique || [], col = base === 'HT' ? 'prix_ht' : 'prix_ttc';
    return { col: col, enr: H.enrichir(h, S.etat.tva_march), matrice: H.matriceDernierPrix(h, col), pos: H.positionnement(h, 'Hympyr', col), evol: H.evolutionPeriode(h, 'Hympyr', col), deg: H.degressivite(h, col), vol: H.volatilite(h, col), coh: H.coherenceBases(h) };
  };
  APP.serieEvolution = function (enr, ref, col) {
    var d = enr.filter(function (r) { return r.reference === ref && !isNaN(r[col]); }), par = {};
    d.forEach(function (r) { (par[r.acteur] = par[r.acteur] || []).push([r.date, r[col]]); });
    return Object.keys(par).sort().map(function (a) { return { nom: a, pts: par[a], fort: estInterne(a) }; });
  };
  APP.serieMarche = function (enr, ref, col) {
    var d = enr.filter(function (r) { return r.reference === ref && !isNaN(r[col]); }), conc = d.filter(function (r) { return !estInterne(r.acteur); }), par = {};
    conc.forEach(function (r) { (par[r.date] = par[r.date] || []).push(r[col]); });
    var dates = Object.keys(par).sort();
    var moy = dates.map(function (dt) { var a = par[dt]; return [dt, a.reduce(function (x, y) { return x + y; }, 0) / a.length]; });
    var bande = dates.map(function (dt) { var a = par[dt]; return [dt, Math.min.apply(null, a), Math.max.apply(null, a)]; });
    var mine = d.filter(function (r) { return estInterne(r.acteur); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (r) { return [r.date, r[col]]; });
    var series = []; if (moy.length) series.push({ nom: 'Moyenne marché', pts: moy, couleur: null, tirets: true, _moy: true }); if (mine.length) series.push({ nom: 'Hympyr', pts: mine, fort: true });
    return { series: series, bande: bande };
  };
  APP.serieDegressivite = function (deg) { return deg.acteurs.map(function (a) { return { nom: a, fort: estInterne(a), pts: deg.paliers.filter(function (p) { return deg.valeurs[p][a] !== undefined; }).map(function (p) { return [p, deg.valeurs[p][a]]; }) }; }); };

  /* ------------------------------------------------------------------ rendu */
  var CHAUD = function (t) { /* 0 = moins cher (vert), 1 = plus cher (rouge) */ var c = t < .5 ? [127, 208, 166, .34 + .0 * t] : [240, 130, 110, .12 + .5 * (t - .5) * 1]; if (t >= .5) { var k = (t - .5) * 2; c = [242 - 2 * k, 194 - 64 * k, 107 + 3 * k, .3 + .12 * k]; } else { var j = t * 2; c = [127 + 115 * j, 208 - 14 * j, 166 - 59 * j, .38 - .08 * j]; } return 'rgba(' + c[0].toFixed(0) + ',' + c[1].toFixed(0) + ',' + c[2].toFixed(0) + ',' + c[3].toFixed(2) + ')'; };

  function rendre() {
    var p = $('#p-analyse'), h = S.etat.historique || [];
    if (!H.enrichir(h, S.etat.tva_march).length) {
      p.innerHTML = '<div class="titre"><div><h1>Analyse <em>des prix</em></h1><p>Positionnement concurrentiel, évolution, dégressivité vrac et volatilité.</p></div></div><section class="carte verre"><div class="msg">' + icon('info') + '<div>Aucune donnée à analyser. Rendez-vous dans l\'onglet « Données » pour importer des grilles ou saisir des relevés, ou archivez votre grille depuis l\'onglet « Grille tarifaire ».</div></div><div class="actions" style="margin-top:var(--s5)"><button class="btn btn--main" type="button" data-aller="donnees">' + icon('donnees') + 'Aller aux données</button></div></section>';
      p.querySelector('[data-aller]').onclick = function () { APP.aller('donnees'); };
      return;
    }
    var D = APP.analyseDonnees(baseAn), d = D.enr;
    var acteurs = D.matrice.acteurs.slice(), concurrents = acteurs.filter(function (a) { return !estInterne(a); }), refs = D.matrice.references;
    if (!refFocus || refs.indexOf(refFocus) < 0) refFocus = refs[0];
    var dates = d.map(function (r) { return r.date; }).sort(), periode = H.dateFr(dates[0]).slice(3) + ' → ' + H.dateFr(dates[dates.length - 1]).slice(3);
    var anomalie = D.coh.some(function (c) { return c.anomalie; });
    p.innerHTML =
      '<div class="titre"><div><h1>Analyse <em>des prix</em></h1><p>Toutes les comparaisons de cet écran sont exprimées en <b>' + baseAn + '</b>. Comparez en HT face à des concurrents professionnels, en TTC face à des tarifs grand public : ne mélangez jamais les deux.</p></div>' +
        '<div class="seg" id="a-base" role="group" aria-label="Base de comparaison"><button type="button" data-ab="TTC" aria-pressed="' + (baseAn === 'TTC') + '">TTC</button><button type="button" data-ab="HT" aria-pressed="' + (baseAn === 'HT') + '">HT</button></div></div>' +
      '<div class="pile">' +
      '<div class="kpi4"><div class="kpi verre"><small>Relevés</small><b class="num">' + d.length + '</b></div><div class="kpi verre"><small>Acteurs</small><b class="num">' + acteurs.length + '</b></div><div class="kpi verre"><small>Références</small><b class="num">' + refs.length + '</b></div><div class="kpi verre"><small>Période</small><b>' + esc(periode) + '</b></div></div>' +
      (anomalie ? '<div class="msg msg--err">' + icon('alert') + '<div><b>Taux de TVA anormaux détectés.</b> Les écarts ci-dessous peuvent être artificiels : corrigez les relevés dans l\'onglet « Données » avant d\'exploiter ces chiffres.</div></div>' : '') +
      (!concurrents.length ? '<div class="msg msg--warn">' + icon('alert') + '<div>Aucun concurrent renseigné : les lectures concurrentielles resteront vides. Ajoutez des relevés dans l\'onglet « Données ».</div></div>' : '') +
      '<section class="carte verre" aria-labelledby="a1"><h2 id="a1">' + icon('grille') + '1. Matrice des prix — dernier prix connu (' + baseAn + ')</h2><p class="aide">Lecture transversale : qui pratique quoi, sur quelle référence. Vert : le moins cher de la ligne ; rouge : le plus cher.</p>' + matriceHtml(D.matrice) + '</section>' +
      '<section class="carte verre" aria-labelledby="a2"><h2 id="a2">' + icon('analyse') + '2. Positionnement concurrentiel (' + baseAn + ')</h2><p class="aide">Indice base 100 = moyenne du marché. Inférieur à 100 : Hympyr est moins cher.</p><div id="a2-corps"></div></section>' +
      '<section class="carte verre" aria-labelledby="a3"><h2 id="a3">' + icon('analyse') + '3. Évolution dans le temps (' + baseAn + ')</h2><div class="champ" style="max-width:calc(var(--k)*420)"><label for="a-ref">Référence à examiner</label><select class="saisie" id="a-ref">' + refs.map(function (r) { return '<option' + (r === refFocus ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></div>' +
        '<div class="rang" style="margin-top:var(--s5)"><div><h3 class="etiquette">Évolution du prix</h3><div class="graph" id="g-evol"></div></div><div><h3 class="etiquette">Positionnement vs marché</h3><div class="graph" id="g-marche"></div></div></div><div id="a3-tab"></div></section>' +
      '<section class="carte verre" aria-labelledby="a4"><h2 id="a4">' + icon('analyse') + '4. Dégressivité vrac (' + baseAn + ')</h2><p class="aide">Une pente plus forte traduit une politique plus agressive sur les gros volumes.</p><div id="a4-corps"></div></section>' +
      '<section class="carte verre" aria-labelledby="a5"><h2 id="a5">' + icon('analyse') + '5. Volatilité par référence (' + baseAn + ')</h2>' + volatiliteHtml(D.vol) + '</section>' +
      '<section class="carte verre" aria-labelledby="a6"><h2 id="a6">' + icon('download') + 'Export du rapport</h2><div class="actions"><button class="btn btn--main" type="button" data-exp="pdf">' + icon('fichier') + 'Rapport d\'analyse ' + baseAn + ' (PDF)</button><button class="btn btn--ghost" type="button" data-exp="excel">' + icon('download') + 'Classeur complet (Excel)</button></div></section>' +
      '</div>';
    APP.glisse($('#a-base'));
    p.onclick = function (e) {
      var b = e.target.closest('[data-ab]'); if (b && b.dataset.ab !== baseAn) { baseAn = b.dataset.ab; rendre(); return; }
      var x = e.target.closest('[data-exp]'); if (x) { if (x.dataset.exp === 'pdf' && APP.exporterPdfAnalyse) APP.exporterPdfAnalyse(baseAn, refFocus); else if (APP.exporterExcel) APP.exporterExcel(); }
    };
    $('#a-ref').onchange = function (e) { refFocus = e.target.value; dessinerFocus(D); };
    positionnementHtml(D); degressiviteHtml(D); dessinerFocus(D);
  }

  function matriceHtml(m) {
    var h = '<div class="tbl-wrap" style="margin-top:var(--s4)"><table class="tbl"><thead><tr><th>Référence</th>' + m.acteurs.map(function (a) { return '<th class="n">' + esc(a) + '</th>'; }).join('') + '</tr></thead><tbody>';
    m.references.forEach(function (r) {
      var l = m.valeurs[r], vals = m.acteurs.map(function (a) { return l[a]; }).filter(function (v) { return v !== undefined; }), mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      h += '<tr><td><b>' + esc(r) + '</b></td>' + m.acteurs.map(function (a) { var v = l[a]; if (v === undefined) return '<td class="n calc">—</td>'; var t = mx === mn || vals.length < 2 ? .5 : (v - mn) / (mx - mn); return '<td class="n"><span class="heat num" style="background:' + (vals.length > 1 ? CHAUD(t) : 'rgba(255,255,255,.08)') + '">' + esc(H.dec(v)) + '</span></td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function positionnementHtml(D) {
    var z = $('#a2-corps'), pos = D.pos;
    if (!pos.length) { z.innerHTML = '<div class="msg">' + icon('info') + '<div>Nécessite au moins un concurrent sur une référence commune avec Hympyr.</div></div>'; return; }
    var moy = pos.reduce(function (s, r) { return s + r.ecartPct; }, 0) / pos.length;
    var verdict = moy < -3 ? '<div class="msg msg--ok">' + icon('check') + '<div>Hympyr est en moyenne <b>' + esc(H.dec(Math.abs(moy), 1)) + ' %</b> sous le marché. Vérifier que cet écart est un choix assumé, pas une érosion de marge.</div></div>'
      : moy > 3 ? '<div class="msg msg--warn">' + icon('alert') + '<div>Hympyr est en moyenne <b>' + esc(H.dec(moy, 1)) + ' %</b> au-dessus du marché. L\'écart doit être argumenté par les commerciaux (service, délai, proximité).</div></div>'
      : '<div class="msg">' + icon('info') + '<div>Hympyr est aligné sur le marché (' + esc(H.pct(moy)) + ').</div></div>';
    z.innerHTML = '<div class="tbl-wrap" style="margin-top:var(--s4)"><table class="tbl"><thead><tr><th>Référence</th><th class="n">Hympyr</th><th class="n">Moy. marché</th><th class="n">Mini</th><th class="n">Maxi</th><th class="n">Écart %</th><th class="n">Indice</th><th class="n">Rang</th><th class="n">Offres</th></tr></thead><tbody>' +
      pos.map(function (r) { return '<tr><td><b>' + esc(r.reference) + '</b></td><td class="n num">' + esc(H.dec(r.hympyr)) + '</td><td class="n num">' + esc(H.dec(r.moyenne)) + '</td><td class="n num">' + esc(H.dec(r.mini)) + '</td><td class="n num">' + esc(H.dec(r.maxi)) + '</td><td class="n num" style="color:' + (r.ecartPct > 0 ? 'var(--err)' : 'var(--ok)') + '">' + esc(H.pct(r.ecartPct)) + '</td><td class="n num">' + esc(H.dec(r.indice, 1)) + '</td><td class="n">' + r.rang + '</td><td class="n">' + r.nbOffres + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="graph" id="g-pos" style="margin-top:var(--s5)"></div><div style="margin-top:var(--s4)">' + verdict + '</div>';
    monter($('#g-pos'), function (w) { return barres({ w: w, rows: pos.slice().sort(function (a, b) { return a.ecartPct - b.ecartPct; }).map(function (r) { return { nom: r.reference, v: r.ecartPct }; }) }); });
  }

  function dessinerFocus(D) {
    var col = D.col;
    monter($('#g-evol'), function (w) { return courbes({ w: w, series: APP.serieEvolution(D.enr, refFocus, col), yLib: '€ ' + baseAn, titre: 'Évolution du prix ' + refFocus }); });
    monter($('#g-marche'), function (w) { var s = APP.serieMarche(D.enr, refFocus, col); var g = courbes({ w: w, series: s.series.map(function (x) { return x._moy ? Object.assign({}, x, { couleur: THEMES.ecran.moyenne }) : x; }), bande: s.bande, yLib: '€ ' + baseAn, titre: 'Positionnement vs marché ' + refFocus }); return g; });
    var ev = D.evol, z = $('#a3-tab');
    z.innerHTML = ev.length ? '<h3 class="etiquette" style="margin:var(--s5) 0 var(--s3)">Variation des prix Hympyr sur la période (' + baseAn + ')</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Référence</th><th>Première date</th><th class="n">Prix initial</th><th>Dernière date</th><th class="n">Prix actuel</th><th class="n">Variation €</th><th class="n">Variation %</th></tr></thead><tbody>' + ev.map(function (r) { return '<tr><td><b>' + esc(r.reference) + '</b></td><td>' + esc(H.dateFr(r.dateInitiale)) + '</td><td class="n num">' + esc(H.dec(r.prixInitial)) + '</td><td>' + esc(H.dateFr(r.dateActuelle)) + '</td><td class="n num">' + esc(H.dec(r.prixActuel)) + '</td><td class="n num">' + esc(H.dec(r.variation)) + '</td><td class="n num">' + esc(H.pct(r.variationPct)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
  }

  function degressiviteHtml(D) {
    var z = $('#a4-corps'), g = D.deg;
    if (!g.paliers.length) { z.innerHTML = '<div class="msg">' + icon('info') + '<div>Aucune donnée vrac avec palier renseigné.</div></div>'; return; }
    z.innerHTML = '<div class="graph" id="g-deg" style="margin-top:var(--s4)"></div><div class="tbl-wrap" style="margin-top:var(--s5)"><table class="tbl"><thead><tr><th class="n">Palier (T)</th>' + g.acteurs.map(function (a) { return '<th class="n">' + esc(a) + '</th>'; }).join('') + '</tr></thead><tbody>' + g.paliers.map(function (p) { return '<tr><td class="n"><b>' + H.dec(p, 0) + '</b></td>' + g.acteurs.map(function (a) { var v = g.valeurs[p][a]; return '<td class="n num">' + (v === undefined ? '—' : esc(H.dec(v))) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    monter($('#g-deg'), function (w) { return courbes({ w: w, series: APP.serieDegressivite(g), yLib: '€ ' + baseAn + ' / tonne', titre: 'Dégressivité vrac' }); });
  }

  function volatiliteHtml(v) {
    if (!v.length) return '<div class="msg">' + icon('info') + '<div>Données insuffisantes.</div></div>';
    return '<div class="tbl-wrap" style="margin-top:var(--s4)"><table class="tbl"><thead><tr><th>Référence</th><th class="n">Relevés</th><th class="n">Mini</th><th class="n">Maxi</th><th class="n">Moyen</th><th class="n">Écart-type</th><th class="n">Amplitude</th></tr></thead><tbody>' + v.map(function (r) { return '<tr><td><b>' + esc(r.reference) + '</b></td><td class="n">' + r.nb + '</td><td class="n num">' + esc(H.dec(r.mini)) + '</td><td class="n num">' + esc(H.dec(r.maxi)) + '</td><td class="n num">' + esc(H.dec(r.moyenne)) + '</td><td class="n num">' + esc(H.dec(r.ecartType)) + '</td><td class="n num">' + esc(H.pct(r.amplitude, false)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  APP.vues.analyse = { rendre: rendre, ouvrir: rendre };
})();
