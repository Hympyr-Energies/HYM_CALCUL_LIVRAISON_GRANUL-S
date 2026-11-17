/* Parité Python ↔ JavaScript : chaque résultat de src/logique.js est comparé à celui de la logique d'origine (reference.json).
   Usage : node tests/parite.test.js   (régénérer reference.json avec tests/generer_reference.py) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../src/logique.js');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference.json'), 'utf-8'));

let ok = 0, ko = 0; const echecs = [];
function t(nom, fn) { try { fn(); ok++; } catch (e) { ko++; echecs.push(nom + ' : ' + e.message.split('\n').slice(0, 4).join(' | ')); } }
const presque = (a, b, nom, tol) => { tol = tol === undefined ? 1e-9 : tol; if (a === null || b === null || a === undefined || b === undefined) { assert.strictEqual(a === undefined ? null : a, b === undefined ? null : b, nom); return; } assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), nom + ' : ' + a + ' ≠ ' + b); };
const nn = (v) => (v === undefined || (typeof v === 'number' && isNaN(v))) ? null : v;

t('eur', () => R.eur.forEach(([v, s]) => assert.strictEqual(H.eur(v).replace(/\u00a0/g, ' '), s.replace(/\u00a0/g, ' '), 'eur(' + v + ')')));
t('dec', () => R.dec.forEach(([v, n, s]) => assert.strictEqual(H.dec(v, n), s, 'dec(' + v + ',' + n + ')')));
t('pct', () => R.pct.forEach(([v, a, b]) => { assert.strictEqual(H.pct(v), a.replace(' %', ' %')); assert.strictEqual(H.pct(v, false), b.replace(' %', ' %')); }));
t('taux_fmt', () => R.taux_fmt.forEach(([v, s]) => assert.strictEqual(H.tauxFmt(v), s.replace(' %', ' %'), 'taux ' + v)));
t('normaliser', () => R.normaliser.forEach(([v, s]) => assert.strictEqual(H.normaliser(v), s, 'normaliser ' + v)));

let ecartsTva = 0;
t('tva (4000 cas)', () => R.tva.forEach(([v, tx, ttc, ht]) => {
  const a = H.htVersTtc(v, tx), b = H.ttcVersHt(v, tx);
  if (a !== ttc || b !== ht) ecartsTva++;
  assert.ok(Math.abs(a - ttc) < 0.0100001 && Math.abs(b - ht) < 0.0100001, 'tva ' + v + ' ' + tx);   // jamais plus d'un centime
}));
t('tva : écarts d\'un centime sur égalités exactes (tolérés)', () => assert.ok(ecartsTva <= 4000 * 0.002, ecartsTva + ' écarts sur 4000'));
t('taux_norm', () => R.taux_norm.forEach(([v, s]) => presque(nn(H.normaliserTaux(v)), s, 'taux ' + JSON.stringify(v))));
let ecartsPaire = 0;
t('paire_prix', () => R.paire.forEach(([v, tx, b, ht, ttc]) => { const p = H.pairePrix(v, tx, b); if (p.ht !== ht || p.ttc !== ttc) ecartsPaire++; assert.ok(Math.abs(p.ht - ht) < 0.0100001 && Math.abs(p.ttc - ttc) < 0.0100001); }));
t('paire_prix : écarts tolérés', () => assert.ok(ecartsPaire <= 1500 * 0.002, ecartsPaire + ' écarts sur 1500'));

const zones = H.CONFIG.ZONES_TTC_DEFAUT.map(z => ({ Zone: z.Zone, "Jusqu'à (km)": z["Jusqu'à (km)"], '72 h HT': 1, '72 h TTC': z['72 h TTC'], '15 j HT': 1, '15 j TTC': z['15 j TTC'] }));
t('zones', () => R.zones.forEach(([km, nom, lib, t72, j15]) => { const z = H.zonePalette(km, zones); assert.strictEqual(z.nom, nom); assert.strictEqual(z.libelle, lib.replace(/≤ /, '≤ ')); assert.strictEqual(z.zone['72 h TTC'], t72); assert.strictEqual(z.zone['15 j TTC'], j15); }));
t('libelle_zone', () => R.libelle_zone.forEach(([p, b, s]) => assert.strictEqual(H.libelleZone(p, b), s)));
t('frais_vrac', () => R.frais_vrac.forEach(([km, fr, pk, v]) => assert.strictEqual(H.fraisVrac(km, fr, pk), v, 'vrac ' + km + ' ' + fr + ' ' + pk)));
t('cout_livre', () => R.cout_livre.forEach(([p, f, tn, v]) => presque(nn(H.coutLivre(p, f, tn)), v, 'cout')));
t('borne', () => R.borne.forEach(([v, b]) => presque(nn(H.borneDepuisLibelle(v)), b, 'borne ' + v)));
t('haversine', () => R.haversine.forEach(([a, b, c, d, v]) => presque(H.haversine(a, b, c, d), v, 'haversine', 1e-12)));

// historique
const hist = R.historique;
const cmp = (a, b, cles, nom) => cles.forEach(([ja, py, tol]) => presque(nn(a[ja]), nn(b[py]), nom + '.' + ja, tol));
t('enrichir', () => {
  const e = H.enrichir(hist);
  assert.strictEqual(e.length, R.enrichir.length);
  e.forEach((r, i) => { const p = R.enrichir[i]; assert.strictEqual(r.date, p.date); assert.strictEqual(r.reference, p.reference); assert.strictEqual(r.acteur, p.acteur); presque(r.prix_ht, p.prix_ht, 'ht', 1e-9); presque(r.prix_ttc, p.prix_ttc, 'ttc', 1e-9); presque(r.taux_tva, p.taux_tva, 'taux'); });
});
['prix_ttc', 'prix_ht'].forEach(col => {
  t('matrice ' + col, () => {
    const m = H.matriceDernierPrix(hist, col), p = R['matrice_' + col];
    assert.deepStrictEqual(m.references, p.index); assert.deepStrictEqual(m.acteurs, p.colonnes);
    p.index.forEach((ref, i) => p.colonnes.forEach((a, j) => presque(m.valeurs[ref][a] === undefined ? null : m.valeurs[ref][a], p.valeurs[i][j], 'cell ' + ref + a)));
  });
  t('positionnement ' + col, () => {
    const pos = H.positionnement(hist, 'Hympyr', col), p = R['position_' + col];
    assert.strictEqual(pos.length, p.length);
    pos.forEach((r, i) => { const q = p[i]; assert.strictEqual(r.reference, q.reference); presque(r.hympyr, q['Hympyr']); presque(r.moyenne, q['Moyenne marché']); presque(r.mini, q['Mini marché']); presque(r.maxi, q['Maxi marché']); presque(r.ecart, q['Écart € vs moyenne']); presque(r.ecartPct, q['Écart % vs moyenne']); presque(r.indice, q['Indice (base 100)']); assert.strictEqual(r.rang, q['Rang']); assert.strictEqual(r.nbOffres, q['Nb offres comparées']); });
  });
  t('volatilité ' + col, () => {
    const v = H.volatilite(hist, col), p = R['volat_' + col];
    assert.strictEqual(v.length, p.length);
    v.forEach((r, i) => { const q = p[i]; assert.strictEqual(r.reference, q.reference); assert.strictEqual(r.nb, q['Nb relevés']); presque(r.mini, q['Prix mini']); presque(r.maxi, q['Prix maxi']); presque(r.moyenne, q['Prix moyen']); presque(nn(r.ecartType), q['Écart-type']); presque(r.amplitude, q['Amplitude %']); });
  });
  t('évolution ' + col, () => {
    const v = H.evolutionPeriode(hist, 'Hympyr', col), p = R['evol_' + col];
    assert.strictEqual(v.length, p.length);
    v.forEach((r, i) => { const q = p[i]; assert.strictEqual(r.reference, q.reference); assert.strictEqual(r.dateInitiale, q['Première date']); assert.strictEqual(r.dateActuelle, q['Dernière date']); presque(r.prixInitial, q['Prix initial']); presque(r.prixActuel, q['Prix actuel']); presque(r.variation, q['Variation €']); presque(r.variationPct, q['Variation %']); });
  });
  t('dégressivité ' + col, () => {
    const g = H.degressivite(hist, col), p = R['degres_' + col];
    assert.deepStrictEqual(g.paliers, p.index); assert.deepStrictEqual(g.acteurs, p.colonnes);
    p.index.forEach((pal, i) => p.colonnes.forEach((a, j) => presque(g.valeurs[pal][a] === undefined ? null : g.valeurs[pal][a], p.valeurs[i][j], 'deg')));
  });
});
t('cohérence TVA', () => {
  const c = H.coherenceBases(hist), p = R.coherence;
  assert.strictEqual(c.length, p.length);
  c.forEach((r, i) => { const q = p[i]; assert.strictEqual(r.acteur, q.acteur); presque(r.tauxMini, q['Taux mini']); presque(r.tauxMaxi, q['Taux maxi']); assert.strictEqual(r.heterogene, q['Taux hétérogène']); assert.strictEqual(r.divergent, q['Divergent']); assert.strictEqual(r.anomalie, q['Anomalie']); presque(r.dominant, q['Taux dominant']); });
});
t('dédoublonnage', () => {
  const d = H.dedoublonner(hist), p = R.dedoublonne;
  assert.strictEqual(d.length, p.length);
  const cle = r => r.date + '|' + r.acteur + '|' + H.reference(r);
  const idx = {}; p.forEach(r => idx[cle(r)] = r);
  d.forEach(r => { const q = idx[cle(r)]; assert.ok(q, 'ligne absente ' + cle(r)); presque(nn(r.prix_ht), nn(q.prix_ht), 'ht', 1e-9); presque(nn(r.prix_ttc), nn(q.prix_ttc), 'ttc', 1e-9); });
});
t('import de fichier', () => {
  const r = H.validerImport(R.import_entree, 'test.csv', 0.10), p = R.import;
  assert.deepStrictEqual(r.rejets, p.rejets); assert.deepStrictEqual(r.avertissements.map(s => s.replace(/ /g, ' ')), p.avertissements);
  assert.strictEqual(r.lignes.length, p.lignes.length);
  r.lignes.forEach((l, i) => { const q = p.lignes[i]; ['date', 'acteur', 'type_acteur', 'conditionnement', 'produit', 'unite'].forEach(k => assert.strictEqual(l[k], q[k], k)); presque(nn(l.palier_t), nn(q.palier_t)); presque(nn(l.prix_ht), nn(q.prix_ht)); presque(nn(l.prix_ttc), nn(q.prix_ttc)); presque(nn(l.taux_tva), nn(q.taux_tva)); });
});
t('import : colonnes manquantes', () => assert.deepStrictEqual(H.validerImport(R.import_mauvais.entree, 'mauvais.csv', 0.10).rejets, R.import_mauvais.rejets));
t('relecture du classeur exporté par Python', () => {
  const r = H.lireGrilleClasseur(R.classeur_feuilles, 0.10, 0.10), p = R.classeur_relu;
  assert.ok(r.grille, JSON.stringify(r.messages));
  const g = r.grille, q = p.grille;
  assert.strictEqual(g.date_grille, q.date_grille);
  assert.deepStrictEqual(Object.keys(g.palettes).sort(), Object.keys(q.palettes).sort());
  Object.keys(q.palettes).forEach(k => { presque(g.palettes[k].ht, q.palettes[k].ht); presque(g.palettes[k].ttc, q.palettes[k].ttc); });
  Object.keys(q.vrac).forEach(k => { presque(g.vrac[k].ht, q.vrac[k].ht); presque(g.vrac[k].ttc, q.vrac[k].ttc); });
  assert.strictEqual(g.zones.length, q.zones.length);
  q.zones.forEach((z, i) => { assert.strictEqual(g.zones[i].Zone, z.Zone); presque(g.zones[i]["Jusqu'à (km)"], z["Jusqu'à (km)"]); ['72 h HT', '72 h TTC', '15 j HT', '15 j TTC'].forEach(k => presque(g.zones[i][k], z[k], k)); });
  presque(g.tva_march, q.tva_march); presque(g.tva_livr, q.tva_livr); presque(g.franchise_km, q.franchise_km); presque(g.prix_km_ht, q.prix_km_ht); presque(g.prix_km_ttc, q.prix_km_ttc);
  assert.deepStrictEqual(r.messages, p.messages);
});
t('relecture de l\'historique du classeur', () => { const r = H.lireHistoriqueClasseur(R.classeur_feuilles, 0.10); assert.ok(r.lignes.length >= R.classeur_histo.n - 1, r.lignes.length + ' lignes lues pour ' + R.classeur_histo.n); });

// sérialisation compatible Supabase
t('aller-retour encoder/décoder', () => {
  const e = H.etatParDefaut('2026-11-17'); e.historique = H.dedoublonner(hist);
  const p = JSON.parse(JSON.stringify(H.encoderEtat(e))); assert.strictEqual(p.schema_version, 1);
  const d = H.decoderEtat(p);
  assert.deepStrictEqual(Object.keys(d.vrac).map(Number), Object.keys(e.vrac).map(Number)); assert.strictEqual(d.historique.length, e.historique.length);
  assert.strictEqual(d.date_grille, '2026-11-17');
});

// devis (scénarios de bout en bout)
const etat = H.etatParDefaut('2026-11-17');
t('devis palettes', () => {
  const d = H.calculerDevis({ mode: 'Palettes', quantites: { 'Piveteau': 2, 'Granulés de nos régions': 1 }, delai: '72h', kmRetenu: 25, etat });
  assert.strictEqual(d.complet, true); presque(d.produitTtc, 2 * 452.87 + 431.24); assert.strictEqual(d.fraisTtc, 59);
  assert.ok(/Zone 3/.test(d.detailFrais) && /une seule fois/.test(d.detailFrais));
  presque(d.totalTtc, d.produitTtc + 59); presque(d.tva, H.r2(d.totalTtc - d.totalHt));
});
t('devis vrac', () => {
  const d = H.calculerDevis({ mode: 'Vrac', tonnage: 4, kmRetenu: 60, etat });
  presque(d.produitTtc, 4 * 415); assert.strictEqual(d.fraisTtc, H.fraisVrac(60, 35, 1.4)); presque(d.tonnes, 4);
});
t('devis sans distance', () => { const d = H.calculerDevis({ mode: 'Palettes', quantites: { 'Piveteau': 1 }, delai: '15j', kmRetenu: null, etat }); assert.strictEqual(d.complet, false); assert.strictEqual(d.fraisTtc, null); });
t('distance retenue', () => {
  assert.deepStrictEqual(H.distanceRetenue({ kmReel: 21.4, allerRetour: true, forcer: false, source: 'osrm' }), { km: 43, source: 'osrm', trajet: 'aller-retour' });
  assert.deepStrictEqual(H.distanceRetenue({ kmReel: 21.4, allerRetour: true, forcer: true, kmManuel: 30, source: 'osrm' }), { km: 30, source: 'manuel', trajet: 'aller simple' });
  assert.strictEqual(H.distanceRetenue({ kmReel: null, forcer: false }), null);
});

console.log('Parité Python ↔ JavaScript : ' + ok + ' groupes de tests réussis, ' + ko + ' en échec.');
if (ecartsTva || ecartsPaire) console.log('  (arrondis : ' + ecartsTva + '/4000 conversions TVA et ' + ecartsPaire + '/1500 paires diffèrent d\'un centime exactement sur une égalité binaire ; tolérance d\'un centime)');
if (ko) { echecs.forEach(e => console.log(' ✗ ' + e)); process.exit(1); }
