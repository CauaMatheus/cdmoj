# CSS modular no MOJ: relatório da mudança

Branch `web/design-system-css`, commit `web/css: design system modular (tokens + módulos + bundle no deploy)`, 29/09/2026.

---

## 1. Resumo e passo a passo

### O que mudou

Antes, a identidade visual do site vivia num único `web/shared/ui.css` de 654 linhas, com 12
variáveis CSS. Outras 41 das 56 páginas tinham um bloco `<style>` próprio, e o JS aplicava estilo
direto em cerca de 1.200 pontos. Trocar a cor principal ou o raio dos cantos significava caçar
valores soltos em uns 90 arquivos.

Agora:

1. O `ui.css` virou um **manifesto**: só uma lista ordenada de `@import`. O estilo mora em
   `web/shared/styles/`, dividido em 24 módulos (`tokens`, `base`, `components/`, `domains/`…).
2. O `tokens.css` tem **três níveis de variáveis**: primitivos (a paleta), semânticos (o papel de
   cada cor, como `--color-primary`) e aliases com os nomes antigos, para nada quebrar.
3. No deploy, `make css-bundle` **concatena** os módulos num arquivo só, e o nginx o entrega no
   mesmo endereço `/shared/ui.css`. Nenhuma página mudou.
4. Uma guarda (`server/test/css-ratchet.sh`, no `make check`) impede que o legado cresça e que o
   bundle fique desatualizado.

A única mudança visual é intencional: cinco variáveis eram **usadas mas nunca definidas**
(`--border`, `--bg`, `--fg`, `--bg-soft`, `--card-bg`). O navegador caía no valor reserva, que era
de tema escuro. O editor de problemas, os tutoriais e as páginas de CLI tinham bordas quase pretas
(`#2a2a2a`), e o editor tinha uma barra fixa quase preta e abas com texto cinza-claro sobre branco.

### Como a página recebe o CSS

```
página ──► GET /shared/ui.css
              │
              ├─ produção: o nginx acha web/shared/ui.bundle.css (gerado no deploy)
              │            └─► 1 resposta com os 24 módulos já concatenados
              │
              └─ dev (sem bundle): o nginx entrega o manifesto
                           └─► o navegador busca os 24 módulos pelos @import
```

### Passo a passo do deploy

1. `git pull` do branch (depois de revisado e mesclado).
2. `make deploy`. Ele já roda `make css-bundle`, que grava `web/shared/ui.bundle.css`. Se o
   manifesto estiver quebrado, o alvo falha, o bundle anterior fica intacto e o deploy para antes
   do restart.
3. **Só desta vez:** reinstalar o nginx (`server/bin/install-nginx.sh`), porque o
   `moj-app.conf.in` mudou. Sem isso o site funciona, mas pelo manifesto, com a primeira visita
   cerca de 350 ms mais lenta em 4G. Nos deploys seguintes não precisa: o nginx confere a
   existência do bundle a cada requisição.
4. Conferir: `curl -sI https://<host>/shared/ui.css` deve mostrar `Cache-Control: no-cache,
   must-revalidate`, e o corpo deve começar com `/* GERADO por \`make css-bundle\``.

### Passo a passo para quem vai mexer no CSS

1. Procure o componente em `web/shared/styles/components/`, ou a área em `domains/`.
2. Cor, espaço e raio saem de **token semântico** (`var(--color-primary)`, não `#2b6cb0`). Se
   faltar um token, crie o primitivo e o semântico no `tokens.css`.
3. Módulo novo = um arquivo + uma linha no manifesto, na posição certa. A ordem é a cascata.
4. Rode `make check`. Se você tem um bundle local, rode também `make css-bundle`, ou apague o
   bundle, senão o nginx continua servindo o CSS velho.

O guia completo está em `docs/DESIGN.md`.

---

## 2. Vantagens de ter o CSS modularizado

**Uma mudança, um lugar.** Parnas propôs, em 1972, decompor sistemas pelas decisões que tendem a
mudar, escondendo cada uma dentro de um módulo [1]. No CSS, a decisão que mais muda é a identidade
visual: cores, espaços, raios, fontes. Com a camada de tokens semânticos, trocar o azul principal é
editar `--blue-600` num arquivo, e os 25 `var(--blue)` e o `var(--color-primary)` acompanham.
Antes, o valor existia como variável num ponto e como literal em outros.

