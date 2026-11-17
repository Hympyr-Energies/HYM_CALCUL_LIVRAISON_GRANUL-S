# -*- coding: utf-8 -*-
"""Assemble la webapp en UN seul fichier : index.html (CSS converti en vw, JS, logos et fond intégrés).
Usage : python3 build.py [--sync-url https://PROJET.supabase.co/functions/v1/granules-state]"""
import base64, json, os, re, sys, random

D = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(D, 'src')
lire = lambda n: open(os.path.join(S, n), encoding='utf-8').read()

def conv(v):
    return re.sub(r'(?<![\w.#-])(-?\d*\.?\d+)px\b', lambda m: 'calc(var(--k)*%s)' % m.group(1), v)

css = []
for ligne in lire('styles.css').split('\n'):
    if ligne.startswith(('@media', '@supports')):
        i = ligne.index('{')
        css.append(ligne[:i] + conv(ligne[i:]))
    else:
        css.append(conv(ligne))
css = '\n'.join(css).replace('calc(var(--k)*1) solid', 'thin solid')

data_uri = lambda n: 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(S, n), 'rb').read()).decode()

# fond : granulés dispersés, déterministe
rnd = random.Random(1117)
pel = []
for _ in range(120):
    x, y = rnd.uniform(0, 1600), rnd.uniform(0, 900)
    pel.append('<ellipse cx="%.0f" cy="%.0f" rx="%.1f" ry="%.1f" transform="rotate(%.0f %.0f %.0f)" fill="%s" opacity="%.2f"/>' % (
        x, y, rnd.uniform(10, 20), rnd.uniform(4, 7), rnd.uniform(0, 180), x, y, rnd.choice(['#CB7A28', '#98612A', '#DDA771', '#6B4220']), rnd.uniform(.08, .26)))
fond = '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' + ''.join(pel) + '</svg>'

sync = ''
if '--sync-url' in sys.argv:
    sync = sys.argv[sys.argv.index('--sync-url') + 1]
config = json.dumps({'SYNC_URL': sync}, ensure_ascii=False)

js = '\n'.join(lire(n) for n in ['logique.js', 'core.js', 'simulateur.js', 'grille.js', 'donnees.js', 'analyse.js', 'exports.js', 'main.js'])
js = js.replace('</script>', '<\\/script>')

html = lire('template.html')
for k, v in {'{{CSS}}': css, '{{JS}}': js, '{{CONFIG}}': config, '{{FOND}}': fond, '{{LOGO_CLAIRE}}': data_uri('logo-claire.svg'), '{{LOGO_FONCE}}': data_uri('logo-fonce.svg'),
             '{{SOCIETE}}': 'Hympyr Énergies', '{{TEL}}': '05 61 70 03 27'}.items():
    html = html.replace(k, v)
sortie = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'index.html'
open(os.path.join(D, sortie), 'w', encoding='utf-8').write(html)
print('%s écrit : %d Ko' % (sortie, len(html.encode('utf-8')) // 1024))
