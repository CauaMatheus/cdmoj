#!/bin/bash
# css-ratchet.sh — guarda do DESIGN SYSTEM do web/ (docs/DESIGN.md). Estático, roda em qualquer lugar.
#
# Duas partes:
#  1. PORTÕES (reprovam sempre):
#     - o manifesto shared/ui.css expande (server/bin/css-bundle.sh) e todo módulo de
#       shared/styles/ aparece nele EXATAMENTE uma vez (módulo fora do manifesto = estilo que
#       nunca carrega; duas vezes = cascata dobrada);
#     - nenhum `var(--x)` usa token que não é definido em lugar nenhum (foi assim que o editor
#       de problemas viveu com borda/fundo de tema ESCURO: `var(--border,#2a2a2a)` sem --border);
#     - o CSS expandido não tem `import `/`fetch(`/`<script src=` (vai inlinado no relatório
#       offline, cujo smoke proíbe essas palavras);
#     - se existe o web/shared/ui.bundle.css do deploy (`make css-bundle`), ele é o expandido de
#       AGORA (o nginx o serve no lugar do manifesto: bundle velho = produção com estilo velho).
#  2. CATRACA (o legado não pode CRESCER): contagens de estilo fora do design system — cor hex
#     fora do tokens.css, <style>/style="" no HTML, estilo aplicado por JS, .css avulso. Subiu =
#     FAIL; desceu = aviso para travar o novo patamar com `--update` (que só aceita descer).
#
# uso: css-ratchet.sh [--update]
set -u
ROOT="${MOJ_SERVER_ROOT:-$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)}"
WEB="$(cd "$ROOT/.." && pwd)/web"
BASE="$ROOT/test/css-ratchet.baseline"
STY="$WEB/shared/styles"
pass=0; fail=0
ck(){ if eval "$2"; then echo "  ok: $1"; ((pass++)); else echo "  FAIL: $1 ${DBG:+:: $DBG}"; ((fail++)); fi; DBG=; }

# arquivos do front que contam (vendor é código de terceiros)
# (o ui.bundle.css é CÓPIA gerada dos módulos: contá-lo dobraria tudo)
files(){ find "$WEB" -type f \( -name '*.css' -o -name '*.html' -o -name '*.js' \) \
           -not -path "$WEB/shared/vendor/*" -not -name 'ui.bundle.css' -not -name '.ui.bundle.css.tmp' "$@" -print0; }

# arquivos de UM tipo (vendor é código de terceiros); extra = filtros adicionais do find
fw(){ local n=$1; shift; find "$WEB" -type f -name "$n" -not -path "$WEB/shared/vendor/*" \
        -not -name 'ui.bundle.css' -not -name '.ui.bundle.css.tmp' "$@" -print0; }

echo "== portões =="
B="$(mktemp)"; trap 'rm -f "$B"' EXIT
bash "$ROOT/bin/css-bundle.sh" "$WEB/shared/ui.css" > "$B"; rc=$?
ck "manifesto shared/ui.css expande (css-bundle.sh rc=$rc)" '[[ $rc -eq 0 ]]'