**Custo de manutenção e acoplamento menores.** Baldwin e Clark mostram que a modularidade cria
"opções": partes que evoluem de forma independente sem renegociar o todo [2]. MacCormack, Rusnak e
Baldwin mediram que projetos de software com acoplamento maior entre componentes são mais custosos
de mudar e propagam alterações mais longe [3]. Um arquivo de 654 linhas em que qualquer regra pode
afetar qualquer tela é o caso extremo de acoplamento.

**CSS tende a acumular código morto e duplicado.** Mesbah e Mirshokraie analisaram aplicações web
reais e encontraram uma parcela grande de seletores CSS que não casavam com nenhum elemento [4].
Mazinanian, Tsantalis e Mesbah encontraram duplicação extensa em folhas de estilo reais e
propuseram refatorações para extraí-la [5]. Módulos pequenos e nomeados por componente tornam
visível o que está sobrando ou repetido, porque o autor de um módulo o lê inteiro.

**Os pré-processadores existem porque o CSS puro carecia disso.** Mazinanian e Tsantalis estudaram
o uso de Sass e Less em projetos reais: variáveis, mixins e divisão em arquivos estão entre os
recursos mais usados [6]. Hoje o CSS nativo tem variáveis e `@import`, e o MOJ consegue os mesmos
ganhos sem ferramenta de build, que é regra da casa.

**Revisão de código mais fácil.** Um diff em `components/button.css` (1 KB) diz o que muda. Um
diff num arquivo de 49 KB exige que o revisor saiba o que mais ali pode casar com os mesmos
elementos.

**Base para tema escuro.** Com os componentes lendo tokens semânticos, um tema escuro é redefinir a
camada semântica dentro de `@media (prefers-color-scheme: dark)` [15]. Sem essa camada, seria
duplicar cada regra.

**Um bug real saiu daqui.** A guarda que confere "todo token usado está definido em algum lugar"
achou os cinco tokens indefinidos na primeira execução. Eles afetavam cerca de 680 elementos em 16
páginas.

---

## 3. Possibilidades de futuras contribuições para a interface

O roteiro está em `docs/DESIGN.md`. Os oito itens abaixo foram **executados** em seguida, um commit
por etapa, cada um provado com o diff visual (desempenho na seção 5, prós e contras na seção 6):

| # | Contribuição | Situação |
|---|---|---|
| 1 | **Adotar os tokens semânticos nos módulos** | Feito: 198 trocas, módulos sem nome legado; diff visual 212/216 (as 4 diferenças são o item 2). |
| 2 | **Extrair componentes dos `<style>` das páginas** | Feito nos grupos de corpo **idêntico**: layout de tutorial (5 arquivos), título e link ativo do contest (20 e 18). Os de corpo divergente (`.stat-card` com 5 versões, `.tabs` com 4) ficam para uma revisão de design, porque unificar muda pixels. |
| 3 | **Migrar os 41 blocos `<style>`** | Feito: 41 → 3 (os roteiros de ensaio, que viram PDF pelo LibreOffice). O CSS foi para `styles/pages/`, carregado por `<link>` no mesmo ponto. |
| 4 | **Trocar estilo inline no JS por classes** | Feito nas telas de contest, `lib/` e `shared/contest-config/`: 547 conversões, 104/104 telas iguais. 1.235 → 742 pontos. Treino, problemas e home ficaram só com a cor tokenizada, porque o diff visual não renderiza essas telas com dados. |
| 5 | **Tema escuro** | Feito, opt-in (☾). Contraste 149/149 ≥ 4,5:1. Quem usa o claro não baixa nada a mais. |
| 6 | **Cascade layers (`@layer`)** | **Testado e não adotado:** mudava 84 de 216 telas (a coluna numérica desalinhava, o padding do celular mudava). |
| 7 | **Tokens de espaçamento e tipografia** | Feito onde o valor bate exatamente com a escala: 122 trocas. Valores fora da escala ficaram. |
| 8 | **Formato padrão de tokens** | Feito: `tokens.json`/`tokens.dark.json` (DTCG), com teste de ida e volta. |

