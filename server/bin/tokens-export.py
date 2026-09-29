#!/usr/bin/env python3
"""tokens-export.py — exporta web/shared/styles/tokens.css no formato do W3C Design Tokens Community
Group (DTCG, https://tr.designtokens.org/format/), para ferramentas de design (Figma via plugin,
Style Dictionary, Tokens Studio).

    python3 server/bin/tokens-export.py            # grava tokens.json e tokens.dark.json
    python3 server/bin/tokens-export.py --check    # rc 1 se os .json não batem com o tokens.css

O tokens.css é a FONTE; os .json são derivados (e conferidos pelo server/test/css-ratchet.sh).
- grupos = os níveis do tokens.css: primitive, semantic, component, page, js;
- alias continua alias: `--color-primary: var(--blue-600)` → {"$value": "{primitive.blue-600}"};
- tokens.dark.json traz SÓ o que o tema escuro redefine, nos mesmos caminhos (mescle por cima);
- canal RGB (`--rgb-primary: 43,108,176`, detalhe de implementação p/ rgba) sai como cor
  rgb(…) com "$extensions": {"moj.rgbChannel": true}.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
STY = os.path.join(HERE, '..', '..', 'web', 'shared', 'styles')
SRC = os.path.join(STY, 'tokens.css')
OUT = {'light': os.path.join(STY, 'tokens.json'), 'dark': os.path.join(STY, 'tokens.dark.json')}

css = open(SRC, encoding='utf-8').read()
light_css = css
DARK = os.path.join(STY, 'theme-dark.css')        # o escuro é gerado por tokens-dark.py
dark_css = open(DARK, encoding='utf-8').read() if os.path.exists(DARK) else ''
nocom = lambda s: re.sub(r'/\*.*?\*/', '', s, flags=re.S)

# nível de cada token = a seção do tokens.css em que ele é declarado
SECTIONS = [('1. PRIMITIVOS', 'primitive'), ('2. SEMÂNTICOS', 'semantic'), ('3. COMPONENTES', 'component'),
            ('3b. PÁGINAS', 'page'), ('3c. TELAS EM JS', 'js'), ('4. LEGADO', 'legacy')]
def tiers(text):
    marks = sorted((text.find('---------- ' + k), v) for k, v in SECTIONS if text.find('---------- ' + k) >= 0)
    out = {}
    for i, (pos, tier) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        for name, val in re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', nocom(text[pos:end])):
            out[name] = (tier, ' '.join(val.split()))
    return out

LIGHT = tiers(light_css)
PATH = {n: f'{t}.{n[2:]}' for n, (t, _) in LIGHT.items()}

def dtype(name, val):
    if name.startswith('--rgb-'): return 'color'
    if re.fullmatch(r'#[0-9a-fA-F]{3,8}|rgba?\(.*\)', val): return 'color'
    if name.startswith('--font-'): return 'fontFamily'
    if name.startswith('--elev-') or name.startswith('--shadow-'): return 'shadow'
    if name.startswith('--z-'): return 'number'
    if re.fullmatch(r'-?[\d.]+(rem|px|em|%)', val): return 'dimension'
    return None

def shadow(val):
    parts = [p.strip() for p in re.split(r',(?![^(]*\))', val)]
    out = []
    for p in parts:
        color = re.search(r'rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}', p).group(0)
        nums = re.sub(r'rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}', '', p).split()
        nums += ['0px'] * (4 - len(nums))
        x, y, blur, spread = [n if n != '0' else '0px' for n in nums[:4]]
        out.append({'color': color, 'offsetX': x, 'offsetY': y, 'blur': blur, 'spread': spread})
    return out if len(out) > 1 else out[0]

def entry(name, val, tier):
    m = re.fullmatch(r'var\((--[a-z0-9-]+)\)', val)
    if m and m.group(1) in PATH:                               # alias
        e = {'$value': '{' + PATH[m.group(1)] + '}'}
        t = dtype(m.group(1), LIGHT[m.group(1)][1])
        if t: e['$type'] = t
        return e
    t = dtype(name, val)
    if name.startswith('--rgb-'):
        return {'$type': 'color', '$value': f'rgb({val})', '$extensions': {'moj.rgbChannel': True}}
    if t == 'shadow': return {'$type': 'shadow', '$value': shadow(val)}
    if t == 'fontFamily': return {'$type': 'fontFamily', '$value': [f.strip().strip('"') for f in val.split(',')]}
    if t == 'number': return {'$type': 'number', '$value': float(val) if '.' in val else int(val)}
    e = {'$value': val}
    if t: e['$type'] = t
    return e

def build(defs, only=None):
    doc = {'$description': 'Gerado de web/shared/styles/tokens.css por server/bin/tokens-export.py — NÃO EDITE (docs/DESIGN.md).'}
    for name, (tier, val) in defs.items():
        if only is not None and name not in only: continue
        if tier == 'legacy': continue                         # alias de compatibilidade do CSS, sem valor de design
        doc.setdefault(tier, {})[name[2:]] = entry(name, val, tier)
    return doc

light = build(LIGHT)
dark_defs = {}
for name, val in re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', nocom(dark_css)):
    if name in LIGHT: dark_defs[name] = (LIGHT[name][0], ' '.join(val.split()))
dark = build(dark_defs)
dark['$description'] = ('Tema ESCURO: só os tokens que o <html data-theme="dark"> redefine, nos mesmos caminhos do '
                        'tokens.json (mescle por cima). ' + dark['$description'])

# IDA E VOLTA: resolver cada alias no JSON tem de dar o MESMO valor final que resolver a cadeia de
# var() no CSS. Diverge = o exportador está errado; não grava nada.
def css_final(n, defs, seen=()):
    v = defs[n][1]; m = re.fullmatch(r'var\((--[a-z0-9-]+)\)', v)
    return css_final(m.group(1), defs, seen + (n,)) if m and m.group(1) in defs and n not in seen else v
def json_final(doc, path, seen=()):
    g, k = path.split('.', 1); e = doc[g][k]; v = e['$value']
    if isinstance(v, str) and v.startswith('{') and path not in seen: return json_final(doc, v[1:-1], seen + (path,))
    return e
errs = 0
for name, (tier, _) in LIGHT.items():
    if tier == 'legacy': continue
    want, got = css_final(name, LIGHT), json_final(light, f'{tier}.{name[2:]}')
    gv = got['$value']
    ok = (gv == f'rgb({want})') if name.startswith('--rgb-') else \
         (isinstance(gv, (list, dict)) or gv == want or (isinstance(gv, (int, float)) and float(want) == gv))
    if not ok: print('IDA-E-VOLTA diverge:', name, want, gv); errs += 1
if errs: sys.exit(2)
docs = {k: json.dumps(v, ensure_ascii=False, indent=2) + '\n' for k, v in (('light', light), ('dark', dark))}
if '--check' in sys.argv:
    bad = [OUT[k] for k in docs if not os.path.exists(OUT[k]) or open(OUT[k], encoding='utf-8').read() != docs[k]]
    for b in bad: print('desatualizado:', os.path.relpath(b), '— rode: python3 server/bin/tokens-export.py')
    sys.exit(1 if bad else 0)
for k, d in docs.items():
    open(OUT[k], 'w', encoding='utf-8').write(d)
n = sum(len(v) for k, v in light.items() if not k.startswith('$'))
print(f'tokens.json: {n} tokens; tokens.dark.json: {len(dark_defs)} redefinidos')