imports="$(sed -nE 's/^@import url\("([^"]+)"\);[[:space:]]*$/\1/p' "$WEB/shared/ui.css" | sort)"
ondisk="$(cd "$WEB/shared" && find styles -name '*.css' -not -path 'styles/pages/*' | sort)"
DBG="$(comm -3 <(echo "$imports" | sort -u) <(echo "$ondisk") | tr '\n' ' ')"
ck "todo módulo de shared/styles/ está no manifesto (e só ele)" '[[ -z "$DBG" ]]'
# styles/pages/ = CSS PRÓPRIO de uma tela, fora do manifesto: cada arquivo tem de ser carregado por
# um <link> de alguma página, e todo <link> p/ pages/ tem de apontar p/ um arquivo que existe
linked="$(fw '*.html' | xargs -0 grep -ohE '/shared/styles/pages/[a-zA-Z0-9_.-]+\.css' | sed 's#^/shared/##' | sort -u)"
pages="$(cd "$WEB/shared" && find styles/pages -name '*.css' 2>/dev/null | sort)"
DBG="$(comm -3 <(echo "$linked") <(echo "$pages") | tr '\n' ' ')"
ck "todo arquivo de styles/pages/ é carregado por uma página (e todo <link> existe)" '[[ -z "${DBG// /}" ]]'
DBG="$(echo "$imports" | uniq -d | tr '\n' ' ')"
ck "nenhum módulo importado duas vezes" '[[ -z "$DBG" ]]'

defs="$(files | xargs -0 grep -ohE -- "--[a-zA-Z0-9_-]+[[:space:]]*:|setProperty\(['\"]--[a-zA-Z0-9_-]+" \
        | grep -oE -- '--[a-zA-Z0-9_-]+' | sort -u)"
uses="$(files | xargs -0 grep -ohE -- 'var\(--[a-zA-Z0-9_-]+' | sed 's/^var(//' | sort -u)"
DBG="$(comm -13 <(echo "$defs") <(echo "$uses") | tr '\n' ' ')"
ck "nenhum token usado sem definição" '[[ -z "$DBG" ]]'

DBG="$(grep -nE '<script src=|import |fetch\(' "$B" | head -3 | tr '\n' ' ')"
ck "CSS expandido é seguro p/ o relatório offline" '[[ -z "$DBG" ]]'

# o bundle do deploy (make css-bundle) é servido NO LUGAR do manifesto: se existir, tem de ser o
# expandido de AGORA (1ª linha = cabeçalho "GERADO") — senão a produção serve estilo velho calada
UB="$WEB/shared/ui.bundle.css"
if [[ -f $UB ]]; then
  DBG="bundle ≠ módulos — rode: make css-bundle"
  ck "shared/ui.bundle.css em dia com os módulos" 'tail -n +2 "$UB" | cmp -s - <(bash "$ROOT/bin/css-bundle.sh" --strip-comments "$WEB/shared/ui.css")'
fi

# o tokens.json/tokens.dark.json (formato DTCG, p/ ferramentas de design) é derivado do tokens.css
DBG="$(python3 "$ROOT/bin/tokens-export.py" --check 2>&1 | tr '\n' ' ')"
ck "tokens.json (DTCG) em dia com o tokens.css" '[[ -z "$DBG" ]]'

echo "== catraca (legado fora do design system) =="
# conta ocorrências (grep -o) de uma ERE nos arquivos que chegam por NUL no stdin
occ(){ local n; n="$(xargs -0 grep -ohE -- "$1" 2>/dev/null | wc -l)"; echo "${n//[^0-9]/}"; }
Q="[\"'\`]"   # aspa simples, dupla ou crase (grep não entende \x27)
HEX='#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b|#[0-9a-fA-F]{3}\b'
declare -A M
M[hex_fora_tokens]=$( { fw '*.css' -not -path "$STY/tokens.css"; fw '*.html'; fw '*.js'; } | occ "$HEX")
M[html_style_blocos]=$(fw '*.html' | occ '<style')
M[html_style_linhas]=$(fw '*.html' | xargs -0 awk '/<style/{s=1} s{n++} /<\/style>/{s=0} END{print n+0}' | awk '{t+=$1} END{print t+0}')
M[html_style_attr]=$(fw '*.html' | occ 'style="')
M[js_estilo_inline]=$(fw '*.js' | occ "\.style\.[a-zA-Z]+[[:space:]]*=[^=]|cssText|style:[[:space:]]*$Q")
M[js_style_tags]=$(fw '*.js' | occ "createElement\(${Q}style${Q}\)|<style[ >]")
M[css_avulso]=$(fw '*.css' -not -path "$STY/*" -not -path "$WEB/shared/ui.css" | tr -cd '\0' | wc -c)

declare -A OLD
if [[ -f $BASE ]]; then while read -r k v; do [[ $k == \#* || -z $k ]] || OLD[$k]=$v; done < "$BASE"; fi
down=0
for k in $(printf '%s\n' "${!M[@]}" | sort); do
  new=${M[$k]}; old=${OLD[$k]:-}
  if [[ -z $old ]]; then echo "  (sem linha de base) $k = $new"; ((down++)); continue; fi
  DBG="$old → $new"
  ck "$k não cresceu ($old → $new)" '(( new <= old ))'
  (( new < old )) && { echo "    ↓ desceu: rode css-ratchet.sh --update p/ travar o novo patamar"; ((down++)); }
done

if [[ ${1:-} == --update ]]; then
  if (( fail )); then echo "não atualizo a linha de base com FAIL (a catraca só desce)"; exit 1; fi
  { echo "# linha de base do server/test/css-ratchet.sh — só DESCE (regenere com --update)"
    for k in $(printf '%s\n' "${!M[@]}" | sort); do echo "$k ${M[$k]}"; done; } > "$BASE"
  echo "linha de base gravada em ${BASE#"$ROOT"/}"
fi

echo; echo "RESULT: $pass passed, $fail failed"
(( fail == 0 ))