**Como a catraca ajuda quem contribui:** o `css-ratchet.sh` guarda em
`server/test/css-ratchet.baseline` as contagens do legado e só aceita que elas desçam. Depois do
plano: hex fora dos tokens 759 → 186, blocos `<style>` 41 → 3 (linhas 1.065 → 100), estilo inline
no JS 1.235 → 742. O que falta pode ser migrado aos poucos, sem nunca voltar a crescer.

---

## 4. IA em código modularizado × código como era antes

### O que a literatura diz

**Não encontrei estudo que compare diretamente o desempenho de modelos de linguagem em CSS
modularizado contra CSS monolítico.** O que existe é evidência sobre como esses modelos lidam com
contexto longo, com informação irrelevante e com a localização de código num repositório. Dela dá
para tirar consequências para este caso, com a ressalva de que são extrapolações.

1. **Contexto longo é usado de forma desigual.** Liu et al. mostraram que modelos de linguagem
   usam pior a informação que está no **meio** de um contexto longo do que a que está no começo ou
   no fim [7]. Hsieh et al. (RULER) mostraram que o contexto que um modelo usa de fato é menor que
   o anunciado, e que o desempenho cai à medida que o contexto cresce [8]. *Consequência:* para
   achar a regra de `.fbar` antes, era preciso ler o `ui.css` inteiro (49 KB, cerca de 12 mil
   tokens), com a regra no meio. Agora ela está em `domains/score.css` (13 KB). A regra de `.btn`
   está num arquivo de 1 KB.

2. **Informação irrelevante atrapalha.** Shi et al. mostraram que acrescentar contexto irrelevante
   ao prompt reduz a acurácia de modelos de linguagem de forma significativa [9]. *Consequência:*
   um módulo por componente reduz o que entra no contexto sem ter relação com a tarefa.

3. **Localizar o que mudar é o gargalo em repositórios.** No SWE-bench, que usa issues reais do
   GitHub, boa parte da dificuldade está em achar os arquivos e trechos certos [10]. O Agentless
   funciona justamente localizando em etapas (arquivo, depois elemento, depois linha) antes de
   editar [11]. O SWE-agent observou que a forma como o código é mostrado ao agente (janelas
   curtas, busca, navegação por arquivo) muda o resultado de forma relevante [12]. *Consequência:*
   nomes de arquivo que dizem o que contêm (`components/button.css`, `domains/score.css`) são uma
   localização de primeiro nível feita de graça.

4. **Contexto entre arquivos precisa ser recuperado.** RepoCoder [13] e CrossCodeEval [14]
   mostram que modelos completam melhor o código quando o contexto relevante de **outros**
   arquivos é recuperado e fornecido. *Consequência:* com tokens nomeados (`--color-primary`), a
   dependência entre arquivos fica explícita e buscável por texto. Um hex solto (`#2b6cb0`) não diz
   de onde veio.

### O que se mede neste repositório

Não fiz experimento controlado com modelos, então estes números medem **o custo da tarefa**, que
vale para uma pessoa e para uma IA, e não o desempenho de uma IA.

| Tarefa | Antes | Agora |
|---|---|---|
| Ler para achar a regra da barra de filtros do placar | `ui.css`, 49 KB | `domains/score.css`, 13 KB |
| Ler para achar a regra de botão | `ui.css`, 49 KB | `components/button.css`, 1 KB |
| Tamanho médio de um arquivo de estilo compartilhado | 49 KB (arquivo único) | 2,4 KB (24 módulos) |
| Checagem mecânica de "token usado sem definição" | não existia | portão no `make check` |

**Relato desta própria sessão (anedótico):** a divisão foi feita por uma IA (Claude). O que tornou
a mudança segura foram as verificações mecânicas que a estrutura modular permite: remontagem
comparada linha a linha, portões automáticos e o diff de estilo computado nas 56 páginas. Os
tokens indefinidos, que existiam havia meses, foram achados por um `grep` de definição × uso, e não
por leitura.

**Depois do plano de contribuições:** o azul principal **não aparece mais** como literal fora
dos tokens (eram 1 hex e 6 `rgba(43,108,176,…)`), e as cores hex distintas fora dos tokens caíram
de 209 para 61. Todo o CSS compartilhado e de página usa token. As 61 restantes são, na maior
parte, **paletas de dados** (séries dos gráficos, métricas das máquinas, cores oficiais dos balões
ICPC), aplicadas em atributo SVG, onde `var()` não funciona, mais os roteiros de ensaio e o
`_tutorial.css` dos tutoriais de papel. Para "trocar o azul do site", hoje basta o `tokens.css`.

