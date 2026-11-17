/* Cockpit granulés · exports et imports de classeurs : Excel (ExcelJS) et PDF (jsPDF), chargés à la demande. Même disposition de classeur que la version Streamlit. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, S = APP.store, icon = APP.icon;
  var LIBS = {
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  };
  var chargees = {};
  function charger(cle) {
    if (chargees[cle]) return chargees[cle];
    return chargees[cle] = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = LIBS[cle]; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = function () { delete chargees[cle]; ko(new Error('Bibliothèque ' + cle + ' indisponible (connexion ?).')); };
      document.head.appendChild(s);
    });
  }
  var plat = function (t) { return String(t === null || t === undefined ? '' : t).replace(/[  ]/g, ' '); };
  var nom = function (ext, pref) { return (pref || 'HYM_grille_granules_') + String(S.etat.date_grille || APP.aujourdhui()).replace(/-/g, '') + '.' + ext; };

  APP.telecharger = function (blob, fichier) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fichier; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  var attente = function (msg, promesse) {
    APP.toast(msg); return promesse.catch(function (e) { APP.toast(e.message || 'Export impossible.', 'err'); throw e; });
  };

  /* ================================================================== lecture d'un classeur .xlsx -> { feuille: [[cellules]] } */
  APP.lireClasseur = function (fichier) {
    return charger('exceljs').then(function () { return fichier.arrayBuffer(); }).then(function (buf) {
      var wb = new ExcelJS.Workbook();
      return wb.xlsx.load(buf).then(function () {
        var out = {};
        wb.eachSheet(function (ws) {
          var rows = [];
          ws.eachRow({ includeEmpty: true }, function (row, n) {
            var v = row.values.slice(1), r = v.map(function (c) {
              if (c === null || c === undefined) return null;
              if (c instanceof Date) return c.getUTCFullYear() + '-' + String(c.getUTCMonth() + 1).padStart(2, '0') + '-' + String(c.getUTCDate()).padStart(2, '0');
              if (typeof c === 'object') { if ('result' in c) return c.result instanceof Date ? H.dateIso(c.result) : c.result; if (c.richText) return c.richText.map(function (t) { return t.text; }).join(''); if ('text' in c) return c.text; return String(c); }
              return c;
            });
            rows[n - 1] = r;
          });
          for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
          out[ws.name] = rows;
        });
        return out;
      });
    });
  };

  /* ================================================================== Excel */
  function mettreEnForme(ws, euroCols) {
    var ent = ws.getRow(1);
    ent.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D2408' } }; c.font = { color: { argb: 'FFF5F4F0' }, bold: true, size: 10 }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns.forEach(function (col, i) {
      var max = 8; col.eachCell({ includeEmpty: false }, function (c) { var l = String(c.value instanceof Date ? '00/00/0000' : (c.value === null || c.value === undefined ? '' : c.value)).length; if (l > max) max = l; });
      col.width = Math.min(Math.max(max + 3, 11), 34);
    });
    (euroCols || []).forEach(function (i) { ws.getColumn(i).numFmt = '# ##0.00 "€"'; });
  }
  function feuille(wb, nomF, entetes, lignes, euroCols) {
    var ws = wb.addWorksheet(nomF.slice(0, 31));
    ws.addRow(entetes); lignes.forEach(function (l) { ws.addRow(l); });
    mettreEnForme(ws, euroCols); return ws;
  }
  var dateXl = function (iso) { return iso ? new Date(iso + 'T00:00:00Z') : null; };
  var nn = function (v) { return v === undefined || (typeof v === 'number' && isNaN(v)) ? null : v; };

  function construireClasseur() {
    var e = S.etat, h = e.historique || [], wb = new ExcelJS.Workbook(); wb.creator = 'Hympyr Énergies'; wb.created = new Date();
    // Grille tarifaire
    var gt = H.grilleTableau(e.palettes, e.vrac, e.tva_march);
    var wg = feuille(wb, 'Grille tarifaire', ['Date d\'effet', 'Conditionnement', 'Produit', 'Palier (T)', 'Unité', 'Prix HT', 'TVA', 'Prix TTC'], gt.map(function (r) { return [dateXl(e.date_grille), r.Conditionnement, r.Produit, r['Palier (T)'] === '' ? null : r['Palier (T)'], r['Unité'], r['Prix HT'], plat(r.TVA), r['Prix TTC']]; }), [6, 8]);
    wg.getColumn(1).numFmt = 'dd/mm/yyyy';
    // Livraison : zones puis règles du vrac, comme l'outil d'origine
    var z = H.libellesZones(e.zones, e.tva_livr);
    var wl = wb.addWorksheet('Livraison');
    wl.addRow(['Zone', 'Distance', '72 h HT', '72 h TTC', '15 j HT', '15 j TTC', 'TVA']);
    z.forEach(function (r) { wl.addRow([r.Zone, plat(r.Distance), r['72 h HT'], r['72 h TTC'], r['15 j HT'], r['15 j TTC'], plat(r.TVA)]); });
    wl.addRow([]); wl.addRow([]);
    var entRegle = wl.addRow(['Règle vrac', 'Valeur']);
    wl.addRow(['Franchise (km)', e.franchise_km]); wl.addRow(['€ HT / km au-delà', e.prix_km_ht]); wl.addRow(['€ TTC / km au-delà', e.prix_km_ttc]); wl.addRow(['TVA livraison', plat(H.tauxFmt(e.tva_livr))]);
    mettreEnForme(wl, [3, 4, 5, 6]);
    [1, 2].forEach(function (c) { var cell = entRegle.getCell(c); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D2408' } }; cell.font = { color: { argb: 'FFF5F4F0' }, bold: true, size: 10 }; });
    // Historique et analyses
    var enr = H.enrichir(h, e.tva_march);
    if (enr.length) {
      var wd = feuille(wb, 'Données brutes', H.COLONNES.concat(['reference']), enr.map(function (r) { return H.COLONNES.map(function (c) { return c === 'date' ? dateXl(r.date) : nn(r[c]); }).concat([r.reference]); }), [8, 10]);
      wd.getColumn(1).numFmt = 'dd/mm/yyyy';
      [['TTC', 'prix_ttc'], ['HT', 'prix_ht']].forEach(function (b) {
        var m = H.matriceDernierPrix(h, b[1]);
        if (m.references.length) feuille(wb, 'Matrice ' + b[0], ['reference'].concat(m.acteurs), m.references.map(function (r) { return [r].concat(m.acteurs.map(function (a) { return m.valeurs[r][a] === undefined ? null : m.valeurs[r][a]; })); }), m.acteurs.map(function (a, i) { return i + 2; }));
        var p = H.positionnement(h, 'Hympyr', b[1]);
        if (p.length) feuille(wb, 'Positionnement ' + b[0], ['reference', 'Hympyr', 'Moyenne marché', 'Mini marché', 'Maxi marché', 'Écart € vs moyenne', 'Écart % vs moyenne', 'Indice (base 100)', 'Rang', 'Nb offres comparées'], p.map(function (r) { return [r.reference, r.hympyr, r.moyenne, r.mini, r.maxi, r.ecart, r.ecartPct, r.indice, r.rang, r.nbOffres]; }), [2, 3, 4, 5, 6]);
      });
      var v = H.volatilite(h); if (v.length) feuille(wb, 'Volatilité', ['reference', 'Nb relevés', 'Prix mini', 'Prix maxi', 'Prix moyen', 'Écart-type', 'Amplitude %'], v.map(function (r) { return [r.reference, r.nb, r.mini, r.maxi, r.moyenne, nn(r.ecartType), r.amplitude]; }), [3, 4, 5, 6]);
      var ev = H.evolutionPeriode(h); if (ev.length) feuille(wb, 'Évolution Hympyr', ['reference', 'Première date', 'Prix initial', 'Dernière date', 'Prix actuel', 'Variation €', 'Variation %'], ev.map(function (r) { return [r.reference, dateXl(r.dateInitiale), r.prixInitial, dateXl(r.dateActuelle), r.prixActuel, r.variation, r.variationPct]; }), [3, 5, 6]);
      var dg = H.degressivite(h); if (dg.paliers.length) feuille(wb, 'Dégressivité vrac', ['palier_t'].concat(dg.acteurs), dg.paliers.map(function (p) { return [p].concat(dg.acteurs.map(function (a) { return dg.valeurs[p][a] === undefined ? null : dg.valeurs[p][a]; })); }), dg.acteurs.map(function (a, i) { return i + 2; }));
      var co = H.coherenceBases(h); if (co.length) feuille(wb, 'Contrôle bases TVA', ['acteur', 'Taux mini', 'Taux maxi', 'Nb relevés', 'Taux hétérogène', 'Taux dominant', 'Divergent', 'Anomalie'], co.map(function (r) { return [r.acteur, r.tauxMini, r.tauxMaxi, r.nb, r.heterogene ? 'oui' : 'non', r.dominant, r.divergent ? 'oui' : 'non', r.anomalie ? 'oui' : 'non']; }));
    }
    feuille(wb, 'Modèle import', ['date', 'acteur', 'type_acteur', 'conditionnement', 'produit', 'palier_t', 'unite', 'prix_ht', 'taux_tva', 'prix_ttc'], MODELE);
    return wb;
  }
  var MODELE = [['01/09/2026', 'Hympyr', 'Interne', 'Palette', 'Piveteau', '', 'palette', '411,70', '10', '452,87'], ['01/09/2026', 'Concurrent A', 'Concurrent', 'Vrac', 'Granulés vrac', '5', 'tonne', '', '10', '415,00']];

  APP.exporterExcel = function () {
    return attente('Préparation du classeur Excel…', charger('exceljs').then(function () { return construireClasseur().xlsx.writeBuffer(); }).then(function (buf) {
      APP.telecharger(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nom('xlsx')); APP.toast('Classeur téléchargé.');
    }));
  };
  APP.exporterModele = function () {
    return attente('Préparation du modèle…', charger('exceljs').then(function () {
      var wb = new ExcelJS.Workbook(); feuille(wb, 'Modèle import', ['date', 'acteur', 'type_acteur', 'conditionnement', 'produit', 'palier_t', 'unite', 'prix_ht', 'taux_tva', 'prix_ttc'], MODELE);
      return wb.xlsx.writeBuffer();
    }).then(function (buf) { APP.telecharger(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'HYM_modele_import_prix.xlsx'); }));
  };

  /* ================================================================== PDF */
  var BRUN = [61, 36, 8], ORANGE = [203, 122, 40], TEXTE = [40, 30, 20];
  function nouveauPdf(titre, sous) {
    var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4', compress: true });
    doc.setFillColor.apply(doc, BRUN); doc.rect(0, 0, 210, 30, 'F');
    doc.setFillColor.apply(doc, ORANGE); doc.rect(0, 30, 210, 1.4, 'F');
    doc.setTextColor(245, 244, 240); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(plat(titre), 14, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(plat(sous), 14, 22);
    doc.setTextColor.apply(doc, TEXTE); doc._y = 42; return doc;
  }
  function section(doc, t) {
    if (doc._y > 245) { doc.addPage(); doc._y = 20; }
    doc._y += 3; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor.apply(doc, BRUN); doc.text(plat(t), 14, doc._y);
    doc.setDrawColor.apply(doc, ORANGE); doc.setLineWidth(.6); doc.line(14, doc._y + 2, 196, doc._y + 2); doc.setTextColor.apply(doc, TEXTE); doc._y += 8;
  }
  function para(doc, t, taille) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(taille || 9.5);
    var l = doc.splitTextToSize(plat(t), 182); if (doc._y + l.length * 5 > 280) { doc.addPage(); doc._y = 20; }
    doc.text(l, 14, doc._y); doc._y += l.length * 4.8 + 3;
  }
  function tableau(doc, tete, corps) {
    if (!corps.length) { para(doc, 'Aucune donnée disponible.'); return; }
    doc.autoTable({ startY: doc._y, head: [tete.map(plat)], body: corps.map(function (r) { return r.map(plat); }), theme: 'plain', margin: { left: 14, right: 14 }, styles: { font: 'helvetica', fontSize: tete.length > 6 ? 6.8 : 8.3, cellPadding: 1.6, halign: 'center', textColor: TEXTE, lineColor: [225, 215, 200], lineWidth: .1, overflow: 'linebreak' }, headStyles: { fillColor: BRUN, textColor: [245, 244, 240], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [250, 244, 234] }, didDrawPage: function () {} });
    doc._y = doc.lastAutoTable.finalY + 5;
  }
  function pied(doc, t) {
    para(doc, t, 7.5);
    var n = doc.internal.getNumberOfPages(); for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130, 120, 110); doc.text(plat(H.CONFIG.SOCIETE) + ' · page ' + i + '/' + n, 196, 290, { align: 'right' }); }
  }
  function imageSvg(svg, largeur) {
    return new Promise(function (ok, ko) {
      var m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = +m[1], h = +m[2], img = new Image();
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.onload = function () { var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); ok({ data: c.toDataURL('image/jpeg', .92), w: largeur, h: largeur * h / w }); };
      img.onerror = function () { ko(new Error('Graphique non exportable.')); }; img.src = url;
    });
  }
  function poserImage(doc, im) { if (doc._y + im.h > 282) { doc.addPage(); doc._y = 20; } doc.addImage(im.data, 'JPEG', 14, doc._y, im.w, im.h, undefined, 'FAST'); doc._y += im.h + 5; }
  var libZone = function (t) { return plat(t).replace('≤ ', '<= '); };

  APP.exporterPdfGrille = function () {
    return attente('Préparation du PDF…', charger('jspdf').then(function () { return charger('autotable'); }).then(function () {
      var e = S.etat, doc = nouveauPdf('Grille tarifaire granulés de bois', H.CONFIG.SOCIETE + ' · Date d\'effet : ' + H.dateFr(e.date_grille) + ' · Édité le ' + H.dateFr(APP.aujourdhui()));
      section(doc, 'Granulés en palette');
      tableau(doc, ['Produit', 'Prix HT (EUR)', 'TVA', 'Prix TTC (EUR)'], Object.keys(e.palettes).map(function (k) { return [k, H.dec(e.palettes[k].ht), H.tauxFmt(e.tva_march), H.dec(e.palettes[k].ttc)]; }));
      section(doc, 'Granulés en vrac');
      tableau(doc, ['Palier', 'HT / tonne (EUR)', 'TVA', 'TTC / tonne (EUR)', 'Total TTC (EUR)'], Object.keys(e.vrac).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return [t + ' T', H.dec(e.vrac[t].ht), H.tauxFmt(e.tva_march), H.dec(e.vrac[t].ttc), H.dec(H.r2(t * e.vrac[t].ttc))]; }));
      section(doc, 'Frais de livraison - palettes');
      para(doc, 'Frais déterminés par la distance routière réelle entre le dépôt de Saint-Sulpice-la-Pointe et l\'adresse de livraison. À partir de deux palettes, les frais sont facturés une seule fois.');
      tableau(doc, ['Zone', 'Distance', '72 h HT', '72 h TTC', '15 j HT', '15 j TTC', 'TVA'], H.libellesZones(e.zones, e.tva_livr).map(function (z) { return [z.Zone, libZone(z.Distance), H.dec(z['72 h HT']), H.dec(z['72 h TTC']), H.dec(z['15 j HT']), H.dec(z['15 j TTC']), H.tauxFmt(z.TVA ? e.tva_livr : e.tva_livr)]; }));
      section(doc, 'Frais de livraison - vrac');
      para(doc, 'Livraison offerte jusqu\'à ' + H.dec(e.franchise_km, 0) + ' km. Au-delà : ' + H.dec(e.prix_km_ht) + ' EUR HT (' + H.dec(e.prix_km_ttc) + ' EUR TTC) par kilomètre supplémentaire, calculé sur la distance routière réelle.');
      pied(doc, H.CONFIG.SOCIETE + ' · ' + H.CONFIG.TELEPHONE + ' · Document indicatif à usage interne. TVA marchandise ' + H.tauxFmt(e.tva_march) + ', TVA livraison ' + H.tauxFmt(e.tva_livr) + ' - taux paramétrés dans l\'outil et à confirmer auprès du service comptable. Ne vaut pas offre contractuelle. Tarifs susceptibles de modification sans préavis.');
      doc.save(nom('pdf')); APP.toast('PDF téléchargé.');
    }));
  };

  APP.exporterPdfAnalyse = function (base, ref) {
    return attente('Préparation du rapport…', charger('jspdf').then(function () { return charger('autotable'); }).then(function () {
      var D = APP.analyseDonnees(base), d = D.enr;
      if (!d.length) throw new Error('Aucune donnée à analyser.');
      var dates = d.map(function (r) { return r.date; }).sort(), acteurs = D.matrice.acteurs, conc = acteurs.filter(function (a) { return a.toLowerCase() !== 'hympyr'; });
      var doc = nouveauPdf('Analyse tarifaire - granulés de bois (' + base + ')', H.CONFIG.SOCIETE + ' · Période ' + H.dateFr(dates[0]) + ' -> ' + H.dateFr(dates[dates.length - 1]) + ' · Édité le ' + H.dateFr(APP.aujourdhui()));
      section(doc, 'Périmètre');
      para(doc, d.length + ' relevés de prix · ' + acteurs.length + ' acteur(s) dont ' + conc.length + ' concurrent(s) · ' + D.matrice.references.length + ' référence(s).\nActeurs : ' + acteurs.join(', ') + '.\nToutes les comparaisons de ce rapport sont exprimées en ' + base + '.');
      var anom = D.coh.filter(function (c) { return c.anomalie; });
      if (anom.length) { section(doc, 'Contrôle de cohérence'); para(doc, 'Des taux de TVA anormaux ont été détectés : hétérogènes au sein d\'un même acteur, ou divergents du taux dominant. Cela peut signaler un mélange de sources HT et TTC : les écarts ci-dessous seraient alors artificiels. À vérifier avant toute décision.'); tableau(doc, ['Acteur', 'Taux mini', 'Taux maxi', 'Nb relevés'], anom.map(function (c) { return [c.acteur, H.tauxFmt(c.tauxMini), H.tauxFmt(c.tauxMaxi), c.nb]; })); }
      var pos = D.pos, etapes = [];
      if (pos.length) {
        etapes.push(function () {
          var moy = pos.reduce(function (s, r) { return s + r.ecartPct; }, 0) / pos.length;
          section(doc, 'Positionnement concurrentiel - dernier prix connu (' + base + ')');
          para(doc, 'Sur l\'ensemble des références comparables, Hympyr se situe en moyenne ' + H.dec(Math.abs(moy), 1) + ' % ' + (moy < 0 ? 'en dessous de' : 'au-dessus de') + ' la moyenne du marché.');
          tableau(doc, ['Référence', 'Hympyr', 'Moy. marché', 'Mini', 'Maxi', 'Écart %', 'Rang', 'Offres'], pos.map(function (r) { return [r.reference, H.dec(r.hympyr), H.dec(r.moyenne), H.dec(r.mini), H.dec(r.maxi), H.pct(r.ecartPct), r.rang, r.nbOffres]; }));
          return imageSvg(APP.graphiques.barres({ w: 640, theme: 'papier', rows: pos.slice().sort(function (a, b) { return a.ecartPct - b.ecartPct; }).map(function (r) { return { nom: r.reference, v: r.ecartPct }; }) }).svg, 182).then(function (im) { poserImage(doc, im); });
        });
      }
      if (D.evol.length && dates[0] !== dates[dates.length - 1]) etapes.push(function () { section(doc, 'Évolution des prix Hympyr sur la période (' + base + ')'); tableau(doc, ['Référence', 'Première date', 'Prix initial', 'Dernière date', 'Prix actuel', 'Variation %'], D.evol.map(function (r) { return [r.reference, H.dateFr(r.dateInitiale), H.dec(r.prixInitial), H.dateFr(r.dateActuelle), H.dec(r.prixActuel), H.pct(r.variationPct)]; })); });
      if (ref) {
        etapes.push(function () {
          section(doc, 'Focus référence - ' + ref);
          var m = APP.serieMarche(d, ref, D.col);
          var g1 = APP.graphiques.courbes({ w: 640, theme: 'papier', series: m.series.map(function (x) { return x._moy ? Object.assign({}, x, { couleur: APP.themeGraph.papier.moyenne }) : x; }), bande: m.bande, yLib: 'EUR ' + base });
          var g2 = APP.graphiques.courbes({ w: 640, theme: 'papier', series: APP.serieEvolution(d, ref, D.col), yLib: 'EUR ' + base });
          return imageSvg(g1.svg, 182).then(function (a) { poserImage(doc, a); return imageSvg(g2.svg, 182); }).then(function (b) { poserImage(doc, b); }).catch(function () {});
        });
      }
      if (D.deg.paliers.length) {
        etapes.push(function () {
          section(doc, 'Dégressivité vrac (' + base + ')');
          para(doc, 'Comparaison des structures de dégressivité : une pente plus forte signale une politique plus agressive sur les gros volumes.');
          return imageSvg(APP.graphiques.courbes({ w: 640, theme: 'papier', series: APP.serieDegressivite(D.deg), yLib: 'EUR ' + base + ' / tonne' }).svg, 182).then(function (im) { poserImage(doc, im); }, function () {}).then(function () { tableau(doc, ['Palier (T)'].concat(D.deg.acteurs), D.deg.paliers.map(function (p) { return [H.dec(p, 0)].concat(D.deg.acteurs.map(function (a) { return D.deg.valeurs[p][a] === undefined ? '-' : H.dec(D.deg.valeurs[p][a]); })); })); });
        });
      }
      var suite = etapes.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
      return suite.then(function () {
        if (D.vol.length) { section(doc, 'Volatilité par référence (' + base + ')'); para(doc, 'Amplitude entre prix mini et maxi relevés sur la période, tous acteurs confondus.'); tableau(doc, ['Référence', 'Relevés', 'Mini', 'Maxi', 'Moyen', 'Amplitude'], D.vol.map(function (r) { return [r.reference, r.nb, H.dec(r.mini), H.dec(r.maxi), H.dec(r.moyenne), H.pct(r.amplitude, false)]; })); }
        pied(doc, H.CONFIG.SOCIETE + ' · ' + H.CONFIG.TELEPHONE + ' · Analyse fondée exclusivement sur les données importées par l\'utilisateur ; leur exactitude et leur représentativité n\'ont pas été vérifiées. Les montants complétés par conversion HT/TTC reposent sur les taux renseignés dans l\'outil. Document interne.');
        doc.save('HYM_analyse_prix_' + base + '_' + APP.aujourdhui().replace(/-/g, '') + '.pdf'); APP.toast('Rapport téléchargé.');
      });
    }));
  };
})();
