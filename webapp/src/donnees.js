/* Cockpit granulés · onglet Données : import de grilles (xlsx, csv), saisie d'un relevé concurrent, historique, contrôle de cohérence TVA. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, S = APP.store;
  var fichiers = [], filtre = '', baseSaisie = 'TTC';

  /** CSV : séparateur détecté (; , tab), guillemets gérés. -> tableau de lignes. */
  function parseCsv(texte) {
    texte = texte.replace(/^﻿/, '');
    var premiere = texte.split(/\r?\n/)[0] || '', sep = [';', '\t', ','].map(function (s) { return [s, premiere.split(s).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var lignes = [], ligne = [], champ = '', q = false;
    for (var i = 0; i < texte.length; i++) {
      var c = texte[i];
      if (q) { if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
      else if (c === '"') q = true;
      else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.length > 1 || ligne[0] !== '') lignes.push(ligne); ligne = []; }
      else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }
  function enObjets(rows) {
    if (!rows.length) return [];
    var ent = rows[0].map(function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return c !== null && c !== undefined && String(c).trim() !== ''; }); }).map(function (r) { var o = {}; ent.forEach(function (c, i) { if (c) o[c] = r[i] === undefined ? null : r[i]; }); return o; });
  }
  function lireFichier(f) {
    if (/\.csv$/i.test(f.name)) return f.text().then(function (t) { return enObjets(parseCsv(t)); });
    if (/\.xls$/i.test(f.name)) return Promise.reject(new Error('le format .xls n\'est pas pris en charge : enregistrez le fichier en .xlsx ou en .csv.'));
    return APP.lireClasseur(f).then(function (feuilles) { var n = Object.keys(feuilles)[0]; return enObjets(feuilles[n] || []); });
  }

  function rendre() {
    var e = S.etat, p = $('#p-donnees'), h = e.historique || [];
    p.innerHTML =
      '<div class="titre"><div><h1>Données <em>concurrentielles</em></h1><p>Importez des grilles tarifaires, saisissez un relevé de prix, et gardez un historique partagé pour l\'analyse.</p></div><div class="actions"><button class="btn btn--ghost" type="button" data-act="modele">' + icon('download') + 'Modèle d\'import (Excel)</button></div></div>' +
      '<div class="grille2" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<section class="carte verre" aria-labelledby="d-imp"><h2 id="d-imp">' + icon('upload') + 'Importer des grilles tarifaires</h2>' +
        '<p class="aide">Formats acceptés : .xlsx et .csv, plusieurs fichiers à la fois. Colonnes minimales : <b>date</b>, <b>acteur</b> et un prix (<b>HT</b> ou <b>TTC</b>). Le montant manquant est complété avec le taux de TVA de la ligne, ou ' + esc(H.tauxFmt(e.tva_march)) + ' à défaut.</p>' +
        '<label class="depot" for="d-fichiers" id="d-depot">' + icon('upload') + '<b>Choisir ou déposer des fichiers</b><small>.xlsx · .csv</small></label><input type="file" id="d-fichiers" accept=".xlsx,.xls,.csv" multiple class="sr">' +
        '<div class="fichiers" id="d-liste"></div><div class="actions"><button class="btn btn--main" type="button" id="d-importer" disabled>' + icon('upload') + 'Importer</button></div><div id="d-retour" class="msgs"></div></section>' +
      '<section class="carte verre" aria-labelledby="d-saisie"><h2 id="d-saisie">' + icon('euro') + 'Saisie directe d\'un relevé concurrent</h2>' +
        '<p class="aide">Pour un prix relevé au téléphone ou sur un site. Précisez bien la base : un tarif affiché en ligne est généralement <b>TTC</b>, un devis professionnel généralement <b>HT</b>.</p>' +
        '<form id="d-form" novalidate><div class="rang"><div class="champ"><label for="f-date">Date du relevé</label><input class="saisie" type="date" id="f-date" value="' + esc(APP.aujourdhui()) + '" required></div><div class="champ"><label for="f-acteur">Concurrent</label><input class="saisie" id="f-acteur" placeholder="ex : Péchavy" autocomplete="off" required></div></div>' +
        '<div class="rang" style="margin-top:var(--s4)"><div class="champ"><label for="f-cond">Conditionnement</label><select class="saisie" id="f-cond"><option>Palette</option><option>Vrac</option></select></div><div class="champ"><label for="f-produit">Produit</label><input class="saisie" id="f-produit" value="Granulés" autocomplete="off"></div></div>' +
        '<div class="rang3" style="margin-top:var(--s4)"><div class="champ"><label for="f-palier">Palier <span class="opt">(vrac, en T)</span></label><input class="saisie" type="number" id="f-palier" min="0" max="30" step="1" inputmode="numeric" placeholder="0" disabled></div>' +
        '<div class="champ"><span class="lbl">Base du prix relevé</span><div class="seg seg--plein" id="f-base" role="group" aria-label="Base du prix"><button type="button" data-fb="TTC" aria-pressed="true">TTC</button><button type="button" data-fb="HT" aria-pressed="false">HT</button></div></div>' +
        '<div class="champ"><label for="f-prix" id="f-prix-l">Prix TTC</label><div class="unite"><input class="saisie" type="number" id="f-prix" min="0" max="5000" step="0.01" inputmode="decimal" placeholder="0,00"><span>€</span></div></div></div>' +
        '<div class="rang" style="margin-top:var(--s4);align-items:end"><div class="champ"><label for="f-tva">TVA applicable</label><div class="unite"><input class="saisie" type="number" id="f-tva" min="0" max="30" step="0.1" inputmode="decimal" value="' + esc(+(e.tva_march * 100).toFixed(2)) + '"><span>%</span></div></div><div class="actions"><button class="btn btn--main" type="submit">' + icon('plus') + 'Ajouter le relevé</button></div></div>' +
        '<div id="f-retour" class="msgs" style="margin-top:var(--s4)"></div></form></section>' +
      '</div><div class="pile" style="margin-top:var(--gut)">' +
      '<section class="carte verre" aria-labelledby="d-hist"><h2 id="d-hist">' + icon('donnees') + 'Historique <span class="etiquette" style="margin-left:auto">' + h.length + ' relevé' + (h.length > 1 ? 's' : '') + '</span></h2><div id="d-corps"></div></section>' +
      '</div>';
    lier(p); majListe(); majHistorique(); APP.glisse($('#f-base'));
  }

  function lier(p) {
    var fi = $('#d-fichiers'), dep = $('#d-depot');
    var ajouter = function (liste) { fichiers = fichiers.concat([].slice.call(liste)); majListe(); };
    fi.onchange = function () { ajouter(fi.files); fi.value = ''; };
    ['dragover', 'dragenter'].forEach(function (n) { dep.addEventListener(n, function (e) { e.preventDefault(); dep.classList.add('is-sur'); }); });
    ['dragleave', 'drop'].forEach(function (n) { dep.addEventListener(n, function (e) { e.preventDefault(); dep.classList.remove('is-sur'); if (n === 'drop') ajouter(e.dataTransfer.files); }); });
    $('#d-importer').onclick = importer;
    p.addEventListener('click', function (e) {
      var r = e.target.closest('[data-retire]'); if (r) { fichiers.splice(+r.dataset.retire, 1); majListe(); return; }
      var fb = e.target.closest('[data-fb]'); if (fb) { baseSaisie = fb.dataset.fb; $$('#f-base button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fb === baseSaisie)); }); APP.glisse($('#f-base')); $('#f-prix-l').textContent = 'Prix ' + baseSaisie; return; }
      var a = e.target.closest('[data-act]'); if (a && a.dataset.act === 'modele' && APP.exporterModele) APP.exporterModele();
      if (e.target.closest('[data-vider]')) vider();
    });
    $('#f-cond').onchange = function (e) { var v = e.target.value === 'Vrac'; $('#f-palier').disabled = !v; if (!v) $('#f-palier').value = ''; };
    $('#d-form').onsubmit = function (e) { e.preventDefault(); saisir(); };
  }

  function majListe() {
    var z = $('#d-liste'); if (!z) return;
    z.innerHTML = fichiers.map(function (f, i) { return '<span class="pastille" style="display:inline-flex;align-items:center;gap:var(--s2)">' + esc(f.name) + '<button type="button" class="icone-btn" style="width:calc(var(--k)*26);height:calc(var(--k)*26)" data-retire="' + i + '" aria-label="Retirer ' + esc(f.name) + '">' + icon('croix') + '</button></span>'; }).join('');
    $('#d-importer').disabled = !fichiers.length;
  }

  function importer() {
    var retour = $('#d-retour'), e = S.etat, tva = e.tva_march;
    retour.innerHTML = '<div class="msg"><span class="chargement" aria-hidden="true"></span><div>Lecture des fichiers…</div></div>';
    var rejets = [], avert = [], total = 0, lignes = (e.historique || []).slice();
    var suite = fichiers.reduce(function (p, f) {
      return p.then(function () {
        return lireFichier(f).then(function (brut) { var r = H.validerImport(brut, f.name, tva); rejets = rejets.concat(r.rejets); avert = avert.concat(r.avertissements); if (r.lignes.length) { lignes = lignes.concat(r.lignes); total += r.lignes.length; } },
          function (err) { rejets.push(f.name + ' : illisible (' + err.message + ').'); });
      });
    }, Promise.resolve());
    suite.then(function () {
      var html = '';
      var fin = function () { retour.innerHTML = html + avert.map(function (a) { return '<div class="msg">' + icon('info') + '<div>' + esc(a) + '</div></div>'; }).join('') + rejets.map(function (r) { return '<div class="msg msg--warn">' + icon('alert') + '<div>' + esc(r) + '</div></div>'; }).join(''); };
      if (!total) { fin(); return; }
      return S.appliquer({ historique: H.dedoublonner(lignes, tva) }).then(function () { html = '<div class="msg msg--ok">' + icon('check') + '<div>' + total + ' ligne(s) importée(s).</div></div>'; fichiers = []; var r = retour.innerHTML; majListe(); majHistorique(); fin(); $('#d-hist').lastElementChild.textContent = ((S.etat.historique || []).length) + ' relevé' + ((S.etat.historique || []).length > 1 ? 's' : ''); });
    });
  }

  function saisir() {
    var r = $('#f-retour'), acteur = $('#f-acteur').value.trim(), prix = parseFloat($('#f-prix').value), cond = $('#f-cond').value, date = $('#f-date').value;
    var tva = (parseFloat($('#f-tva').value) || 0) / 100, palier = parseFloat($('#f-palier').value);
    var erreurs = [];
    if (!acteur) erreurs.push('Indiquez le nom du concurrent.');
    if (!(prix > 0)) erreurs.push('Le prix doit être strictement positif.');
    if (!date) erreurs.push('Indiquez la date du relevé.');
    $('#f-acteur').setAttribute('aria-invalid', String(!acteur)); $('#f-prix').setAttribute('aria-invalid', String(!(prix > 0)));
    if (erreurs.length) { r.innerHTML = erreurs.map(function (t) { return '<div class="msg msg--err">' + icon('alert') + '<div>' + esc(t) + '</div></div>'; }).join(''); return; }
    var p = H.pairePrix(prix, tva, baseSaisie);
    var ligne = { date: date, acteur: acteur, type_acteur: 'Concurrent', conditionnement: cond, produit: $('#f-produit').value.trim() || 'Granulés', palier_t: (cond === 'Vrac' && palier) ? palier : null, unite: cond === 'Vrac' ? 'tonne' : 'palette', prix_ht: p.ht, taux_tva: tva, prix_ttc: p.ttc };
    S.appliquer({ historique: H.dedoublonner((S.etat.historique || []).concat([ligne]), S.etat.tva_march) }).then(function () {
      r.innerHTML = '<div class="msg msg--ok">' + icon('check') + '<div>Relevé <b>' + esc(acteur) + '</b> ajouté : ' + esc(H.eur(p.ht)) + ' HT / ' + esc(H.eur(p.ttc)) + ' TTC.</div></div>';
      $('#f-prix').value = ''; majHistorique(); $('#d-hist').lastElementChild.textContent = ((S.etat.historique || []).length) + ' relevés';
    });
  }

  function majHistorique() {
    var z = $('#d-corps'); if (!z) return;
    var h = S.etat.historique || [];
    if (!h.length) { z.innerHTML = '<div class="msg">' + icon('info') + '<div>Aucune donnée. Importez un fichier, saisissez un relevé, ou archivez la grille depuis l\'onglet « Grille tarifaire ».</div></div>'; return; }
    var enr = H.enrichir(h, S.etat.tva_march).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var coh = H.coherenceBases(h).filter(function (c) { return c.anomalie; });
    var f = filtre.trim().toLowerCase();
    var vis = f ? enr.filter(function (r) { return (r.acteur + ' ' + r.reference + ' ' + r.conditionnement + ' ' + r.produit).toLowerCase().indexOf(f) >= 0; }) : enr;
    z.innerHTML =
      (coh.length ? '<div class="msg msg--warn">' + icon('alert') + '<div><b>Taux de TVA anormaux détectés</b> (hétérogènes chez un acteur, ou divergents du taux dominant) : vérifiez que vous ne mélangez pas des relevés HT et TTC, ce qui fausserait les écarts calculés dans l\'analyse.<br>' + coh.map(function (c) { return esc(c.acteur) + ' : ' + esc(H.tauxFmt(c.tauxMini)) + ' à ' + esc(H.tauxFmt(c.tauxMaxi)); }).join(' · ') + '</div></div>' : '') +
      '<div class="champ" style="margin:var(--s4) 0"><label for="d-filtre" class="sr">Filtrer les relevés</label><div class="unite"><input class="saisie" id="d-filtre" type="search" placeholder="Filtrer : acteur, produit, palier…" value="' + esc(filtre) + '" autocomplete="off"><span>' + vis.length + '</span></div></div>' +
      '<div class="tbl-wrap tbl-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Acteur</th><th>Référence</th><th class="n">Prix HT</th><th class="n">TVA</th><th class="n">Prix TTC</th></tr></thead><tbody>' +
      vis.slice(0, 400).map(function (r) { return '<tr><td>' + esc(H.dateFr(r.date)) + '</td><td>' + esc(r.acteur) + (r.type_acteur === 'Interne' ? ' <span class="etiquette">interne</span>' : '') + '</td><td>' + esc(r.reference) + '</td><td class="n num">' + esc(H.eur(r.prix_ht)) + '</td><td class="n">' + esc(H.tauxFmt(r.taux_tva)) + '</td><td class="n num">' + esc(H.eur(r.prix_ttc)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (vis.length > 400 ? '<p class="aide" style="margin-top:var(--s3)">400 premières lignes affichées sur ' + vis.length + ' : affinez le filtre ou exportez le classeur.</p>' : '') +
      '<hr class="sep"><div class="actions"><button class="btn btn--danger" type="button" data-vider>' + icon('trash') + 'Vider les données</button></div>';
    var inp = $('#d-filtre'); inp.addEventListener('input', APP.debounce(function () { filtre = inp.value; var pos = inp.selectionStart; majHistorique(); var n = $('#d-filtre'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }, 200));
  }

  function vider() {
    APP.confirmer({ titre: 'Supprimer tout l\'historique ?', texte: 'L\'historique de prix est partagé avec toute l\'équipe et n\'a pas de corbeille. Exportez d\'abord le classeur Excel si vous voulez le conserver.', ok: 'Supprimer définitivement', danger: true }).then(function (ok) {
      if (!ok) return;
      S.appliquer({ historique: [] }).then(function () { APP.toast('Historique supprimé.'); rendre(); });
    });
  }

  APP.vues.donnees = { rendre: rendre, ouvrir: function () { APP.glisse($('#f-base')); } };
})();
