#!/usr/bin/env python3
"""tokens-dark.py — gera web/shared/styles/theme-dark.css, o TEMA ESCURO (docs/DESIGN.md › Tema escuro).

    python3 server/bin/tokens-dark.py            # grava o theme-dark.css
    python3 server/bin/tokens-dark.py --check    # rc 1 se o theme-dark.css não bate (css-ratchet.sh)

O theme-dark.css é DERIVADO do tokens.css — não o edite: ajuste AQUI.
- os SEMÂNTICOS (--color-*) do escuro estão escolhidos à mão na tabela SEM abaixo;
- os tokens de componente, página e JS são derivados em OKLCH pelo PAPEL do nome
  (-bg → superfície escura com a mesma matiz, -text → texto claro, -border → borda média);
  o que já é de tema escuro (fundo escuro, texto claro) fica como está; OVERRIDE força um valor;
- o contraste texto × fundo é conferido (WCAG AA, ≥ 4,5:1): abaixo disso não grava.
Token novo no tokens.css ⇒ rode este script (o css-ratchet.sh reprova o theme-dark.css velho).
"""
import re, sys, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
STY = os.path.join(HERE, '..', '..', 'web', 'shared', 'styles')
CHECK = '--check' in sys.argv
TOK = open(os.path.join(STY, 'tokens.css'), encoding='utf-8').read()
BODY = re.sub(r'/\*.*?\*/', '', TOK.split('/* ---------- 4. LEGADO')[0], flags=re.S)
OVERRIDE = {}   # '--nome': '#valor' — ajuste manual de um derivado
# ---- cor: sRGB <-> OKLab/OKLCH
def hex2rgb(h):
    h = h.lstrip('#'); h = ''.join(c * 2 for c in h) if len(h) == 3 else h
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def lin(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
def delin(c): return 12.92 * c if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055
def rgb2oklch(rgb):
    r, g, b = map(lin, rgb)
    l = .4122214708 * r + .5363325363 * g + .0514459929 * b
    m = .2119034982 * r + .6806995451 * g + .1073969566 * b
    s = .0883024619 * r + .2817188376 * g + .6299787005 * b
    l, m, s = (x ** (1 / 3) for x in (l, m, s))
    L = .2104542553 * l + .7936177850 * m - .0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s
    B = .0259040371 * l + .7827717662 * m - .8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360
def oklch2rgb(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + .3963377774 * A + .2158037573 * B) ** 3
    m = (L - .1055613458 * A - .0638541728 * B) ** 3
    s = (L - .0894841775 * A - 1.2914855480 * B) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s
    b = -.0041960863 * l - .7034186147 * m + 1.7076147010 * s
    return [delin(x) for x in (r, g, b)]
def to_hex(L, C, H):
    for _ in range(40):                       # reduz croma até caber no sRGB
        rgb = oklch2rgb(L, C, H)
        if all(-.001 <= x <= 1.001 for x in rgb): break
        C *= .9
    return '#' + ''.join(f'{round(min(1, max(0, x)) * 255):02x}' for x in rgb)
def lum(h):
    r, g, b = map(lin, hex2rgb(h)); return .2126 * r + .7152 * g + .0722 * b
def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + .05) / (lb + .05)

# ---- semânticos do escuro (à mão; contraste conferido abaixo)
SEM = {
    '--color-text': '#e6edf3', '--color-text-muted': '#9aa7b8', '--color-text-subtle': '#7d8a9a', '--color-text-inverse': '#ffffff',
    '--color-page': '#0d1117', '--color-surface': '#161b22', '--color-surface-alt': '#1a212b', '--color-surface-sunken': '#10151c',
    '--color-surface-muted': '#1a212b', '--color-primary-faint': '#1b2635', '--color-pending-bg': '#222a35',
    '--color-border': '#2a3441', '--color-border-strong': '#3b4758', '--color-border-control': '#3b4758', '--color-neutral': '#4b5563',
    '--color-primary': '#58a6ff', '--color-primary-strong': '#8cc4ff', '--color-primary-soft': '#1f3350', '--color-primary-deep': '#102a4d',
    '--color-accent': '#a79bff', '--color-success': '#3fb950', '--color-success-bg': '#11301c',
    '--color-danger': '#ff7b72', '--color-danger-bg': '#3b1519', '--color-warning': '#e3b341', '--color-warning-bg': '#3a2d0c',
    '--color-code-bg': '#0b0f14', '--color-code-text': '#e2e8f0',
}
EXTRA = [  # não-cor ou canal
    ('--color-focus-ring', 'rgba(88,166,255,.35)'), ('--rgb-shadow', '0,0,0'), ('--rgb-primary', '88,166,255'),
    ('--elev-1', '0 1px 3px rgba(0,0,0,.45)'), ('--elev-2', '0 1px 2px rgba(0,0,0,.35), 0 6px 20px rgba(0,0,0,.4)'),
    ('--elev-3', '0 2px 4px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.5)'),
]

