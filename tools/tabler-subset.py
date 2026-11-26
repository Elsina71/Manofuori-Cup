#!/usr/bin/env python3
"""Icone Tabler alleggerite: dal font completo (tools/tabler, ~860 kB) tiene solo le icone usate dall'app.

Cerca nei file dell'app (js, css, index.html) ogni parola che è il nome di un'icona Tabler e scrive
vendor/tabler/tabler-icons.min.css e vendor/tabler/fonts/tabler-icons.woff2 con solo quelle.
Se aggiungi un'icona nuova all'app (classe "ti ti-nome"), rilancia:  python3 tools/tabler-subset.py
Serve fontTools con brotli:  pip install fonttools brotli
"""
import os, re, glob, hashlib
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL_CSS = os.path.join(ROOT, 'tools/tabler/tabler-icons.min.css')
FULL_FONT = os.path.join(ROOT, 'tools/tabler/tabler-icons.woff2')
OUT_CSS = os.path.join(ROOT, 'vendor/tabler/tabler-icons.min.css')
OUT_FONT = os.path.join(ROOT, 'vendor/tabler/fonts/tabler-icons.woff2')

css = open(FULL_CSS, encoding='utf-8').read()
icons = dict(re.findall(r'\.ti-([a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}', css))

# parole che compaiono nei sorgenti dell'app (anche nomi scritti senza "ti-", per le icone scelte da codice)
words = set()
for f in glob.glob(os.path.join(ROOT, 'js/*.js')) + glob.glob(os.path.join(ROOT, 'css/*.css')) + [os.path.join(ROOT, 'index.html')]:
    words |= set(re.findall(r'[a-z0-9]+(?:-[a-z0-9]+)*', open(f, encoding='utf-8').read()))
words |= {w[3:] for w in words if w.startswith('ti-')}   # "ti-plus" → "plus"
used = sorted(n for n in icons if n in words)

head = css[:css.index('.ti-a-b:before')]
head = head.replace('font-display:block', 'font-display:swap')
rules = ''.join('.ti-%s:before{content:"\\%s"}' % (n, icons[n]) for n in used)
os.makedirs(os.path.dirname(OUT_FONT), exist_ok=True)
open(OUT_CSS, 'w', encoding='utf-8').write(head + rules)

opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = []
opts.drop_tables += ['GSUB', 'GPOS', 'GDEF']   # legature non usate (e illeggibili per fontTools)
opts.name_IDs = ['*']
opts.notdef_outline = True
font = subset.load_font(FULL_FONT, opts, dontLoadGlyphNames=True)
for tag in ('GSUB', 'GPOS', 'GDEF'):
    if tag in font: del font[tag]
s = subset.Subsetter(opts)
s.populate(unicodes=[int(icons[n], 16) for n in used])
s.subset(font)
subset.save_font(font, OUT_FONT, opts)
# il font si chiama con un numero di versione (cambia solo se cambiano le icone): il browser lo tiene in memoria
ver = hashlib.sha1(open(OUT_FONT, 'rb').read()).hexdigest()[:10]
open(OUT_CSS, 'w', encoding='utf-8').write((head + rules).replace('fonts/tabler-icons.woff2', 'fonts/tabler-icons.woff2?v=' + ver))
print('icone usate: %d su %d · css %d kB · font %d kB' % (len(used), len(icons), os.path.getsize(OUT_CSS) // 1024, os.path.getsize(OUT_FONT) // 1024))
