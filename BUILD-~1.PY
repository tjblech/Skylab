#!/usr/bin/env python3
"""Bundle SKYLAB into one self-contained HTML file.

Inlines app.css, app.js and every referenced image (as data URIs) so the app
runs from a single file with no assets folder. Re-run this after any edit:

    python3 build-standalone.py

Output: skylab-standalone.html
"""
import base64, mimetypes, pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / 'skylab-standalone.html'

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'app.css').read_text(encoding='utf-8')
js = (ROOT / 'app.js').read_text(encoding='utf-8')

# ---- 1. collect every referenced asset and encode it -------------------
refs = sorted(set(re.findall(r'assets/[A-Za-z0-9_.-]+', html + css + js)))
data_uris, missing, total = {}, [], 0

for ref in refs:
    path = ROOT / ref
    if not path.exists():
        missing.append(ref)
        continue
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    raw = path.read_bytes()
    total += len(raw)
    data_uris[ref] = f'data:{mime};base64,' + base64.b64encode(raw).decode()

if missing:
    print('WARNING: referenced but not found:', ', '.join(missing), file=sys.stderr)

# longest paths first so 'assets/moon-obj.png' never partially matches
for ref in sorted(data_uris, key=len, reverse=True):
    uri = data_uris[ref]
    html = html.replace(ref, uri)
    css = css.replace(ref, uri)
    js = js.replace(ref, uri)

# ---- 2. fold the stylesheet and script in ------------------------------
html = re.sub(r'<link rel="stylesheet" href="app\.css(\?v=\d+)?">',
              lambda _: '<style>\n' + css + '\n</style>', html, count=1)
html = re.sub(r'<script src="app\.js(\?v=\d+)?"></script>',
              lambda _: '<script>\n' + js + '\n</script>', html, count=1)
if '<style>' not in html or 'function renderNow' not in html:
    raise SystemExit('ERROR: app.css / app.js were not inlined — check the tag patterns')

# a single file has no sibling manifest or service worker to register
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
html = html.replace(
    "if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});",
    "/* standalone build: no service worker */")

OUT.write_text(html, encoding='utf-8')

print(f'inlined {len(data_uris)} assets ({total/1024:.0f} KB raw)')
print(f'wrote {OUT.name} — {OUT.stat().st_size/1024:.0f} KB')
