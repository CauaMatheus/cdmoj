// shared/css-bundle.js — CSS com os @import EXPANDIDOS, para inlinar num <style>.
//
// O /shared/ui.css é um MANIFESTO de @import (docs/DESIGN.md). Num documento blob:/srcdoc a base
// URL é opaca e um @import relativo dentro de <style> não resolve — quem inlina o CSS (o
// enunciado aberto em aba nova, contest/contest.js) precisa do texto já expandido.
// Gêmeo no servidor: server/bin/css-bundle.sh (mesma sintaxe aceita — mexeu num, mexa no outro).
//
// Sintaxe aceita: linha inteira `@import url("rel.css");`, caminho relativo ao arquivo que importa.

// o \n? final come a quebra de linha junto: o texto sai IGUAL ao do css-bundle.sh (byte a byte)
const IMPORT_RE = /^[ \t]*@import[ \t]+(?:url\()?["']?([^"')\s]+)["']?\)?[ \t]*;[ \t]*$\n?/gm;

export async function bundledCss(url, depth = 0) {
  if (depth > 8) throw new Error('css-bundle: @import aninhado demais em ' + url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('css-bundle: HTTP ' + res.status + ' em ' + url);
  const text = await res.text();
  const base = new URL(url, location.href);
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(IMPORT_RE)) {
    parts.push(text.slice(last, m.index));
    parts.push(bundledCss(new URL(m[1], base).href, depth + 1));   // em paralelo; a ORDEM é a do array
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return (await Promise.all(parts)).join('');
}