# ---- componentes / páginas / JS: derivados pelo PAPEL do nome
rawd = dict(re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', BODY))
def res(n, seen=()):
    v = rawd.get(n, '').strip(); m = re.fullmatch(r'var\((--[a-z0-9-]+)\)', v)
    return res(m.group(1), seen + (n,)) if m and n not in seen else v
KEEP = {'--topbar-link'}      # a topbar continua azul no escuro: o link claro dela fica
comp = [(n, res(n)) for n in rawd if n not in KEEP and not n.startswith('--color-')
        and re.fullmatch(r'#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}', res(n))]
prims = re.compile(r'--(blue|slate|green|red|amber|violet|white)\b|--(rgb)-')
def role(n):
    if re.search(r'-(bg|bg-\d+|fill|hover-bg|row-hover|faint)\b|-bg-|draft-bg', n): return 'bg'
    if re.search(r'-(text|text-\d+|val|sub|label)\b|-text-', n): return 'text'
    if re.search(r'-(border|border-\d+|edge|accent|ring|outline)\b|-border-', n): return 'border'
    return None
def dark_of(n, h):
    L, C, H = rgb2oklch(hex2rgb(h)); r = role(n)
    if r is None: r = 'text' if L < .6 else 'bg'
    # o que JÁ é de tema escuro (os chips do editor: fundo escuro + texto claro mesmo no claro) fica
    if r == 'bg' and L < .45: return h.lower()
    if r == 'text' and L > .72: return h.lower()
    if r == 'bg':     return to_hex(.2 + (1 - L) * .6, min(C, .07) * .9, H)
    if r == 'text':   return to_hex(max(.8, min(.92, 1.25 - L)), min(C, .14), H)
    return to_hex(.42 + (1 - L) * .25, min(C, .12), H)            # borda / acento
DER = [(n, OVERRIDE.get(n) or dark_of(n, v)) for n, v in comp if not prims.match(n) and n not in SEM]

# ---- contraste: pares texto × fundo que aparecem juntos
report = []
def chk(name, fg, bg, need=4.5):
    c = contrast(fg, bg); report.append((c >= need, f'{c:5.2f}:1  {name}'))
for t in ('--color-text', '--color-text-muted', '--color-primary', '--color-primary-strong', '--color-accent',
          '--color-success', '--color-danger', '--color-warning'):
    for b in ('--color-surface', '--color-page', '--color-surface-alt'):
        chk(f'{t} sobre {b}', SEM[t], SEM[b], 4.5 if 'muted' not in t else 4.5)
chk('--color-text-inverse sobre --color-primary-fill (#2b6cb0)', '#ffffff', '#2b6cb0')
chk('--color-success sobre --color-success-bg', SEM['--color-success'], SEM['--color-success-bg'])
chk('--color-danger sobre --color-danger-bg', SEM['--color-danger'], SEM['--color-danger-bg'])
chk('--color-warning sobre --color-warning-bg', SEM['--color-warning'], SEM['--color-warning-bg'])
chk('--color-code-text sobre --color-code-bg', SEM['--color-code-text'], SEM['--color-code-bg'])
d = dict(DER)
for n, v in DER:
    if role(n) == 'text':
        base = re.sub(r'-text(-\d+)?$', '', n)
        for bn in (base + '-bg', base + '-bg-2'):
            if bn in d: chk(f'{n} sobre {bn}', v, d[bn])
        chk(f'{n} sobre --color-surface', v, SEM['--color-surface'])
bad = [r for ok, r in report if not ok]
if not CHECK: print(f'{len(SEM)} semânticos, {len(DER)} derivados; contraste: {len(report) - len(bad)}/{len(report)} ≥ 4.5:1')
for r in bad: print('  ABAIXO:', r)

lines = ['/* styles/theme-dark.css — TEMA ESCURO (opt-in). GERADO por server/bin/tokens-dark.py — NÃO EDITE.',
         '   Carregado SÓ por quem escolheu o escuro: o boot inline do <head> de cada página o acrescenta',
         '   (e marca <html data-theme="dark">) antes da 1ª pintura; o botão ☾ (shared/theme.js) o carrega ao',
         '   ligar. Quem usa o claro não baixa este arquivo. Dentro de @media screen: a IMPRESSÃO sai clara.',
         f'   Contraste conferido: {len(report)} pares texto × fundo ≥ 4,5:1 (WCAG AA). */',
         '@media screen {', '  :root[data-theme="dark"] {', '    color-scheme: dark;']
for n, v in list(SEM.items()) + EXTRA: lines.append(f'    {n}:{v};')
lines.append('    /* derivados (componentes, páginas, JS) */')
row = '   '
for n, v in DER:
    piece = f' {n}:{v};'
    if len(row) + len(piece) > 104: lines.append(row); row = '   '
    row += piece
lines.append(row); lines += ['  }', '}']
out = '\n'.join(lines) + '\n'
dst = os.path.join(STY, 'theme-dark.css')
if bad: sys.exit(2)
if CHECK:
    cur = open(dst, encoding='utf-8').read() if os.path.exists(dst) else ''
    if cur != out: print('desatualizado: web/shared/styles/theme-dark.css — rode: python3 server/bin/tokens-dark.py'); sys.exit(1)
    sys.exit(0)
open(dst, 'w', encoding='utf-8').write(out)
