/* Cockpit granulés · logique métier pure (aucun accès au DOM).
   Port fidèle de la « logique pure » de app_gran.py : mêmes règles de TVA, de zones, de frais de vrac, mêmes grilles de lecture.
   Fonctionne dans le navigateur (window.HYM) et sous Node (module.exports) : les tests comparent ces fonctions à celles de Python. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HYM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================== configuration métier (tout ce qui change se modifie ICI) */
  var CONFIG = {
    ADRESSE_DEPART: '490 route de Toulouse 81370 Saint-Sulpice-la-Pointe',
    TELEPHONE: '05 61 70 03 27',
    SOCIETE: 'Hympyr Énergies',
    TVA_MARCHANDISE_DEFAUT: 0.10,   // À VALIDER PAR LA COMPTABILITÉ avant tout usage commercial
    TVA_LIVRAISON_DEFAUT: 0.10,
    ZONES_TTC_DEFAUT: [
      { Zone: 'Zone 1', "Jusqu'à (km)": 10, '72 h TTC': 49, '15 j TTC': 29 },
      { Zone: 'Zone 2', "Jusqu'à (km)": 20, '72 h TTC': 49, '15 j TTC': 35 },
      { Zone: 'Zone 3', "Jusqu'à (km)": 30, '72 h TTC': 59, '15 j TTC': 45 },
      { Zone: 'Zone 4', "Jusqu'à (km)": 53, '72 h TTC': 79, '15 j TTC': 59 },
      { Zone: 'Zone 5', "Jusqu'à (km)": 9999, '72 h TTC': 95, '15 j TTC': 69 }
    ],
    VRAC_FRANCHISE_KM_DEFAUT: 35,
    VRAC_PRIX_KM_TTC_DEFAUT: 1.40,
    PALETTES_TTC_DEFAUT: { 'Piveteau': 452.87, 'Granulés de nos régions': 431.24 },
    VRAC_TTC_DEFAUT: { 2: 437, 3: 420, 4: 415, 5: 409, 6: 404, 7: 404, 8: 399, 9: 399 },
    SEUIL_ALERTE_KM: 80,
    ARRONDI_KM: 'entier',            // 'entier' | 'superieur' | 'aucun'
    COEF_VOL_OISEAU: 1.30
  };

  var COLONNES = ['date', 'acteur', 'type_acteur', 'conditionnement', 'produit', 'palier_t', 'unite', 'prix_ht', 'taux_tva', 'prix_ttc'];

  /* ================================================================== utilitaires */
  var isNum = function (v) { return typeof v === 'number' && !isNaN(v); };
  var isNil = function (v) { return v === null || v === undefined || (typeof v === 'number' && isNaN(v)); };

  /** Arrondi décimal identique à Python (valeur binaire exacte, égalité exacte arrondie au pair) : « 12.5 » -> « 12 », « 0.125 » -> « 0.12 ». */
  function fixedPy(v, n) {
    var neg = v < 0, a = Math.abs(v);
    var parts = a.toFixed(Math.min(100, n + 40)).split('.'), fr = parts[1] || '';
    var keep = fr.slice(0, n), rest = fr.slice(n);
    var entier = BigInt(parts[0] + keep);
    var tie = /^50*$/.test(rest), haut = rest.charAt(0) >= '5' && (!tie || entier % 2n === 1n);
    if (haut) entier += 1n;
    var str = entier.toString().padStart(n + 1, '0');
    var res = n ? str.slice(0, str.length - n) + '.' + str.slice(-n) : str;
    return (neg ? '-' : '') + res;
  }

  /** Arrondi au centime, identique à Python round(x, 2). */
  function r2(x) {
    if (isNil(x)) return NaN;
    return Number(fixedPy(Number(x), 2)) + 0;
  }

  function groupe(entier) { return entier.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }

  /** Montant en euros, format français (espace fine insécable entre milliers, virgule, espace insécable avant « € »). */
  function eur(v) {
    if (isNil(v)) return '—';
    var n = Number(v), s = fixedPy(Math.abs(n), 2).split('.');
    var neg = n < 0 && Number(fixedPy(Math.abs(n), 2)) !== 0;
    return (neg ? '-' : '') + groupe(s[0]) + ',' + s[1] + '\u00a0€';
  }
  function dec(v, n) {
    if (isNil(v)) return '—';
    n = n === undefined ? 2 : n;
    return fixedPy(Number(v), n).replace('.', ',');
  }
  function kmFmt(v) { return dec(v, 1) + ' km'; }
  function pct(v, signe) {
    if (isNil(v)) return '—';
    signe = signe === undefined ? true : signe;
    return (signe && v > 0 ? '+' : '') + dec(v, 1) + ' %';
  }
  function tauxFmt(t) {
    if (isNil(t)) return '—';
    var s = dec(Number(t) * 100, 1);
    s = s.replace(/0+$/, '').replace(/,$/, '');
    return s + ' %';
  }
  function normaliser(txt) {
    var t = String(txt).normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /* ================================================================== conversions TVA */
  function htVersTtc(ht, taux) { return isNil(ht) ? NaN : r2(Number(ht) * (1 + Number(taux))); }
  function ttcVersHt(ttc, taux) { return isNil(ttc) ? NaN : r2(Number(ttc) / (1 + Number(taux))); }

  /** Accepte 10, '10 %', 0.10, '0,1' -> 0.10. NaN si illisible. */
  function normaliserTaux(v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'string') {
      v = v.replace('%', '').replace(',', '.').replace(/ | /g, '').trim();
      if (!v) return NaN;
    }
    var x = Number(v);
    if (isNaN(x)) return NaN;
    return x > 1 ? x / 100 : x;
  }

  /** Depuis un montant saisi dans une base, renvoie {ht, ttc}. Les deux valeurs sont figées : aucune dérive d'arrondi au retour. */
  function pairePrix(valeur, taux, base) {
    if (isNil(valeur)) return { ht: NaN, ttc: NaN };
    var v = Number(valeur);
    if (String(base).toUpperCase() === 'HT') return { ht: r2(v), ttc: htVersTtc(v, taux) };
    return { ht: ttcVersHt(v, taux), ttc: r2(v) };
  }

  function arrondirKm(km, mode) {
    mode = mode || CONFIG.ARRONDI_KM;
    if (mode === 'entier') return Math.round(km);
    if (mode === 'superieur') return Math.ceil(km);
    return km;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    var rad = function (d) { return d * Math.PI / 180; };
    var p1 = rad(lat1), p2 = rad(lat2), dp = rad(lat2 - lat1), dl = rad(lon2 - lon1);
    var a = Math.pow(Math.sin(dp / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2);
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }

  /* ================================================================== tarification */
  function libelleZone(precedent, borne) {
    if (precedent === 0) return '≤ ' + dec(borne, 0) + ' km';
    if (borne < 9999) return '> ' + dec(precedent, 0) + ' à ' + dec(borne, 0) + ' km';
    return '> ' + dec(precedent, 0) + ' km';
  }

  /** Bornes continues, tri croissant. -> { nom, libelle, zone }. */
  function zonePalette(km, zones) {
    var tri = zones.slice().sort(function (a, b) { return Number(a["Jusqu'à (km)"]) - Number(b["Jusqu'à (km)"]); });
    var precedent = 0;
    for (var i = 0; i < tri.length; i++) {
      var borne = Number(tri[i]["Jusqu'à (km)"]);
      if (km <= borne) return { nom: tri[i].Zone, libelle: libelleZone(precedent, borne), zone: tri[i] };
      precedent = borne;
    }
    var d = tri[tri.length - 1];
    return { nom: d.Zone, libelle: '> ' + dec(precedent, 0) + ' km', zone: d };
  }

  function fraisVrac(km, franchise, prixKm) { return r2(Math.max(0, Number(km) - Number(franchise)) * Number(prixKm)); }
  function coutLivre(prixProduit, frais, tonnes) { return !tonnes || tonnes <= 0 ? NaN : (prixProduit + frais) / tonnes; }

  /* ================================================================== modèle de données (historique de prix) */
  function dateIso(v) {
    if (isNil(v) || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);   // jour d'abord, comme dayfirst=True
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    if (typeof v === 'number' && v > 20000 && v < 80000) {          // numéro de série Excel
      var d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    var t = new Date(s);
    return isNaN(t) ? null : dateIso(t);
  }
  function dateFr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }

  function reference(row) {
    if (String(row.conditionnement || '').trim().toLowerCase().indexOf('vrac') === 0) {
      var p = row.palier_t;
      if (isNil(p) || p === '') return 'Vrac';
      var n = parseInt(parseFloat(p), 10);
      return isNaN(n) ? 'Vrac' : 'Vrac ' + n + ' T';
    }
    return String(row.produit === undefined || row.produit === null ? '' : row.produit).trim();
  }

  function numOuNaN(v) { if (isNil(v) || v === '') return NaN; var n = Number(v); return isNaN(n) ? NaN : n; }

  /** Complète la colonne manquante (HT ou TTC) à partir du taux disponible. */
  function completerPrix(rows, tauxDefaut) {
    return rows.map(function (r) {
      var d = Object.assign({}, r);
      d.taux_tva = normaliserTaux(d.taux_tva);
      if (isNaN(d.taux_tva)) d.taux_tva = Number(tauxDefaut);
      d.prix_ht = numOuNaN(d.prix_ht); d.prix_ttc = numOuNaN(d.prix_ttc);
      if (isNaN(d.prix_ht) && !isNaN(d.prix_ttc)) d.prix_ht = ttcVersHt(d.prix_ttc, d.taux_tva);
      else if (isNaN(d.prix_ttc) && !isNaN(d.prix_ht)) d.prix_ttc = htVersTtc(d.prix_ht, d.taux_tva);
      return d;
    });
  }

  /** Ajoute 'reference', normalise les types, complète HT/TTC. */
  function enrichir(rows, tauxDefaut) {
    tauxDefaut = tauxDefaut === undefined ? CONFIG.TVA_MARCHANDISE_DEFAUT : tauxDefaut;
    if (!rows || !rows.length) return [];
    var d = rows.map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) { o[c] = r[c] === undefined ? NaN : r[c]; });
      o.date = dateIso(o.date);
      o.palier_t = numOuNaN(o.palier_t);
      return o;
    }).filter(function (r) { return r.date; })
      .map(function (r) { r.prix_ht = numOuNaN(r.prix_ht); r.prix_ttc = numOuNaN(r.prix_ttc); return r; })
      .filter(function (r) { return !isNaN(r.prix_ht) || !isNaN(r.prix_ttc); });
    d = completerPrix(d, tauxDefaut);
    d.forEach(function (r) { r.reference = reference(r); });
    return d;
  }

  function grilleVersLignes(dateEffet, palettes, vrac, taux, acteur) {
    acteur = acteur || 'Hympyr';
    var lignes = [], iso = dateIso(dateEffet);
    Object.keys(palettes).forEach(function (nom) {
      var p = palettes[nom];
      lignes.push({ date: iso, acteur: acteur, type_acteur: 'Interne', conditionnement: 'Palette', produit: nom, palier_t: null, unite: 'palette', prix_ht: Number(p.ht), taux_tva: Number(taux), prix_ttc: Number(p.ttc) });
    });
    Object.keys(vrac).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) {
      var p = vrac[t];
      lignes.push({ date: iso, acteur: acteur, type_acteur: 'Interne', conditionnement: 'Vrac', produit: 'Granulés vrac', palier_t: t, unite: 'tonne', prix_ht: Number(p.ht), taux_tva: Number(taux), prix_ttc: Number(p.ttc) });
    });
    return lignes;
  }

  /* ================================================================== import de fichiers */
  var ALIAS = {
    date: ['date', 'date_effet', 'date_d_effet', 'periode', 'mois', 'jour'],
    acteur: ['acteur', 'fournisseur', 'concurrent', 'enseigne', 'societe', 'entreprise', 'marque'],
    type_acteur: ['type_acteur', 'type', 'categorie', 'nature'],
    conditionnement: ['conditionnement', 'format', 'type_produit', 'packaging'],
    produit: ['produit', 'libelle', 'designation', 'article', 'reference'],
    palier_t: ['palier_t', 'palier', 'tonnage', 'tonnes', 'quantite_t', 'qte'],
    unite: ['unite', 'unit'],
    prix_ht: ['prix_ht', 'prix_hors_taxe', 'prix_hors_taxes', 'ht', 'montant_ht', 'tarif_ht', 'prix_unitaire_ht', 'prix_tonne_ht', 'prix_palette_ht'],
    taux_tva: ['taux_tva', 'tva', 'taux', 'taux_de_tva', 'tva_pct'],
    prix_ttc: ['prix_ttc', 'prix', 'tarif', 'montant', 'montant_ttc', 'ttc', 'prix_ttc_eur', 'prix_unitaire', 'prix_unitaire_ttc', 'prix_tonne', 'prix_palette']
  };

  /** Apparie les colonnes d'un fichier importé au schéma canonique. */
  function mapperColonnes(cols) {
    var norm = {}, mapping = {}, pris = {};
    cols.forEach(function (c) { var n = normaliser(c); if (!(n in norm)) norm[n] = c; });
    Object.keys(ALIAS).forEach(function (cible) {
      for (var i = 0; i < ALIAS[cible].length; i++) {
        var a = ALIAS[cible][i];
        if (a in norm && !pris[norm[a]]) { mapping[cible] = norm[a]; pris[norm[a]] = true; break; }
      }
    });
    return mapping;
  }

  /** Nombre au format français (« 1 234,50 € ») -> Number, NaN si illisible. */
  function numFr(v) {
    if (isNil(v) || v === '') return NaN;
    if (typeof v === 'number') return v;
    var s = String(v).replace(/[   €]/g, '').replace(',', '.');
    var n = Number(s);
    return isNaN(n) || s === '' ? NaN : n;
  }

  /** Normalise des lignes importées (objets {entête: valeur}) vers le schéma canonique. -> { lignes, rejets, avertissements }. */
  function validerImport(brut, nomFichier, tauxDefaut) {
    tauxDefaut = tauxDefaut === undefined ? CONFIG.TVA_MARCHANDISE_DEFAUT : tauxDefaut;
    var avertissements = [], rejets = [];
    var cols = brut.length ? Object.keys(brut[0]) : [];
    var mapping = mapperColonnes(cols);
    var manquantes = ['date', 'acteur'].filter(function (c) { return !(c in mapping); });
    if (!('prix_ht' in mapping) && !('prix_ttc' in mapping)) manquantes.push('prix HT ou prix TTC');
    if (manquantes.length) {
      rejets.push(nomFichier + ' : colonnes obligatoires introuvables (' + manquantes.join(', ') + '). Fichier ignoré.');
      return { lignes: [], rejets: rejets, avertissements: avertissements };
    }
    var d = brut.map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) { o[c] = c in mapping ? r[mapping[c]] : NaN; });
      o.date = dateIso(o.date);
      o.prix_ht = 'prix_ht' in mapping ? numFr(o.prix_ht) : NaN;
      o.prix_ttc = 'prix_ttc' in mapping ? numFr(o.prix_ttc) : NaN;
      o.palier_t = numOuNaN(o.palier_t);
      o.taux_tva = normaliserTaux(o.taux_tva);
      return o;
    });
    var n0 = d.length;
    var invalides = d.filter(function (r) { return !r.date || (isNaN(r.prix_ht) && isNaN(r.prix_ttc)); });
    if (invalides.length) rejets.push(nomFichier + ' : ' + invalides.length + ' ligne(s) sur ' + n0 + ' écartée(s) (date ou prix illisible).');
    d = d.filter(function (r) { return r.date && !(isNaN(r.prix_ht) && isNaN(r.prix_ttc)); });
    if (!d.length) return { lignes: [], rejets: rejets, avertissements: avertissements };

    var sansTaux = d.filter(function (r) { return isNaN(r.taux_tva); }).length;
    if (!('taux_tva' in mapping) || sansTaux === d.length) avertissements.push(nomFichier + ' : taux de TVA absent, ' + tauxFmt(tauxDefaut) + ' appliqué par défaut pour compléter la colonne manquante.');
    else if (sansTaux) avertissements.push(nomFichier + ' : ' + sansTaux + ' ligne(s) sans taux de TVA, complétées à ' + tauxFmt(tauxDefaut) + '.');
    d = completerPrix(d, tauxDefaut);

    if (!('conditionnement' in mapping)) {
      d.forEach(function (r) { r.conditionnement = isNaN(r.palier_t) ? 'Palette' : 'Vrac'; });
      avertissements.push(nomFichier + ' : colonne « conditionnement » absente, déduite du palier.');
    }
    d.forEach(function (r) {
      var c = String(r.conditionnement).trim();
      c = c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : 'Palette';
      r.conditionnement = (c === 'Nan' || c === '') ? 'Palette' : c;
      r.acteur = String(r.acteur).trim();
    });
    if (!('type_acteur' in mapping)) {
      d.forEach(function (r) { r.type_acteur = r.acteur.toLowerCase().indexOf('hympyr') >= 0 ? 'Interne' : 'Concurrent'; });
      avertissements.push(nomFichier + ' : colonne « type_acteur » absente, déduite du nom de l\'acteur.');
    }
    if (!('produit' in mapping)) d.forEach(function (r) { r.produit = r.conditionnement === 'Vrac' ? 'Granulés vrac' : 'Palette'; });
    if (!('unite' in mapping)) d.forEach(function (r) { r.unite = r.conditionnement === 'Vrac' ? 'tonne' : 'palette'; });
    var lignes = d.map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) { o[c] = isNil(r[c]) ? null : r[c]; });
      return o;
    });
    return { lignes: lignes, rejets: rejets, avertissements: avertissements };
  }

  /** Une seule ligne par (date, acteur, référence) — la dernière importée gagne. */
  function dedoublonner(rows, tauxDefaut) {
    var d = enrichir(rows, tauxDefaut);
    var vus = {};
    for (var i = d.length - 1; i >= 0; i--) {
      var cle = d[i].date + '|' + d[i].acteur + '|' + d[i].reference;
      if (vus[cle]) d[i]._sup = true; else vus[cle] = true;
    }
    return d.filter(function (r) { return !r._sup; }).map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) { o[c] = isNil(r[c]) ? null : r[c]; });
      return o;
    });
  }

  /* ================================================================== grilles de lecture (colonne = 'prix_ttc' | 'prix_ht') */
  function trierDate(d) { return d.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
  function moyenne(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function ecartType(a) { if (a.length < 2) return NaN; var m = moyenne(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1)); }
  function uniques(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /** Dernier prix connu par référence × acteur -> { references[], acteurs[], valeurs{ref:{acteur:prix}} }. */
  function matriceDernierPrix(rows, colonne) {
    colonne = colonne || 'prix_ttc';
    var d = trierDate(enrichir(rows));
    var vals = {}, refs = [], acteurs = [];
    d.forEach(function (r) {
      var v = r[colonne];
      if (isNaN(v)) return;
      if (!vals[r.reference]) { vals[r.reference] = {}; refs.push(r.reference); }
      vals[r.reference][r.acteur] = v;
      if (acteurs.indexOf(r.acteur) < 0) acteurs.push(r.acteur);
    });
    return { references: refs.sort(), acteurs: acteurs.sort(), valeurs: vals };
  }

  /** Positionnement sur le dernier prix connu. Indice base 100 = moyenne des concurrents. */
  function positionnement(rows, interne, colonne) {
    interne = interne || 'Hympyr'; colonne = colonne || 'prix_ttc';
    var m = matriceDernierPrix(rows, colonne);
    if (!m.references.length || m.acteurs.indexOf(interne) < 0) return [];
    var concurrents = m.acteurs.filter(function (a) { return a !== interne; });
    if (!concurrents.length) return [];
    var out = [];
    m.references.forEach(function (ref) {
      var ligne = m.valeurs[ref], mine = ligne[interne];
      var conc = concurrents.map(function (a) { return ligne[a]; }).filter(function (v) { return v !== undefined; });
      if (mine === undefined || !conc.length) return;
      var moy = moyenne(conc);
      var tous = Object.keys(ligne).map(function (a) { return ligne[a]; });
      var rang = 1 + tous.filter(function (v) { return v < mine; }).length;   // rang « min » : les ex æquo partagent le meilleur rang
      out.push({
        reference: ref, hympyr: mine, moyenne: moy, mini: Math.min.apply(null, conc), maxi: Math.max.apply(null, conc),
        ecart: mine - moy, ecartPct: (mine / moy - 1) * 100, indice: mine / moy * 100, rang: rang, nbOffres: tous.length
      });
    });
    return out;
  }

  /** Dispersion des prix par référence sur toute la période. */
  function volatilite(rows, colonne) {
    colonne = colonne || 'prix_ttc';
    var d = enrichir(rows), g = {};
    d.forEach(function (r) { if (!isNaN(r[colonne])) (g[r.reference] = g[r.reference] || []).push(r[colonne]); });
    var out = Object.keys(g).map(function (ref) {
      var a = g[ref], mn = Math.min.apply(null, a), mx = Math.max.apply(null, a);
      return { reference: ref, nb: a.length, mini: mn, maxi: mx, moyenne: moyenne(a), ecartType: ecartType(a), amplitude: (mx / mn - 1) * 100 };
    });
    return out.sort(function (a, b) { return b.amplitude - a.amplitude; });
  }

  /** Variation du premier au dernier relevé, par référence, pour un acteur. */
  function evolutionPeriode(rows, acteur, colonne) {
    acteur = acteur || 'Hympyr'; colonne = colonne || 'prix_ttc';
    var d = trierDate(enrichir(rows).filter(function (r) { return r.acteur === acteur && !isNaN(r[colonne]); })), g = {}, ordre = [];
    d.forEach(function (r) { if (!g[r.reference]) { g[r.reference] = []; ordre.push(r.reference); } g[r.reference].push(r); });
    var out = ordre.map(function (ref) {
      var a = g[ref], p = a[0], q = a[a.length - 1];
      return { reference: ref, dateInitiale: p.date, prixInitial: p[colonne], dateActuelle: q.date, prixActuel: q[colonne], variation: q[colonne] - p[colonne], variationPct: (q[colonne] / p[colonne] - 1) * 100 };
    });
    return out.sort(function (a, b) { return b.variationPct - a.variationPct; });
  }

  /** Prix/tonne par palier et par acteur (dernier prix connu) -> { paliers[], acteurs[], valeurs{palier:{acteur:prix}} }. */
  function degressivite(rows, colonne) {
    colonne = colonne || 'prix_ttc';
    var d = trierDate(enrichir(rows).filter(function (r) { return String(r.conditionnement).toLowerCase().indexOf('vrac') === 0 && !isNaN(r.palier_t) && !isNaN(r[colonne]); }));
    var vals = {}, paliers = [], acteurs = [];
    d.forEach(function (r) {
      if (!vals[r.palier_t]) { vals[r.palier_t] = {}; paliers.push(r.palier_t); }
      vals[r.palier_t][r.acteur] = r[colonne];
      if (acteurs.indexOf(r.acteur) < 0) acteurs.push(r.acteur);
    });
    return { paliers: uniques(paliers).sort(function (a, b) { return a - b; }), acteurs: acteurs.sort(), valeurs: vals };
  }

  /** Contrôle qualité sur les taux de TVA (hétérogènes chez un acteur / divergents du taux dominant). */
  function coherenceBases(rows) {
    var d = enrichir(rows);
    if (!d.length) return [];
    var g = {}, comptes = {};
    d.forEach(function (r) {
      (g[r.acteur] = g[r.acteur] || []).push(r.taux_tva);
      var k = String(r.taux_tva); comptes[k] = (comptes[k] || 0) + 1;
    });
    var maxc = Math.max.apply(null, Object.keys(comptes).map(function (k) { return comptes[k]; }));
    var dominant = Math.min.apply(null, Object.keys(comptes).filter(function (k) { return comptes[k] === maxc; }).map(Number));   // mode(), plus petite valeur en cas d'égalité
    return Object.keys(g).sort().map(function (acteur) {
      var a = g[acteur], mn = Math.min.apply(null, a), mx = Math.max.apply(null, a);
      var het = mn !== mx, div = mn !== dominant || mx !== dominant;
      return { acteur: acteur, tauxMini: mn, tauxMaxi: mx, nb: a.length, heterogene: het, dominant: dominant, divergent: div, anomalie: het || div };
    });
  }

  /* ================================================================== grille tarifaire (tableaux d'édition) */
  function grilleTableau(palettes, vrac, taux) {
    var l = Object.keys(palettes).map(function (k) { return { Conditionnement: 'Palette', Produit: k, 'Palier (T)': '', 'Unité': 'palette', 'Prix HT': palettes[k].ht, TVA: tauxFmt(taux), 'Prix TTC': palettes[k].ttc }; });
    Object.keys(vrac).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) {
      l.push({ Conditionnement: 'Vrac', Produit: 'Granulés vrac', 'Palier (T)': t, 'Unité': 'tonne', 'Prix HT': vrac[t].ht, TVA: tauxFmt(taux), 'Prix TTC': vrac[t].ttc });
    });
    return l;
  }

  function libellesZones(zones, taux) {
    var out = [], precedent = 0;
    zones.slice().sort(function (a, b) { return Number(a["Jusqu'à (km)"]) - Number(b["Jusqu'à (km)"]); }).forEach(function (z) {
      var b = Number(z["Jusqu'à (km)"]);
      out.push({ Zone: z.Zone, Distance: libelleZone(precedent, b), '72 h HT': Number(z['72 h HT']), '72 h TTC': Number(z['72 h TTC']), '15 j HT': Number(z['15 j HT']), '15 j TTC': Number(z['15 j TTC']), TVA: tauxFmt(taux) });
      precedent = b;
    });
    return out;
  }

  /** « ≤ 10 km » -> 10 ; « > 10 à 20 km » -> 20 ; « > 53 km » -> 9999. */
  function borneDepuisLibelle(valeur) {
    if (isNil(valeur)) return null;
    if (typeof valeur === 'number') return valeur;
    var txt = String(valeur).trim(), nombres = txt.match(/\d+(?:[.,]\d+)?/g);
    if (!nombres) return null;
    if (/^\s*>/.test(txt) && nombres.length === 1) return 9999;
    return parseFloat(nombres[nombres.length - 1].replace(',', '.'));
  }

  /** Paire HT/TTC : si la valeur saisie est celle d'origine (même taux), la paire d'origine est conservée telle quelle. */
  function pairOuOrig(v, taux, base, orig, tauxOrig) {
    if (orig && tauxOrig !== undefined && Math.abs(taux - tauxOrig) < 1e-12 && Number(v) === Number(orig[String(base).toLowerCase()])) return { ht: orig.ht, ttc: orig.ttc };
    return pairePrix(v, taux, base);
  }
  function extrairePalettes(lignes, taux, base, tauxOrig) {
    var out = {};
    (lignes || []).forEach(function (r) {
      var nom = String(r.nom === undefined || r.nom === null ? '' : r.nom).trim();
      var v = numOuNaN(r.prix);
      if (!nom || isNaN(v)) return;
      out[nom] = pairOuOrig(v, taux, base, r.orig, tauxOrig);
    });
    return out;
  }
  function extraireVrac(lignes, taux, base, tauxOrig) {
    var out = {};
    (lignes || []).forEach(function (r) {
      var p = numOuNaN(r.palier), v = numOuNaN(r.prix);
      if (isNaN(p) || isNaN(v)) return;
      out[Math.round(p)] = pairOuOrig(v, taux, base, r.orig, tauxOrig);
    });
    return out;
  }
  function extraireZones(lignes, taux, base, tauxOrig) {
    var out = [];
    (lignes || []).forEach(function (r) {
      var borne = numOuNaN(r.borne), a = numOuNaN(r.h72), b = numOuNaN(r.j15);
      if (isNaN(borne) || isNaN(a) || isNaN(b)) return;
      var p72 = pairOuOrig(a, taux, base, r.o72, tauxOrig), p15 = pairOuOrig(b, taux, base, r.o15, tauxOrig);
      out.push({ Zone: String(r.zone || '').trim() || 'Zone', "Jusqu'à (km)": borne, '72 h HT': p72.ht, '72 h TTC': p72.ttc, '15 j HT': p15.ht, '15 j TTC': p15.ttc });
    });
    return out;
  }

  /** Zones : bornes strictement croissantes, la dernière ouverte (9999). -> liste de messages d'alerte (vide si tout va bien). */
  function controleZones(zones) {
    var msgs = [], tri = zones.slice().sort(function (a, b) { return Number(a["Jusqu'à (km)"]) - Number(b["Jusqu'à (km)"]); });
    for (var i = 1; i < tri.length; i++) if (Number(tri[i]["Jusqu'à (km)"]) === Number(tri[i - 1]["Jusqu'à (km)"])) msgs.push('Deux zones ont la même borne (' + dec(tri[i]["Jusqu'à (km)"], 0) + ' km).');
    if (tri.length && Number(tri[tri.length - 1]["Jusqu'à (km)"]) < 9999) msgs.push('La dernière zone doit être ouverte (borne 9999 km) pour couvrir toutes les distances.');
    return msgs;
  }

  /* ================================================================== lecture d'un classeur exporté (feuilles = tableaux de lignes) */
  /** sheets : { nomFeuille: [[cellules…], …] } (première ligne = en-têtes). -> { grille | null, messages[] }. */
  function lireGrilleClasseur(sheets, tauxMarchDefaut, tauxLivrDefaut) {
    tauxMarchDefaut = tauxMarchDefaut === undefined ? CONFIG.TVA_MARCHANDISE_DEFAUT : tauxMarchDefaut;
    tauxLivrDefaut = tauxLivrDefaut === undefined ? CONFIG.TVA_LIVRAISON_DEFAUT : tauxLivrDefaut;
    var msgs = [];
    var gRows = sheets['Grille tarifaire'];
    if (!gRows) return { grille: null, messages: ['Onglet « Grille tarifaire » introuvable. Utilisez un classeur exporté par cet outil.'] };
    var tab = enTableau(gRows);
    var cols = {};
    tab.entetes.forEach(function (c) { cols[normaliser(c)] = c; });
    var besoin = ['produit', 'prix_ht', 'prix_ttc'].filter(function (c) { return !(c in cols); });
    if (besoin.length) return { grille: null, messages: ['Colonnes manquantes dans « Grille tarifaire » : ' + besoin.join(', ') + '.'] };

    var lignes = tab.lignes.map(function (r) {
      return {
        r: r, ht: numFr(r[cols.prix_ht]), ttc: numFr(r[cols.prix_ttc]),
        cond: 'conditionnement' in cols ? String(r[cols.conditionnement] === undefined || r[cols.conditionnement] === null ? '' : r[cols.conditionnement]).trim().toLowerCase() : '',
        palier: 'palier_t' in cols ? numOuNaN(r[cols.palier_t]) : (('palier_t_' in cols) ? numOuNaN(r[cols.palier_t_]) : NaN)
      };
    });
    // la colonne « Palier (T) » se normalise en « palier_t »
    var tvaM = NaN;
    if ('tva' in cols) {
      var taux = lignes.map(function (l) { return normaliserTaux(l.r[cols.tva]); }).filter(function (t) { return !isNaN(t); });
      if (taux.length) tvaM = modeValeur(taux);
    }
    if (isNaN(tvaM)) {
      var valides = lignes.filter(function (l) { return l.ht > 0 && l.ttc > 0; });
      if (valides.length) {
        var rapports = valides.map(function (l) { return l.ttc / l.ht - 1; }).sort(function (a, b) { return a - b; });
        var mid = rapports.length >> 1, med = rapports.length % 2 ? rapports[mid] : (rapports[mid - 1] + rapports[mid]) / 2;
        tvaM = Number(med.toFixed(4));
        msgs.push('Colonne TVA absente : taux marchandise déduit du rapport HT/TTC (' + tauxFmt(tvaM) + ').');
      }
    }
    if (isNaN(tvaM)) { tvaM = Number(tauxMarchDefaut); msgs.push('Taux de TVA marchandise introuvable, ' + tauxFmt(tvaM) + ' appliqué par défaut.'); }

    var palettes = {}, vrac = {};
    lignes.forEach(function (l) {
      var ht = l.ht, ttc = l.ttc;
      if (isNaN(ht) && isNaN(ttc)) return;
      if (isNaN(ht)) ht = ttcVersHt(ttc, tvaM);
      if (isNaN(ttc)) ttc = htVersTtc(ht, tvaM);
      if (l.cond.indexOf('vrac') === 0 && !isNaN(l.palier)) vrac[Math.round(l.palier)] = { ht: r2(ht), ttc: r2(ttc) };
      else {
        var nom = String(l.r[cols.produit] === undefined || l.r[cols.produit] === null ? '' : l.r[cols.produit]).trim();
        if (nom && nom.toLowerCase() !== 'nan') palettes[nom] = { ht: r2(ht), ttc: r2(ttc) };
      }
    });
    if (!Object.keys(palettes).length && !Object.keys(vrac).length) return { grille: null, messages: ['Aucune ligne de prix exploitable dans « Grille tarifaire ».'] };

    var dateGrille = dateIso(new Date()), cleDate = cols.date_d_effet || cols.date_effet || cols.date;
    if (cleDate) {
      var ds = lignes.map(function (l) { return dateIso(l.r[cleDate]); }).filter(Boolean).sort();
      if (ds.length) dateGrille = ds[ds.length - 1];
    }

    var zones = [], tvaL = Number(tauxLivrDefaut), franchise = CONFIG.VRAC_FRANCHISE_KM_DEFAUT, kmHt = NaN, kmTtc = CONFIG.VRAC_PRIX_KM_TTC_DEFAUT;
    if (sheets['Livraison']) {
      try {
        var brut = sheets['Livraison'];
        var lt = enTableau(brut), lc = {};
        lt.entetes.forEach(function (c) { lc[normaliser(c)] = c; });
        var cleBorne = 'jusqu_a_km' in lc ? 'jusqu_a_km' : ('distance' in lc ? 'distance' : null);
        if ('zone' in lc && cleBorne) {
          lt.lignes.forEach(function (r) {
            if (isNil(r[lc.zone]) || r[lc.zone] === '' || isNil(r[lc[cleBorne]]) || r[lc[cleBorne]] === '') return;
            var borne = borneDepuisLibelle(r[lc[cleBorne]]);
            if (borne === null) return;       // ligne « Règle vrac », pas une zone
            var v = function (k) { return k in lc && !isNil(r[lc[k]]) ? numFr(r[lc[k]]) : NaN; };
            zones.push({ Zone: String(r[lc.zone]).trim(), "Jusqu'à (km)": borne, '72 h HT': v('72_h_ht'), '72 h TTC': v('72_h_ttc'), '15 j HT': v('15_j_ht'), '15 j TTC': v('15_j_ttc') });
          });
          if ('tva' in lc) {
            var tl = lt.lignes.map(function (r) { return normaliserTaux(r[lc.tva]); }).filter(function (t) { return !isNaN(t); });
            if (tl.length) tvaL = modeValeur(tl);
          }
        }
        brut.forEach(function (r) {            // bloc « Règle vrac » situé sous le tableau des zones
          var libelle = !isNil(r[0]) && r[0] !== '' ? normaliser(r[0]) : '', val = r.length > 1 ? r[1] : null;
          if (isNil(val) || val === '') return;
          if (libelle.indexOf('franchise') >= 0) franchise = numFr(val);
          else if (libelle.indexOf('ht_km') >= 0 || (libelle.indexOf('ht') >= 0 && libelle.indexOf('km') >= 0)) kmHt = numFr(val);
          else if (libelle.indexOf('ttc_km') >= 0 || (libelle.indexOf('ttc') >= 0 && libelle.indexOf('km') >= 0)) kmTtc = numFr(val);
          else if (libelle.indexOf('tva_livraison') >= 0) { var t = normaliserTaux(val); if (!isNaN(t)) tvaL = t; }
        });
      } catch (e) { msgs.push('Onglet « Livraison » ignoré (' + e.message + '). Grille de livraison laissée inchangée.'); zones = []; }
    }
    var zonesOk = [];
    zones.forEach(function (z) {
      var h72 = z['72 h HT'], t72 = z['72 h TTC'], h15 = z['15 j HT'], t15 = z['15 j TTC'];
      if (isNaN(h72) && isNaN(t72)) return;
      if (isNaN(h72)) h72 = ttcVersHt(t72, tvaL);
      if (isNaN(t72)) t72 = htVersTtc(h72, tvaL);
      if (isNaN(h15) && isNaN(t15)) { h15 = h72; t15 = t72; }
      if (isNaN(h15)) h15 = ttcVersHt(t15, tvaL);
      if (isNaN(t15)) t15 = htVersTtc(h15, tvaL);
      zonesOk.push({ Zone: z.Zone, "Jusqu'à (km)": z["Jusqu'à (km)"], '72 h HT': h72, '72 h TTC': t72, '15 j HT': h15, '15 j TTC': t15 });
    });
    if (!zonesOk.length) {
      msgs.push('Grille de livraison non trouvée dans le classeur : les zones par défaut sont conservées.');
      zonesOk = zonesParDefaut(tvaL);
    }
    if (isNaN(kmHt)) kmHt = ttcVersHt(kmTtc, tvaL);
    if (!Object.keys(palettes).length) msgs.push('Aucune palette dans le classeur : la liste palettes est vide.');
    if (!Object.keys(vrac).length) msgs.push('Aucun palier vrac dans le classeur : la liste vrac est vide.');
    return { grille: { date_grille: dateGrille, palettes: palettes, vrac: vrac, zones: zonesOk, tva_march: tvaM, tva_livr: tvaL, franchise_km: franchise, prix_km_ht: kmHt, prix_km_ttc: kmTtc }, messages: msgs };
  }

  function enTableau(rows) {
    var entetes = (rows[0] || []).map(function (c) { return isNil(c) ? '' : String(c); });
    var lignes = rows.slice(1).map(function (r) { var o = {}; entetes.forEach(function (c, i) { if (c) o[c] = r[i] === undefined ? null : r[i]; }); return o; });
    return { entetes: entetes.filter(Boolean), lignes: lignes };
  }
  function modeValeur(a) {
    var c = {}; a.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
    var m = Math.max.apply(null, Object.keys(c).map(function (k) { return c[k]; }));
    return Math.min.apply(null, Object.keys(c).filter(function (k) { return c[k] === m; }).map(Number));
  }

  /** Relit l'onglet « Données brutes » d'un classeur exporté. -> { lignes, messages }. */
  function lireHistoriqueClasseur(sheets, tauxDefaut) {
    var rows = sheets['Données brutes'];
    if (!rows) return { lignes: [], messages: ['Onglet « Données brutes » absent : aucun historique à charger depuis ce classeur.'] };
    var t = enTableau(rows);
    var r = validerImport(t.lignes, 'Données brutes', tauxDefaut);
    return { lignes: r.lignes, messages: r.rejets.concat(r.avertissements) };
  }

  /* ================================================================== état par défaut, sérialisation compatible Supabase */
  function zonesParDefaut(tvaLivr) {
    return CONFIG.ZONES_TTC_DEFAUT.map(function (z) {
      return { Zone: z.Zone, "Jusqu'à (km)": z["Jusqu'à (km)"], '72 h HT': ttcVersHt(z['72 h TTC'], tvaLivr), '72 h TTC': z['72 h TTC'], '15 j HT': ttcVersHt(z['15 j TTC'], tvaLivr), '15 j TTC': z['15 j TTC'] };
    });
  }

  function etatParDefaut(aujourdhui) {
    var tm = CONFIG.TVA_MARCHANDISE_DEFAUT, tl = CONFIG.TVA_LIVRAISON_DEFAUT, palettes = {}, vrac = {};
    Object.keys(CONFIG.PALETTES_TTC_DEFAUT).forEach(function (k) { var v = CONFIG.PALETTES_TTC_DEFAUT[k]; palettes[k] = { ht: ttcVersHt(v, tm), ttc: v }; });
    Object.keys(CONFIG.VRAC_TTC_DEFAUT).forEach(function (t) { var v = CONFIG.VRAC_TTC_DEFAUT[t]; vrac[t] = { ht: ttcVersHt(v, tm), ttc: v }; });
    return {
      tva_march: tm, tva_livr: tl, base_saisie: 'TTC', palettes: palettes, vrac: vrac, zones: zonesParDefaut(tl),
      franchise_km: CONFIG.VRAC_FRANCHISE_KM_DEFAUT, prix_km_ttc: CONFIG.VRAC_PRIX_KM_TTC_DEFAUT, prix_km_ht: ttcVersHt(CONFIG.VRAC_PRIX_KM_TTC_DEFAUT, tl),
      date_grille: dateIso(aujourdhui || new Date()), historique: [], source_grille: 'Valeurs par défaut du code'
    };
  }

  var GRID_KEYS = ['date_grille', 'palettes', 'vrac', 'zones', 'tva_march', 'tva_livr', 'franchise_km', 'prix_km_ht', 'prix_km_ttc', 'base_saisie', 'source_grille'];

  /** Même document JSON que la version Streamlit (schema_version 1) : les données déjà dans Supabase se rechargent telles quelles. */
  function encoderEtat(etat) {
    var grille = {};
    GRID_KEYS.forEach(function (k) { grille[k] = etat[k]; });
    grille.date_grille = dateIso(grille.date_grille);
    var historique = (etat.historique || []).map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) {
        var v = r[c];
        o[c] = (v === undefined || (typeof v === 'number' && !isFinite(v))) ? null : (c === 'date' ? (dateIso(v) + 'T00:00:00.000') : v);
      });
      return o;
    });
    return { schema_version: 1, grille: grille, historique: historique };
  }

  function decoderEtat(payload) {
    if (!payload || payload.schema_version !== 1) throw new Error('Version des données non prise en charge.');
    var g = payload.grille, etat = {};
    GRID_KEYS.forEach(function (k) { if (!(k in g)) throw new Error('Donnée « ' + k + ' » absente de la sauvegarde.'); etat[k] = g[k]; });
    etat.date_grille = dateIso(etat.date_grille);
    var vrac = {};
    Object.keys(etat.vrac).forEach(function (k) { vrac[parseInt(k, 10)] = etat.vrac[k]; });
    etat.vrac = vrac;
    etat.historique = (payload.historique || []).map(function (r) {
      var o = {};
      COLONNES.forEach(function (c) { var v = r[c]; o[c] = c === 'date' ? dateIso(v) : (v === undefined ? null : v); });
      return o;
    });
    return etat;
  }

  /* ================================================================== simulateur : calcul du devis */
  /** entrée : { mode:'Palettes'|'Vrac', quantites:{nom:n}, delai:'72h'|'15j', tonnage, kmRetenu|null, etat } -> devis. */
  function calculerDevis(e) {
    var s = e.etat, lignes = [], produitHt = 0, produitTtc = 0, fraisHt = null, fraisTtc = null, detail = '', tonnes = 0;
    if (e.mode === 'Palettes') {
      var nb = 0;
      Object.keys(s.palettes).forEach(function (nom) {
        var q = Number((e.quantites || {})[nom] || 0);
        if (q > 0) {
          var ht = q * s.palettes[nom].ht, ttc = q * s.palettes[nom].ttc;
          produitHt += ht; produitTtc += ttc; nb += q;
          lignes.push({ libelle: q + ' × Palette ' + nom, ht: ht, ttc: ttc });
        }
      });
      tonnes = nb;                                   // 1 palette ≈ 1 tonne
      if (e.kmRetenu !== null && e.kmRetenu !== undefined && nb > 0) {
        var z = zonePalette(e.kmRetenu, s.zones), rapide = e.delai === '72h';
        fraisHt = Number(rapide ? z.zone['72 h HT'] : z.zone['15 j HT']);
        fraisTtc = Number(rapide ? z.zone['72 h TTC'] : z.zone['15 j TTC']);
        detail = z.nom + ' (' + z.libelle + ') · ' + (rapide ? 'sous 72 h' : 'sous 15 jours') + (nb > 1 ? ' · facturés une seule fois' : '');
      }
    } else {
      var t = Number(e.tonnage), p = s.vrac[t];
      if (p) {
        produitHt = t * p.ht; produitTtc = t * p.ttc; tonnes = t;
        lignes.push({ libelle: t + ' T vrac × ' + eur(p.ttc) + ' TTC/T', ht: produitHt, ttc: produitTtc });
        if (e.kmRetenu !== null && e.kmRetenu !== undefined) {
          fraisHt = fraisVrac(e.kmRetenu, s.franchise_km, s.prix_km_ht);
          fraisTtc = fraisVrac(e.kmRetenu, s.franchise_km, s.prix_km_ttc);
          var exc = Math.max(0, e.kmRetenu - s.franchise_km);
          detail = exc === 0 ? 'Dans la franchise de ' + dec(s.franchise_km, 0) + ' km — offerts' : kmFmt(exc) + ' au-delà de ' + dec(s.franchise_km, 0) + ' km × ' + dec(s.prix_km_ttc) + ' € TTC/km';
        }
      }
    }
    var out = { lignes: lignes, produitHt: produitHt, produitTtc: produitTtc, fraisHt: fraisHt, fraisTtc: fraisTtc, detailFrais: detail, tonnes: tonnes, complet: false };
    if (produitTtc > 0 && fraisTtc !== null) {
      out.complet = true;
      out.totalHt = produitHt + fraisHt;
      out.totalTtc = produitTtc + fraisTtc;
      out.tva = r2(out.totalTtc - out.totalHt);
      out.coutRendu = coutLivre(produitTtc, fraisTtc, tonnes);
    }
    return out;
  }

  /** Distance retenue (km arrondis) et source, à partir de la distance routière, du forçage manuel et de l'aller-retour. */
  function distanceRetenue(opts) {
    var km = null, source = opts.source || null;
    if (opts.forcer && opts.kmManuel > 0) { km = opts.kmManuel; source = 'manuel'; }
    else if (opts.kmReel !== null && opts.kmReel !== undefined) km = opts.kmReel * (opts.allerRetour ? 2 : 1);
    if (km === null) return null;
    return { km: arrondirKm(km), source: source, trajet: (opts.allerRetour && source !== 'manuel') ? 'aller-retour' : 'aller simple' };
  }

  function recapitulatif(devis, ctx) {
    var l = ['Devis granulés — ' + ctx.dateFr, 'Livraison : ' + ctx.destination, 'Distance : ' + kmFmt(ctx.km) + ' (' + ctx.trajet + ')', ''];
    devis.lignes.forEach(function (x) { l.push('- ' + x.libelle + ' : ' + eur(x.ttc) + ' TTC (' + eur(x.ht) + ' HT)'); });
    l.push('- Frais de livraison (' + devis.detailFrais + ') : ' + eur(devis.fraisTtc) + ' TTC (' + eur(devis.fraisHt) + ' HT)', '');
    l.push('TOTAL HT   : ' + eur(devis.totalHt), 'TVA        : ' + eur(devis.tva), 'TOTAL TTC  : ' + eur(devis.totalTtc));
    return l.join('\n');
  }

  return {
    CONFIG: CONFIG, COLONNES: COLONNES, ALIAS: ALIAS,
    r2: r2, eur: eur, dec: dec, kmFmt: kmFmt, pct: pct, tauxFmt: tauxFmt, normaliser: normaliser, dateIso: dateIso, dateFr: dateFr, numFr: numFr,
    htVersTtc: htVersTtc, ttcVersHt: ttcVersHt, normaliserTaux: normaliserTaux, pairePrix: pairePrix, arrondirKm: arrondirKm, haversine: haversine,
    libelleZone: libelleZone, zonePalette: zonePalette, fraisVrac: fraisVrac, coutLivre: coutLivre,
    reference: reference, completerPrix: completerPrix, enrichir: enrichir, grilleVersLignes: grilleVersLignes, mapperColonnes: mapperColonnes, validerImport: validerImport, dedoublonner: dedoublonner,
    matriceDernierPrix: matriceDernierPrix, positionnement: positionnement, volatilite: volatilite, evolutionPeriode: evolutionPeriode, degressivite: degressivite, coherenceBases: coherenceBases,
    grilleTableau: grilleTableau, libellesZones: libellesZones, borneDepuisLibelle: borneDepuisLibelle, extrairePalettes: extrairePalettes, extraireVrac: extraireVrac, extraireZones: extraireZones, pairOuOrig: pairOuOrig, controleZones: controleZones,
    lireGrilleClasseur: lireGrilleClasseur, lireHistoriqueClasseur: lireHistoriqueClasseur, zonesParDefaut: zonesParDefaut, etatParDefaut: etatParDefaut,
    encoderEtat: encoderEtat, decoderEtat: decoderEtat, calculerDevis: calculerDevis, distanceRetenue: distanceRetenue, recapitulatif: recapitulatif
  };
});