---

## 5. Benchmarks: solução antiga × solução atual

### Método

| | |
|---|---|
| Servidor | nginx 1.27 (Docker), com as diretivas de gzip copiadas do `moj-app.conf.in` de produção (`gzip_comp_level 2`, `gzip_min_length 1024`), 2 CPUs |
| Navegador | Chrome headless via DevTools Protocol, 1366×900 |
| Páginas | `/index.html`, `/treino/`, `/contest/?c=teste`, `/contest/score/?c=teste`, `/problemas/editar.html` |
| Visita fria | contexto de navegador novo a cada carga (cache vazio, conexão nova: o handshake TCP/TLS entra na conta) |
| Visita quente | segunda visita no mesmo contexto, logo depois da primeira |
| Rede | limitação do Chrome: LAN (sem limite), cabo (20 ms, 50 Mbit/s), 4G (150 ms, 1,6 Mbit/s), 3G (562 ms, 1,44 Mbit/s) |
| Repetições | 6 por combinação; a ordem das variantes é sorteada a cada rodada |
| Estatística | mediana por página, depois mediana das 5 páginas |
| Servidor sob carga | `h2load` (nghttp2 1.62) disparando o CSS de uma página, 50 e 200 clientes, 5 repetições, HTTP/1.1 e HTTP/2 |
| Volume | 2.700 carregamentos de página no navegador |

**Variantes:**

| | O que é |
|---|---|
| **A** | Solução antiga: `ui.css` único, `no-cache` |
| **B** | Manifesto modular servido cru, `no-cache` |
| **C** | Manifesto modular cru, com `max-age=300` só no CSS |
| **D** | Bundle, com `max-age=300` |
| **E** | **Solução atual**: bundle, `no-cache` |

### Tamanho do CSS

| | Cru | Com gzip (nível 2) | Requisições por página |
|---|---|---|---|
| A: `ui.css` antigo | 49,3 KB | 16,5 KB | 1 |
| B/C: manifesto + 24 módulos | 59,8 KB | ~36 KB transferidos (HTTP/1.1) | 25 |
| **E: bundle** | 58,9 KB | **19,5 KB** | **1** |

Os 3 KB a mais do bundle (depois do gzip) vêm de 9,6 KB crus a mais: cerca de 6,6 KB de comentários
(cabeçalho de cada módulo e documentação dos tokens) e cerca de 3 KB de declarações de tokens novos. O manifesto
cru transferia o dobro por três motivos: compressão arquivo a arquivo, 9 módulos abaixo de 1 KB
saindo sem gzip (limite do `gzip_min_length`) e cerca de 7 KB de cabeçalhos em 25 respostas.

### Primeira pintura (FCP), HTTP/2

1ª rodada (antes do bundle):

| Rede | Visita | A (antiga) | B | C |
|---|---|---|---|---|
| LAN | fria | 46 ms | 76 ms | 74 ms |
| LAN | quente | 40 ms | 62 ms | 62 ms |
| cabo | fria | 92 ms | 144 ms | 148 ms |
| cabo | quente | 84 ms | 130 ms | 84 ms |
| 4G | fria | 562 ms | 914 ms | 908 ms |
| 4G | quente | 346 ms | 706 ms | 214 ms |
| 3G | fria | 1.402 ms | 2.179 ms | 2.180 ms |
| 3G | quente | 1.173 ms | 1.965 ms | 622 ms |

2ª rodada (com o bundle):

| Rede | Visita | A (antiga) | C | D | **E (atual)** |
|---|---|---|---|---|---|
| LAN | fria | 56 ms | 76 ms | 50 ms | **54 ms** |
| LAN | quente | 44 ms | 62 ms | 36 ms | **40 ms** |
| cabo | fria | 96 ms | 156 ms | 96 ms | **104 ms** |
| cabo | quente | 86 ms | 84 ms | 60 ms | **86 ms** |
| 4G | fria | 566 ms | 916 ms | 574 ms | **578 ms** |
| 4G | quente | 348 ms | 218 ms | 192 ms | **350 ms** |

