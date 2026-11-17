# -*- coding: utf-8 -*-
"""Génère des cas de référence à partir de la logique Python d'origine (app_gran.py) : tests/reference.json.
Le JavaScript (src/logique.js) doit donner exactement les mêmes résultats (voir tests/parite.test.js).
Usage : python3 tests/generer_reference.py CHEMIN/app_gran.py"""
import json, math, random, re, sys, types, io, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pylibs'))
import numpy as np
import pandas as pd

src = open(sys.argv[1], encoding='utf-8').read()
cfg_a = src.index('ADRESSE_DEPART =')
cfg_b = src.index('st.set_page_config')
bloc_a = src.index('# ===== LOGIQUE PURE — DÉBUT')
bloc_b = src.index('# ===== LOGIQUE PURE — FIN')
ns = {'__name__': 'ref', 'np': np, 'pd': pd, 'math': math, 're': re, 'io': io, 'os': os,
      'matplotlib': types.SimpleNamespace(get_data_path=lambda: ''), 'plt': None}
import unicodedata
from datetime import date, datetime
ns.update({'unicodedata': unicodedata, 'date': date, 'datetime': datetime})
exec(src[cfg_a:cfg_b], ns)
exec(src[bloc_a:bloc_b], ns)
F = lambda n: ns[n]

def nan_none(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (np.floating,)):
        v = float(v)
        return None if math.isnan(v) else v
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return pd.Timestamp(v).strftime('%Y-%m-%d')
    return v

def df_records(df, index_name=None):
    if df is None or len(df) == 0:
        return []
    d = df.copy()
    if index_name:
        d = d.reset_index()
        d = d.rename(columns={d.columns[0]: index_name})
    return [{k: nan_none(v) for k, v in r.items()} for r in d.to_dict(orient='records')]

random.seed(20261117)
out = {}

# --- formats
valeurs = [0, 1, 12.5, 1234.5, 1234567.891, 0.005, 99.995, 452.87, 431.24, 9999.0, 0.1, 10.0, 7.25, 1e6]
out['eur'] = [[v, F('eur')(v)] for v in valeurs]
out['dec'] = [[v, n, F('dec')(v, n)] for v in valeurs for n in (0, 1, 2)]
out['pct'] = [[v, F('pct')(v), F('pct')(v, False)] for v in [0, 1.234, -2.5, 12, 0.05, -0.04]]
out['taux_fmt'] = [[t, F('taux_fmt')(t)] for t in [0.10, 0.055, 0.2, 0.196, 0.0, 0.1234]]
out['normaliser'] = [[t, F('normaliser')(t)] for t in ['Prix TTC (€)', "Date d'effet", 'Palier (T)', 'Écart % vs moyenne', '  Granulés  vrac ', 'prix_HT']]

# --- TVA
taux = [0.055, 0.10, 0.20, 0.0, 0.196]
cas = []
for _ in range(4000):
    v = round(random.uniform(1, 900), random.choice([0, 1, 2, 3]))
    t = random.choice(taux)
    cas.append([v, t, F('ht_vers_ttc')(v, t), F('ttc_vers_ht')(v, t)])
out['tva'] = cas
out['taux_norm'] = [[v, nan_none(F('normaliser_taux')(v))] for v in [10, '10 %', 0.10, '0,1', '', None, 'abc', 5.5, '20', 1, 0.5, '12,5%']]
out['paire'] = []
for _ in range(1500):
    v, t, b = round(random.uniform(1, 800), 2), random.choice(taux), random.choice(['HT', 'TTC'])
    ht, ttc = F('paire_prix')(v, t, b)
    out['paire'].append([v, t, b, ht, ttc])

# --- zones, frais vrac
zones = [{"Zone": z["Zone"], "Jusqu'à (km)": z["Jusqu'à (km)"], "72 h HT": 1, "72 h TTC": z["72 h TTC"], "15 j HT": 1, "15 j TTC": z["15 j TTC"]} for z in ns['ZONES_TTC_DEFAUT']]
out['zones'] = []
for km in [0, 0.5, 5, 10, 10.01, 19.9, 20, 29, 30, 30.5, 52.9, 53, 53.1, 80, 120, 9999, 12000]:
    nom, lib, z = F('zone_palette')(km, zones)
    out['zones'].append([km, nom, lib, z['72 h TTC'], z['15 j TTC']])
