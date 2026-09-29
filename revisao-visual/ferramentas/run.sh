#!/bin/bash
# css-visual-diff.sh — DIFF VISUAL do design system (docs/DESIGN.md › "Diff visual").
#
# Compara o estilo COMPUTADO de todo elemento, página por página, entre uma REFERÊNCIA (um commit)
# e a árvore de trabalho, no Chrome headless, em desktop e celular. É a prova de que uma
# refatoração de CSS/estilo "não mudou nada" — ou a lista exata do que mudou.
#
# Como: monta o contest fictício do server/bin/shots-ajuda.sh (--serve: API DE VERDADE, o
# router.sh, sobre dados inventados, com sessão por papel — admin incluso) e sobe DOIS servidores
# sobre o MESMO fixture: um com o web/+server/ da referência (git archive) e outro com a árvore
# atual. O diff.mjs carrega cada página nos dois e compara. Nada toca em dado real.
#
# Uso:  bash server/test/visual/css-visual-diff.sh [REF=HEAD] [--b <REF2>] [--only <regex>]
#                                                  [--widths 1366,390] [--out <dir>] [--no-static]
#   REF          commit/branch de referência (padrão HEAD: "o que mudou no que não commitei")
#   --b          compara REF com OUTRO commit em vez da árvore de trabalho (dá p/ seguir editando
#                enquanto o diff roda)
#   --only       só as páginas cujo "caminho [sessão]" casa com a regex
#   --no-static  pula as páginas estáticas (só as de papel, de pages.txt)
# Saída 0 = nenhuma diferença; 1 = diferenças (ver <out>/report.json e <out>/pairs.txt).
# Precisa: node, python3, jq, Chrome ou Chromium (CHROME=<binário>). Leva alguns minutos.
set -uo pipefail
HERE=/home/caua-matheus/open-source/cdmoj/server/test/visual; PX="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
REF=HEAD; REFB=""; ONLY=""; WIDTHS="1366,390"; OUT=""; STATIC=1
while [[ $# -gt 0 ]]; do case "$1" in
  --only) ONLY="$2"; shift;; --b) REFB="$2"; shift;; --widths) WIDTHS="$2"; shift;; --out) OUT="$2"; shift;;
  --no-static) STATIC=0;; -*) echo "opção desconhecida: $1" >&2; exit 2;; *) REF="$1";;
esac; shift; done
for b in node python3 jq git; do command -v "$b" >/dev/null || { echo "falta: $b" >&2; exit 2; }; done

T="$(mktemp -d)"; OUT="${OUT:-$T/out}"
NEWPID=""; REFPID=""
cleanup(){ [[ -n ${BPID:-} ]] && kill "$BPID" 2>/dev/null; [[ -n $REFPID ]] && kill "$REFPID" 2>/dev/null; [[ -n $NEWPID ]] && kill "$NEWPID" 2>/dev/null; wait 2>/dev/null
  :
  rm -rf "$T"; }
trap cleanup EXIT

echo ">> referência: $(git -C "$ROOT" rev-parse --short "$REF") ($REF) × ${REFB:-árvore de trabalho}"
mkdir -p "$T/ref"
git -C "$ROOT" archive "$REF" web server | tar -x -C "$T/ref" || { echo "git archive $REF falhou" >&2; exit 2; }
BROOT="$ROOT"          # lado B: a árvore de trabalho, ou um 2º commit extraído (--b)
if [[ -n $REFB ]]; then
  mkdir -p "$T/b"; git -C "$ROOT" archive "$REFB" web server | tar -x -C "$T/b" || { echo "git archive $REFB falhou" >&2; exit 2; }
  BROOT="$T/b"
fi

# todos os módulos ligados: os painéis de evento/máquinas do admin só existem com eles
export SHOT_MODULES="${SHOT_MODULES:-sedes,maquinas,rodadas,documentos,baloes,coortes,inscricoes,telao,classificacao,virtual}"
export SHOT_DELAY_MS="${SHOT_DELAY_MS:-700}"
bash "$ROOT/server/bin/shots-ajuda.sh" --serve > "$T/serve.log" 2>&1 & NEWPID=$!
for _ in $(seq 120); do grep -q '^SERVE ' "$T/serve.log" && break; sleep 0.5; done
line="$(grep '^SERVE ' "$T/serve.log")" || { echo "o servidor do fixture não subiu:" >&2; tail -5 "$T/serve.log" >&2; exit 2; }
NEWPORT="$(sed -nE 's/.*port=([0-9]+).*/\1/p' <<< "$line")"
export SHOT_FIX="$(sed -nE 's/.* fix=([^ ]+).*/\1/p' <<< "$line")"
export SHOT_RUN="$(sed -nE 's/.* run=([^ ]+).*/\1/p' <<< "$line")"
export SHOT_SESS="$(sed -nE 's/.* sess=([^ ]+).*/\1/p' <<< "$line")"
SRVPID="$(sed -nE 's/.* pid=([0-9]+).*/\1/p' <<< "$line")"
REFPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
# o servidor da referência roda com o AMBIENTE EXATO do servidor do fixture (ANIMEITOR_URL do mock
# do telão e o que mais o shots-ajuda.sh exportar) — só a raiz e a porta mudam. Sem isso as telas
# que dependem desse ambiente (Central do admin, telão) divergiam no teste nulo.
[[ -r /proc/$SRVPID/environ ]] || { echo "sem /proc/$SRVPID/environ (Linux é obrigatório)" >&2; exit 2; }
mapfile -d '' ENVV < "/proc/$SRVPID/environ"
env -i "${ENVV[@]}" SHOT_ROOT="$T/ref" SHOT_PORT="$REFPORT" python3 "$T/ref/server/bin/shots-server.py" > "$T/ref.log" 2>&1 & REFPID=$!
for _ in $(seq 40); do curl -sf "http://127.0.0.1:$REFPORT/__ping" >/dev/null 2>&1 && break; sleep 0.25; done
BPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
env -i "${ENVV[@]}" SHOT_ROOT="$BROOT" SHOT_PORT="$BPORT" python3 "$BROOT/server/bin/shots-server.py" > "$T/b.log" 2>&1 & BPID=$!
for _ in $(seq 40); do curl -sf "http://127.0.0.1:$BPORT/__ping" >/dev/null 2>&1 && break; sleep 0.25; done
NEWPORT=$BPORT

{ (( STATIC )) && (cd "$BROOT/web" && find . -name '*.html' -not -path './shared/vendor/*' | sed 's#^\.##' | sort)
  cat "$HERE/pages.txt"; } > "$T/pages.txt"
echo ">> referência em :$REFPORT, árvore atual em :$NEWPORT — $(grep -cvE '^\s*(#|$)' "$T/pages.txt") páginas × {$WIDTHS}"
NEUTRAL_B="${NEUTRAL_B:-}" FILT="$PX/filt.py" node "$PX/pixel.mjs" ${START:+--start "$START"} --a "http://127.0.0.1:$REFPORT" --b "http://127.0.0.1:$NEWPORT" \
  --pages "$T/pages.txt" --out "$OUT" --widths "$WIDTHS" ${ONLY:+--only "$ONLY"}
rc=$?

exit $rc
