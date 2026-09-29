#!/usr/bin/env python3
"""gen-neutral.py — reaplica o <style> de uma página de A em B, restrito a essa página.

Uso: git show <A>:<pagina.html> | gen-neutral.py <sufixo-do-link-da-pagina-em-B> <var-indefinida>...

Para neutralizar uma página cuja mudança relevada toca MUITAS regras (o editor de problemas), em vez
de listar seletor por seletor: TODAS as regras do <style> de A entram, cada seletor com o prefixo
`html:has(link[href$="<sufixo>"])` (a página só existe em B com esse <link>, então A nunca casa) e com
`var(--x, reserva)` trocado pela reserva quando --x era INDEFINIDA em A (o que o navegador de fato
usava). Como base e variantes (.tab e .tab.on) ganham o MESMO prefixo, a especificidade entre elas é a
de A — é o que a lista à mão errava (o chip ativo do R2).
"""
import re, sys

sufixo, indef = sys.argv[1], set(sys.argv[2:])
html = sys.stdin.read()
css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

def resolve(v):  # var(--x, reserva) -> reserva, só p/ --x indefinida; aninhado resolve de dentro p/ fora
    pat = re.compile(r"var\(\s*(--[\w-]+)\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)")
    while True:
        n = pat.sub(lambda m: m.group(2).strip() if m.group(1) in indef else m.group(0).replace("var(", "var\x00("), v)
        if n == v: return n.replace("var\x00(", "var(")
        v = n

PFX = f'html:has(link[href$="{sufixo}"])'
def prefix(sel):
    out = []
    for s in re.split(r",(?![^()]*\))", sel):
        s = s.strip()
        if not s: continue
        s = re.sub(r"^(html|:root)\b", "", s).strip()   # a raiz vira o próprio prefixo
        s = re.sub(r"^body\b", "body", s)
        out.append(f"{PFX} {s}".rstrip() if s else PFX)
    return ", ".join(out)

def walk(block):
    res, i = [], 0
    while i < len(block):
        j = block.find("{", i)
        if j < 0: break
        head = block[i:j].strip()
        depth, k = 1, j + 1
        while depth and k < len(block):
            depth += {"{": 1, "}": -1}.get(block[k], 0); k += 1
        body = block[j + 1:k - 1]
        if head.startswith("@media") or head.startswith("@supports"):
            res.append(f"{head} {{\n{walk(body)}\n}}")
        elif head.startswith("@"):
            res.append(f"{head} {{{body}}}")          # @keyframes etc.: intocado
        else:
            res.append(f"{prefix(head)} {{{resolve(body).strip()}}}")
        i = k
    return "\n".join(res)

print(walk(css))