out['libelle_zone'] = [[p, b, F('libelle_zone')(p, b)] for p, b in [(0, 10), (10, 20), (53, 9999), (0, 9999)]]
out['frais_vrac'] = [[km, fr, pk, F('frais_vrac')(km, fr, pk)] for km in [0, 20, 35, 35.5, 60.3, 80, 120] for fr, pk in [(35, 1.4), (35, 1.27), (0, 1.4), (20, 0.99)]]
out['cout_livre'] = [[p, f, t, nan_none(F('cout_livre')(p, f, t))] for p, f, t in [(1000, 49, 2), (437 * 5, 20, 5), (100, 0, 0), (100, 10, 3)]]
out['borne'] = [[v, nan_none(F('borne_depuis_libelle')(v))] for v in ['≤ 10 km', '> 10 à 20 km', '> 53 km', 20, 20.5, 'Zone', None, '> 9,5 à 12,5 km']]
out['haversine'] = [[a, b, c, d, F('haversine')(a, b, c, d)] for a, b, c, d in [(43.9, 2.1, 43.6, 1.44), (43.93, 2.14, 43.93, 2.14), (48.85, 2.35, 45.76, 4.83)]]

# --- historique
lignes = []
def L(d, a, cond, prod, pal, ht, ttc, tva=0.10, typ=None):
    lignes.append({"date": pd.Timestamp(d), "acteur": a, "type_acteur": typ or ("Interne" if a == "Hympyr" else "Concurrent"),
                   "conditionnement": cond, "produit": prod, "palier_t": pal, "unite": "tonne" if cond == "Vrac" else "palette",
                   "prix_ht": ht, "taux_tva": tva, "prix_ttc": ttc})
for d, k in [("2026-03-01", 0), ("2026-06-01", 1), ("2026-09-01", 2)]:
    L(d, "Hympyr", "Palette", "Piveteau", np.nan, 380 + 10 * k, np.nan)
    L(d, "Hympyr", "Palette", "Granulés de nos régions", np.nan, np.nan, 420 + 5 * k)
    for t in (2, 4, 6):
        L(d, "Hympyr", "Vrac", "Granulés vrac", float(t), np.nan, 440 - 6 * t + 3 * k)
    L(d, "Pechavy", "Palette", "Piveteau", np.nan, np.nan, 470 + 4 * k)
    L(d, "Pechavy", "Vrac", "Granulés vrac", 4.0, np.nan, 430 + 2 * k)
    L(d, "Biocombustibles 31", "Palette", "Piveteau", np.nan, np.nan, 455 - 3 * k)
    L(d, "Biocombustibles 31", "Vrac", "Granulés vrac", 4.0, np.nan, 418 + k)
    L(d, "Biocombustibles 31", "Vrac", "Granulés vrac", 6.0, np.nan, 410 + k)
L("2026-09-01", "Pro Pellets", "Palette", "Piveteau", np.nan, 400.0, np.nan, tva=0.20)      # taux divergent
L("2026-09-01", "Hympyr", "Palette", "Piveteau", np.nan, 391.0, np.nan)                     # doublon à dédoublonner (dernier gagne)
df = pd.DataFrame(lignes, columns=ns['COLONNES'])

def jsonable_rows(df):
    return [{k: nan_none(v) for k, v in r.items()} for r in df.to_dict(orient='records')]
out['historique'] = jsonable_rows(df)
enr = F('enrichir')(df)
out['enrichir'] = [{k: nan_none(v) for k, v in r.items()} for r in enr.to_dict(orient='records')]
for col in ('prix_ttc', 'prix_ht'):
    m = F('matrice_dernier_prix')(df, col)
    out['matrice_' + col] = {'index': list(m.index), 'colonnes': list(m.columns), 'valeurs': [[nan_none(v) for v in r] for r in m.to_numpy()]}
    p = F('positionnement')(df, colonne=col)
    out['position_' + col] = df_records(p, 'reference')
    out['volat_' + col] = df_records(F('volatilite')(df, col), 'reference')
    out['evol_' + col] = df_records(F('evolution_periode')(df, colonne=col), 'reference')
    g = F('degressivite')(df, col)
    out['degres_' + col] = {'index': [float(i) for i in g.index], 'colonnes': list(g.columns), 'valeurs': [[nan_none(v) for v in r] for r in g.to_numpy()]}
