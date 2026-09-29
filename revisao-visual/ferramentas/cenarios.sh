# cenarios.sh — ESTADOS CONDICIONAIS das telas que o fixture base (shots-ajuda.sh) não produz.
#
# O fixture base é UM instante: prova em andamento há 2 h, falta 1 h, placar congelado há 30 min,
# ICPC, balão no estilo `fill`, todo time com alguma submissão. Muita tela só mostra uma parte
# quando outra condição vale (fase da prova, freeze, modo, estilo do balão, lista vazia...).
# Cada cenário aqui é:
#   cen_<nome>        altera o fixture ($C = contest demo) — roda sobre uma CÓPIA LIMPA do fixture
#   pages_<nome>      as telas que aquela condição muda ("caminho [sessão]", como o pages.txt)
# O run-cenarios.sh restaura o fixture, aplica um cenário e compara A × B nas telas dele.
#
# Regra que morde: o /contest/score REGERA o placar (score/build.sh, a partir de metrics.json, que o
# fixture não tem) se o `conf` ficar mais novo que o var/placar*.txt feito à mão. Todo cenário que
# mexe no `conf` chama `placar_fresco` no fim.

CENARIOS=(antes aberto encerrado final icone obi convidados vazio treino interacao)

setconf(){ # <CHAVE> <valor> — troca ou acrescenta a linha (o conf é sourced: %q)
  local k="$1" v; v="$(printf '%q' "$2")"
  if grep -q "^$k=" "$C/conf"; then sed -i "s|^$k=.*|$k=$v|" "$C/conf"; else printf '%s=%s\n' "$k" "$v" >> "$C/conf"; fi
}
delconf(){ sed -i "/^$1=/d" "$C/conf"; }
placar_fresco(){ sleep 1; touch "$C"/var/placar*.txt; rm -f "$C"/var/placar*.txt.gz "$C"/var/*cache* 2>/dev/null; }
modulos(){ setconf CONTEST_MODULES "$1"; }

# --- 1. ANTES DO INÍCIO: vitrine do placar (sem colunas de problema), contagem regressiva,
#        formulário de login escondido atrás do "Organização? Entrar"
cen_antes(){ local N=$EPOCHSECONDS
  setconf CONTEST_START $((N+3600)); setconf CONTEST_END $((N+3600+10800)); setconf FREEZE_TIME $((N+3600+7200))
  placar_fresco; rm -f "$C/var/placar-prestart.txt"; }
pages_antes(){ cat <<'EOF'
/contest/index.html
/contest/ s_comp
/contest/ s_judge
/contest/score/ s_comp
/contest/score/ s_judge
/contest/submissions/ s_comp
/contest/clarification/ s_comp
EOF
}

# --- 2. EM ANDAMENTO SEM CONGELAMENTO: placar aberto para o time, sem o aviso de freeze, e com o
#        📷 das fotos (só aparece com o placar ABERTO)
cen_aberto(){ setconf FREEZE_TIME 0; cp "$C/var/placar-full.txt" "$C/var/placar.txt"; placar_fresco; }
pages_aberto(){ cat <<'EOF'
/contest/score/ s_comp
/contest/score/index.html
/contest/ s_comp
EOF
}

# --- 3. ENCERRADA E AINDA CONGELADA: "competição encerrada", envio fechado, cerimônia liberada
cen_encerrado(){ local N=$EPOCHSECONDS
  setconf CONTEST_START $((N-10800)); setconf CONTEST_END $((N-600)); setconf FREEZE_TIME $((N-4200))
  placar_fresco; }
pages_encerrado(){ cat <<'EOF'
/contest/index.html
/contest/ s_comp
/contest/score/ s_comp
/contest/score/reveal.html s_anim
/contest/score/reveal.html s_admin
/contest/submissions/ s_comp
/contest/clarification/ s_comp
/contest/admin/#central/central s_admin
EOF
}

# --- 4. ENCERRADA E DESCONGELADA (placar final) + módulo virtual: botão da participação virtual
cen_final(){ local N=$EPOCHSECONDS
  setconf CONTEST_START $((N-10800)); setconf CONTEST_END $((N-600)); setconf FREEZE_TIME 0
  modulos "sedes,maquinas,rodadas,documentos,baloes,coortes,inscricoes,telao,classificacao,virtual"
  cp "$C/var/placar-full.txt" "$C/var/placar.txt"; placar_fresco; }
pages_final(){ cat <<'EOF'
/contest/score/index.html
/contest/score/ s_comp
/contest/ s_comp
/contest/score/reveal.html s_anim
EOF
}

# --- 5. BALÃO NO ESTILO PADRÃO (`icon`): o fixture usa `fill`, mas o padrão de todo contest é
#        `icon` (fundo neutro + bolinha com a cor) — o caso mais comum não era exercitado
cen_icone(){ delconf SCORE_BALLOON_STYLE; placar_fresco; }
pages_icone(){ cat <<'EOF'
/contest/score/index.html
/contest/score/ s_comp
/contest/score/ s_judge
/contest/score/reveal.html s_anim
/contest/ s_comp
EOF
}

# --- 6. MODO OBI: placar de NOTAS (outro renderizador: score-obi.js), sem balão nem penalidade
cen_obi(){
  setconf CONTEST_TYPE obi
  { printf 'obi\nasc:username:team name:A:B:C:D:E:F:G:H:Total\n'
    printf '%s\n' 'time-delta:Dirac Delta:100:100:100:40:100:100:0:0:540' \
                  'time-alfa:Alpha Team:100:100:100:100:100:0:30:0:530' \
                  'time-beta:Beta Testers:100:20:0:0:100:0:100:100:420' \
                  'time-epsilon:Sufficient Epsilon:100:0:0:60:0:0:0:0:160' \
                  'time-gama:Gamma Radiation:0:10:0:0:100:0:0:0:110' \
                  'time-zeta:Zeta Zero:0:0:0:0:0:0:0:0:0'; } > "$C/var/placar-full.txt"
  cp "$C/var/placar-full.txt" "$C/var/placar.txt"; placar_fresco; }
pages_obi(){ cat <<'EOF'
/contest/score/index.html
/contest/score/ s_comp
/contest/score/ s_judge
/contest/ s_comp
EOF
}

# --- 7. CONVIDADOS NUMERADOS: coluna `guest` + flag `g` (linha em itálico, posição própria)
cen_convidados(){
  setconf GUEST_NUMBERING 1
  for f in "$C/var/placar.txt" "$C/var/placar-full.txt"; do
    awk -F: 'BEGIN{OFS=":"} NR==1{print "icpc g"; next} NR==2{print $0":guest"; next}
             {g=($2=="time-epsilon"||$2=="time-zeta")?"1":""; print $0":"g}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"   # dados: flag:login:… (sem desc:asc)
  done; placar_fresco; }
pages_convidados(){ cat <<'EOF'
/contest/score/index.html
/contest/score/ s_comp
/contest/score/ s_judge
EOF
}

# --- 8. LISTAS VAZIAS: um time que não fez nada, e filas/avisos zerados (o texto "nada aqui")
cen_vazio(){
  local d="$C/users/time-eta"; mkdir -p "$d/submissions" "$d/mojlog" "$d/results"
  jq -cn '{login:"time-eta", password:"demo1234", fullname:"Eta Newcomers", email:"", created_at:0,
           updated_at:0, status:"active", uname_changes:[],
           team:{name:"Eta Newcomers", univ_short:"UFMG", univ_full:"UFMG", region:"Curitiba", flag:"br"}}' > "$d/account.json"
  : > "$d/history"
  printf 'CONTEST=%q\nLOGIN=%q\nUSERFULLNAME=%q\nLOGINAT=%q\n' demo time-eta "Eta Newcomers" "$EPOCHSECONDS" > "$SHOT_SESS/s_eta"
  find "$C/print-requests" -maxdepth 1 -type f ! -name staff-filters.json -delete
  rm -f "$C"/review/*.json "$C"/clarifications/*.json
  printf '[]\n' > "$C/news.json"; }
pages_vazio(){ cat <<'EOF'
/contest/ s_eta
/contest/submissions/ s_eta
/contest/print/ s_eta
/contest/backup/ s_eta
/contest/clarification/ s_eta
/contest/staff/ s_staff
/contest/judge/ s_judge
/contest/clarification/ s_judge
/contest/chief/#sit s_cjudge
/contest/admin/#operacao/staff s_admin
EOF
}

# --- 9. TREINO COM DADOS: a base só tinha o contest `demo`, e as telas do treino (/, /treino/,
#        /treino/problema/) saíam VAZIAS — 1366×900 = só o cabeçalho. Aqui: 8 problemas públicos
#        com tags/coleções, contagens que cobrem as 4 faixas de dificuldade + "novo" (sem tentativa),
#        e um aluno com acertos e erros (marcas ✓/✗ da lista).
cen_treino(){
  local T="$SHOT_FIX/treino" N=$EPOCHSECONDS id i k t tag s a html
  mkdir -p "$T/var/jsons" "$T/var/json-count" "$T/users/aluno"
  printf 'CONTEST_ID=treino\nCONTEST_NAME="Treino"\nCONTEST_TYPE=lista-publica\nUSER_STORE=v2\n' > "$T/conf"
  local P=("soma:Soma simples:iniciante:900:1000" "fila:Fila do banco:grafos:700:900"
           "moedas:Troco com moedas:dp:300:500" "torre:Torre de Hanói:recursão:120:400"
           "grafo:Caminho mínimo:grafos:40:300" "primo:Crivo de primos:matemática:10:200"
           "texto:Palíndromos:strings:450:600" "novo:Problema recém-publicado:iniciante:0:0")
  for i in "${P[@]}"; do IFS=: read -r k t tag s a <<<"$i"; id="col#$k"
    html="<h1 class=\"moj-title\">$t</h1><p>Enunciado de <em>$t</em>: leia <em>N</em> e imprima a resposta.</p><h2>Entrada</h2><p>Um inteiro <em>N</em> (1 &le; <em>N</em> &le; 10<sup>5</sup>).</p><h2>Saída</h2><p>Uma linha.</p>"
    jq -cn --arg id "$id" --arg t "$t" --arg tag "$tag" --arg h "$(printf '%s' "$html" | base64 -w0)" \
      '{id:$id, title:$t, public:true, tags:[$tag], collections:["col"], statement_langs:["pt"],
        author:"Equipe MOJ", languages:[], time_limits:{default:"1.0000", java:"2.0000"},
        statement_html_b64:$h, samples:[{name:"sample1", input:"10\n", output:"23\n"}]}' > "$T/var/jsons/$id.json"
    (( a > 0 )) && jq -cn --argjson s "$s" --argjson a "$a" '{solved_count:$s, attempted_count:$a}' > "$T/var/json-count/$id.json"
  done
  jq -cn '{login:"aluno", password:"demo1234", fullname:"Ana Aluna", email:"", created_at:0, updated_at:0,
           status:"active", uname_changes:[], university:"UnB", public:true}' > "$T/users/aluno/account.json"
  { printf '%s:col#soma:C:Accepted:%s:t001\n' $((N-86400)) $((N-86400))
    printf '%s:col#moedas:C++:Wrong Answer:%s:t002\n' $((N-7200)) $((N-7200))
    printf '%s:col#fila:Py:Accepted:%s:t003\n' $((N-3600)) $((N-3600)); } > "$T/users/aluno/history"
  printf 'CONTEST=%q\nLOGIN=%q\nUSERFULLNAME=%q\nLOGINAT=%q\n' treino aluno "Ana Aluna" "$N" > "$SHOT_SESS/s_treino"
  touch "$T/var/.treino-list-dirty" "$T/var/.score-dirty"; }
pages_treino(){ cat <<'EOF'
/index.html
/treino/index.html
/treino/ s_treino
/treino/problema/?id=col%23moedas
/treino/problema/?id=col%23soma s_treino
/treino/perfil/ s_treino
/treino/problemas/
/treino/problemas/ s_treino
/problemas/ s_treino
/problemas/editar.html s_treino
EOF
}

# --- 10. ESTADOS DE INTERAÇÃO: telas que só existem DEPOIS de um clique. Usa os ganchos do
#         shots-server.py (?clickcss= p/ a sanfona, que é um <span>; ?click=<texto do botão>&times=N),
#         as MESMAS interações que o shots-ajuda.sh usa nas fotos dos tutoriais, sem o ?hide=.
#         + a avaliação RESERVADA do juiz (o claim_r5 do shots-ajuda.sh): com a reserva, o
#         /contest/judge/ troca a fila pelo PAINEL DE AVALIAÇÃO. Prazo de 3 h: o de 4 min do shots-ajuda.sh
#         vencia antes de a tela do juiz ser capturada (ela vem por último), e a fila aparecia no lugar.
cen_interacao(){ local N=$EPOCHSECONDS
  jq -c --argjson exp "$((N+10800))" --argjson at "$((N-60))" \
    '.claimants=[{by:"juri.judge", at:$at, expires_at:$exp}] | .status="claimed"' \
    "$C/review/r5.json" > "$C/review/r5.tmp" && mv "$C/review/r5.tmp" "$C/review/r5.json"; }
pages_interacao(){ cat <<'EOF'
/contest/?clickcss=.prob-left&times=1 s_comp
/contest/?clickcss=.prob-left&times=8 s_comp
/contest/score/reveal.html?click=Step&times=4 s_anim
/contest/clarification/?click=edit%20answer&times=1 s_cjudge
/contest/animeitor/?click=show%20the%20big-screen%20links s_anim
/contest/judge/ s_judge
EOF
}
