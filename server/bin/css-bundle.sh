#!/usr/bin/env bash
# css-bundle.sh <entrada.css> — imprime o CSS com os @import EXPANDIDOS (recursivo), na ordem.
#
# O web/shared/ui.css é um MANIFESTO de @import (docs/DESIGN.md). Quem precisa do CSS como
# TEXTO — o relatório offline (score/report-gen.sh inlina num <style>; aberto por blob:/srcdoc,
# onde @import relativo não resolve) e os testes que leem as regras — passa por aqui.
# Gêmeo no navegador: web/shared/css-bundle.js (mesma sintaxe aceita — mexeu num, mexa no outro).
#
# Sintaxe aceita: linha inteira `@import url("rel.css");` (ou url('…')/url(…)/"…"), caminho
# RELATIVO ao arquivo que importa, sem media/layer/supports. Qualquer outro @import = ERRO (rc 2):
# expandir pela metade daria um relatório sem parte do estilo, sem ninguém notar.
set -u

_cb_emit() {  # arquivo profundidade
  local f=$1 depth=$2 line dir rel
  (( depth > 8 )) && { echo "css-bundle: @import aninhado demais em $f" >&2; return 2; }
  [[ -r $f ]] || { echo "css-bundle: não consigo ler $f" >&2; return 2; }
  dir=$(dirname -- "$f")
  local re='^[[:space:]]*@import[[:space:]]+(url\()?["'"'"']?([^"'"'"')[:space:]]+)["'"'"']?\)?[[:space:]]*;[[:space:]]*$'
  while IFS= read -r line || [[ -n $line ]]; do
    if [[ $line =~ ^[[:space:]]*@import ]]; then
      if [[ $line =~ $re ]]; then
        rel=${BASH_REMATCH[2]}
        case $rel in
          /*|*://*|data:*) echo "css-bundle: só @import relativo é aceito ($rel em $f)" >&2; return 2 ;;
        esac
        _cb_emit "$dir/$rel" $((depth + 1)) || return $?
      else
        echo "css-bundle: @import fora da sintaxe aceita em $f: $line" >&2; return 2
      fi
    else
      printf '%s\n' "$line"
    fi
  done < "$f"
}

# --strip-comments: tira os /* comentários */ e as linhas em branco (o bundle SERVIDO — `make
# css-bundle`: 30 → 19 KB com gzip). Não muda nenhuma regra: nenhuma string do CSS contém "/*".
STRIP=0; [[ ${1:-} == --strip-comments ]] && { STRIP=1; shift; }
[[ $# -eq 1 ]] || { echo "uso: css-bundle.sh [--strip-comments] <entrada.css>" >&2; exit 64; }
if (( STRIP )); then
  set -o pipefail
  _cb_emit "$1" 0 | perl -0777 -pe 's{/\*.*?\*/}{}gs; s/[ \t]+$//mg; s/\n{2,}/\n/g; s/\A\n+//'
else
  _cb_emit "$1" 0
fi