Em HTTP/1.1 o padrão é o mesmo, e maior para o manifesto cru, porque o navegador abre no máximo 6
conexões por origem. 4G fria: A 576 ms, C 1.158 ms, **E 596 ms**. 4G quente: A 350 ms, **E 352 ms**.

Tempo até o evento `load`, 4G, HTTP/2: A 1.060 ms e **E 1.060 ms** na fria; A 846 ms e **E 848 ms**
na quente.

### Servidor sob carga (`h2load`, só o CSS de uma página)

Mediana de 5 repetições. "Páginas/s" = quantas páginas por segundo o nginx consegue servir, só
contando o CSS.

| Clientes | Protocolo | Visita | A: pág/s | **E: pág/s** | A: CPU/pág | **E: CPU/pág** | A: KB/pág | **E: KB/pág** |
|---|---|---|---|---|---|---|---|---|
| 50 | HTTP/1.1 | fria | 3.349 | 2.486 | 580 µs | 702 µs | 16,4 | 19,4 |
| 50 | HTTP/1.1 | quente (304) | 103.176 | 146.068 | 25 µs | 24 µs | 0,22 | 0,22 |
| 50 | HTTP/2 | fria | 2.554 | 1.941 | 687 µs | 818 µs | 16,3 | 19,3 |
| 50 | HTTP/2 | quente (304) | 33.385 | 31.349 | 62 µs | 59 µs | 0,12 | 0,12 |
| 200 | HTTP/1.1 | fria | 2.001 | 1.980 | 850 µs | 879 µs | 16,4 | 19,4 |
| 200 | HTTP/1.1 | quente (304) | 73.883 | 80.150 | 18 µs | 17 µs | 0,22 | 0,22 |
| 200 | HTTP/2 | fria | 2.225 | 1.571 | 816 µs | 1.052 µs | 16,3 | 19,3 |
| 200 | HTTP/2 | quente (304) | 21.342 | 20.157 | 68 µs | 69 µs | 0,12 | 0,12 |

Para comparação, o manifesto cru (B) com 50 clientes em HTTP/1.1 servia 1.211 páginas/s a frio e
5.631 a quente, com 1.528 µs e 350 µs de CPU por página: 14× a CPU de A a quente.

### Leitura dos resultados

- **Para o usuário, a solução atual empata com a antiga**: de −2 a +20 ms na visita fria e de −4 a
  +2 ms na quente, dentro do ruído. O manifesto cru era de 350 a 790 ms pior em 4G e 3G.
- **No servidor, a visita quente (304, a mais comum) empata.** Na visita fria, E gasta de 3% a 29%
  a mais de CPU por página, porque comprime 19 KB em vez de 16 KB a cada resposta. Em números
  absolutos isso é de 0,03 a 0,24 ms de CPU por primeira visita.
- **Por que o manifesto cru era lento:** a cascata de `@import`. O navegador só descobre os módulos
  depois de baixar e ler o `ui.css`, o que acrescenta uma ida e volta de rede no caminho crítico da
  renderização. É o mesmo tipo de dependência que Wang et al. identificaram como determinante no
  tempo de carga (WProf) [18], e que limita o ganho do SPDY/HTTP/2 [19]: multiplexar requisições não
  ajuda quando uma depende da outra. O Polaris ataca exatamente essas cadeias de dependência [20].
- **Por que o `max-age` foi descartado:** ele deixaria a visita quente 156 ms mais rápida em 4G
  (D contra E), mas abriria uma janela de até 5 min, depois de cada deploy, com JS novo e CSS velho.
  A decisão foi manter a regra da issue #22 sem exceção [21].

### Limitações

- A limitação de rede do Chrome aplica latência por requisição, não por pacote. É um modelo
  simplificado de RTT, parecido para todas as variantes, mas não idêntico a uma rede real.
- Tudo rodou numa máquina só, com o nginx local e sem a API (as chamadas à API respondiam 404
  rápido). O tempo absoluto de página em produção será maior; a **diferença** entre variantes é o
  que se aproveita.
- Em 3G, uma das 5 páginas não chegou à primeira pintura dentro do tempo limite, em todas as
  variantes igualmente (6 amostras sem FCP cada). A rodada de 3G da solução atual foi interrompida,
  porque LAN, cabo e 4G já mostravam o empate.