out['coherence'] = df_records(F('coherence_bases')(df), 'acteur')
dd = F('dedoublonner')(df)
out['dedoublonne'] = [{k: nan_none(v) for k, v in r.items()} for r in dd.to_dict(orient='records')]

# --- import de fichiers « sales »
brut = pd.DataFrame([
    {"Date": "01/09/2026", "Fournisseur": "Concurrent A", "Format": "Vrac", "Tonnage": "5", "Prix": "415,00 €", "TVA": "10"},
    {"Date": "15/09/2026", "Fournisseur": "Concurrent A", "Format": "palette", "Tonnage": "", "Prix": "1 452,50", "TVA": "5,5 %"},
    {"Date": "pas une date", "Fournisseur": "X", "Format": "Vrac", "Tonnage": "2", "Prix": "400", "TVA": "10"},
    {"Date": "01/10/2026", "Fournisseur": "Hympyr", "Format": "Palette", "Tonnage": "", "Prix": "", "TVA": "10"},
    {"Date": "02/10/2026", "Fournisseur": "Concurrent B", "Format": "", "Tonnage": "3", "Prix": "420", "TVA": ""},
])
ok, rej, av = F('valider_import')(brut, 'test.csv', 0.10)
out['import_entree'] = brut.to_dict(orient='records')
out['import'] = {'lignes': [{k: nan_none(v) for k, v in r.items()} for r in ok.to_dict(orient='records')], 'rejets': rej, 'avertissements': av}
brut2 = pd.DataFrame([{"Foo": 1, "Bar": 2}])
ok2, rej2, av2 = F('valider_import')(brut2, 'mauvais.csv', 0.10)
out['import_mauvais'] = {'rejets': rej2, 'entree': brut2.to_dict(orient='records')}

# --- classeur Excel (grille + livraison) produit par l'outil d'origine, relu par le JS
palettes = {"Piveteau": {"ht": 411.70, "ttc": 452.87}, "Granulés de nos régions": {"ht": 392.04, "ttc": 431.24}}
vrac = {t: {"ht": F('ttc_vers_ht')(v, 0.10), "ttc": v} for t, v in ns['VRAC_TTC_DEFAUT'].items()}
zones_ok = [{"Zone": z["Zone"], "Jusqu'à (km)": z["Jusqu'à (km)"], "72 h HT": F('ttc_vers_ht')(z["72 h TTC"], 0.10), "72 h TTC": z["72 h TTC"],
             "15 j HT": F('ttc_vers_ht')(z["15 j TTC"], 0.10), "15 j TTC": z["15 j TTC"]} for z in ns['ZONES_TTC_DEFAUT']]
xl = F('export_excel')(date(2026, 9, 1), palettes, vrac, zones_ok, df, 0.10, 0.10, 35.0, F('ttc_vers_ht')(1.40, 0.10), 1.40) if 'openpyxl' in sys.modules or True else None
chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classeur_python.xlsx')
open(chemin, 'wb').write(xl)
_xf = pd.ExcelFile(chemin)
out['classeur_feuilles'] = {n: [[nan_none(c) for c in row] for row in _xf.parse(n, header=None).to_numpy().tolist()] for n in _xf.sheet_names}
out['classeur'] = {'fichier': 'classeur_python.xlsx', 'palettes': palettes, 'vrac': {str(k): v for k, v in vrac.items()}, 'zones': zones_ok}
g, msgs = F('lire_grille_classeur')(chemin, 0.10, 0.10)
g['date_grille'] = g['date_grille'].isoformat()
g['vrac'] = {str(k): v for k, v in g['vrac'].items()}
out['classeur_relu'] = {'grille': g, 'messages': msgs}
h, msgs2 = F('lire_historique_classeur')(chemin, 0.10)
out['classeur_histo'] = {'n': len(h), 'messages': msgs2}

json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reference.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, default=str)
print('reference.json écrit :', {k: (len(v) if hasattr(v, '__len__') else v) for k, v in out.items()})