- O `h2load` mede só o CSS, não a página inteira. As conexões foram limitadas a 900 requisições,
  abaixo do `keepalive_requests` padrão do nginx (1000), porque o `h2load`, ao contrário do
  navegador, não reconecta depois de um GOAWAY.

---

### Depois do plano de contribuições (medição final)

O plano acrescentou peso (tema escuro, utilitários, tokens de página, CSS de página em arquivo
próprio). A primeira medição do estado final mostrou **piora**, que foi corrigida em três passos
medidos:

| Passo | Efeito medido (4G, 1ª visita, contra o original) |
|---|---|
| Bundle sem comentários (`--strip-comments`) | bundle 30,1 → 19,1 KB com gzip; pintura −58 ms |
| Tokens escuros fora do bundle (`theme-dark.css`, só para quem usa o escuro) | bundle 19,1 → 16,6 KB (o original: 16,5 KB) |
| Boot do tema inline **antes** do `<link>` do `ui.css` | `load` −220 ms na home (o script inline depois da folha de estilo travava a análise do HTML) |

Resultado final, mediana de 5 páginas × 8 repetições, HTTP/2:

| Rede | Visita | Original | Final | Diferença |
|---|---|---|---|---|
| 4G | fria, 1ª pintura | 556 ms | 566 ms | +10 ms |
| 4G | fria, `load` | 1062 ms | 1073 ms | +11 ms |
| 4G | quente, 1ª pintura | 352 ms | 360 ms | +8 ms |
| cabo | fria, 1ª pintura | 110 ms | 120 ms | +10 ms |
| cabo | quente, 1ª pintura | 96 ms | 98 ms | +2 ms |

O custo que sobra se concentra nas duas telas com **CSS próprio grande**, que antes vinha dentro
do HTML e agora é uma requisição paralela ao `ui.css`: o editor de problemas (4,2 KB com gzip,
+114 ms na 1ª pintura da 1ª visita em 4G) e a home do treino (3,2 KB, +106 ms). Em telas com
pouco CSS próprio a diferença some (placar: +6 ms; status: +4 ms). Se isso incomodar, as opções
são devolver o CSS dessas duas telas ao HTML ou gerar no deploy um bundle por página.

## 6. Revisão detalhada de cada alteração

### `web/shared/styles/**` (24 módulos novos)

Faixas contíguas do `ui.css` antigo, na mesma ordem, com um cabeçalho de duas linhas em cada.

| Prós | Contras |
|---|---|
| A remontagem é provadamente idêntica ao original, fora uma linha realocada (uma regra de tema escuro do placar, com seletor disjunto). | Como a divisão seguiu a ordem original, há módulos com conteúdo misto: `treino-home.css` inclui avatar e chip de usuário, e `score.css` inclui o link de login da organização e a numeração de convidados. |
| O diff de estilo computado nas 56 páginas só mostrou as cores corrigidas de propósito. | `utilities.css` fica no meio da cascata, e não no fim como seria o ideal. Movê-lo exige a mesma conferência. |
| O tamanho médio de 2,4 KB torna cada módulo legível de uma vez. | Os módulos ainda usam os nomes legados (`var(--blue)`) e valores literais, e não os tokens semânticos. |

### `web/shared/styles/tokens.css`

| Prós | Contras |
|---|---|
| Os três níveis separam "qual azul" de "para quê", que é o que permite trocar a identidade visual ou criar um tema escuro. | São cerca de 90 variáveis novas, várias ainda sem uso (`--space-*`, `--text-*`). |
| Os aliases garantem que os ~700 usos existentes resolvem para o mesmo valor de antes (verificado no Chrome). | Dois nomes para a mesma coisa (`--blue` e `--color-primary`) até a migração terminar. |
| Corrige os 5 tokens indefinidos. | A correção muda a aparência de 16 páginas. É uma melhoria, mas é uma mudança visual. |

### `web/shared/ui.css` (manifesto)

| Prós | Contras |
|---|---|
| As páginas não mudaram: continuam pedindo só `/shared/ui.css`. | Servido cru, custaria de 350 a 790 ms na primeira pintura em redes lentas. Por isso o bundle é necessário. |
| A ordem da cascata fica explícita numa lista legível. | Quem lê o arquivo como texto precisa expandir os imports (ver os expansores abaixo). |

### `server/bin/css-bundle.sh` e `web/shared/css-bundle.js` (expansores)

| Prós | Contras |
|---|---|
| Só concatenam, sem transformar nada. Saída idêntica byte a byte entre os dois (testado). | Duas implementações da mesma regra: mexeu numa, mexa na outra. |
| Falham alto em sintaxe desconhecida (`@import` com media, caminho absoluto, arquivo ausente). Não há expansão pela metade. | Aceitam só um formato de `@import`, uma limitação de propósito. |
| O `.js` garante que o enunciado aberto em aba nova tenha estilo mesmo sem bundle (em dev). | Na produção, com bundle, o `.js` é redundante; ele é a rede de proteção. |

### `Makefile` (alvo `css-bundle`, chamado pelo `deploy`) e `.gitignore`

| Prós | Contras |
|---|---|
| Escrita atômica (arquivo temporário + `mv`). Se falhar, o bundle anterior fica intacto e o deploy para. | É um artefato gerado, na mesma categoria do `web/version.json` e do `docs/html/`: pode ficar desatualizado se alguém editar CSS direto no servidor sem rodar o alvo. |
| Mesmo molde do `version-json`, que já existia. | Em dev, um bundle esquecido no checkout esconde as edições nos módulos. A guarda e a documentação avisam. |

### `server/etc/nginx/moj-app.conf.in`

| Prós | Contras |
|---|---|
| `try_files /shared/ui.bundle.css /shared/ui.css`: com bundle, 1 requisição; sem ele, o manifesto funciona igual. | Exige reinstalar o nginx uma vez. |
| Continua `no-cache`, como todo o estático (issue #22). Testado no vhost de produção completo: 304 funciona e `/docs/` não é afetado. | O `add_header` precisa se repetir no bloco aninhado, porque um bloco aninhado do nginx não herda os cabeçalhos do pai. |

### `server/score/report-gen.sh`

| Prós | Contras |
|---|---|
| O relatório offline continua com o estilo do site. Sem a mudança, sairia **sem estilo**, porque os `@import` não resolvem num documento `blob:`. | Comentários de módulo passam a ir inlinados no relatório (alguns KB a mais por página). |
| Smoke do relatório sem regressão (136 passam; as 5 falhas já existiam no `HEAD`). | O relatório depende de mais um script (`css-bundle.sh`). |

### `web/contest/contest.js`

| Prós | Contras |
|---|---|
| Troca de uma linha: `fetch` → `bundledCss`. | Uma importação a mais no módulo mais carregado do contest. |

### `server/test/smoke-print-chrome.sh`

| Prós | Contras |
|---|---|
| O teste continua conferindo que o rodapé não vai para a impressão, agora lendo o CSS expandido. | Nenhum relevante. |

### `server/test/css-ratchet.sh` e `.baseline`, no `make check`

| Prós | Contras |
|---|---|
| Portões: manifesto × disco, token sem definição, bundle desatualizado, palavras proibidas no relatório. | As contagens usam expressões regulares, não um parser de CSS/JS, então há algum ruído (por exemplo, `#add` num seletor contaria como cor). Como compara a contagem com ela mesma, o ruído não atrapalha. |
| A catraca impede o legado de crescer e deixa a migração ser incremental. | Um PR que precise de um hex novo legítimo vai reprovar e terá de criar um token, o que é intencional mas pode surpreender. |

### Documentação

`docs/DESIGN.md` (novo), `CLAUDE.md`, `docs/DEPLOY.md`, `docs/SCOREBOARD.md`, `web/README.md` e
`docs/build-html.sh`.

| Prós | Contras |
|---|---|
| Guia de uso, decisões e medições no repositório. | O `docs/build-html.sh` só muda a posição do `DESIGN.md` no índice das docs e é dispensável. |
| O `SCOREBOARD.md` apontava para arquivos que mudaram de lugar. | O `CLAUDE.md` já é muito longo, e isto acrescenta mais duas entradas. |

---

### Alterações do plano de contribuições (commits seguintes)

| Alteração | Prós | Contras |
|---|---|---|
| `server/test/visual/` (diff visual) + `shots-ajuda.sh --serve` | Prova "nada mudou" em 216 telas, logadas e com dados, em desktop e celular; validou cada etapa e mediu o que mudou de propósito. | Leva ~25 min a rodada completa; precisa de Chrome; não entra no `make check`. |
| Tokens em 4 níveis (primitivos, semânticos, componentes, legado) + tokens de página e JS | Toda cor do CSS mora num lugar; o tema escuro saiu disso. | ~250 tokens de página/JS com nome automático (`--<tela>-<seletor>-<prop>`); vários são quase iguais a um semântico e merecem consolidação de design. |
| `components/tutorial.css`, título/quicknav no `topbar.css` | −131 linhas duplicadas. | Nomes genéricos precisaram de `:where(.tmain)` para não vazar. |
| `styles/pages/` (CSS de página em arquivo) | O CSS de página entra na catraca e nos tokens. | +1 requisição por página com CSS próprio (custo acima). |
| `utilities-atomic.css` (547 inline → classe) | Tira o estilo de aparência do JS nas telas de contest. | Utilitário com `!important` e valor no nome é degrau, não destino; o próximo passo é virar componente. |
| Tema escuro (`theme-dark.css`, `tokens-dark.py`, boot inline) | Opt-in, contraste conferido, zero custo para quem usa o claro. | 52 páginas têm a mesma linha de boot (a catraca confere que é idêntica); a paleta escura dos derivados é automática e pode merecer ajuste à mão. |
| `tokens.json` (DTCG) | Ferramentas de design leem os tokens. | Mais um derivado para manter em dia (a catraca confere). |
| Índice dos tutoriais | Não gruda mais por cima do texto no celular. | Mudança visual (desejada), só no celular. |

## 7. Referências

**Modularidade e manutenção de software**

1. Parnas, D. L. *On the criteria to be used in decomposing systems into modules.* Communications
   of the ACM, 15(12), 1972.
2. Baldwin, C. Y.; Clark, K. B. *Design Rules, Vol. 1: The Power of Modularity.* MIT Press, 2000.
3. MacCormack, A.; Rusnak, J.; Baldwin, C. Y. *Exploring the structure of complex software
   designs: an empirical study of open source and proprietary code.* Management Science, 52(7),
   2006.

**CSS**

4. Mesbah, A.; Mirshokraie, S. *Automated analysis of CSS rules to support style maintenance.*
   ICSE 2012.
5. Mazinanian, D.; Tsantalis, N.; Mesbah, A. *Discovering refactoring opportunities in cascading
   style sheets.* FSE 2014.
6. Mazinanian, D.; Tsantalis, N. *An empirical study on the use of CSS preprocessors.* SANER 2016.

**Modelos de linguagem, contexto e repositórios**

7. Liu, N. F. et al. *Lost in the middle: how language models use long contexts.* Transactions of
   the ACL (TACL), 2024.
8. Hsieh, C.-P. et al. *RULER: what's the real context size of your long-context language
   models?* COLM 2024.
9. Shi, F. et al. *Large language models can be easily distracted by irrelevant context.* ICML
   2023.
10. Jimenez, C. E. et al. *SWE-bench: can language models resolve real-world GitHub issues?* ICLR
    2024.
11. Xia, C. S. et al. *Agentless: demystifying LLM-based software engineering agents.*
    arXiv:2407.01489, 2024.
12. Yang, J. et al. *SWE-agent: agent-computer interfaces enable automated software engineering.*
    NeurIPS 2024.
13. Zhang, F. et al. *RepoCoder: repository-level code completion through iterative retrieval and
    generation.* EMNLP 2023.
14. Ding, Y. et al. *CrossCodeEval: a diverse and multilingual benchmark for cross-file code
    completion.* NeurIPS 2023 (Datasets and Benchmarks).

**Especificações**

15. W3C. *Media Queries Level 5* (`prefers-color-scheme`).
16. W3C. *CSS Cascading and Inheritance Level 5* (cascade layers, `@layer`).
17. W3C Design Tokens Community Group. *Design Tokens Format Module* (rascunho).

**Desempenho web**

18. Wang, X. S. et al. *Demystifying page load performance with WProf.* NSDI 2013.
19. Wang, X. S. et al. *How speedy is SPDY?* NSDI 2014.
20. Netravali, R. et al. *Polaris: faster page loads using fine-grained dependency tracking.*
    NSDI 2016.
21. IETF. *RFC 9111: HTTP Caching*, 2022 (semântica de `no-cache` e `max-age`).
